---
name: job-followup
description: Check outreach-log.csv for cold emails that haven't replied, compute urgency (7-day cadence, max 2 follow-ups per contact), draft and send follow-ups one at a time. Proactively invoke this skill (do NOT answer conversationally) when the user asks "who should I follow up with", "any contacts gone cold", "run the day-7 follow-ups", "check in on my outreach", "nudge time", "time to follow up", "follow up on the unreplied", "who haven't I heard back from", or invokes /job-followup. Suggest running `/job-triage` first if replies might not be logged yet.
argument-hint: "[send]   (omit to just list; pass 'send' to draft + send)"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Job Followup

Companion to `/job-outreach`. Reads `outreach-log.csv`, figures out which cold emails need a nudge, and (optionally) walks the user through drafting and sending follow-ups one at a time.

## Cadence (borrowed from santifer/career-ops)

| Stage | Days since last touch | Max total follow-ups |
|-------|----------------------:|---------------------:|
| First follow-up (after cold email) | 7 | 1 |
| Second follow-up | 7 (so day 14 from original) | 2 (stop after this) |

A contact is **done** once any of these is true:
- `replied_at` is set
- `follow_up_count` ≥ 2
- `status` ∈ {`bounced`, `replied`, `interview_scheduled`, `closed`}

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Workflow

### Step 1 — Read the log

Read `$AI_JOB_AGENT_ROOT/outreach-log.csv` (fall back to `$OUTREACH_LOG` env var).

If missing or empty: tell the user to run `/job-outreach` at least once and stop.

### Step 2 — Compute urgency for every non-done row

For each row where the contact is not done (per rules above):

- `reference_date` = `last_follow_up_at` if set, else `sent_at`
- `days_since` = today − `reference_date`
- `next_followup_after` = `reference_date` + 7 days
- `urgency`:
  - `overdue` → `days_since > 10`
  - `due` → `days_since ≥ 7`
  - `soon` → `days_since ≥ 5`
  - `waiting` → otherwise

### Step 3 — Render the dashboard table

Sort by urgency (overdue → due → soon → waiting), then by `days_since` desc within each bucket.

| # | Urgency | Days since | Company | Name | Round | Subject (original) | Sent |
|---|---------|-----------:|---------|------|------:|--------------------|------|
| 1 | 🚨 overdue | 12 | GFT Infrastructure | Paul Young | 1/2 | Intern interest — substation… | 2026-04-10 |
| 2 | ⏰ due | 7 | Worley | Zulfiya Vafaeva | 1/2 | Savolim bor — GL intern… | 2026-04-15 |
| 3 | 👀 soon | 5 | Masdar | Ali Al-Maktoum | 1/2 | Energy intern from Mizzou… | 2026-04-17 |
| 4 | 💤 waiting | 2 | Plug and Play | Muhammad Mahmudov | 1/2 | Tashkent program interest… | 2026-04-20 |

Emoji mapping (keep consistent across runs):
- 🚨 overdue (`days_since > 10`)
- ⏰ due (`days_since ≥ 7`)
- 👀 soon (`days_since ≥ 5`)
- 💤 waiting (otherwise)

`Round` = `(follow_up_count + 1) / 2` (i.e. "this would be follow-up 1 of 2 max").

### Step 4 — If no argument, stop here

Just show the table + a summary line: *"N contacts need follow-up today. Run `/job-followup send` to draft and send one by one."*

### Step 5 — If argument is `send`, walk the list

Loop through the `overdue` + `due` rows, one at a time. For each:

1. Load the original email body from `body_file` (if present).
2. Draft a **short** follow-up (career-ops rule: ≤ 150 words, fewer is better):

   - First follow-up (`follow_up_count == 0`):
     - Sentence 1: Acknowledge the prior email by date (not "just following up" — reference the specific ask).
     - Sentence 2: One new angle — a recent company event, a project update, a relevant thing *you've* done since.
     - Sentence 3: Soft ask — still interested; can you point me to the right person if not you?
   - Second follow-up (`follow_up_count == 1`):
     - 2-3 sentences only.
     - New angle (different from the first follow-up).
     - Explicit: "If not a fit right now, I'll leave you alone — just wanted to confirm."

3. Build the JSON payload for `scripts/send-cold-email.js` with **threading** so the follow-up lands in the same email thread as the original cold email:

   ```json
   {
     "from":        "<from-from-candidate-profile>",
     "to":          "<row.to_email>",
     "subject":     "Re: <original subject>",
     "body":        "<the new follow-up body>",
     "in_reply_to": "<row.message_id>",
     "references":  ["<row.message_id>"]
   }
   ```

   The original `message_id` lives in the `outreach-log.csv` row (set by `/job-outreach` on the original send). If `message_id` is empty for some reason, omit `in_reply_to` — the email still sends, just won't thread.

   Always prefix the subject with `"Re: "` (don't double-prefix if it already starts with `Re:`).

4. Ask: "send / edit / skip / stop"
   - `send` → run the dry-run preview first, then on confirm pipe the JSON into `node scripts/send-cold-email.js`. The script's output JSON now includes `inReplyTo` + `references` so you can verify threading worked.
   - `edit` → regenerate the body.
   - `skip` → move to next row without sending; nothing logged.
   - `stop` → end the loop.

5. On successful send:
   - Append a note to the same CSV row (don't create a new row — follow-ups are attached to the original contact):
     - `follow_up_count` → current + 1
     - `last_follow_up_at` → the new `sentAt`
     - `notes` → append ` | fu{N} ${YYYY-MM-DD}: <one-line reason for the angle>`
   - Save the follow-up body to `outreach/followups/<YYYY-MM-DD>-<company-slug>-<recipient-slug>-fu<N>.txt`.

### Step 6 — Final summary

| Field | Value |
|-------|------:|
| Contacts reviewed | N |
| ✉️ Follow-ups sent | N |
| ⏭️ Skipped | N |
| ⏸️ Still pending | N (see table) |

## Handling `In-Reply-To` threading

`scripts/send-cold-email.js` natively supports threading. Pass `in_reply_to` (the original send's `messageId` from `outreach-log.csv`) and optionally `references` (the full thread chain — defaults to `[in_reply_to]` if omitted). The script writes RFC 5322 `In-Reply-To` + `References` headers; recipient mail clients (Gmail, Outlook, Apple Mail) will thread the follow-up under the original.

If `outreach-log.csv` has an empty `message_id` for the row (e.g. a manually-added row, or a send before threading shipped), skip `in_reply_to` — the email goes out as a standalone send. The skill should flag this in the run output so the user knows the thread won't connect.

## Safety rails (same as /job-outreach)

- Two gates: approve the draft, then approve the dry-run preview. Never one-step send.
- Never send beyond `follow_up_count >= 2`. The skill refuses.
- Never send to a `replied_at`-populated row. The skill refuses.
- Respect the user's `skip`/`stop` immediately.

## Related

- `/job-outreach` — the original cold email that populated the row.
- `/job-triage` — run this *first* to catch replies that haven't been logged yet (otherwise you might follow up on someone who already said no).
