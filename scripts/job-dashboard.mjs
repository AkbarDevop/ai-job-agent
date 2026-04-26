#!/usr/bin/env node
// Terminal dashboard for the AI Job Agent.
//
// Two modes:
//   node scripts/job-dashboard.mjs              -- interactive TUI (needs TTY)
//   node scripts/job-dashboard.mjs --snapshot   -- one-shot snapshot to stdout
//                                                 (works in non-TTY, e.g.
//                                                  from the /job-dashboard
//                                                  Claude Code skill)
//
// Zero dependencies. Reads application-tracker.csv and outreach-log.csv from
// the repo root (resolved via $AI_JOB_AGENT_ROOT, ~/.claude/skills/ai-job-agent,
// the REPO_PATH marker file, or ~/ai-job-agent).
//
// Keybindings in interactive mode:
//   tab / right / left   switch tab
//   1 2 3 4              jump to tab (Applications / Outreach / Follow-ups / Pipeline)
//   up / down / j / k    scroll rows
//   /                    fuzzy filter the current tab
//   enter                open detail pane for the selected row
//   esc                  close detail / clear filter / dismiss help
//   ?                    toggle help overlay
//   r                    reload from disk (auto-reload also fires on file change)
//   q / Ctrl-C           quit

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inv: '\x1b[7m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bg: {
    blue: '\x1b[44m',
    cyan: '\x1b[46m',
    yellow: '\x1b[43m',
    green: '\x1b[42m',
    red: '\x1b[41m',
    black: '\x1b[40m',
  },
  clear: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  alt: '\x1b[?1049h',
  altOff: '\x1b[?1049l',
};

const STATUS_EMOJI = {
  applied: '📄',
  submitted: '📬',
  interview: '💼',
  offer: '🎯',
  rejected: '❌',
  blocked: '🚫',
  withdrawn: '🚪',
  replied: '💬',
  sent: '✉️',
  draft: '📝',
};

const URGENCY_EMOJI = {
  overdue: '🚨',
  due: '⏰',
  soon: '👀',
  waiting: '💤',
};

const URGENCY_COLOR = {
  overdue: ANSI.red,
  due: ANSI.yellow,
  soon: ANSI.cyan,
  waiting: ANSI.dim,
};

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function color(c, s) {
  return `${c}${s}${ANSI.reset}`;
}

function statusEmoji(status) {
  if (!status) return '';
  const key = status.toLowerCase().trim();
  return STATUS_EMOJI[key] || '';
}

function pad(str, width, align = 'left') {
  const s = String(str ?? '');
  const visible = stripAnsi(s);
  const deficit = width - visibleWidth(visible);
  if (deficit <= 0) return truncate(s, width);
  if (align === 'right') return ' '.repeat(deficit) + s;
  return s + ' '.repeat(deficit);
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleWidth(s) {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1f300 && cp <= 0x1faff) w += 2;
    else if (cp >= 0x2600 && cp <= 0x27bf) w += 2;
    else w += 1;
  }
  return w;
}

function truncate(s, max) {
  const visible = stripAnsi(s);
  if (visibleWidth(visible) <= max) return s;
  let w = 0;
  let out = '';
  for (const ch of visible) {
    const add = visibleWidth(ch);
    if (w + add > max - 1) break;
    out += ch;
    w += add;
  }
  return out + '…';
}

function sparkline(values, opts = {}) {
  if (!values.length) return '';
  const max = opts.max != null ? opts.max : Math.max(...values, 1);
  return values
    .map((v) => {
      if (v === 0) return ' ';
      const idx = Math.min(SPARK_CHARS.length - 1, Math.floor((v / max) * (SPARK_CHARS.length - 1)));
      return SPARK_CHARS[Math.max(0, idx)];
    })
    .join('');
}

// --------------------------------------------------------------------------
// Path resolution
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
  // Walk up from this script's actual location (handles spaces/unicode/Windows
  // drive paths via fileURLToPath — `new URL().pathname` mangles them).
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function readMarker() {
  const p = path.join(os.homedir(), '.claude/skills/ai-job-agent/REPO_PATH');
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch (_) {
    return null;
  }
}

// --------------------------------------------------------------------------
// CSV parsing (RFC 4180-lite, handles quoted fields with commas / newlines)
// --------------------------------------------------------------------------

function parseCSV(text) {
  if (!text || !text.trim()) return [];
  // Strip UTF-8 BOM — Excel and some Google Sheets exports include it,
  // and otherwise the first header field becomes "﻿date" and never matches.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((v) => v.length)).map((r) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return parseCSV(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// --------------------------------------------------------------------------
// Analysis
// --------------------------------------------------------------------------

function statusCounts(rows) {
  const counts = {};
  for (const r of rows) {
    const key = (r.status || 'unknown').toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function daysBetween(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  return Math.floor(ms / 86_400_000);
}

function urgencyFor(row) {
  if (row.status && ['replied', 'bounced', 'closed', 'interview_scheduled'].includes(row.status.toLowerCase())) {
    return null;
  }
  if (row.replied_at) return null;
  const fc = Number(row.follow_up_count || 0);
  if (fc >= 2) return null;
  const reference = row.last_follow_up_at || row.sent_at;
  const days = daysBetween(reference);
  if (days === null) return null;
  if (days > 10) return { bucket: 'overdue', days };
  if (days >= 7) return { bucket: 'due', days };
  if (days >= 5) return { bucket: 'soon', days };
  return { bucket: 'waiting', days };
}

function followUpRows(outreach) {
  return outreach
    .map((r) => ({ row: r, urgency: urgencyFor(r) }))
    .filter((x) => x.urgency)
    .sort((a, b) => {
      const order = { overdue: 0, due: 1, soon: 2, waiting: 3 };
      if (order[a.urgency.bucket] !== order[b.urgency.bucket]) {
        return order[a.urgency.bucket] - order[b.urgency.bucket];
      }
      return b.urgency.days - a.urgency.days;
    });
}

function rowsPerDay(rows, dateField, days = 14) {
  const buckets = new Array(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of rows) {
    const d = r[dateField];
    if (!d) continue;
    const t = new Date(d);
    if (isNaN(t.getTime())) continue;
    t.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - t) / 86_400_000);
    if (diff >= 0 && diff < days) buckets[days - 1 - diff] += 1;
  }
  return buckets;
}

function filterRows(rows, query, fields) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter((r) =>
    fields.some((f) => String(r[f] || '').toLowerCase().includes(q)),
  );
}

// --------------------------------------------------------------------------
// Table rendering
// --------------------------------------------------------------------------

const TABLE = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│', cross: '┼', t: '┬', b: '┴', l: '├', r: '┤',
};

function renderTable({ title, columns, rows, highlight = -1, rowColors = null }) {
  const widths = columns.map((c, i) => {
    const headerW = visibleWidth(c.label);
    const cellsW = rows.length
      ? Math.max(...rows.map((r) => visibleWidth(stripAnsi(String(r[i] ?? '')))))
      : 0;
    return Math.max(c.min || 4, Math.min(c.max || 40, Math.max(headerW, cellsW)));
  });
  const out = [];
  if (title) out.push(color(ANSI.bold + ANSI.cyan, title));
  const top = TABLE.tl + widths.map((w) => TABLE.h.repeat(w + 2)).join(TABLE.t) + TABLE.tr;
  const mid = TABLE.l + widths.map((w) => TABLE.h.repeat(w + 2)).join(TABLE.cross) + TABLE.r;
  const bot = TABLE.bl + widths.map((w) => TABLE.h.repeat(w + 2)).join(TABLE.b) + TABLE.br;
  out.push(color(ANSI.dim, top));
  out.push(
    color(ANSI.dim, TABLE.v) +
      columns
        .map((c, i) => ' ' + color(ANSI.bold, pad(c.label, widths[i], c.align)) + ' ')
        .join(color(ANSI.dim, TABLE.v)) +
      color(ANSI.dim, TABLE.v),
  );
  out.push(color(ANSI.dim, mid));
  rows.forEach((r, ri) => {
    const isHighlighted = ri === highlight;
    const rowColor = rowColors ? rowColors[ri] : '';
    const wrapper = (cell) => {
      let s = ' ' + cell + ' ';
      if (rowColor) s = rowColor + s + ANSI.reset;
      if (isHighlighted) s = ANSI.inv + s + ANSI.reset;
      return s;
    };
    out.push(
      color(ANSI.dim, TABLE.v) +
        columns
          .map((c, i) => wrapper(pad(r[i] ?? '', widths[i], c.align)))
          .join(color(ANSI.dim, TABLE.v)) +
        color(ANSI.dim, TABLE.v),
    );
  });
  out.push(color(ANSI.dim, bot));
  return out.join('\n');
}

// --------------------------------------------------------------------------
// Views
// --------------------------------------------------------------------------

function viewApplications(applications, scroll, opts = {}) {
  const { filter = '', highlight = -1, narrow = false } = opts;
  const counts = statusCounts(applications);
  const total = applications.length;
  const countRows = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([status, n]) => [`${statusEmoji(status)} ${status}`, String(n)]);
  countRows.push([color(ANSI.bold, 'total'), color(ANSI.bold, String(total))]);

  const filteredAll = filterRows(applications, filter, ['company', 'role', 'status', 'source', 'platform', 'location']);
  const sorted = [...filteredAll].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recent = sorted.slice(scroll, scroll + 15);

  const rowColors = recent.map((r) => {
    const s = (r.status || '').toLowerCase();
    if (s === 'rejected') return ANSI.dim;
    if (s === 'offer') return ANSI.green + ANSI.bold;
    if (s === 'interview') return ANSI.cyan;
    return '';
  });

  const cols = narrow
    ? [
        { label: 'Date', max: 11 },
        { label: 'Company', max: 22 },
        { label: 'Status', max: 18 },
      ]
    : [
        { label: 'Date', max: 11 },
        { label: 'Company', max: 24 },
        { label: 'Role', max: 28 },
        { label: 'Status', max: 18 },
        { label: 'Source', max: 14 },
      ];

  const detailRows = recent.map((r) =>
    narrow
      ? [r.date || '-', truncate(r.company || '-', 22), `${statusEmoji(r.status)} ${r.status || '-'}`]
      : [
          r.date || '-',
          truncate(r.company || '-', 24),
          truncate(r.role || '-', 28),
          `${statusEmoji(r.status)} ${r.status || '-'}`,
          truncate(r.source || r.platform || '-', 14),
        ],
  );

  const filterTag = filter
    ? color(ANSI.yellow, ` (filter: "${filter}" — ${filteredAll.length}/${applications.length})`)
    : '';

  return {
    output: [
      renderTable({
        title: 'Applications — status breakdown',
        columns: [{ label: 'Status', max: 18 }, { label: 'Count', align: 'right', min: 6 }],
        rows: countRows,
      }),
      '',
      renderTable({
        title: `Applications — recent ${recent.length} of ${filteredAll.length}` + filterTag,
        columns: cols,
        rows: detailRows,
        highlight,
        rowColors,
      }),
    ].join('\n'),
    visibleRows: recent,
    totalRows: filteredAll.length,
  };
}

function viewOutreach(outreach, scroll, opts = {}) {
  const { filter = '', highlight = -1, narrow = false } = opts;
  const total = outreach.length;
  const counts = statusCounts(outreach);
  const countRows = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([s, n]) => [`${statusEmoji(s)} ${s}`, String(n)]);
  countRows.push([color(ANSI.bold, 'total'), color(ANSI.bold, String(total))]);

  const filteredAll = filterRows(outreach, filter, ['company', 'to_name', 'to_email', 'subject', 'status']);
  const sorted = [...filteredAll].sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));
  const recent = sorted.slice(scroll, scroll + 15);

  const rowColors = recent.map((r) => {
    const s = (r.status || '').toLowerCase();
    if (s === 'replied') return ANSI.green;
    if (s === 'bounced') return ANSI.red;
    return '';
  });

  const cols = narrow
    ? [
        { label: 'Sent', max: 11 },
        { label: 'Company', max: 18 },
        { label: 'Recipient', max: 16 },
      ]
    : [
        { label: 'Sent', max: 11 },
        { label: 'Company', max: 22 },
        { label: 'Recipient', max: 22 },
        { label: 'Subject', max: 30 },
        { label: 'Status', max: 14 },
        { label: 'FU', max: 5, align: 'right' },
      ];

  const detailRows = recent.map((r) =>
    narrow
      ? [(r.sent_at || '-').slice(0, 10), truncate(r.company || '-', 18), truncate(r.to_name || '-', 16)]
      : [
          (r.sent_at || '-').slice(0, 10),
          truncate(r.company || '-', 22),
          truncate(r.to_name || '-', 22),
          truncate(r.subject || '-', 30),
          `${statusEmoji(r.status)} ${r.status || '-'}`,
          `${r.follow_up_count || '0'}/2`,
        ],
  );

  const filterTag = filter
    ? color(ANSI.yellow, ` (filter: "${filter}" — ${filteredAll.length}/${outreach.length})`)
    : '';

  return {
    output: [
      renderTable({
        title: 'Outreach — status breakdown',
        columns: [{ label: 'Status', max: 16 }, { label: 'Count', align: 'right', min: 6 }],
        rows: countRows,
      }),
      '',
      renderTable({
        title: `Outreach — recent ${recent.length} of ${filteredAll.length}` + filterTag,
        columns: cols,
        rows: detailRows,
        highlight,
        rowColors,
      }),
    ].join('\n'),
    visibleRows: recent,
    totalRows: filteredAll.length,
  };
}

function viewFollowups(outreach, scroll, opts = {}) {
  const { filter = '', highlight = -1, narrow = false } = opts;
  const all = followUpRows(outreach);
  const bucketCounts = { overdue: 0, due: 0, soon: 0, waiting: 0 };
  for (const x of all) bucketCounts[x.urgency.bucket] += 1;

  const summary = Object.entries(bucketCounts).map(([k, n]) => [
    `${URGENCY_EMOJI[k]} ${k}`,
    String(n),
  ]);
  summary.push([color(ANSI.bold, 'needs follow-up'), color(ANSI.bold, String(all.length))]);

  const filtered = filter
    ? all.filter((x) => {
        const q = filter.toLowerCase();
        return ['company', 'to_name', 'subject'].some((f) =>
          String(x.row[f] || '').toLowerCase().includes(q),
        );
      })
    : all;

  const visible = filtered.slice(scroll, scroll + 15);
  const rowColors = visible.map((x) => URGENCY_COLOR[x.urgency.bucket] || '');

  const cols = narrow
    ? [
        { label: '#', align: 'right', min: 3 },
        { label: 'Urg', max: 12 },
        { label: 'Days', align: 'right', min: 5 },
        { label: 'Company', max: 18 },
        { label: 'Name', max: 16 },
      ]
    : [
        { label: '#', align: 'right', min: 3 },
        { label: 'Urgency', max: 14 },
        { label: 'Days', align: 'right', min: 5 },
        { label: 'Company', max: 22 },
        { label: 'Name', max: 22 },
        { label: 'Round', align: 'right', min: 6 },
        { label: 'Subject', max: 30 },
        { label: 'Sent', max: 11 },
      ];

  const detailRows = visible.map((x, i) => {
    const r = x.row;
    const fc = Number(r.follow_up_count || 0);
    return narrow
      ? [
          String(scroll + i + 1),
          `${URGENCY_EMOJI[x.urgency.bucket]} ${x.urgency.bucket}`,
          String(x.urgency.days),
          truncate(r.company || '-', 18),
          truncate(r.to_name || '-', 16),
        ]
      : [
          String(scroll + i + 1),
          `${URGENCY_EMOJI[x.urgency.bucket]} ${x.urgency.bucket}`,
          String(x.urgency.days),
          truncate(r.company || '-', 22),
          truncate(r.to_name || '-', 22),
          `${fc + 1}/2`,
          truncate(r.subject || '-', 30),
          (r.sent_at || '-').slice(0, 10),
        ];
  });

  const filterTag = filter
    ? color(ANSI.yellow, ` (filter: "${filter}" — ${filtered.length}/${all.length})`)
    : '';

  return {
    output: [
      renderTable({
        title: 'Follow-ups — 7-day cadence, max 2 per contact',
        columns: [{ label: 'Bucket', max: 14 }, { label: 'Count', align: 'right', min: 6 }],
        rows: summary,
      }),
      '',
      filtered.length === 0
        ? color(ANSI.dim, '  (nothing to follow up on right now)\n')
        : renderTable({
            title: `Due now — ${visible.length} of ${filtered.length}` + filterTag,
            columns: cols,
            rows: detailRows,
            highlight,
            rowColors,
          }),
    ].join('\n'),
    visibleRows: visible.map((x) => x.row),
    totalRows: filtered.length,
  };
}

function viewPipeline(applications, outreach) {
  const counts = statusCounts(applications);
  const stages = ['applied', 'submitted', 'interview', 'offer'];
  const stageCounts = {};
  for (const s of stages) stageCounts[s] = counts[s] || 0;

  const total = applications.length;
  const rejected = counts.rejected || 0;
  const blocked = counts.blocked || 0;
  const withdrawn = counts.withdrawn || 0;

  // Cumulative "reached this stage or further" — the right way to read a funnel.
  // status field is current-state, so an interviewing candidate already counted
  // as "submitted" and "applied" — sum forward through the stages.
  const reached = {};
  let running = 0;
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    running += stageCounts[stages[i]];
    reached[stages[i]] = running;
  }

  // Last-14-day sparklines
  const apps14 = rowsPerDay(applications, 'date', 14);
  const out14 = rowsPerDay(outreach, 'sent_at', 14);
  const apps14Total = apps14.reduce((a, b) => a + b, 0);
  const out14Total = out14.reduce((a, b) => a + b, 0);

  // Funnel rows
  const funnelLines = [];
  funnelLines.push(color(ANSI.bold + ANSI.cyan, 'Pipeline funnel — all-time (cumulative: how many reached this stage)'));
  funnelLines.push('');

  const stageEmoji = { applied: '📄', submitted: '📬', interview: '💼', offer: '🎯' };
  const topReached = reached.applied || 1;

  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const n = reached[stage];
    const prevN = i === 0 ? topReached : reached[stages[i - 1]];
    const rate = prevN > 0 && i > 0 ? Math.round((n / prevN) * 100) : 100;
    const barW = Math.floor((n / topReached) * 26);
    const bar = color(ANSI.bg.cyan + ANSI.black, ' '.repeat(Math.max(1, barW))) +
      ' '.repeat(Math.max(0, 26 - barW));
    const rateLabel = i === 0
      ? color(ANSI.dim, `(${total > 0 ? Math.round((n / total) * 100) : 0}% of all logged)`)
      : color(ANSI.dim, `(${rate}% from ${stages[i - 1]})`);
    funnelLines.push(`  ${stageEmoji[stage]} ${pad(stage, 12)} ${pad(String(n), 4, 'right')}   ${bar}  ${rateLabel}`);
    if (i < stages.length - 1) {
      funnelLines.push(color(ANSI.dim, `        │`));
      funnelLines.push(color(ANSI.dim, `        ▼`));
    }
  }

  if (stageCounts.offer > 0) {
    funnelLines.push('');
    funnelLines.push(color(ANSI.bold + ANSI.green, '   🎉 ' + stageCounts.offer + ' offer(s) — congrats'));
  }

  funnelLines.push('');
  funnelLines.push(color(ANSI.bold + ANSI.cyan, 'Closed paths'));
  funnelLines.push('');
  funnelLines.push(`  ${color(ANSI.red, '❌ rejected ')} ${pad(String(rejected), 4, 'right')}   ${color(ANSI.dim, `(${total > 0 ? Math.round((rejected / total) * 100) : 0}% rejection rate)`)}`);
  funnelLines.push(`  ${color(ANSI.dim, '🚫 blocked  ')} ${pad(String(blocked), 4, 'right')}   ${color(ANSI.dim, '(captcha / pre-filtered)')}`);
  funnelLines.push(`  ${color(ANSI.dim, '🚪 withdrawn')} ${pad(String(withdrawn), 4, 'right')}`);

  funnelLines.push('');
  funnelLines.push(color(ANSI.bold + ANSI.cyan, 'Last 14 days — daily activity'));
  funnelLines.push('');
  funnelLines.push(`  📄 applications  ${pad(String(apps14Total), 4, 'right')}   ${color(ANSI.cyan, sparkline(apps14))}`);
  funnelLines.push(`  ✉️  cold emails   ${pad(String(out14Total), 4, 'right')}   ${color(ANSI.cyan, sparkline(out14))}`);

  return {
    output: funnelLines.join('\n'),
    visibleRows: [],
    totalRows: 0,
  };
}

// --------------------------------------------------------------------------
// Detail pane (shown on the right when state.detailRow is set)
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Reports view (5th tab) — lists eval reports from /job-evaluate
// --------------------------------------------------------------------------

// Best-effort YAML frontmatter parser (just the simple key: value lines we
// emit from /job-evaluate). Doesn't handle nested maps beyond fit_breakdown.
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: text };
  const block = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, '');
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    meta[m[1]] = val;
  }
  return { meta, body };
}

function loadReports(root) {
  const dir = path.join(root, 'reports');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const filePath = path.join(dir, name);
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const { meta, body } = parseFrontmatter(text);
      out.push({
        path: filePath,
        relPath: path.join('reports', name),
        name,
        company: meta.company || '',
        role: meta.role || '',
        url: meta.url || '',
        evaluated_at: meta.evaluated_at || '',
        fit_score: typeof meta.fit_score === 'number' ? meta.fit_score : Number(meta.fit_score) || 0,
        status: meta.status || 'evaluated',
        body,
      });
    } catch (_) { /* skip malformed */ }
  }
  return out.sort((a, b) => (b.evaluated_at || '').localeCompare(a.evaluated_at || ''));
}

function fitColor(score) {
  if (score >= 4.0) return ANSI.green + ANSI.bold;
  if (score >= 3.0) return ANSI.cyan;
  if (score >= 2.0) return ANSI.yellow;
  return ANSI.dim;
}

function viewReports(applications, outreach, opts = {}) {
  // signature matches the others (applications, outreach, scroll, opts)
  // but reports come from disk, not CSVs, so we re-resolve root inline.
  const { filter = '', highlight = -1, narrow = false, scroll = 0, root } = opts;
  const reports = root ? loadReports(root) : [];

  if (reports.length === 0) {
    return {
      output: [
        color(ANSI.bold + ANSI.cyan, 'Evaluation reports'),
        '',
        color(ANSI.dim, '  (no reports yet — paste a job URL in chat and ask Claude to /job-evaluate it)'),
      ].join('\n'),
      visibleRows: [],
      totalRows: 0,
    };
  }

  const filtered = filter
    ? reports.filter((r) => {
        const q = filter.toLowerCase();
        return [r.company, r.role, r.status].some((f) => String(f).toLowerCase().includes(q));
      })
    : reports;

  // Score buckets
  const buckets = { 'high (4.0+)': 0, 'medium (3.0-3.9)': 0, 'low (<3.0)': 0 };
  for (const r of filtered) {
    if (r.fit_score >= 4.0) buckets['high (4.0+)'] += 1;
    else if (r.fit_score >= 3.0) buckets['medium (3.0-3.9)'] += 1;
    else buckets['low (<3.0)'] += 1;
  }
  const summary = Object.entries(buckets).map(([k, n]) => [k, String(n)]);
  summary.push([color(ANSI.bold, 'total'), color(ANSI.bold, String(filtered.length))]);

  const visible = filtered.slice(scroll, scroll + 15);
  const rowColors = visible.map((r) => fitColor(r.fit_score));

  const cols = narrow
    ? [
        { label: 'Date', max: 11 },
        { label: 'Fit', max: 5, align: 'right' },
        { label: 'Company', max: 22 },
        { label: 'Status', max: 12 },
      ]
    : [
        { label: 'Date', max: 11 },
        { label: 'Fit', max: 5, align: 'right' },
        { label: 'Company', max: 22 },
        { label: 'Role', max: 28 },
        { label: 'Status', max: 14 },
        { label: 'Report', max: 30 },
      ];

  const detailRows = visible.map((r) =>
    narrow
      ? [
          (r.evaluated_at || '-').slice(0, 10),
          r.fit_score ? r.fit_score.toFixed(1) : '-',
          truncate(r.company || '-', 22),
          truncate(r.status || '-', 12),
        ]
      : [
          (r.evaluated_at || '-').slice(0, 10),
          r.fit_score ? r.fit_score.toFixed(1) : '-',
          truncate(r.company || '-', 22),
          truncate(r.role || '-', 28),
          truncate(r.status || '-', 14),
          truncate(r.relPath, 30),
        ],
  );

  const filterTag = filter
    ? color(ANSI.yellow, ` (filter: "${filter}" — ${filtered.length}/${reports.length})`)
    : '';

  return {
    output: [
      renderTable({
        title: 'Reports — fit-score breakdown',
        columns: [{ label: 'Bucket', max: 18 }, { label: 'Count', align: 'right', min: 6 }],
        rows: summary,
      }),
      '',
      renderTable({
        title: `Reports — recent ${visible.length} of ${filtered.length}` + filterTag,
        columns: cols,
        rows: detailRows,
        highlight,
        rowColors,
      }),
    ].join('\n'),
    visibleRows: visible,
    totalRows: filtered.length,
  };
}

function renderReportDetail(report, height) {
  if (!report) return '';
  const lines = [];
  lines.push(color(ANSI.bold + ANSI.cyan, '─── Report '.padEnd(60, '─')));
  lines.push('');
  lines.push(`  ${color(ANSI.bold, 'Company:')}  ${report.company || '(none)'}`);
  lines.push(`  ${color(ANSI.bold, 'Role:')}     ${report.role || '(none)'}`);
  lines.push(`  ${color(ANSI.bold, 'Fit score:')} ${color(fitColor(report.fit_score), (report.fit_score || 0).toFixed(1) + ' / 5.0')}`);
  lines.push(`  ${color(ANSI.bold, 'Status:')}   ${report.status}`);
  lines.push(`  ${color(ANSI.bold, 'Date:')}     ${(report.evaluated_at || '').slice(0, 10)}`);
  if (report.url) lines.push(`  ${color(ANSI.bold, 'URL:')}      ${color(ANSI.blue, truncate(report.url, 50))}`);
  lines.push(`  ${color(ANSI.bold, 'File:')}     ${color(ANSI.dim, report.relPath)}`);
  lines.push('');
  lines.push(color(ANSI.dim, '─── Body ───'));
  lines.push('');
  // Render the body with the ANSI markdown renderer, capped at the available height
  const rendered = renderMarkdown(report.body || '', 56);
  const bodyLines = rendered.split('\n').slice(0, height - 12);
  for (const line of bodyLines) lines.push(line);
  if (rendered.split('\n').length > bodyLines.length) {
    lines.push('');
    lines.push(color(ANSI.dim, `  …open ${report.relPath} for the full report`));
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Plan view (6th tab) — surfaces config/search-plan.md (the /job-coach plan)
// --------------------------------------------------------------------------

function viewPlan(applications, outreach, opts = {}) {
  const { root } = opts;
  const planPath = root ? path.join(root, 'config', 'search-plan.md') : null;
  if (!planPath || !fs.existsSync(planPath)) {
    return {
      output: [
        color(ANSI.bold + ANSI.cyan, 'Search plan'),
        '',
        color(ANSI.dim, '  (no plan yet — run `/job-coach intake` to build one)'),
      ].join('\n'),
      visibleRows: [],
      totalRows: 0,
    };
  }

  const text = fs.readFileSync(planPath, 'utf8');
  const ageDays = Math.floor((Date.now() - fs.statSync(planPath).mtimeMs) / 86_400_000);
  const ageBucket = ageDays > 14 ? color(ANSI.red, `${ageDays}d old — stale, run /job-coach refresh`)
    : ageDays > 7 ? color(ANSI.yellow, `${ageDays}d old — getting stale`)
    : color(ANSI.green, `${ageDays}d old — fresh`);

  return {
    output: [
      renderTable({
        title: 'Search plan — meta',
        columns: [{ label: 'Field', max: 20 }, { label: 'Value', max: 80 }],
        rows: [
          ['Path', planPath.replace(root + '/', '')],
          ['Last updated', ageBucket],
          ['Bytes', String(text.length)],
        ],
      }),
      '',
      color(ANSI.bold + ANSI.cyan, 'Plan body (markdown)'),
      '',
      renderMarkdown(text, 80),
    ].join('\n'),
    visibleRows: [],
    totalRows: 0,
  };
}

// --------------------------------------------------------------------------
// Markdown → ANSI renderer (small, just enough for our reports + plans)
// --------------------------------------------------------------------------

function renderMarkdown(text, maxWidth = 80) {
  const out = [];
  const lines = text.split('\n');
  let inCode = false;
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    // Skip YAML frontmatter
    if (i === 0 && line.startsWith('---')) { inFrontmatter = true; continue; }
    if (inFrontmatter) {
      if (line.startsWith('---')) inFrontmatter = false;
      continue;
    }

    // Code fences
    if (line.startsWith('```')) {
      inCode = !inCode;
      out.push(color(ANSI.dim, '  ' + line));
      continue;
    }
    if (inCode) {
      out.push('  ' + color(ANSI.dim, line));
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      out.push('  ' + color(ANSI.bold + ANSI.cyan, line.slice(4)));
      continue;
    }
    if (line.startsWith('## ')) {
      out.push('  ' + color(ANSI.bold + ANSI.cyan, line.slice(3)));
      continue;
    }
    if (line.startsWith('# ')) {
      out.push('  ' + color(ANSI.bold + ANSI.blue, line.slice(2)));
      continue;
    }

    // Block quote
    if (line.startsWith('> ')) {
      out.push('  ' + color(ANSI.dim, '┃ ') + color(ANSI.dim, applyInline(line.slice(2))));
      continue;
    }

    // Bullet
    if (/^\s*[-*]\s/.test(line)) {
      const indent = (line.match(/^\s*/) || [''])[0];
      const body = line.replace(/^\s*[-*]\s/, '');
      out.push('  ' + indent + color(ANSI.cyan, '•') + ' ' + applyInline(body));
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const m = line.match(/^(\s*)(\d+)\.\s(.*)$/);
      if (m) {
        out.push('  ' + m[1] + color(ANSI.cyan, m[2] + '.') + ' ' + applyInline(m[3]));
        continue;
      }
    }

    // hr
    if (line.match(/^---+\s*$/)) {
      out.push('  ' + color(ANSI.dim, '─'.repeat(Math.min(60, maxWidth))));
      continue;
    }

    // Paragraph (apply inline + indent)
    if (line.trim()) {
      out.push('  ' + applyInline(line));
    } else {
      out.push('');
    }
  }
  return out.join('\n');
}

function applyInline(text) {
  // Order matters — code first so its content isn't bold/italic'd
  return text
    .replace(/`([^`\n]+)`/g, (_, m) => color(ANSI.bg.black + ANSI.cyan, ' ' + m + ' '))
    .replace(/\*\*([^*\n]+)\*\*/g, (_, m) => color(ANSI.bold, m))
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_, lead, m) => lead + color(ANSI.dim, m))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => color(ANSI.blue + ANSI.bold, label) + color(ANSI.dim, ` (${url})`));
}

// --------------------------------------------------------------------------
// Artifact counter (PDFs, prep notes) — shown in footer
// --------------------------------------------------------------------------

function countArtifacts(root) {
  const pdfDir = path.join(root, 'output');
  const prepDir = path.join(root, 'interview-prep');
  let pdfs = 0;
  let preps = 0;
  try { pdfs = fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf')).length; } catch (_) { /* none */ }
  try { preps = fs.readdirSync(prepDir).filter((f) => f.endsWith('.md')).length; } catch (_) { /* none */ }
  return { pdfs, preps };
}

function renderDetailPane(row, sourceKey, height) {
  if (!row) return '';
  const lines = [];
  lines.push(color(ANSI.bold + ANSI.cyan, '─── Detail '.padEnd(60, '─')));
  lines.push('');

  const fields = sourceKey === 'applications'
    ? ['date', 'company', 'role', 'status', 'location', 'source', 'platform', 'applied_by', 'url', 'notes', 'contact', 'compensation']
    : ['sent_at', 'company', 'role', 'to_name', 'to_email', 'to_title', 'to_linkedin', 'subject', 'body_file', 'message_id', 'status', 'replied_at', 'follow_up_count', 'last_follow_up_at', 'notes'];

  for (const f of fields) {
    const v = row[f];
    if (!v) continue;
    const label = color(ANSI.bold, pad(f, 18));
    let displayValue = String(v);
    if (f === 'status') displayValue = `${statusEmoji(v)} ${v}`;
    if (f === 'url' || f === 'to_linkedin') displayValue = color(ANSI.blue + ANSI.bold, displayValue);
    if (f === 'notes') {
      // Wrap long notes
      const wrapped = displayValue.match(/.{1,55}(\s|$)/g) || [displayValue];
      lines.push(`  ${label} ${wrapped[0]}`);
      for (let i = 1; i < wrapped.length; i += 1) {
        lines.push(`  ${' '.repeat(18)} ${wrapped[i]}`);
      }
    } else {
      lines.push(`  ${label} ${truncate(displayValue, 55)}`);
    }
  }

  lines.push('');
  lines.push(color(ANSI.dim, '  Press esc or enter to close'));

  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Help overlay (centered modal box)
// --------------------------------------------------------------------------

function renderHelpOverlay(termRows, termCols) {
  const helpLines = [
    [color(ANSI.bold + ANSI.cyan, 'AI Job Agent Dashboard — keybindings')],
    [''],
    ['Navigation'],
    ['  tab / →     ', 'next tab'],
    ['  ←           ', 'previous tab'],
    ['  1-6        ', 'jump to tab (Apps · Outreach · Follow-ups · Pipeline · Reports · Plan)'],
    ['  ↑ ↓ j k    ', 'scroll rows up / down'],
    [''],
    ['Filtering'],
    ['  /           ', 'fuzzy filter on current tab (type to filter, esc to clear)'],
    [''],
    ['Detail view'],
    ['  enter       ', 'open detail pane for the highlighted row'],
    ['  esc         ', 'close detail pane'],
    [''],
    ['Other'],
    ['  r           ', 'reload from disk (auto-reload also fires on file change)'],
    ['  ?           ', 'toggle this help overlay'],
    ['  q / Ctrl-C  ', 'quit'],
    [''],
    [color(ANSI.dim, 'Press any key to dismiss')],
  ];

  const width = 64;
  const innerW = width - 4;
  const boxLines = helpLines.map((parts) => {
    const text = parts.length === 1 ? parts[0] : color(ANSI.bold, parts[0]) + parts[1];
    return color(ANSI.dim, TABLE.v) + ' ' + pad(text, innerW) + ' ' + color(ANSI.dim, TABLE.v);
  });
  const top = color(ANSI.dim, TABLE.tl + TABLE.h.repeat(width - 2) + TABLE.tr);
  const bot = color(ANSI.dim, TABLE.bl + TABLE.h.repeat(width - 2) + TABLE.br);

  const totalH = boxLines.length + 2;
  const startRow = Math.max(2, Math.floor((termRows - totalH) / 2));
  const startCol = Math.max(1, Math.floor((termCols - width) / 2));

  const out = [];
  out.push(`\x1b[${startRow};${startCol}H${top}`);
  boxLines.forEach((l, i) => {
    out.push(`\x1b[${startRow + 1 + i};${startCol}H${l}`);
  });
  out.push(`\x1b[${startRow + 1 + boxLines.length};${startCol}H${bot}`);
  return out.join('');
}

// --------------------------------------------------------------------------
// Snapshot mode
// --------------------------------------------------------------------------

function printSnapshot(data) {
  const { applications, outreach, root } = data;
  const artifacts = countArtifacts(root);
  process.stdout.write(color(ANSI.bold, '\nAI Job Agent Dashboard') + '\n');
  process.stdout.write(color(ANSI.dim, `  ${root}`) + '\n');
  process.stdout.write(
    color(ANSI.dim, `  artifacts: ${artifacts.pdfs} CV PDF(s) · ${artifacts.preps} interview prep note(s)\n\n`),
  );
  if (applications.error || outreach.error) {
    process.stdout.write(color(ANSI.red, `  error: ${applications.error || outreach.error}\n`));
    return;
  }
  process.stdout.write(viewApplications(applications, 0).output + '\n\n');
  process.stdout.write(viewOutreach(outreach, 0).output + '\n\n');
  process.stdout.write(viewFollowups(outreach, 0).output + '\n\n');
  process.stdout.write(viewPipeline(applications, outreach).output + '\n\n');
  const reportsView = viewReports(applications, outreach, { root });
  process.stdout.write(reportsView.output + '\n\n');
  const planView = viewPlan(applications, outreach, { root });
  process.stdout.write(planView.output + '\n\n');
  process.stdout.write(
    color(ANSI.dim, '  For live interactive view: run `npm run dashboard` in a terminal tab. Press ? once running for keybinds.\n'),
  );
}

// --------------------------------------------------------------------------
// Interactive TUI
// --------------------------------------------------------------------------

const TABS = [
  { key: 'applications', label: 'Applications', render: viewApplications, source: 'applications' },
  { key: 'outreach', label: 'Outreach', render: viewOutreach, source: 'outreach' },
  { key: 'followups', label: 'Follow-ups', render: viewFollowups, source: 'outreach' },
  { key: 'pipeline', label: 'Pipeline', render: viewPipeline, source: 'pipeline' },
  { key: 'reports', label: 'Reports', render: viewReports, source: 'reports' },
  { key: 'plan', label: 'Plan', render: viewPlan, source: 'plan' },
];

function runInteractive(initialData, root) {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      color(ANSI.yellow, 'Not a TTY — falling back to --snapshot.\n') +
        color(ANSI.dim, 'To use the interactive TUI, run this command in a terminal.\n'),
    );
    printSnapshot({ ...initialData, root });
    return;
  }

  let state = {
    tab: 0,
    scroll: 0,
    cursor: 0,           // index into the current tab's visible rows
    ...initialData,
    lastLoaded: new Date(),
    helpVisible: false,
    filterMode: false,
    filterQuery: '',
    detailRow: null,     // the row object being inspected; null means no detail pane
  };

  let lastViewMeta = { visibleRows: [], totalRows: 0 };
  let watchTimer = null;
  let watchers = [];

  const reload = () => {
    const applications = loadCSV(path.join(root, 'application-tracker.csv'));
    const outreach = loadCSV(path.join(root, 'outreach-log.csv'));
    state.applications = applications;
    state.outreach = outreach;
    state.lastLoaded = new Date();
  };

  // Auto-reload when CSVs change. Debounce: fs.watch fires multiple times per save.
  const setupWatchers = () => {
    const csvs = [
      path.join(root, 'application-tracker.csv'),
      path.join(root, 'outreach-log.csv'),
    ];
    for (const p of csvs) {
      if (!fs.existsSync(p)) continue;
      try {
        const w = fs.watch(p, () => {
          if (watchTimer) clearTimeout(watchTimer);
          watchTimer = setTimeout(() => {
            reload();
            draw();
          }, 200);
        });
        watchers.push(w);
      } catch (_) {
        // Ignore watch errors — manual `r` still works.
      }
    }
  };

  process.stdout.write(ANSI.alt + ANSI.hideCursor);

  const cleanup = () => {
    process.stdout.write(ANSI.showCursor + ANSI.altOff);
    for (const w of watchers) {
      try { w.close(); } catch (_) { /* noop */ }
    }
    if (watchTimer) clearTimeout(watchTimer);
    try {
      process.stdin.setRawMode(false);
    } catch (_) {
      /* noop */
    }
    process.stdin.pause();
  };

  const draw = () => {
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;
    const narrow = cols < 100;
    const splitPane = state.detailRow != null && cols >= 120;
    const listWidth = splitPane ? Math.floor(cols * 0.55) : cols;

    process.stdout.write(ANSI.clear);

    // Header — title + path + artifact counts
    const artifacts = countArtifacts(root);
    const title = ' AI Job Agent Dashboard ';
    process.stdout.write(color(ANSI.bg.blue + ANSI.bold + ANSI.white, title));
    process.stdout.write(color(ANSI.dim, '  ' + root));
    if (artifacts.pdfs || artifacts.preps) {
      process.stdout.write(color(ANSI.dim, `   📑 ${artifacts.pdfs} PDF · 🎤 ${artifacts.preps} prep`));
    }
    process.stdout.write('\n\n');

    // Tabs
    const tabLine = TABS.map((t, i) => {
      const label = ` ${i + 1}·${t.label} `;
      if (i === state.tab) return color(ANSI.bg.cyan + ANSI.bold + ANSI.black, label);
      return color(ANSI.dim, label);
    }).join(' ');
    process.stdout.write(tabLine + '\n\n');

    // Current tab content
    const current = TABS[state.tab];
    let viewResult;
    if (current.key === 'pipeline') {
      viewResult = viewPipeline(state.applications, state.outreach);
    } else if (current.key === 'reports') {
      viewResult = viewReports(state.applications, state.outreach, {
        filter: state.filterQuery,
        highlight: state.cursor,
        narrow: splitPane || narrow,
        scroll: state.scroll,
        root,
      });
    } else if (current.key === 'plan') {
      viewResult = viewPlan(state.applications, state.outreach, { root });
    } else {
      const data = state[current.source];
      if (data && data.error) {
        process.stdout.write(color(ANSI.red, `  error reading ${current.source}: ${data.error}\n`));
        viewResult = { output: '', visibleRows: [], totalRows: 0 };
      } else {
        viewResult = current.render(data || [], state.scroll, {
          filter: state.filterQuery,
          highlight: state.cursor,
          narrow: splitPane || narrow,
        });
      }
    }

    lastViewMeta = { visibleRows: viewResult.visibleRows, totalRows: viewResult.totalRows };

    // Render the main view (constrained to listWidth if split-pane)
    process.stdout.write(viewResult.output + '\n');

    // Right-side detail pane
    if (splitPane && state.detailRow) {
      // Reports tab uses a markdown-aware detail renderer; other tabs use the
      // generic field-list pane.
      const detailContent = current.key === 'reports'
        ? renderReportDetail(state.detailRow, rows - 8)
        : renderDetailPane(state.detailRow, current.source, rows - 8);
      const detailLines = detailContent.split('\n');
      detailLines.forEach((line, i) => {
        process.stdout.write(`\x1b[${4 + i};${listWidth + 2}H${line}`);
      });
    }

    // Footer — context-aware keybinds
    const footerY = rows;
    let footer;
    if (state.filterMode) {
      footer =
        color(ANSI.bg.yellow + ANSI.black, ' FILTER ') +
        ` ${state.filterQuery}${color(ANSI.bold, '_')}    ` +
        color(ANSI.dim, '[enter] confirm  [esc] cancel');
    } else if (state.detailRow) {
      footer =
        `  ${color(ANSI.dim, 'detail')}   ` +
        `${color(ANSI.bold, '[esc/enter]')} close   ` +
        `${color(ANSI.bold, '[?]')} help   ` +
        `${color(ANSI.bold, '[q]')} quit`;
    } else {
      const reloaded = state.lastLoaded.toLocaleTimeString();
      const tabHint = current.key === 'pipeline'
        ? `${color(ANSI.bold, '[tab/←→]')} switch tab`
        : `${color(ANSI.bold, '[/]')} filter   ${color(ANSI.bold, '[enter]')} detail`;
      footer =
        `  ${color(ANSI.dim, 'loaded')} ${reloaded}   ` +
        `${tabHint}   ` +
        `${color(ANSI.bold, '[?]')} help   ` +
        `${color(ANSI.bold, '[q]')} quit`;
    }
    process.stdout.write(`\x1b[${footerY};1H` + footer);

    // Help overlay last so it's on top
    if (state.helpVisible) {
      process.stdout.write(renderHelpOverlay(rows, cols));
    }
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  process.stdin.on('keypress', (ch, key) => {
    if (!key) return;

    // Filter mode captures everything (text input)
    if (state.filterMode) {
      if (key.name === 'escape') {
        state.filterMode = false;
        state.filterQuery = '';
        state.cursor = 0;
        state.scroll = 0;
      } else if (key.name === 'return') {
        state.filterMode = false;
        state.cursor = 0;
        state.scroll = 0;
      } else if (key.name === 'backspace') {
        state.filterQuery = state.filterQuery.slice(0, -1);
        state.cursor = 0;
        state.scroll = 0;
      } else if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      } else if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
        state.filterQuery += ch;
        state.cursor = 0;
        state.scroll = 0;
      } else {
        return;
      }
      draw();
      return;
    }

    // Help overlay: any key dismisses (except quit)
    if (state.helpVisible) {
      if (key.ctrl && key.name === 'c') { cleanup(); process.exit(0); }
      if (key.name === 'q') { cleanup(); process.exit(0); }
      state.helpVisible = false;
      draw();
      return;
    }

    // Quit
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      cleanup();
      process.exit(0);
    }

    // Detail pane: esc closes; arrows / enter still navigate
    if (state.detailRow) {
      if (key.name === 'escape' || key.name === 'return') {
        state.detailRow = null;
        draw();
        return;
      }
    }

    if (key.name === 'escape') {
      // No-op when nothing to dismiss; future: could close detail or filter.
      return;
    }

    if (key.name === '?' || ch === '?') {
      state.helpVisible = true;
      draw();
      return;
    }

    if (key.name === '/' || ch === '/') {
      state.filterMode = true;
      draw();
      return;
    }

    if (key.name === 'return') {
      // Open detail pane for highlighted row
      const visible = lastViewMeta.visibleRows;
      if (visible.length > 0) {
        const idx = Math.min(state.cursor, visible.length - 1);
        state.detailRow = visible[idx];
        draw();
      }
      return;
    }

    if (key.name === 'tab' || key.name === 'right') {
      state.tab = (state.tab + 1) % TABS.length;
      state.scroll = 0;
      state.cursor = 0;
      state.filterQuery = '';
    } else if (key.name === 'left') {
      state.tab = (state.tab - 1 + TABS.length) % TABS.length;
      state.scroll = 0;
      state.cursor = 0;
      state.filterQuery = '';
    } else if (ch === '1' || ch === '2' || ch === '3' || ch === '4' || ch === '5' || ch === '6') {
      state.tab = Math.min(TABS.length - 1, Number(ch) - 1);
      state.scroll = 0;
      state.cursor = 0;
      state.filterQuery = '';
    } else if (key.name === 'down' || key.name === 'j') {
      state.cursor += 1;
      const visible = lastViewMeta.visibleRows.length;
      if (state.cursor >= visible && state.scroll + visible < lastViewMeta.totalRows) {
        state.scroll += 1;
        state.cursor = visible - 1;
      } else if (state.cursor >= visible) {
        state.cursor = Math.max(0, visible - 1);
      }
    } else if (key.name === 'up' || key.name === 'k') {
      if (state.cursor > 0) {
        state.cursor -= 1;
      } else if (state.scroll > 0) {
        state.scroll -= 1;
      }
    } else if (key.name === 'r') {
      reload();
    } else {
      return;
    }
    draw();
  });

  process.stdout.on('resize', draw);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  setupWatchers();
  draw();
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const snapshot = args.includes('--snapshot') || args.includes('-s');

  const root = resolveRepoRoot();
  if (!root) {
    process.stderr.write(
      color(ANSI.red, 'Could not find the ai-job-agent repo.\n') +
        'Set $AI_JOB_AGENT_ROOT, run `bash skills/install.sh` from the repo, ' +
        'or clone to ~/ai-job-agent.\n',
    );
    process.exit(1);
  }

  const applications = loadCSV(path.join(root, 'application-tracker.csv'));
  const outreach = loadCSV(path.join(root, 'outreach-log.csv'));

  if (snapshot) {
    printSnapshot({ applications, outreach, root });
    return;
  }

  runInteractive({ applications, outreach }, root);
}

main();
