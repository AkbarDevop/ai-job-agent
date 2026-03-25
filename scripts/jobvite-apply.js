#!/usr/bin/env node

/**
 * Jobvite ATS Application Automation
 *
 * Fills Jobvite job application forms using Playwright and a JSON config.
 * Supports CDP connection to an existing browser or launching a new one.
 *
 * Usage:
 *   node jobvite-apply.js <jobUrl> <configPath>
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
  console.error('Usage: node jobvite-apply.js <jobUrl> <configPath>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeSelectResidenceAndConsent(page) {
  const selector = page.locator('#jv-country-select');
  if (await selector.count()) {
    await selector.selectOption({ label: config.residenceLabel || 'All locations except California & Europe' });
    await page.waitForTimeout(400);
  }

  const accept = page.getByRole('button', { name: /i accept/i });
  if (await accept.count()) {
    await accept.first().click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1200);
  }
}

async function setValue(page, id, value) {
  const locator = page.locator(`#${id}`);
  if (!(await locator.count())) {
    throw new Error(`Missing field: ${id}`);
  }
  await locator.first().click({ force: true });
  await locator.first().fill(value ?? '');
  await locator.first().dispatchEvent('input');
  await locator.first().dispatchEvent('change');
  await locator.first().dispatchEvent('blur');
}

async function setSelect(page, id, value) {
  const locator = page.locator(`#${id}`);
  if (!(await locator.count())) {
    throw new Error(`Missing select: ${id}`);
  }
  await locator.selectOption({ label: value }).catch(async () => {
    await locator.selectOption({ value });
  });
}

async function uploadFile(page, id, path) {
  const locator = page.locator(`#${id}`);
  if (!(await locator.count())) {
    throw new Error(`Missing file input: ${id}`);
  }
  await locator.setInputFiles(path);
}

async function fillJobviteForm(page) {
  if (config.resumePath) {
    await uploadFile(page, 'file-input-0', config.resumePath);
  }

  for (const field of config.textValues || []) {
    await setValue(page, field.id, field.value);
  }

  for (const field of config.selectValues || []) {
    await setSelect(page, field.id, field.value);
  }

  for (const field of config.fileValues || []) {
    await uploadFile(page, field.id, field.path);
  }

  const missingRequired = await page.evaluate(() =>
    [...document.querySelectorAll('input[required], textarea[required], select[required]')]
      .filter((el) => {
        if (el.type === 'file') return !el.files || !el.files.length;
        if (el.tagName === 'SELECT') return !el.value;
        return !el.value;
      })
      .map((el) => el.id || el.name || el.outerHTML.slice(0, 80))
  );

  console.log(JSON.stringify({ stage: 'filled', missingRequired }));
  return missingRequired;
}

async function clickSend(page) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    };

    const candidates = [
      ...document.querySelectorAll('button, input[type="submit"], input[type="button"]'),
    ];
    const send = candidates.find((el) => {
      const text = (el.innerText || el.textContent || el.value || '').trim();
      return isVisible(el) && /send application/i.test(text);
    });
    if (send) {
      send.click();
      return 'send';
    }

    const next = candidates.find((el) => {
      const text = (el.innerText || el.textContent || el.value || '').trim();
      return isVisible(el) && /^next/i.test(text);
    });
    if (next) {
      next.click();
      return 'next';
    }

    return '';
  });

  if (!clicked) {
    throw new Error('Could not find a visible submit button');
  }

  console.log(JSON.stringify({ stage: 'clicked', clicked }));
}

async function monitorSubmission(page) {
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.slice(0, 6000) : '';
      const captchaFrames = [...document.querySelectorAll('iframe')]
        .map((f) => f.src || '')
        .filter((src) => src.includes('recaptcha') || src.includes('captcha'));
      const submitted =
        /thank you for applying|application received|we have received your application|application submitted|you have successfully applied/i.test(text) ||
        /thanks for applying/i.test(text);
      return {
        url: location.href,
        title: document.title,
        submitted,
        captchaFrames,
        textSample: text.slice(0, 1000),
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

async function main() {
  const cdpUrl = process.env.CDP_URL;
  const headless = process.env.HEADLESS !== '0';
  const launchOptions = process.env.PW_CHANNEL ? { headless, channel: process.env.PW_CHANNEL } : { headless };
  const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : await chromium.launch(launchOptions);
  const context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    await maybeSelectResidenceAndConsent(page);
    await page.waitForTimeout(800);

    const missingRequired = await fillJobviteForm(page);
    if (missingRequired.length > 0) {
      console.log(JSON.stringify({ stage: 'blocked', missingRequired }));
      process.exit(2);
    }

    if (!config.autoSubmit) {
      console.log(JSON.stringify({ stage: 'ready' }));
      process.exit(0);
    }

    await clickSend(page);
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
