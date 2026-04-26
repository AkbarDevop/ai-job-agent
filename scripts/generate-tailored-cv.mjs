#!/usr/bin/env node

/**
 * Render a tailored CV markdown into an ATS-friendly PDF using
 * playwright-core's headless Chromium. JSON in / JSON out.
 *
 * Why this exists: /job-cv (the wrapping skill) does the actual *tailoring*
 * — Claude reads the user's base cv.md plus a JD, rewrites bullets, and asks
 * for approval. Once approved, the skill calls this script to render the
 * approved markdown to PDF. No new deps. No LaTeX. No pandoc.
 *
 * Usage:
 *   echo '{"cv":"# Akbar...","outputPath":"...pdf","title":"..."}' \
 *     | node scripts/generate-tailored-cv.mjs
 *   node scripts/generate-tailored-cv.mjs payload.json
 *
 * Payload:
 *   {
 *     "cv":         "<markdown>",          // required
 *     "outputPath": "/abs/path/to/cv.pdf", // required
 *     "title":      "Resume — Akbar K.",   // optional, used as PDF <title>
 *     "css":        "<override CSS>",      // optional, replaces default CSS
 *     "format":     "letter" | "a4"        // optional, default "letter"
 *   }
 *
 * Output (stdout JSON):
 *   { "ok": true, "outputPath": "...", "bytes": N, "pages": estimate }
 *
 * Exit codes:
 *   0 = success
 *   1 = crash / unexpected error
 *   2 = invalid payload (missing cv / outputPath, malformed JSON)
 *   3 = Playwright browser launch / render failed
 */

import fs from 'node:fs';
import path from 'node:path';

function fail(code, message, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, code, error: message, ...extra }) + '\n');
  process.exit(code);
}

function readPayload(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  let raw;
  if (file) {
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      fail(2, `Cannot read payload file ${file}: ${err.message}`);
    }
  } else if (!process.stdin.isTTY) {
    raw = fs.readFileSync(0, 'utf8');
  } else {
    fail(2, 'No payload. Pipe JSON to stdin or pass a file path.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(2, `Payload is not valid JSON: ${err.message}`);
  }
  if (!parsed.cv || typeof parsed.cv !== 'string') fail(2, 'Payload missing required field: cv (markdown string)');
  if (!parsed.outputPath || typeof parsed.outputPath !== 'string') fail(2, 'Payload missing required field: outputPath');
  return parsed;
}

// ---------- minimal markdown → HTML converter ----------
// Handles: # headings, **bold**, *italic*, `code`, [text](url), - / * bullets,
// blank-line paragraphs, --- horizontal rules. Deliberately small. NOT a full
// CommonMark implementation — but enough for clean CV markdown.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text) {
  let out = escapeHtml(text);
  // links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  // bold then italic (order matters)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let inUl = false;
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${renderInline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push('<hr>');
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${renderInline(bullet[1].trim())}</li>`);
      continue;
    }

    closeList();
    paraBuf.push(line.trim());
  }
  flushPara();
  closeList();
  return out.join('\n');
}

// ---------- ATS-friendly default CSS ----------
// One column. Serif body. ~11pt. No multicol. No icons. Tight margins handled
// by Playwright @page so the HTML body has 0 margin.
const DEFAULT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11pt;
    line-height: 1.35;
    color: #111;
  }
  h1 { font-size: 18pt; margin: 0 0 4pt; letter-spacing: 0.2pt; }
  h2 {
    font-size: 12pt;
    margin: 12pt 0 4pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    border-bottom: 0.6pt solid #111;
    padding-bottom: 1pt;
  }
  h3 { font-size: 11pt; margin: 8pt 0 2pt; font-weight: 700; }
  h4, h5, h6 { font-size: 11pt; margin: 6pt 0 2pt; font-weight: 700; }
  p  { margin: 4pt 0; }
  ul { margin: 2pt 0 4pt; padding-left: 16pt; }
  li { margin: 1pt 0; }
  a  { color: #111; text-decoration: underline; }
  hr { border: none; border-top: 0.4pt solid #888; margin: 8pt 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code {
    font-family: 'Courier New', monospace;
    font-size: 10pt;
  }
`;

function buildHtml({ cv, title, css }) {
  const body = markdownToHtml(cv);
  const safeTitle = escapeHtml(title || 'Resume');
  const styles = css || DEFAULT_CSS;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------- main ----------

async function main() {
  const payload = readPayload(process.argv);
  const outputPath = path.resolve(payload.outputPath);
  const format = (payload.format || 'letter').toLowerCase();
  if (!['letter', 'a4'].includes(format)) fail(2, `format must be "letter" or "a4", got "${format}"`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const html = buildHtml(payload);

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (err) {
    fail(3, `playwright-core not installed: ${err.message}. Run: npm install --prefix ${path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')}`);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    fail(
      3,
      `Failed to launch Chromium: ${err.message}. If you see "Executable doesn't exist", run: npx playwright install chromium`,
    );
  }

  let pdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' },
      preferCSSPageSize: false,
    });
  } catch (err) {
    try { await browser.close(); } catch (_) {}
    fail(3, `PDF render failed: ${err.message}`);
  }
  await browser.close();

  fs.writeFileSync(outputPath, pdfBuffer);

  // Approximate page count from PDF structure (cheap; matches career-ops idiom).
  const pdfStr = pdfBuffer.toString('latin1');
  const pageCount = (pdfStr.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        outputPath,
        bytes: pdfBuffer.length,
        pages: pageCount,
        format,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  fail(1, err && err.stack ? err.stack : String(err));
});
