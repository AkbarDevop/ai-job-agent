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
// the repo root (resolved via $AI_JOB_AGENT_ROOT, the REPO_PATH marker file,
// or ~/ai-job-agent as a fallback).
//
// Keybindings in interactive mode:
//   tab / right / left   switch tab
//   1  2  3              jump to tab
//   up / down / j / k    scroll rows
//   r                    reload from disk
//   q / Ctrl-C / esc     quit

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

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

// Approximate visible width — emoji counts as 2, everything else as 1.
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

// --------------------------------------------------------------------------
// Path resolution
// --------------------------------------------------------------------------

function resolveRepoRoot() {
  // Priority order:
  //   1. $AI_JOB_AGENT_ROOT       explicit override
  //   2. ~/.claude/skills/ai-job-agent   gstack-style install (recommended)
  //   3. ~/.claude/skills/ai-job-agent/REPO_PATH   marker file (legacy)
  //   4. ~/ai-job-agent           fallback for manual clones
  //   5. walk up from this script  last resort
  const candidates = [
    process.env.AI_JOB_AGENT_ROOT,
    path.join(os.homedir(), '.claude/skills/ai-job-agent'),
    readMarker(),
    path.join(os.homedir(), 'ai-job-agent'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  let dir = path.dirname(new URL(import.meta.url).pathname);
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

// --------------------------------------------------------------------------
// Table rendering
// --------------------------------------------------------------------------

const TABLE = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│', cross: '┼', t: '┬', b: '┴', l: '├', r: '┤',
};

function renderTable({ title, columns, rows, highlight = -1 }) {
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
    const inv = ri === highlight ? ANSI.inv : '';
    out.push(
      color(ANSI.dim, TABLE.v) +
        columns
          .map((c, i) => {
            const cell = ' ' + pad(r[i] ?? '', widths[i], c.align) + ' ';
            return inv ? color(inv, cell) : cell;
          })
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

function viewApplications(applications, scroll) {
  const counts = statusCounts(applications);
  const total = applications.length;
  const countRows = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([status, n]) => [`${statusEmoji(status)} ${status}`, String(n)]);
  countRows.push([color(ANSI.bold, 'total'), color(ANSI.bold, String(total))]);

  const recent = [...applications]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(scroll, scroll + 15);

  const detailRows = recent.map((r) => [
    r.date || '-',
    truncate(r.company || '-', 24),
    truncate(r.role || '-', 28),
    `${statusEmoji(r.status)} ${r.status || '-'}`,
    truncate(r.source || r.platform || '-', 14),
  ]);

  return [
    renderTable({
      title: 'Applications — status breakdown',
      columns: [{ label: 'Status', max: 18 }, { label: 'Count', align: 'right', min: 6 }],
      rows: countRows,
    }),
    '',
    renderTable({
      title: `Applications — recent ${recent.length} of ${applications.length}`,
      columns: [
        { label: 'Date', max: 12 },
        { label: 'Company', max: 24 },
        { label: 'Role', max: 28 },
        { label: 'Status', max: 20 },
        { label: 'Source', max: 14 },
      ],
      rows: detailRows,
    }),
  ].join('\n');
}

function viewOutreach(outreach, scroll) {
  const total = outreach.length;
  const counts = statusCounts(outreach);
  const countRows = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([s, n]) => [`${statusEmoji(s)} ${s}`, String(n)]);
  countRows.push([color(ANSI.bold, 'total'), color(ANSI.bold, String(total))]);

  const recent = [...outreach]
    .sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''))
    .slice(scroll, scroll + 15);

  const detailRows = recent.map((r) => [
    (r.sent_at || '-').slice(0, 10),
    truncate(r.company || '-', 22),
    truncate(r.to_name || '-', 22),
    truncate(r.subject || '-', 32),
    `${statusEmoji(r.status)} ${r.status || '-'}`,
    `${r.follow_up_count || '0'}/2`,
  ]);

  return [
    renderTable({
      title: 'Outreach — status breakdown',
      columns: [{ label: 'Status', max: 16 }, { label: 'Count', align: 'right', min: 6 }],
      rows: countRows,
    }),
    '',
    renderTable({
      title: `Outreach — recent ${recent.length} of ${outreach.length}`,
      columns: [
        { label: 'Sent', max: 12 },
        { label: 'Company', max: 22 },
        { label: 'Recipient', max: 22 },
        { label: 'Subject', max: 32 },
        { label: 'Status', max: 16 },
        { label: 'FU', max: 5, align: 'right' },
      ],
      rows: detailRows,
    }),
  ].join('\n');
}

function viewFollowups(outreach, scroll) {
  const all = followUpRows(outreach);
  const bucketCounts = { overdue: 0, due: 0, soon: 0, waiting: 0 };
  for (const x of all) bucketCounts[x.urgency.bucket] += 1;

  const summary = Object.entries(bucketCounts).map(([k, n]) => [
    `${URGENCY_EMOJI[k]} ${k}`,
    String(n),
  ]);
  summary.push([color(ANSI.bold, 'needs follow-up'), color(ANSI.bold, String(all.length))]);

  const visible = all.slice(scroll, scroll + 15);
  const detailRows = visible.map((x, i) => {
    const r = x.row;
    const fc = Number(r.follow_up_count || 0);
    return [
      String(scroll + i + 1),
      `${URGENCY_EMOJI[x.urgency.bucket]} ${x.urgency.bucket}`,
      String(x.urgency.days),
      truncate(r.company || '-', 22),
      truncate(r.to_name || '-', 22),
      `${fc + 1}/2`,
      truncate(r.subject || '-', 34),
      (r.sent_at || '-').slice(0, 10),
    ];
  });

  return [
    renderTable({
      title: 'Follow-ups — 7-day cadence, max 2 per contact',
      columns: [{ label: 'Bucket', max: 14 }, { label: 'Count', align: 'right', min: 6 }],
      rows: summary,
    }),
    '',
    all.length === 0
      ? color(ANSI.dim, '  (nothing to follow up on right now)\n')
      : renderTable({
          title: `Due now — ${visible.length} of ${all.length}`,
          columns: [
            { label: '#', align: 'right', min: 3 },
            { label: 'Urgency', max: 14 },
            { label: 'Days', align: 'right', min: 5 },
            { label: 'Company', max: 22 },
            { label: 'Name', max: 22 },
            { label: 'Round', align: 'right', min: 6 },
            { label: 'Subject', max: 34 },
            { label: 'Sent', max: 12 },
          ],
          rows: detailRows,
        }),
  ].join('\n');
}

// --------------------------------------------------------------------------
// Snapshot mode
// --------------------------------------------------------------------------

function printSnapshot(data) {
  const { applications, outreach, root } = data;
  process.stdout.write(color(ANSI.bold, '\nAI Job Agent Dashboard') + '\n');
  process.stdout.write(color(ANSI.dim, `  ${root}`) + '\n\n');
  if (applications.error || outreach.error) {
    process.stdout.write(color(ANSI.red, `  error: ${applications.error || outreach.error}\n`));
    return;
  }
  process.stdout.write(viewApplications(applications, 0) + '\n\n');
  process.stdout.write(viewOutreach(outreach, 0) + '\n\n');
  process.stdout.write(viewFollowups(outreach, 0) + '\n\n');
  process.stdout.write(
    color(ANSI.dim, '  For live interactive view: run `npm run dashboard` in a terminal tab.\n'),
  );
}

// --------------------------------------------------------------------------
// Interactive TUI
// --------------------------------------------------------------------------

const TABS = [
  { key: 'applications', label: 'Applications', render: viewApplications, source: 'applications' },
  { key: 'outreach', label: 'Outreach', render: viewOutreach, source: 'outreach' },
  { key: 'followups', label: 'Follow-ups', render: viewFollowups, source: 'outreach' },
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
    ...initialData,
    lastLoaded: new Date(),
  };

  const reload = () => {
    const applications = loadCSV(path.join(root, 'application-tracker.csv'));
    const outreach = loadCSV(path.join(root, 'outreach-log.csv'));
    state.applications = applications;
    state.outreach = outreach;
    state.lastLoaded = new Date();
  };

  process.stdout.write(ANSI.alt + ANSI.hideCursor);

  const cleanup = () => {
    process.stdout.write(ANSI.showCursor + ANSI.altOff);
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
    process.stdout.write(ANSI.clear);

    // Header
    const title = ' AI Job Agent Dashboard ';
    process.stdout.write(color(ANSI.bg.blue + ANSI.bold + ANSI.white, title));
    process.stdout.write(color(ANSI.dim, '  ' + root) + '\n\n');

    // Tabs
    const tabLine = TABS.map((t, i) => {
      const label = ` ${i + 1}·${t.label} `;
      if (i === state.tab) return color(ANSI.bg.cyan + ANSI.bold + ANSI.black, label);
      return color(ANSI.dim, label);
    }).join(' ');
    process.stdout.write(tabLine + '\n\n');

    // Current tab content
    const current = TABS[state.tab];
    const data = state[current.source];
    if (data && data.error) {
      process.stdout.write(color(ANSI.red, `  error reading ${current.source}: ${data.error}\n`));
    } else {
      process.stdout.write(current.render(data || [], state.scroll) + '\n');
    }

    // Footer
    const reloaded = state.lastLoaded.toLocaleTimeString();
    const footer =
      `  ${color(ANSI.dim, 'loaded')} ${reloaded}   ` +
      `${color(ANSI.bold, '[tab/←→]')} switch tab   ` +
      `${color(ANSI.bold, '[↑↓/j/k]')} scroll   ` +
      `${color(ANSI.bold, '[r]')} reload   ` +
      `${color(ANSI.bold, '[q]')} quit`;
    // Position footer at last row
    process.stdout.write(`\x1b[${rows};1H` + footer);
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  process.stdin.on('keypress', (ch, key) => {
    if (!key) return;
    if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      cleanup();
      process.exit(0);
    }
    if (key.name === 'tab' || key.name === 'right') {
      state.tab = (state.tab + 1) % TABS.length;
      state.scroll = 0;
    } else if (key.name === 'left') {
      state.tab = (state.tab - 1 + TABS.length) % TABS.length;
      state.scroll = 0;
    } else if (ch === '1' || ch === '2' || ch === '3') {
      state.tab = Math.min(TABS.length - 1, Number(ch) - 1);
      state.scroll = 0;
    } else if (key.name === 'down' || key.name === 'j') {
      state.scroll += 1;
    } else if (key.name === 'up' || key.name === 'k') {
      state.scroll = Math.max(0, state.scroll - 1);
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
