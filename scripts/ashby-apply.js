#!/usr/bin/env node

/**
 * Ashby ATS Application Automation
 *
 * Fills Ashby job application forms using Playwright and a JSON config.
 * Supports CDP connection to an existing browser or launching a new one.
 *
 * Usage:
 *   node ashby-apply.js <jobUrl> <configPath>
 *
 * Environment variables:
 *   CDP_URL      - Connect to an existing Chrome DevTools Protocol endpoint
 *   HEADLESS     - Set to "0" to run with a visible browser
 *   PW_CHANNEL   - Playwright browser channel (e.g., "chrome")
 *
 * Exit codes:
 *   0 = submitted (or ready in dry-run mode)
 *   1 = crash / unexpected error
 *   2 = blocked on missing required fields
 *   3 = captcha or submission timeout
 */

const fs = require('node:fs');
const { chromium } = require('playwright-core');

const [, , jobUrl, configPath] = process.argv;

if (!jobUrl || !configPath) {
  console.error('Usage: node ashby-apply.js <jobUrl> <configPath>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setValue(page, selector, value) {
  const locator = page.locator(selector);
  if (!(await locator.count())) throw new Error(`Missing field: ${selector}`);
  await locator.first().click({ force: true });
  await locator.first().fill(value ?? '');
  await locator.first().dispatchEvent('input');
  await locator.first().dispatchEvent('change');
  await locator.first().dispatchEvent('blur');
}

async function uploadFile(page, selector, path) {
  const locator = page.locator(selector);
  if (!(await locator.count())) throw new Error(`Missing file input: ${selector}`);
  await locator.first().setInputFiles(path);
}

async function setCheckbox(page, selector, checked) {
  const locator = page.locator(selector);
  if (!(await locator.count())) throw new Error(`Missing checkbox: ${selector}`);
  if (checked) {
    await locator.first().check({ force: true });
  } else {
    await locator.first().uncheck({ force: true }).catch(() => {});
  }
}

async function clickLabeledButton(page, text) {
  const locator = page.getByRole('button', { name: new RegExp(`^${text}$`, 'i') });
  if (!(await locator.count())) throw new Error(`Missing button with text: ${text}`);
  await locator.first().click({ force: true });
}

async function setAutocomplete(page, selector, query, optionText) {
  const locator = page.locator(selector);
  if (!(await locator.count())) throw new Error(`Missing autocomplete input: ${selector}`);
  await locator.first().click({ force: true });
  await locator.first().fill(query);
  await page.waitForTimeout(1000);

  const selected = await page.evaluate((optionText) => {
    const normalize = (text) => text.trim().toLowerCase();
    const wanted = normalize(optionText);
    const options = [...document.querySelectorAll('[role="option"]')];
    const exact = options.find((el) => normalize(el.textContent || '') === wanted);
    const partial = options.find((el) => normalize(el.textContent || '').includes(wanted));
    const choice = exact || partial;
    if (!choice) return '';
    const text = (choice.textContent || '').trim();
    choice.click();
    return text;
  }, optionText);

  if (!selected) {
    await locator.first().press('ArrowDown');
    await locator.first().press('Enter');
  }
}

async function fillAshbyForm(page) {
  // File uploads
  for (const field of config.fileValues || []) {
    await uploadFile(page, field.selector, field.path);
  }

  if (config.resumePath) {
    await uploadFile(page, '#_systemfield_resume', config.resumePath);
  }

  // Text fields
  for (const field of config.textValues || []) {
    await setValue(page, field.selector, field.value);
  }

  // Textareas
  for (const field of config.textareaValues || []) {
    await setValue(page, field.selector, field.value);
  }

  // Checkboxes
  for (const field of config.checkboxValues || []) {
    await setCheckbox(page, field.selector, field.checked);
  }

  // Button clicks (e.g., toggle buttons)
  for (const field of config.buttonValues || []) {
    await clickLabeledButton(page, field.text);
  }

  // Autocomplete fields
  for (const field of config.autocompleteValues || []) {
    await setAutocomplete(page, field.selector, field.query, field.optionText);
  }

  const missingRequired = await page.evaluate(() =>
    [...document.querySelectorAll('input[required], textarea[required], select[required]')]
      .filter((el) => {
        if (el.type === 'file') return !el.files || !el.files.length;
        if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
        return !el.value;
      })
      .map((el) => el.id || el.name || el.outerHTML.slice(0, 80))
  );

  console.log(JSON.stringify({ stage: 'filled', missingRequired }));
  return missingRequired;
}

async function clickSubmit(page) {
  const submit = page.getByRole('button', { name: /submit application/i });
  if (!(await submit.count())) throw new Error('Could not find submit button');
  await submit.first().click({ force: true });
}

async function monitorSubmission(page) {
  let retriedWithToken = false;
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.slice(0, 6000) : '';
      const token =
        document.querySelector('textarea[name="g-recaptcha-response"], textarea#g-recaptcha-response-100000')?.value || '';
      const captchaFrames = [...document.querySelectorAll('iframe')]
        .map((f) => f.src || '')
        .filter((src) => src.includes('recaptcha') || src.includes('captcha'));
      const submitted =
        /thank you for applying|application submitted|we have received your application|thanks for applying|successfully applied/i.test(text);
      return {
        url: location.href,
        title: document.title,
        submitted,
        tokenLength: token.length,
        captchaFrames,
        textSample: text.slice(0, 1000),
      };
    });

    if (state.submitted) {
      console.log(JSON.stringify({ stage: 'submitted', state }));
      return true;
    }

    if (!retriedWithToken && state.tokenLength > 0) {
      retriedWithToken = true;
      console.log(JSON.stringify({ stage: 'captcha-token-present', tokenLength: state.tokenLength }));
      await clickSubmit(page).catch(() => {});
    }

    if (state.captchaFrames.length > 0 && i > 5) {
      console.log(JSON.stringify({ stage: 'captcha-pending', state }));
      return false;
    }

    await sleep(1000);
  }

  console.log(JSON.stringify({ stage: 'timeout' }));
  return false;
}

async function main() {
  const cdpUrl = process.env.CDP_URL;
  const headless = process.env.HEADLESS !== '0';
  const launchOptions = process.env.PW_CHANNEL ? { headless, channel: process.env.PW_CHANNEL } : { headless };
  const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : await chromium.launch(launchOptions);
  const context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const missingRequired = await fillAshbyForm(page);
    if (missingRequired.length > 0) {
      console.log(JSON.stringify({ stage: 'blocked', missingRequired }));
      process.exit(2);
    }

    if (!config.autoSubmit) {
      console.log(JSON.stringify({ stage: 'ready' }));
      process.exit(0);
    }

    await clickSubmit(page);
    const submitted = await monitorSubmission(page);
    process.exit(submitted ? 0 : 3);
  } finally {
    await page.close().catch(() => {});
    if (!cdpUrl) {
      await browser.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
