#!/usr/bin/env node

/**
 * Greenhouse ATS Application Automation
 *
 * Fills Greenhouse job application forms using Playwright and a JSON config.
 * Supports CDP connection to an existing browser or launching a new one.
 *
 * Usage:
 *   node greenhouse-apply.js <jobUrl> <configPath>
 *
 * Environment variables:
 *   CDP_URL       - Connect to an existing Chrome DevTools Protocol endpoint
 *   HEADLESS      - Set to "0" to run with a visible browser
 *   PW_CHANNEL    - Playwright browser channel (e.g., "chrome")
 *   LOG_REQUESTS  - Set to "1" to log non-GET requests
 *
 * Exit codes:
 *   0 = submitted (or ready in dry-run mode)
 *   1 = crash / unexpected error
 *   3 = captcha or submission timeout
 */

const fs = require('node:fs');
const { chromium } = require('playwright-core');

const [, , jobUrl, configPath] = process.argv;

if (!jobUrl || !configPath) {
  console.error('Usage: node greenhouse-apply.js <jobUrl> <configPath>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function locatorById(page, id) {
  return page.locator(`[id=${JSON.stringify(id)}]`);
}

async function setValueById(page, id, value) {
  await locatorById(page, id).evaluate((el, v) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, v ?? '');
    } else {
      el.value = v ?? '';
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value ?? '');
}

async function selectReactOption(page, id, value) {
  const input = locatorById(page, id);
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.click({ force: true });
  await input.fill('');
  await input.type(value, { delay: 15 });
  await page.waitForTimeout(1200);

  const picked = await page.evaluate(({ id, value }) => {
    const normalize = (text) => text.trim().toLowerCase();
    const wanted = normalize(value);
    const prefix = `react-select-${id}-option-`;
    const options = [...document.querySelectorAll('[id]')].filter((el) => el.id.startsWith(prefix));
    const exact = options.find((el) => normalize(el.textContent || '') === wanted);
    const partial = options.find((el) => normalize(el.textContent || '').includes(wanted));
    const choice = exact || partial || options[0];
    if (!choice) return '';
    const selected = (choice.textContent || '').trim();
    choice.click();
    return selected;
  }, { id, value });

  if (!picked) {
    await input.press('Enter');
  }

  await page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    const hidden = el?.closest('.select-shell')?.querySelector('input[required][aria-hidden="true"]');
    const applied = value || el?.value || '';
    if (hidden) {
      hidden.value = applied;
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      hidden.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    if (el) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, { id, value: picked || value });
}

async function ensureApplicationFormOpen(page) {
  const firstName = page.locator('#first_name');
  if (await firstName.count()) return;

  const applyButton = page.getByRole('button', { name: 'Apply' });
  await applyButton.click();
  await firstName.waitFor({ state: 'visible', timeout: 10000 });
}

async function fillGreenhouseForm(page) {
  // File uploads
  for (const field of config.fileValues || []) {
    await locatorById(page, field.id).setInputFiles(field.path);
  }

  if (config.resumePath) {
    await page.locator('#resume').setInputFiles(config.resumePath);
  }

  // Text fields
  for (const field of config.textValues || []) {
    await setValueById(page, field.id, field.value);
  }

  // Textareas
  for (const field of config.textareaValues || []) {
    await setValueById(page, field.id, field.value);
  }

  // React select dropdowns
  for (const field of config.selectValues || []) {
    await selectReactOption(page, field.id, field.value);
  }
}

async function monitorSubmission(page) {
  let retriedWithToken = false;
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.slice(0, 5000) : '';
      const captchaFrames = [...document.querySelectorAll('iframe')]
        .map((f) => f.src || '')
        .filter((src) => src.includes('recaptcha') || src.includes('captcha'));
      return {
        url: location.href,
        title: document.title,
        submitted: /application submitted|thank you|your application has been submitted|we have received your application/i.test(text),
        captchaFrames,
        tokenValue: document.querySelector('textarea[name="g-recaptcha-response"]')?.value || '',
        textSample: text.slice(0, 800),
      };
    });

    if (state.submitted) {
      console.log(JSON.stringify({ stage: 'submitted', state }));
      return true;
    }

    if (state.captchaFrames.length > 0 && i === 5) {
      console.log(JSON.stringify({ stage: 'captcha-pending', state }));
    }

    if (!retriedWithToken && state.captchaFrames.length > 0) {
      const token = await page.evaluate(() => {
        const cfg = window.___grecaptcha_cfg;
        const client = cfg?.clients?.[100000] || cfg?.clients?.[0];
        return (
          document.querySelector('textarea[name="g-recaptcha-response"]')?.value ||
          window.grecaptcha?.enterprise?.getResponse?.(100000) ||
          client?.O ||
          ''
        );
      });

      if (token) {
        retriedWithToken = true;
        await page.evaluate((value) => {
          const field = document.querySelector('textarea[name="g-recaptcha-response"]');
          if (field) {
            field.value = value;
            field.innerHTML = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, token);
        console.log(JSON.stringify({ stage: 'captcha-token-injected', tokenLength: token.length }));
        await page.locator('button[type="submit"]').click().catch(() => {});
      }
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
    if (process.env.LOG_REQUESTS === '1') {
      page.on('request', (request) => {
        if (request.method() !== 'GET') {
          console.log(JSON.stringify({ stage: 'request', method: request.method(), url: request.url() }));
        }
      });
      page.on('response', async (response) => {
        const req = response.request();
        if (req.method() !== 'GET') {
          console.log(JSON.stringify({ stage: 'response', method: req.method(), url: response.url(), status: response.status() }));
        }
      });
    }

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    await ensureApplicationFormOpen(page);
    await fillGreenhouseForm(page);

    if (!config.autoSubmit) {
      console.log(JSON.stringify({ stage: 'ready' }));
      process.exit(0);
    }

    await page.locator('button[type="submit"]').click();
    const submitted = await monitorSubmission(page);
    process.exit(submitted ? 0 : 3);
  } finally {
    await page.close().catch(() => {});
    if (!cdpUrl) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
