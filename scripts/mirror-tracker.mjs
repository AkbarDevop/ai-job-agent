#!/usr/bin/env node
// Mirror application-tracker.csv and outreach-log.csv into human-readable
// markdown tables under data/. Career-ops uses markdown tables as their
// primary tracker format because they read better in any editor / preview.
// We keep CSV as the source of truth (everything writes to CSV) and let
// this script generate the markdown twin on demand.
//
// Run: node scripts/mirror-tracker.mjs
//      node scripts/mirror-tracker.mjs --watch   # keep running, regenerate on change
//
// Outputs:
//   data/applications.md  — pretty markdown table from application-tracker.csv
//   data/outreach.md      — same for outreach-log.csv
//
// Both data/* files are gitignored (personal data).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// --------------------------------------------------------------------------
// Path resolution (same priority order as job-dashboard.mjs)
// --------------------------------------------------------------------------

function resolveRepoRoot() {
  const candidates = [
    process.env.AI_JOB_AGENT_ROOT,
    path.join(os.homedir(), '.claude/skills/ai-job-agent'),
    readMarker(),
    path.join(os.homedir(), 'ai-job-agent'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function readMarker() {
  const p = path.join(os.homedir(), '.claude/skills/ai-job-agent/REPO_PATH');
  try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) { return null; }
}

// --------------------------------------------------------------------------
// CSV parser (RFC 4180-lite, identical to job-dashboard.mjs)
// --------------------------------------------------------------------------

function parseCSV(text) {
  if (!text || !text.trim()) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);  // strip UTF-8 BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i += 1; continue; }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0], rows: rows.slice(1).filter(r => r.some(v => v.length)) };
}

// --------------------------------------------------------------------------
// Markdown rendering
// --------------------------------------------------------------------------

const STATUS_EMOJI = {
  applied: '📄', submitted: '📬', interview: '💼', offer: '🎯',
  rejected: '❌', blocked: '🚫', withdrawn: '🚪', replied: '💬',
  sent: '✉️', draft: '📝', evaluated: '🔍',
};

function escapePipes(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusCell(value) {
  const key = String(value ?? '').toLowerCase().trim();
  const e = STATUS_EMOJI[key];
  return e ? `${e} ${key}` : (key || '');
}

function renderApplicationsMarkdown(parsed) {
  const { header, rows } = parsed;
  if (!header.length) return '# Applications Tracker\n\n_(no rows yet — apply to something)_\n';
  const out = [];
  out.push('# Applications Tracker');
  out.push('');
  out.push(`_${rows.length} row(s) · auto-generated from \`application-tracker.csv\` · do not edit by hand_`);
  out.push('');

  // Counts by status
  const statusCounts = {};
  for (const r of rows) {
    const idxStatus = header.indexOf('status');
    const s = (r[idxStatus] || 'unknown').toLowerCase();
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  out.push('## Status breakdown');
  out.push('');
  out.push('| Status | Count |');
  out.push('|--------|------:|');
  for (const [s, n] of Object.entries(statusCounts).sort(([, a], [, b]) => b - a)) {
    out.push(`| ${statusCell(s)} | ${n} |`);
  }
  out.push(`| **total** | **${rows.length}** |`);
  out.push('');

  // Recent table (last 25 by date, descending)
  const dateIdx = header.indexOf('date');
  const sorted = [...rows].sort((a, b) => (b[dateIdx] || '').localeCompare(a[dateIdx] || ''));
  const recent = sorted.slice(0, 25);

  out.push(`## Recent ${recent.length} of ${rows.length}`);
  out.push('');

  // Show date, company, role, status, source, url, notes
  const showCols = ['date', 'company', 'role', 'status', 'source', 'url', 'notes'];
  const colIdxs = showCols.map(c => header.indexOf(c)).filter(i => i >= 0);
  const colNames = colIdxs.map(i => header[i]);

  out.push('| ' + colNames.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' | ') + ' |');
  out.push('|' + colNames.map(() => '---').join('|') + '|');
  for (const r of recent) {
    const cells = colIdxs.map((i) => {
      const colName = header[i];
      const val = r[i] || '';
      if (colName === 'status') return statusCell(val);
      if (colName === 'url' && val) {
        // Show domain only for readability
        const m = val.match(/^https?:\/\/([^/]+)/);
        return m ? `[${m[1]}](${val})` : escapePipes(val);
      }
      if (colName === 'notes' && val.length > 60) return escapePipes(val.slice(0, 57)) + '…';
      return escapePipes(val);
    });
    out.push('| ' + cells.join(' | ') + ' |');
  }
  out.push('');

  return out.join('\n');
}

function renderOutreachMarkdown(parsed) {
  const { header, rows } = parsed;
  if (!header.length) return '# Outreach Log\n\n_(no rows yet — send your first cold email)_\n';
  const out = [];
  out.push('# Outreach Log');
  out.push('');
  out.push(`_${rows.length} row(s) · auto-generated from \`outreach-log.csv\` · do not edit by hand_`);
  out.push('');

  const statusCounts = {};
  for (const r of rows) {
    const s = (r[header.indexOf('status')] || 'unknown').toLowerCase();
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  out.push('## Status breakdown');
  out.push('');
  out.push('| Status | Count |');
  out.push('|--------|------:|');
  for (const [s, n] of Object.entries(statusCounts).sort(([, a], [, b]) => b - a)) {
    out.push(`| ${statusCell(s)} | ${n} |`);
  }
  out.push(`| **total** | **${rows.length}** |`);
  out.push('');

  const sentIdx = header.indexOf('sent_at');
  const sorted = [...rows].sort((a, b) => (b[sentIdx] || '').localeCompare(a[sentIdx] || ''));
  const recent = sorted.slice(0, 25);

  out.push(`## Recent ${recent.length} of ${rows.length}`);
  out.push('');

  const showCols = ['sent_at', 'company', 'to_name', 'to_email', 'subject', 'status', 'follow_up_count', 'replied_at'];
  const colIdxs = showCols.map(c => header.indexOf(c)).filter(i => i >= 0);
  const colNames = colIdxs.map(i => header[i]);

  out.push('| ' + colNames.map(n => n.charAt(0).toUpperCase() + n.slice(1).replace(/_/g, ' ')).join(' | ') + ' |');
  out.push('|' + colNames.map(() => '---').join('|') + '|');
  for (const r of recent) {
    const cells = colIdxs.map((i) => {
      const colName = header[i];
      const val = r[i] || '';
      if (colName === 'status') return statusCell(val);
      if (colName === 'sent_at' || colName === 'replied_at') return val ? val.slice(0, 10) : '—';
      if (colName === 'follow_up_count') return val ? `${val}/2` : '0/2';
      if (colName === 'subject' && val.length > 50) return escapePipes(val.slice(0, 47)) + '…';
      return escapePipes(val);
    });
    out.push('| ' + cells.join(' | ') + ' |');
  }
  out.push('');

  return out.join('\n');
}

// --------------------------------------------------------------------------
// One-shot mirror
// --------------------------------------------------------------------------

function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function mirror(root) {
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const apps = loadCSV(path.join(root, 'application-tracker.csv'));
  const outreach = loadCSV(path.join(root, 'outreach-log.csv'));

  const appsMd = renderApplicationsMarkdown(apps);
  const outMd = renderOutreachMarkdown(outreach);

  fs.writeFileSync(path.join(dataDir, 'applications.md'), appsMd);
  fs.writeFileSync(path.join(dataDir, 'outreach.md'), outMd);

  return {
    applications_rows: apps.rows.length,
    outreach_rows: outreach.rows.length,
    applications_md: path.join('data', 'applications.md'),
    outreach_md: path.join('data', 'outreach.md'),
  };
}

// --------------------------------------------------------------------------
// Watch mode
// --------------------------------------------------------------------------

function watchMode(root) {
  const csvs = [
    path.join(root, 'application-tracker.csv'),
    path.join(root, 'outreach-log.csv'),
  ];
  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const result = mirror(root);
      const stamp = new Date().toLocaleTimeString();
      process.stdout.write(`[${stamp}] mirrored — apps:${result.applications_rows} outreach:${result.outreach_rows}\n`);
    }, 250);
  };
  // Initial render
  const initial = mirror(root);
  process.stdout.write(`[init] mirrored — apps:${initial.applications_rows} outreach:${initial.outreach_rows}\n`);
  process.stdout.write(`[watch] tracking ${csvs.filter(p => fs.existsSync(p)).length} CSV file(s); ctrl-c to stop\n`);

  for (const p of csvs) {
    if (fs.existsSync(p)) {
      try { fs.watch(p, debounced); } catch (_) { /* ignore */ }
    }
  }
  // Keep process alive
  setInterval(() => {}, 1 << 30);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const root = resolveRepoRoot();
  if (!root) {
    process.stderr.write('Could not find ai-job-agent repo root.\n');
    process.exit(1);
  }
  if (args.includes('--watch') || args.includes('-w')) {
    watchMode(root);
    return;
  }
  const result = mirror(root);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
