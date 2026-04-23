---
name: job-track
description: Show the local application tracker as a grouped table, and optionally sync it to Google Sheets. Use when the user asks "what have I applied to", "show my tracker", "sync the tracker", "how many pending", or invokes /job-track.
argument-hint: "[sync]  (omit to just render; pass 'sync' to push to Google Sheets)"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Job Track

Reads the local CSV tracker and renders it as a markdown table grouped by status. Optionally pushes new rows to the configured Google Sheet.

## Repo location

Same resolution as `/job-apply`: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/REPO_PATH` → `~/ai-job-agent`.

## Tracker location

`$LOCAL_TRACKER` env var, else `$AI_JOB_AGENT_ROOT/application-tracker.csv`.

## Workflow

### 1. Read the CSV

Columns (per `templates/tracker.template.csv`):

```
date, company, role, status, location, source, applied_by, url, notes, contact, compensation, days_since, key
```

If the file doesn't exist, tell the user to run `bash setup.sh` (which creates it from the template) and stop.

### 2. Summary table (counts by status)

| Status | Count |
|--------|------:|
| applied | N |
| submitted | N |
| interview | N |
| offer | N |
| rejected | N |
| blocked | N |
| **total** | **N** |

Use whatever statuses are actually present in the CSV — don't hardcode the list.

### 3. Recent activity table (last 10 rows by date)

| Date | Company | Role | Status | Platform | URL |
|------|---------|------|--------|----------|-----|

Truncate `URL` to domain only (e.g., `linkedin.com/jobs/view/…`) to keep the table readable.

### 4. If argument is `sync`

Check `SPREADSHEET_ID` is set (env var or not `YOUR_SHEET_ID` in the script). If missing, tell the user to either export the env var or edit `scripts/google-sheet-sync.py`, then stop.

Otherwise run:

```bash
cd "$AI_JOB_AGENT_ROOT"
python3 scripts/google-sheet-sync.py "$LOCAL_TRACKER"
```

Parse the JSON output (it returns `updatedRange`, `updatedRows`, etc.) and render a single-row result table:

| Field | Value |
|-------|-------|
| Sheet | `$SPREADSHEET_ID` / `$SHEET_NAME` |
| Rows appended | N |
| Range updated | e.g. `'Job Tracker'!A47:M51` |

### 5. Offer next action

After the summary, suggest one of:
- "Run `/job-status <updates.json>` to flip stale rows to Rejected/Interview."
- "Run `/job-triage` to see if there are new emails about these apps."

Do not run either automatically — the user picks.

## Prerequisites

- `gcloud auth application-default login` for the sync path.
- `SPREADSHEET_ID` env var set, or edited in `scripts/google-sheet-sync.py`.
