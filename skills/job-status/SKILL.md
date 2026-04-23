---
name: job-status
description: Batch-update application statuses (Rejected / Interview / Offer / Withdrawn / …) in both the local CSV and the Google Sheet, with a before/after diff and confirmation gate. Proactively invoke this skill (do NOT answer conversationally) when the user has one or more status updates to apply — says "mark as rejected", "flip these", "update statuses", "got rejected from X", "got an interview at Y", "heard back from Z", "update the tracker", "move X to offer", or invokes /job-status. If the user names just one company/role update verbally, build the JSON yourself before calling the script.
argument-hint: "<updates.json>  (JSON file with array of {sheet_row, company, role, location, status, note})"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Job Status

Wraps `scripts/tracker-status-update.py`. Shows a diff of what will change, asks for approval, then applies.

## Repo location

Same as `/job-apply`: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Input JSON format

Each item in the array:

```json
{
  "sheet_row": 42,
  "company": "Acme Corp",
  "role": "Software Intern",
  "location": "Remote",
  "status": "Rejected",
  "note": "Auto-rejection email received 2026-04-22"
}
```

- `sheet_row` is required for the Google Sheet update (1-indexed, matching the sheet's row number — row 1 is the header, so data starts at row 2).
- `company` + `role` (+ optional `location`) are used to match the local CSV row.
- `status` is free-text, but the sheet filter typically expects: `Applied`, `Interview`, `Offer`, `Rejected`, `Withdrawn`.
- `note` appends to existing notes; skipped if empty or already present.

## Workflow

### 1. Load and validate

Read `$ARGUMENTS` (path to JSON file). Parse. If invalid JSON or missing required fields, stop with an error message listing which rows are malformed.

### 2. Fetch current state

Render a **before/after** table showing what will change. For the sheet side, the script itself fetches rows internally — you can surface what the user supplied and let the script fill in the rest:

| # | Sheet row | Company | Role | Status → new | Note appended |
|---|----------:|---------|------|--------------|---------------|
| 1 | 42 | Acme Corp | Software Intern | 📄 applied → ❌ **Rejected** | "Auto-rejection email received 2026-04-22" |
| 2 | 58 | Beta Inc | EE Intern | 📬 submitted → 💼 **Interview** | "Phone screen scheduled for Thu" |

Apply the same emoji mapping as `/job-track` (📄 applied · 📬 submitted · 💼 interview · 🎯 offer · ❌ rejected · 🚫 blocked · 🚪 withdrawn). Unknown statuses get no emoji.

If you want the current statuses for real, read them from the local CSV (cheap, no network) — the user can spot obvious mistakes before the sheet mutation.

### 3. Confirm

Ask: **"Apply these N updates to Google Sheet + local CSV? (y/n)"**

Stop if no.

### 4. Run

```bash
cd "$AI_JOB_AGENT_ROOT"
python3 scripts/tracker-status-update.py "$JSON_PATH"
```

Parse the script's JSON output:

```json
{
  "sheet_rows_updated": [42, 58, 101],
  "local_rows_changed": 2
}
```

### 5. Render result

| Field | Value |
|-------|------:|
| Sheet rows updated | N |
| Local CSV rows changed | N |
| Sheet rows | `42, 58, 101` |
| Local tracker | `$LOCAL_TRACKER` |

### 6. Flag mismatches

If `sheet_rows_updated` count ≠ input count: the script doesn't apply updates missing `sheet_row`. Flag those.

If `local_rows_changed` < input count: some updates didn't match a local CSV row (fuzzy match is company+role+location, case-insensitive, exact). List the unmatched so the user can add them manually or correct the JSON.

## Prerequisites

- `gcloud auth application-default login`
- `SPREADSHEET_ID` and `SHEET_NAME` env vars set (or edited in the script)
- Local tracker at `$LOCAL_TRACKER` (defaults to `application-tracker.csv`)
