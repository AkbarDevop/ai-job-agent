---
name: job-triage
description: Search and triage job-related emails in Outlook Web. Runs a search, classifies the results (rejection / interview / confirmation / action / other), renders a table, and optionally steps through extracting or marking individual items as read. Use when the user asks "check Outlook", "triage my inbox", "find rejections", "any interview invites", or invokes /job-triage.
argument-hint: "[query]  (default: 'application status')"
allowed-tools:
  - Bash
  - Read
---

# Job Triage

Thin wrapper around `scripts/outlook-triage.js` that runs a search, classifies results locally, and presents them as a table. The underlying script requires a Chrome instance running with `--remote-debugging-port=9224` and Outlook Web already logged in.

## Repo location

Same resolution as `/job-apply`: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/REPO_PATH` → `~/ai-job-agent`.

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
| interview_invite | N | N |
| action_required | N | N |
| rejection | N | N |
| confirmation | N | N |
| recruiter_outreach | N | N |
| other | N | N |
| **total** | **N** | **N** |

### 4. Render detail table (first 20)

| # | Class | Unread | Subject / preview |
|---|-------|:------:|-------------------|
| 0 | rejection | ● | "Regarding your application at Acme — unfortunately..." |

Keep each row ≤ 120 chars.

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
