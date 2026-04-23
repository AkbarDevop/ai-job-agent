---
name: job-apply
description: Apply to a job posting by URL. Auto-routes to the right ATS filler (LinkedIn Easy Apply / Greenhouse / Lever / Jobvite / Ashby), runs dry-run by default, and renders the result as a table. Use when the user pastes a job URL and says "apply", "try applying to this", "run the filler on this", or invokes /job-apply.
argument-hint: "<job URL>  (add --submit to actually submit; default is dry-run)"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Job Apply

Fills out a job application form on the 5 ATS platforms this repo supports. Default is **dry-run** — the form is filled but not submitted.

## Repo location

Resolve the repo root in this order:

1. `$AI_JOB_AGENT_ROOT` env var
2. `~/.claude/skills/ai-job-agent/REPO_PATH` (written by `install.sh`)
3. `~/ai-job-agent` (the default clone target)

Fail with a clear message if none of these exist.

## Workflow

### 1. Parse `$ARGUMENTS`

Expect `<URL> [--submit]`. If no URL, ask the user for one.

### 2. Route by URL host

| Host pattern | Script |
|-------------|--------|
| `linkedin.com/jobs/view/*` | `scripts/linkedin-easy-apply.js` |
| `boards.greenhouse.io/*` or `job-boards.greenhouse.io/*` | `scripts/greenhouse-apply.js` |
| `jobs.lever.co/*` | `scripts/lever-apply.js` |
| `jobs.jobvite.com/*` or `*.jobs.jobvite.com/*` | `scripts/jobvite-apply.js` |
| `jobs.ashbyhq.com/*` or `ashbyhq.com/*` | `scripts/ashby-apply.js` |

If the URL doesn't match, print the table of supported hosts and stop.

### 3. Check config

For LinkedIn: `config/linkedin-config.json` must exist.
For the other four: the user provides a second argument pointing to their form config JSON (per-job, by convention).

If missing, tell the user to run `bash wizard.sh` (for LinkedIn) or point to their filled form config.

### 4. Run the filler

Dry-run by default:

```bash
cd "$AI_JOB_AGENT_ROOT"
node scripts/linkedin-easy-apply.js "$URL" config/linkedin-config.json
```

With `--submit`, set `autoSubmit: true` in the config temporarily (or instruct the user to — do not silently flip it without confirming). Prefer: ask the user to set it themselves if they haven't, to preserve the truthfulness guardrail baked into `CLAUDE.md`.

Environment variables to surface:
- `HEADLESS=0` if the user wants to watch the browser
- `KEEP_OPEN_ON_BLOCK=1` if they want to inspect a stalled form
- `CDP_URL` if they want to connect to an already-open Chrome

### 5. Parse the script's JSON output

All five fillers emit structured JSON on stdout. Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success (submitted, or ready in dry-run) |
| 1 | Crash / unexpected error |
| 2 | Blocked on unknown required field |
| 3 | CAPTCHA or submission timeout |
| 4 | Step limit exceeded (LinkedIn only) |

### 6. Render result table

Show the user a compact markdown table:

| Field | Value |
|-------|-------|
| Company | … |
| Role | … |
| Platform | LinkedIn / Greenhouse / Lever / Jobvite / Ashby |
| Result | Submitted / Dry-run filled / Blocked / CAPTCHA |
| Exit code | 0 / 1 / 2 / 3 / 4 |
| URL | `<url>` |

Then ask: "Log this to the tracker? (y/n)" — if yes, append a row to `application-tracker.csv` with the columns in `templates/tracker.template.csv`, then optionally kick off `/job-track` to sync.

## Rules (from root CLAUDE.md)

- **Truthfulness first** — CAPTCHA stalls are logged as `blocked`, never `submitted`.
- **Skip hard citizen/green-card gated roles** unless the form provides a truthful path.
- **Resume routing** — software/AI roles use the software resume; EE/embedded roles use the EE resume. See `config/candidate-profile.md` for the mapping.
