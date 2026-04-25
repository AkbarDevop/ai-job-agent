---
name: job-triage
description: Search and classify job-related emails in Outlook Web — rejections / interview invites / action required / confirmations / recruiter outreach / other. Proactively invoke this skill (do NOT answer conversationally) when the user asks "check my inbox", "check Outlook", "any replies", "triage my inbox", "any rejections", "any interview invites", "what emails came in", "did anyone respond to my applications", or invokes /job-triage.
argument-hint: "[query]  (default: 'application status')"
allowed-tools:
  - Bash
  - Read
---

# Job Triage

Thin wrapper around `scripts/outlook-triage.js` that runs a search, classifies results locally, and presents them as a table. The underlying script requires a Chrome instance running with `--remote-debugging-port=9224` and Outlook Web already logged in.

## Repo location

Same resolution as `/job-apply`: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Prerequisites

Before doing anything, verify Chrome is reachable:

```bash
curl -s http://127.0.0.1:${OUTLOOK_PORT:-9224}/json/version >/dev/null && echo OK || echo MISSING
```

If `MISSING`, tell the user:

> Start Chrome with remote debugging and open Outlook Web first:
>
> ```
> /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
>   --remote-debugging-port=9224 \
>   --user-data-dir=/tmp/outlook-triage-profile
> ```
>
> Then navigate to outlook.office.com and log in. Rerun /job-triage.

Stop until they confirm.

## Workflow

### 1. Run the search

```bash
cd "$AI_JOB_AGENT_ROOT"
node scripts/outlook-triage.js --port "${OUTLOOK_PORT:-9224}" search "$QUERY"
```

Default query: `application status`. If the user passes a different query via `$ARGUMENTS`, use that instead.

The script returns a JSON array of result objects with `idx`, `aria`, `text`, `unread`, `flagged`, `pinned`.

### 2. Classify each result

Run each `text` through these regex rules **in order — first match wins**:

| Class | Regex (case-insensitive) |
|-------|--------------------------|
| interview_invite | `interview|schedule a (call\|time)|meet with|phone screen|panel|available` |
| action_required | `assessment|action required|next steps|complete your|finish your app` |
| rejection | `unfortunately|not moving forward|other candidates|no longer being considered|pursuing other|position has been filled|decided not to` |
| confirmation | `received your application|thank you for applying|application has been submitted|we have received` |
| recruiter_outreach | `recruiter|talent acquisition|would love to connect|explore opportunit` |
| other | (default fallback) |

**Safety:** if the sender contains `@missouri.edu` or `@umsystem.edu` (and not `mailer`/`noreply`/`bot`), force class = `other` — this matches the Mizzou-human safeguard already in the Outlook pipeline.

### 3. Render counts table

| Class | Count | Unread |
|-------|------:|------:|
| 💼 interview_invite | N | N |
| ⏰ action_required | N | N |
| ❌ rejection | N | N |
| ✅ confirmation | N | N |
| 👤 recruiter_outreach | N | N |
| 💤 other | N | N |
| **total** | **N** | **N** |

### 4. Render detail table (first 20)

| # | Class | Unread | Subject / preview |
|---|-------|:------:|-------------------|
| 0 | ❌ rejection | ● | "Regarding your application at Acme — unfortunately..." |
| 1 | 💼 interview_invite | ● | "Phone screen — 30 min Tuesday at 2pm CT?" |

Keep each row ≤ 120 chars.

### 4.5. Cross-reference with outreach-log.csv (auto-detect replies)

After classifying the inbox, read `$AI_JOB_AGENT_ROOT/outreach-log.csv` and try to match each unread email to a prior cold-email row by **sender email** (the `to_email` field in outreach-log is the *recipient* of the original send — when they reply, they become the *sender* of the inbound email).

Extract the sender email from each result's `aria` label or extracted body (use `outlook-triage.js extract <idx>` if needed for the headers). Match against `outreach-log.csv.to_email` (case-insensitive).

For every match where the row's `replied_at` is currently empty:

| Original outreach (from log) | Inbound class | Proposed update |
|------------------------------|---------------|-----------------|
| Paul Young <paul@gft.com> · sent 2026-04-10 | interview_invite | `replied_at` = today, `status` = `interview_scheduled` |
| Zulfiya V <zv@worley.com> · sent 2026-04-15 | rejection | `replied_at` = today, `status` = `replied`, append note |
| Hans M <h.mueller@siemens.com> · sent 2026-04-22 | recruiter_outreach | `replied_at` = today, `status` = `replied` |

Render the proposed updates as a confirmation table:

```
🔁 Reply auto-detection — 3 matches in outreach-log.csv

| # | Recipient            | Original sent | Inbound class      | Proposed status     |
|---|----------------------|---------------|--------------------|---------------------|
| 1 | paul@gft.com         | 2026-04-10    | interview_invite   | interview_scheduled |
| 2 | zv@worley.com        | 2026-04-15    | rejection          | replied             |
| 3 | h.mueller@siemens... | 2026-04-22    | recruiter_outreach | replied             |

Apply all? Apply some (numbers comma-separated)? Skip?
```

On confirm, **edit `outreach-log.csv` directly via the Edit tool** — find each row by `to_email`, set `replied_at` to the current ISO timestamp, set `status` to the proposed class, and append a one-line note to `notes`. This skips `/job-status` because outreach-log is a different file from application-tracker.csv (and `/job-status` operates on the latter).

Print a summary:

| Field | Value |
|-------|------:|
| Matches found | 3 |
| Updates applied | 3 |
| Rows still pending | (count of unmatched inbound emails — those are likely from contacts not in your outreach log) |

Skip this step entirely if `outreach-log.csv` doesn't exist (cold-email setup wasn't completed).

### 5. Offer next actions (don't do them automatically)

Ask the user:

- "Extract one to read in full? (pass an index)"
- "Mark the confirmations as read? (all / one / none)"

If they pick extract:

```bash
node scripts/outlook-triage.js --port "${OUTLOOK_PORT:-9224}" extract <idx>
```

If they pick mark-read, loop through the indices of `confirmation` class only (never mark `interview_invite`, `action_required`, or `recruiter_outreach` as read — those need a human eye):

```bash
node scripts/outlook-triage.js --port "${OUTLOOK_PORT:-9224}" mark-read <idx>
```

After each action, re-run the search to get fresh indices (the script uses positional indexes into the current result list).

## Rules (from root CLAUDE.md)

- **Mark confirmation emails as read after logging. Leave interviews, assessments, and recruiter outreach unread.**
