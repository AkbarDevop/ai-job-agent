#!/usr/bin/env node

/**
 * Outlook Web Email Triage
 *
 * Searches, reads, and manages emails in Outlook Web App via Chrome DevTools Protocol.
 * Requires a Chrome instance running with --remote-debugging-port and Outlook Web open.
 *
 * Usage:
 *   node outlook-triage.js [--port 9224] search <query>
 *   node outlook-triage.js [--port 9224] extract <index> [--keep-unread]
 *   node outlook-triage.js [--port 9224] mark-read <index>
 *   node outlook-triage.js [--port 9224] clear-search
 *
 * Options:
 *   --port <number>      Chrome debug port (default: 9224)
 *   --wait-ms <number>   Wait time between actions (default: 2500)
 *   --keep-unread        Revert message to unread after extracting
 *   --output <file>      Write JSON output to file
 */

const { chromium } = require('playwright-core');
const fs = require('fs');

function parseArgs(argv) {
  const opts = {
    port: 9224,
    waitMs: 2500,
    keepUnread: false,
    output: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') {
      opts.port = Number(argv[++i]);
    } else if (arg === '--wait-ms') {
      opts.waitMs = Number(argv[++i]);
    } else if (arg === '--keep-unread') {
      opts.keepUnread = true;
    } else if (arg === '--output') {
      opts.output = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { opts, positional };
}

async function withPage(port, fn) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    const result = await fn(page);
    await browser.close();
    return result;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function search(page, query, waitMs) {
  const close = page.getByRole('button', { name: /Close search/i });
  if (await close.count()) {
    await close.click();
    await page.waitForTimeout(1200);
  }
  const searchBox = page.getByRole('combobox', {
    name: /Search for email, meetings, files and more\./i,
  });
  await searchBox.click();
  await searchBox.fill(query);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(waitMs);
  return page.locator('[role="option"]').evaluateAll((nodes) =>
    nodes.map((n, idx) => ({
      idx,
      aria: n.getAttribute('aria-label') || '',
      text: (n.innerText || '').trim(),
      unread: /(^|\s)Unread(\s|$)/.test(n.getAttribute('aria-label') || ''),
      flagged: /(^|\s)Flagged(\s|$)/.test(n.getAttribute('aria-label') || ''),
      pinned: /(^|\s)Pinned(\s|$)/.test(n.getAttribute('aria-label') || ''),
    }))
  );
}

async function clearSearch(page, waitMs) {
  const button = page.getByRole('button', { name: /Close search/i });
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(waitMs);
  }
}

async function extractResult(page, index, waitMs, keepUnread) {
  const rows = page.locator('[role="option"]');
  const count = await rows.count();
  if (index < 0 || index >= count) {
    throw new Error(`Result index ${index} out of range; count=${count}`);
  }
  await rows.nth(index).click();
  await page.waitForTimeout(waitMs);

  const sender = await page.locator('body').evaluate(() => {
    const candidates = [...document.querySelectorAll('[title]')];
    for (const node of candidates) {
      const title = node.getAttribute('title') || '';
      if (title.includes('@') && title.length < 200) return title;
    }
    return '';
  });

  const bodyText = await page.locator('body').evaluate((body) => body.innerText);
  const selectedMeta = await rows.nth(index).evaluate((n, idx) => ({
    idx,
    aria: n.getAttribute('aria-label') || '',
    text: (n.innerText || '').trim(),
  }), index);

  let revertedToUnread = false;
  if (keepUnread) {
    const unreadButton = page.getByRole('button', { name: /^Unread$/i });
    if (await unreadButton.count()) {
      await unreadButton.click();
      await page.waitForTimeout(800);
      revertedToUnread = true;
    }
  }

  return {
    selected: selectedMeta,
    sender,
    body: bodyText,
    revertedToUnread,
  };
}

async function markRead(page, index, waitMs) {
  const rows = page.locator('[role="option"]');
  const count = await rows.count();
  if (index < 0 || index >= count) {
    throw new Error(`Result index ${index} out of range; count=${count}`);
  }
  await rows.nth(index).click();
  await page.waitForTimeout(waitMs);
  const readButton = page.getByRole('button', { name: /^Read$/i });
  if (await readButton.count()) {
    await readButton.click();
    await page.waitForTimeout(800);
  }
  const unreadButton = page.getByRole('button', { name: /^Unread$/i });
  return {
    index,
    nowRead: !!(await unreadButton.count()),
  };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;
  if (!command || ['search', 'extract', 'mark-read', 'clear-search'].indexOf(command) === -1) {
    console.error('Usage: outlook-triage.js [--port 9224] search <query>');
    console.error('       outlook-triage.js [--port 9224] extract <index> [--keep-unread]');
    console.error('       outlook-triage.js [--port 9224] mark-read <index>');
    console.error('       outlook-triage.js [--port 9224] clear-search');
    process.exit(1);
  }

  let result;
  if (command === 'search') {
    const query = rest.join(' ').trim();
    if (!query) throw new Error('search requires a query');
    result = await withPage(opts.port, (page) => search(page, query, opts.waitMs));
  } else if (command === 'extract') {
    if (!rest.length) throw new Error('extract requires a result index');
    const index = Number(rest[0]);
    result = await withPage(opts.port, (page) => extractResult(page, index, opts.waitMs, opts.keepUnread));
  } else if (command === 'mark-read') {
    if (!rest.length) throw new Error('mark-read requires a result index');
    const index = Number(rest[0]);
    result = await withPage(opts.port, (page) => markRead(page, index, opts.waitMs));
  } else if (command === 'clear-search') {
    result = await withPage(opts.port, (page) => clearSearch(page, opts.waitMs));
  }

  const payload = JSON.stringify(result, null, 2);
  if (opts.output) {
    fs.writeFileSync(opts.output, payload);
  }
  console.log(payload);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
