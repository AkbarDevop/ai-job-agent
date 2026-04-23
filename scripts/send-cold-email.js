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
 *     "from":     "Akbar Kamoldinov <k.akbarme@gmail.com>",
 *     "to":       "recipient@example.com"       | ["a@x.com", "b@y.com"],
 *     "cc":       null | "c@x.com"              | [...],
 *     "bcc":      null | "d@x.com"              | [...],
 *     "subject":  "Quick question about substation engineering intern",
 *     "body":     "Hi Paul,\n\nI'm Akbar, an EE junior at Mizzou...\n",
 *     "reply_to": null | "k.akbarme@gmail.com",
 *     "account":  null | "gmail"    // optional msmtp account name
 *   }
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

function buildMessage(payload) {
  const to = toList(payload.to);
  const cc = toList(payload.cc);
  const bcc = toList(payload.bcc);

  const domain = (payload.from.match(/@([^>\s]+)/) || [, 'localhost'])[1];
  const messageId = `<${crypto.randomBytes(12).toString('hex')}@${domain}>`;
  const now = new Date().toUTCString();

  const headers = [
    `From: ${payload.from}`,
    `To: ${to.join(', ')}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(', ')}`);
  headers.push(
    `Subject: ${payload.subject}`,
    `Date: ${now}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
  );
  if (payload.reply_to) headers.push(`Reply-To: ${payload.reply_to}`);

  const body = payload.body.endsWith('\n') ? payload.body : payload.body + '\n';
  return {
    message: headers.join('\r\n') + '\r\n\r\n' + body,
    messageId,
    recipients: { to, cc, bcc },
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
  const { message, messageId, recipients } = buildMessage(payload);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          messageId,
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
  if (payload.account) args.push('-a', payload.account);

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
