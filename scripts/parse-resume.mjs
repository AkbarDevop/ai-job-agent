#!/usr/bin/env node

/**
 * Extract text from a resume PDF using Chromium's built-in PDF viewer.
 *
 * Why Chromium and not pdfjs/pdf-parse: `playwright-core` is already a dep
 * for the ATS form fillers, so we reuse Chromium's PDF viewer. Zero new
 * dependencies. If extraction comes back empty (encrypted PDF, image-only
 * scans), we report a hint to install `poppler-utils` for OCR-style
 * extraction — we don't shell out to it ourselves.
 *
 * Usage:
 *   node scripts/parse-resume.mjs /abs/path/to/resume.pdf
 *   echo '{"path":"/abs/path/to/resume.pdf"}' | node scripts/parse-resume.mjs
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "path": "/abs/path/resume.pdf",
 *     "text": "Akbarjon Kamoldinov\nUniversity of Missouri...",
 *     "chars": 4321,
 *     "pages_estimated": 2,
 *     "extracted_at": "2026-04-26T..."
 *   }
 *
 * Output (failure):
 *   {
 *     "ok": false,
 *     "code": 1,
 *     "error": "Empty extraction — PDF may be image-only. Install poppler...",
 *     "path": "..."
 *   }
 *
 * Exit codes:
 *   0 = success (text extracted, chars > 0)
 *   1 = crash / unexpected error / empty extraction
 *   2 = file missing
 *   3 = Playwright failure (Chromium not installed, browser launch failed)
 */

import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

function emit(obj, exitCode) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(exitCode);
}

function fail(code, error, extra = {}) {
  emit({ ok: false, code, error, ...extra }, code);
}

function readArgs(argv) {
  const args = argv.slice(2);
  const pathArg = args.find((a) => !a.startsWith('--'));

  if (pathArg) return pathArg;

  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) fail(2, 'No path provided. Pass a path or pipe JSON to stdin.');
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.path) fail(2, 'JSON payload missing "path" field.');
      return parsed.path;
    } catch (err) {
      fail(2, `stdin not valid JSON: ${err.message}`);
    }
  }

  fail(2, 'No path provided. Pass a path or pipe JSON to stdin.');
}

async function extract(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    fail(2, `not found: ${pdfPath}`, { path: pdfPath });
  }
  const abs = path.resolve(pdfPath);

  // Real Chrome ships with the PDF viewer plugin baked in; bundled Chromium
  // does not. Prefer `chrome` channel when available, fall back to bundled
  // Chromium (which works for some PDFs but treats most local files as
  // downloads — we'll still try).
  let browser;
  let lastErr;
  for (const opts of [
    { channel: 'chrome', headless: true },
    { headless: true },
  ]) {
    try {
      browser = await chromium.launch(opts);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!browser) {
    fail(
      3,
      `Playwright launch failed: ${lastErr?.message || 'unknown'}. Run \`npx playwright install chromium\` or install Google Chrome.`,
      { path: abs },
    );
  }

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
    });
    const page = await context.newPage();

    // Catch the navigation error if Chromium decides to download the PDF
    // instead of rendering it; we'll fall back to an embed wrapper.
    let navOk = false;
    try {
      await page.goto(`file://${abs}`, { waitUntil: 'load', timeout: 10000 });
      navOk = true;
    } catch (_navErr) {
      const wrapper = `data:text/html,<html><body style="margin:0"><embed src="file://${encodeURI(
        abs,
      )}" type="application/pdf" width="100%" height="100%" /></body></html>`;
      try {
        await page.goto(wrapper, { waitUntil: 'load', timeout: 10000 });
        navOk = true;
      } catch (_) {
        // fall through
      }
    }
    if (!navOk) return '';

    // Chromium's PDF viewer needs a beat to render text into the DOM.
    await page.waitForTimeout(2500);

    const text = await page.evaluate(() => {
      // Chrome's PDF viewer has the text in a shadow DOM; try several selectors.
      const candidates = [
        document.body?.innerText,
        document.querySelector('embed')?.innerText,
        document.documentElement?.innerText,
      ];
      return candidates.find((c) => c && c.length > 50) || '';
    });

    return text.trim();
  } catch (err) {
    fail(3, `Playwright page error: ${err.message}`, { path: abs });
  } finally {
    if (browser) await browser.close();
  }
}

function estimatePages(text) {
  // Rough heuristic: form-feed markers if the viewer emitted them, else ~3000
  // chars per resume page. Resumes are typically 1-2 pages; cap at a sane bound.
  const ff = (text.match(/\f/g) || []).length;
  if (ff > 0) return ff + 1;
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 3000));
}

async function main() {
  const pdfPath = readArgs(process.argv);
  const abs = path.resolve(pdfPath);

  const text = await extract(pdfPath);

  if (!text || text.length === 0) {
    fail(
      1,
      'Empty extraction — PDF may be image-only or encrypted. Install poppler (brew install poppler) for OCR-style fallback.',
      { path: abs },
    );
  }

  emit(
    {
      ok: true,
      path: abs,
      text,
      chars: text.length,
      pages_estimated: estimatePages(text),
      extracted_at: new Date().toISOString(),
    },
    0,
  );
}

main().catch((err) => {
  fail(1, err && err.stack ? err.stack : String(err));
});
