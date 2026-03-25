# AI Job Application Agent - Claude Code Instructions

## Overview

This is a job application automation toolkit. It automates filling and submitting applications on LinkedIn Easy Apply, Greenhouse, Lever, Jobvite, and Ashby, plus email triage and Google Sheets tracking.

## Configuration

All personal details are in the `config/` directory:

- `config/candidate-profile.md` -- Full candidate profile, application rules, session state, and agent handoff context. **Read this first in every session.**
- `config/answer-bank.md` -- Pre-written answers for common application questions.
- `config/linkedin-config.json` -- LinkedIn Easy Apply config with identity, resume path, and Chrome cookie path.
- `config/example-config.json` -- Reference example showing all available fields.

## Workflow

The standard job application workflow is: **Search -> Apply -> Track -> Triage**

### 1. Search for jobs

Use `/job-search` or `python-jobspy` to find matching roles. Filter by:
- Role fit (match resume variants to role types)
- Work authorization eligibility
- Location preferences
- Recency (prefer jobs posted in the last 72 hours)

### 2. Apply to jobs

Choose the right script based on the ATS platform:

```bash
# LinkedIn Easy Apply
node scripts/linkedin-easy-apply.js <jobUrl> config/linkedin-config.json

# Lever
node scripts/lever-apply.js <jobUrl> <configPath>

# Greenhouse
node scripts/greenhouse-apply.js <jobUrl> <configPath>

# Jobvite
node scripts/jobvite-apply.js <jobUrl> <configPath>

# Ashby
node scripts/ashby-apply.js <jobUrl> <configPath>
```

For Lever, Greenhouse, Jobvite, and Ashby, you need to inspect the form first to build the config with the correct field IDs and values.

### 3. Track applications

After each successful submission:

1. Append a row to the local `application-tracker.csv`
2. Append an entry to the daily log `submitted-applications-YYYY-MM-DD.md`
3. Sync to Google Sheets: `python3 scripts/google-sheet-sync.py application-tracker.csv`

### 4. Triage emails

Use the Outlook scripts to search for confirmation and rejection emails:

```bash
# Search for job-related emails
node scripts/outlook-triage.js search "application confirmation"

# Read a specific email
node scripts/outlook-triage.js extract 0

# Mark as read after processing
node scripts/outlook-triage.js mark-read 0
```

### 5. Update statuses

When you receive rejections, interviews, or other updates:

```bash
python3 scripts/tracker-status-update.py updates.json
```

## Application Rules

1. **Truthfulness first**: Prefer truthful, submittable applications over aggressive volume.
2. **Work authorization**: Skip hard citizen/green-card gated roles unless the form provides a truthful path for the candidate's actual status.
3. **Resume selection**: Use the appropriate resume variant for each role type (see candidate-profile.md for the mapping).
4. **Captcha honesty**: If a form stalls behind CAPTCHA, log it as "blocked" -- never inflate submitted counts.
5. **Headless default**: Use headless browser by default. Only open visible windows when manual intervention (e.g., CAPTCHA solving) is required.
6. **Email triage**: Mark confirmation emails as read after logging. Leave interviews, assessments, and recruiter outreach unread.

## Available Scripts

| Script | Purpose | Input |
|--------|---------|-------|
| `scripts/linkedin-easy-apply.js` | LinkedIn Easy Apply | Job URL + LinkedIn config JSON |
| `scripts/lever-apply.js` | Lever ATS | Job URL + form config JSON |
| `scripts/greenhouse-apply.js` | Greenhouse ATS | Job URL + form config JSON |
| `scripts/jobvite-apply.js` | Jobvite ATS | Job URL + form config JSON |
| `scripts/ashby-apply.js` | Ashby ATS | Job URL + form config JSON |
| `scripts/outlook-triage.js` | Email search/read/mark | Command + query/index |
| `scripts/outlook-send.js` | Send email | To + subject + body file |
| `scripts/google-sheet-sync.py` | Append to Google Sheet | CSV file path |
| `scripts/tracker-status-update.py` | Batch status update | JSON file path |

## Exit Codes

All application scripts use consistent exit codes:

- `0` -- Success (submitted or ready in dry-run mode)
- `1` -- Crash or unexpected error
- `2` -- Blocked on unknown required field
- `3` -- Captcha or submission timeout
- `4` -- Step limit exceeded (LinkedIn only)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CDP_URL` | (none) | Connect to existing Chrome via CDP |
| `HEADLESS` | `1` | Set to `0` for visible browser |
| `PW_CHANNEL` | (none) | Playwright browser channel (e.g., `chrome`) |
| `KEEP_OPEN_ON_BLOCK` | `0` | Set to `1` to keep browser open when blocked |
| `CHROME_COOKIE_PATH` | (none) | Path to Chrome Cookies file |
| `SPREADSHEET_ID` | (none) | Google Sheet ID for tracking |
| `SHEET_NAME` | `Job Tracker` | Google Sheet tab name |
| `LOCAL_TRACKER` | `application-tracker.csv` | Path to local CSV tracker |
| `OUTLOOK_PORT` | `9224` | Chrome debug port for Outlook |

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- `/office-hours` — YC-style brainstorming. Startup mode or builder mode.
- `/plan-ceo-review` — Founder/CEO mode. Rethink the problem, find the 10-star product.
- `/plan-eng-review` — Eng manager mode. Lock architecture, data flow, edge cases, tests.
- `/plan-design-review` — Designer's eye plan review. Rate design dimensions, fix gaps.
- `/design-consultation` — Create a design system and DESIGN.md from scratch.
- `/design-review` — Visual QA audit on live site. Find and fix visual issues.
- `/review` — Paranoid staff engineer. Find bugs that pass CI but break production.
- `/ship` — Release engineer. Sync main, run tests, push, open PR.
- `/land-and-deploy` — Merge PR, wait for CI/deploy, verify production health.
- `/canary` — Post-deploy canary monitoring for errors and regressions.
- `/benchmark` — Performance regression detection with baselines and comparison.
- `/browse` — QA engineer. Browser automation — navigate, screenshot, test flows.
- `/qa` — Systematic QA testing + fix loop with before/after evidence.
- `/qa-only` — QA report only, no fixes.
- `/investigate` — Systematic debugging with root cause investigation.
- `/document-release` — Post-ship docs update. Sync README/CHANGELOG/CLAUDE.md.
- `/setup-browser-cookies` — Import real browser cookies for authenticated testing.
- `/setup-deploy` — Configure deployment settings for /land-and-deploy.
- `/retro` — Engineering manager. Analyze commit history and shipping velocity.
- `/codex` — OpenAI Codex CLI wrapper for code review, challenge, and consult.
- `/cso` — Chief Security Officer mode. OWASP audit, STRIDE, secret detection.
- `/careful` — Safety guardrails for destructive commands.
- `/freeze` — Restrict file edits to a specific directory for the session.
- `/guard` — Full safety mode: destructive warnings + directory-scoped edits.
- `/unfreeze` — Clear the freeze boundary set by /freeze.
- `/gstack-upgrade` — Upgrade gstack to the latest version.

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to rebuild.

## Recommended Skills

Install these Claude Code skills for enhanced job hunting:

- `/job-search` -- Multi-board job search
- `/tailor-resume` -- Resume customization per posting
- `/apply` -- AI-assisted ATS form filling
- `/interview-prep-generator` -- STAR stories and practice questions
- `/resume-ats-optimizer` -- ATS keyword optimization
- `/salary-negotiation-prep` -- Market rate research

See `skills/README.md` for full list and install commands.

## File Locations

- Config templates: `config/*.template.*`
- Active configs: `config/linkedin-config.json`, `config/candidate-profile.md`, `config/answer-bank.md`
- Scripts: `scripts/`
- Templates: `templates/`
- Documentation: `docs/`
- Local tracker: `application-tracker.csv` (created by setup.sh)
- Daily logs: `submitted-applications-YYYY-MM-DD.md` (created per session)
