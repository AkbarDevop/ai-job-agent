#!/usr/bin/env node

/**
 * Send a cold email via the local msmtp.
 *
 * Reads a JSON payload from stdin or a file. Pipes an RFC822 message to
 * `msmtp -t` (addresses parsed from the To/Cc/Bcc headers). Emits JSON on
 * stdout with the send result.
 *
 * Why msmtp instead of an API: the user already has msmtp configured
 * (~/.msmtprc) with Gmail app password, so we reuse that. No extra API
 * keys, no third-party SDK.
 *
 * Usage:
 *   echo '{...}' | node scripts/send-cold-email.js
 *   node scripts/send-cold-email.js /path/to/payload.json
 *   node scripts/send-cold-email.js /path/to/payload.json --dry-run
 *
 * Payload:
 *   {
 *     "from":         "Akbar Kamoldinov <k.akbarme@gmail.com>",
 *     "to":           "recipient@example.com"       | ["a@x.com", "b@y.com"],
 *     "cc":           null | "c@x.com"              | [...],
 *     "bcc":          null | "d@x.com"              | [...],
 *     "subject":      "Re: Quick question about substation engineering",
 *     "body":         "Hi Paul,\n\nFollowing up on my note from Apr 10...\n",
 *     "reply_to":     null | "k.akbarme@gmail.com",
 *     "account":      null | "gmail",     // optional msmtp account
 *     "in_reply_to":  null | "<msg-id>",  // RFC 5322 — for follow-ups
 *     "references":   null | ["<id1>","<id2>"]  // thread chain; defaults
 *                                                 to [in_reply_to] if unset
 *   }
 *
 * For follow-ups, set `in_reply_to` to the original send's `messageId`
 * (read from outreach-log.csv). The recipient's mail client will thread
 * the new message under the original. Subject convention: prefix "Re: ".
 *
 * Exit codes:
 *   0 = success (message handed to msmtp)
 *   1 = crash / unexpected error
 *   2 = invalid payload (missing to/subject/body/from)
 *   3 = msmtp not found
 *   4 = msmtp exit non-zero (SMTP send failed)
 */

const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');
const crypto = require('crypto');

function fail(code, message) {
  process.stdout.write(JSON.stringify({ ok: false, code, error: message }) + '\n');
  process.exit(code);
}

function readPayload(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const path = args.find((a) => !a.startsWith('--'));

  let raw;
  if (path) {
    raw = fs.readFileSync(path, 'utf8');
  } else if (!process.stdin.isTTY) {
    raw = fs.readFileSync(0, 'utf8');
  } else {
    fail(2, 'No payload. Pipe JSON to stdin or pass a path.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(2, `Payload is not valid JSON: ${err.message}`);
  }

  for (const key of ['from', 'to', 'subject', 'body']) {
    if (!parsed[key] || (Array.isArray(parsed[key]) && parsed[key].length === 0)) {
      fail(2, `Payload missing required field: ${key}`);
    }
  }
  return { payload: parsed, dryRun };
}

function toList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// RFC 5322 header value sanitization. Strips CR/LF to prevent header
// injection — without this, a malicious or malformed CSV row could inject
// extra headers (e.g. Bcc) by including a newline in any string field.
function sanitizeHeaderValue(s) {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function normalizeMsgId(id) {
  if (!id) return null;
  const trimmed = sanitizeHeaderValue(id);
  if (!trimmed) return null;
  // Strip whitespace inside — RFC 5322 message-ids must not contain it.
  const compact = trimmed.replace(/\s+/g, '');
  // Reject ids that don't look like message-ids — receivers ignore them
  // for threading. Better to skip silently than send a broken In-Reply-To.
  const inner = compact.replace(/^<|>$/g, '');
  if (!inner.includes('@')) return null;
  if (compact.startsWith('<') && compact.endsWith('>')) return compact;
  return `<${compact}>`;
}

function buildMessage(payload) {
  // Sanitize all header-bound strings up front. CR/LF in any of these
  // would otherwise let a malformed CSV inject extra headers (Bcc, etc).
  const fromHdr = sanitizeHeaderValue(payload.from);
  const subjectHdr = sanitizeHeaderValue(payload.subject);
  const replyToHdr = payload.reply_to ? sanitizeHeaderValue(payload.reply_to) : null;
  const accountHdr = payload.account ? sanitizeHeaderValue(payload.account) : null;

  const to = toList(payload.to).map(sanitizeHeaderValue).filter(Boolean);
  const cc = toList(payload.cc).map(sanitizeHeaderValue).filter(Boolean);
  const bcc = toList(payload.bcc).map(sanitizeHeaderValue).filter(Boolean);

  const domain = (fromHdr.match(/@([^>\s]+)/) || [, 'localhost'])[1];
  const messageId = `<${crypto.randomBytes(12).toString('hex')}@${domain}>`;
  const now = new Date().toUTCString();

  // RFC 5322 threading. If `in_reply_to` is set, this is a follow-up that
  // should land in the same thread as the original send. `references` is
  // the chain of all prior message-ids in the thread (or just the parent).
  const inReplyTo = normalizeMsgId(payload.in_reply_to);
  const referencesIn = toList(payload.references)
    .map(normalizeMsgId)
    .filter(Boolean);
  // If only in_reply_to is given, References should at minimum contain it.
  const references = referencesIn.length
    ? referencesIn
    : (inReplyTo ? [inReplyTo] : []);

  const headers = [
    `From: ${fromHdr}`,
    `To: ${to.join(', ')}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(', ')}`);
  headers.push(
    `Subject: ${subjectHdr}`,
    `Date: ${now}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
  );
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references.length) headers.push(`References: ${references.join(' ')}`);
  if (replyToHdr) headers.push(`Reply-To: ${replyToHdr}`);

  // Body is NOT sanitized — newlines are valid in the body. But we do
  // ensure it ends with a single newline so msmtp doesn't choke.
  const body = String(payload.body ?? '').endsWith('\n')
    ? String(payload.body ?? '')
    : String(payload.body ?? '') + '\n';
  return {
    message: headers.join('\r\n') + '\r\n\r\n' + body,
    messageId,
    inReplyTo,
    references,
    recipients: { to, cc, bcc },
    account: accountHdr,
  };
}

function resolveMsmtp() {
  try {
    return execFileSync('command', ['-v', 'msmtp'], {
      encoding: 'utf8',
      shell: '/bin/sh',
    }).trim();
  } catch (_) {
    return null;
  }
}

function main() {
  const { payload, dryRun } = readPayload(process.argv);
  const { message, messageId, inReplyTo, references, recipients, account } = buildMessage(payload);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          messageId,
          inReplyTo,
          references,
          recipients,
          bytes: Buffer.byteLength(message, 'utf8'),
          preview: message.slice(0, 800),
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const msmtpPath = resolveMsmtp();
  if (!msmtpPath) {
    fail(
      3,
      'msmtp not on PATH. Install with `brew install msmtp` and configure ~/.msmtprc.',
    );
  }

  const args = ['-t'];
  if (account) args.push('-a', account);

  const result = spawnSync(msmtpPath, args, {
    input: message,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    fail(4, `msmtp exit ${result.status}: ${stderr || '(no stderr)'}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        dryRun: false,
        messageId,
        inReplyTo,
        references,
        recipients,
        bytes: Buffer.byteLength(message, 'utf8'),
        msmtpPath,
        sentAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  main();
} catch (err) {
  fail(1, err && err.stack ? err.stack : String(err));
}
