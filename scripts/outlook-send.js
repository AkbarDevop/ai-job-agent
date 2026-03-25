#!/usr/bin/env node

/**
 * Outlook Web Email Sender
 *
 * Composes and sends an email via Outlook Web App using Chrome DevTools Protocol.
 * Requires a Chrome instance running with --remote-debugging-port and Outlook Web open.
 *
 * Usage:
 *   node outlook-send.js <to> <subject> <bodyFile> [attachmentPath]
 *
 * Arguments:
 *   to             - Recipient email address
 *   subject        - Email subject line
 *   bodyFile       - Path to a text file containing the email body
 *   attachmentPath - (Optional) Path to a file to attach
 *
 * Prerequisites:
 *   1. Start Chrome with: google-chrome --remote-debugging-port=9224
 *   2. Navigate to https://outlook.office.com in that Chrome instance
 *   3. Sign in to your email account
 */

const { chromium } = require('playwright-core');

const to = process.argv[2];
const subject = process.argv[3];
const bodyFile = process.argv[4];
const attachment = process.argv[5]; // optional local file path

if (!to || !subject || !bodyFile) {
  console.error('Usage: node outlook-send.js <to> <subject> <bodyFile> [attachmentPath]');
  process.exit(1);
}

const fs = require('fs');
const body = fs.readFileSync(bodyFile, 'utf8').trim();

(async () => {
  let browser;
  try {
    const port = process.env.OUTLOOK_PORT || '9224';
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const contexts = browser.contexts();
    if (!contexts.length) { console.error('No browser contexts'); process.exit(1); }
    const pages = contexts[0].pages();
    let page = pages.find(p => p.url().includes('outlook.office'));
    if (!page && pages.length) page = pages[0];
    if (!page) { console.error('No Outlook page found'); process.exit(1); }

    console.log('Found Outlook page:', page.url());

    // Check if compose form is already open
    const composeOpen = await page.locator('div[aria-label="To"][contenteditable="true"]').count();
    if (composeOpen === 0) {
      const newMailBtn = await page.locator('button[aria-label="New"]').first();
      await newMailBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked New');
    } else {
      console.log('Compose form already open');
    }

    // Fill "To" field
    const toField = await page.locator('div[aria-label="To"][contenteditable="true"]').first();
    await toField.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(to, { delay: 10 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log('Filled To:', to);

    // Fill Subject
    const subjectField = await page.locator('input[aria-label="Subject"]').first();
    await subjectField.click();
    await subjectField.fill(subject);
    await page.waitForTimeout(500);
    console.log('Filled Subject:', subject);

    // Fill Body
    const bodyArea = await page.locator('div[aria-label="Message body"][role="textbox"]').first();
    await bodyArea.click();
    await page.waitForTimeout(300);

    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.keyboard.press('Enter');
      const line = lines[i];
      if (line.trim() === '') continue;
      await page.keyboard.type(line, { delay: 1 });
    }
    await page.waitForTimeout(500);
    console.log('Filled body');

    // Attach file if provided
    if (attachment && fs.existsSync(attachment)) {
      const attachBtn = await page.locator('button[aria-label*="Attach"]').first();
      await attachBtn.click();
      await page.waitForTimeout(1500);

      const browseOption = await page.locator('[role="menuitem"]:has-text("Browse this computer"), button:has-text("Browse this computer")').first();

      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
      await browseOption.click();

      try {
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(attachment);
        console.log('Attached:', attachment);
        await page.waitForTimeout(3000);
      } catch (e) {
        console.log('WARNING: File chooser did not appear:', e.message);
      }
    }

    // Click Send
    const sendBtn = await page.locator('button[aria-label="Send"]').first();
    await sendBtn.click();
    await page.waitForTimeout(2000);
    console.log('Email sent!');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
