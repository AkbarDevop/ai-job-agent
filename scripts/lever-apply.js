#!/usr/bin/env node

/**
 * Lever ATS Application Automation
 *
 * Fills Lever job application forms using Playwright and a JSON config.
 * Supports CDP connection to an existing browser or launching a new one.
 *
 * Usage:
 *   node lever-apply.js <jobUrl> <configPath>
 *
 * Environment variables:
 *   CDP_URL         - Connect to an existing Chrome DevTools Protocol endpoint
 *   HEADLESS        - Set to "0" to run with a visible browser
 *   PW_CHANNEL      - Playwright browser channel (e.g., "chrome")
 *   KEEP_OPEN_ON_BLOCK - Set to "1" to keep browser open when blocked
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
  console.error('Usage: node lever-apply.js <jobUrl> <configPath>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissCookieBanner(page) {
  const dismissButtons = [
    page.getByRole('button', { name: /dismiss/i }),
    page.locator('.cc-dismiss'),
  ];
  for (const locator of dismissButtons) {
    try {
      if (await locator.count()) {
        await locator.first().click({ timeout: 1000 });
        return;
      }
    } catch {}
  }
}

async function ensureLeverApplyForm(page) {
  const hasResumeInput = async () =>
    (await page.locator('#resume-upload-input, input[type="file"][name="resume"], input[type="file"]').count()) > 0;

  if (await hasResumeInput()) return;

  const applyLocators = [
    page.getByRole('link', { name: /apply for this job/i }),
    page.getByRole('button', { name: /apply for this job/i }),
    page.locator('a[data-qa="show-page-apply"]'),
    page.locator('a.postings-btn'),
  ];

  for (const locator of applyLocators) {
    try {
      if (await locator.count()) {
        await locator.first().click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        if (await hasResumeInput()) return;
      }
    } catch {}
  }

  if (!page.url().endsWith('/apply')) {
    await page.goto(`${jobUrl.replace(/\/$/, '')}/apply`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
  }
}

async function setTextValue(page, selector, value) {
  const locator = page.locator(selector);
  if (!(await locator.count())) return false;
  await locator.first().evaluate((el, v) => {
    el.focus();
    el.value = v ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value ?? '');
  return true;
}

async function setNamedValue(page, name, value) {
  return setTextValue(page, `input[name=${JSON.stringify(name)}], textarea[name=${JSON.stringify(name)}]`, value);
}

async function setSelectValue(page, name, value) {
  const locator = page.locator(`select[name=${JSON.stringify(name)}]`);
  if (!(await locator.count())) return false;
  await locator.first().selectOption({ label: value }).catch(async () => {
    await locator.first().selectOption({ value });
  });
  return true;
}

async function setRadioValue(page, name, value) {
  const locator = page.locator(`input[type="radio"][name=${JSON.stringify(name)}][value=${JSON.stringify(value)}]`);
  if (!(await locator.count())) return false;
  const item = locator.first();
  await item.evaluate((el) => {
    el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return true;
}

async function setCheckboxValues(page, name, values) {
  const locator = page.locator(`input[type="checkbox"][name=${JSON.stringify(name)}]`);
  if (!(await locator.count())) return false;
  const wanted = new Set(values);
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    const itemValue = await item.getAttribute('value');
    if (wanted.has(itemValue || '')) {
      await item.check({ force: true });
    } else {
      await item.uncheck({ force: true }).catch(() => {});
    }
  }
  return true;
}

async function uploadResume(page, filePath) {
  const selectors = [
    '#resume-upload-input',
    'input[type="file"][name="resume"]',
    'input[type="file"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if (await locator.count()) {
      await locator.first().setInputFiles(filePath);
      return selector;
    }
  }
  throw new Error('Could not find a resume file input');
}

async function uploadNamedFile(page, name, filePath) {
  const locator = page.locator(`input[type="file"][name=${JSON.stringify(name)}]`);
  if (!(await locator.count())) {
    throw new Error(`Could not find named file input ${name}`);
  }
  await locator.first().setInputFiles(filePath);
}

async function setLeverLocation(page, value) {
  return page.evaluate(async (target) => {
    const input = document.querySelector('#location-input, input[name="location"]');
    if (!input) return { ok: false, reason: 'missing-input' };
    input.focus();
    input.value = target;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const hidden = document.querySelector('#selected-location, input[name="selectedLocation"]');
    const captchaValue = document.querySelector('#hcaptchaResponseInput, input[name="h-captcha-response"]')?.value || '';

    try {
      const response = await fetch('/searchLocations?text=' + encodeURIComponent(target) + '&hcaptchaResponse=' + encodeURIComponent(captchaValue), {
        credentials: 'same-origin',
      });
      if (!response.ok) return { ok: false, reason: 'search-failed', status: response.status };
      const results = await response.json();
      if (!Array.isArray(results) || !results.length) return { ok: false, reason: 'no-results' };
      const normalizedTarget = target.trim().toLowerCase();
      const chosen = results.find((item) => (item?.name || '').trim().toLowerCase() === normalizedTarget) || results[0];
      input.value = chosen?.name || target;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (hidden) {
        hidden.value = JSON.stringify(chosen);
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { ok: true, selected: chosen };
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) };
    }
  }, value);
}

async function fillLeverForm(page) {
  await dismissCookieBanner(page);
  await ensureLeverApplyForm(page);
  await dismissCookieBanner(page);

  const resumeSelector = await uploadResume(page, config.resumePath);
  console.log(JSON.stringify({ stage: 'resume', resumeSelector }));

  await setTextValue(page, 'input[name="name"]', config.name);
  await setTextValue(page, 'input[name="email"]', config.email);
  await setTextValue(page, 'input[name="phone"]', config.phone);
  if (config.location) {
    console.log(JSON.stringify({ stage: 'location', result: await setLeverLocation(page, config.location) }));
  }
  await setTextValue(page, 'input[name="org"]', config.currentCompany);
  await setTextValue(page, 'input[name="urls[LinkedIn]"]', config.linkedin || '');
  await setTextValue(page, 'input[name="urls[Twitter]"]', config.twitter || '');
  await setTextValue(page, 'input[name="urls[GitHub]"]', config.github || '');
  await setTextValue(page, 'input[name="urls[Portfolio]"]', config.portfolio || '');
  await setTextValue(page, 'input[name="urls[Other]"]', config.other || '');
  await setTextValue(page, 'textarea[name="comments"]', config.comments || '');

  for (const field of config.textValues || []) {
    await setNamedValue(page, field.name, field.value);
  }
  for (const field of config.selectValues || []) {
    await setSelectValue(page, field.name, field.value);
  }
  for (const field of config.radioValues || []) {
    await setRadioValue(page, field.name, field.value);
  }
  for (const field of config.checkboxValues || []) {
    await setCheckboxValues(page, field.name, field.values);
  }
  for (const field of config.fileValues || []) {
    await uploadNamedFile(page, field.name, field.path);
  }

  if (config.location) {
    console.log(JSON.stringify({ stage: 'location-final', result: await setLeverLocation(page, config.location) }));
  }

  const missingRequired = await page.evaluate(() =>
    [...document.querySelectorAll('[required]')]
      .filter((el) => !el.value && !el.checked)
      .map((el) => el.name || el.id || el.outerHTML.slice(0, 120))
  );

  console.log(JSON.stringify({ stage: 'filled', missingRequired }));
  return missingRequired;
}

async function monitorSubmission(page) {
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate(() => {
      const token = document.querySelector('input[name="h-captcha-response"]')?.value || '';
      const text = document.body ? document.body.innerText.slice(0, 5000) : '';
      const captchaFrames = [...document.querySelectorAll('iframe')]
        .map((f) => f.src || '')
        .filter((src) => src.includes('hcaptcha') || src.includes('captcha'));
      const submitted = /application submitted|thank you|successfully applied/i.test(text) || /confirmation/i.test(location.href);
      return {
        url: location.href,
        title: document.title,
        tokenLength: token.length,
        captchaFrames,
        submitted,
        textSample: text.slice(0, 800),
      };
    });

    if (state.submitted) {
      console.log(JSON.stringify({ stage: 'submitted', state }));
      return true;
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

async function clickVisibleSubmit(page) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    };

    const candidates = [
      ...document.querySelectorAll('#btn-submit, button[type="submit"], input[type="submit"], button, input[type="button"]'),
    ];

    const target = candidates.find((el) => {
      const text = (el.innerText || el.textContent || el.value || '').trim();
      return isVisible(el) && /submit your application|submit|apply/i.test(text);
    });

    if (!target) return false;
    target.click();
    return true;
  });

  if (!clicked) {
    throw new Error('Could not find a visible submit button');
  }
}

async function main() {
  const cdpUrl = process.env.CDP_URL;
  const headless = process.env.HEADLESS !== '0';
  const keepOpenOnBlock = process.env.KEEP_OPEN_ON_BLOCK === '1';
  const launchOptions = process.env.PW_CHANNEL ? { headless, channel: process.env.PW_CHANNEL } : { headless };
  const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : await chromium.launch(launchOptions);
  const context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    const missingRequired = await fillLeverForm(page);
    if (missingRequired.length > 0) {
      console.log(JSON.stringify({ stage: 'blocked', missingRequired }));
      if (keepOpenOnBlock) {
        console.log(JSON.stringify({ stage: 'waiting-for-user', reason: 'missing-required-fields', url: page.url() }));
        await new Promise(() => {});
      }
      process.exit(2);
    }

    if (!config.autoSubmit) {
      console.log(JSON.stringify({ stage: 'ready' }));
      process.exit(0);
    }

    await clickVisibleSubmit(page);
    const submitted = await monitorSubmission(page);
    if (!submitted && keepOpenOnBlock) {
      console.log(JSON.stringify({ stage: 'waiting-for-user', reason: 'captcha-or-timeout', url: page.url() }));
      await new Promise(() => {});
    }
    process.exit(submitted ? 0 : 3);
  } finally {
    if (!keepOpenOnBlock) {
      await page.close().catch(() => {});
      if (!cdpUrl) {
        await browser.close().catch(() => {});
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
