# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.0] — 2026-04-26

Career-ops parity release. Four new skills, the 7-block A-G scoring rubric, the markdown tracker mirror, the doctor health check, and a 5th "Reports" tab in the dashboard. This is the release that ports the deep-dive / interview-prep / pattern-analysis flows from career-ops onto our skill pack.

### Added

- **`/job-evaluate`** — career-ops's killer demo: paste a URL → fetches the JD → scores it across 7-block A-G rubric (Role / CV / Level / Comp / Personalization / Interview / Legitimacy) → writes a structured eval report to `reports/<date>-<co>-<role>.md` → chains into `/job-cv` for tailored PDF → appends a row to `application-tracker.csv` at status `evaluated`. Cites sources for E (personalization), F (interview signal), G (legitimacy).
- **`/job-cv`** — tailor base CV for one specific JD. Claude rewrites — never invents — bullets to match JD keywords/priorities, gets explicit user approval on the tailored markdown, then renders a single-page (or two-page) ATS-friendly PDF via headless Chromium (Playwright). Output to `output/cv-<company>-<date>.pdf`.
- **`/job-interview`** — STAR-grounded interview prep doc. Reads tracker + outreach-log + candidate-profile.md, plus 6-10 web sources (company blog / Glassdoor / Reddit / Blind / interviewer LinkedIn). Produces: company snapshot · 10-15 likely Qs · 5-8 STAR stories drawn from the candidate's *real* projects · 5 smart questions to ask · 3 red flags. Saved to `interview-prep/<date>-<co>-<role>.md`.
- **`/job-patterns`** — pipeline diagnostics. Reads tracker + outreach log, computes 6 signals (rejection rate by ATS, time-to-rejection histogram, geography, role-type, outreach response by tier, day-of-week), renders 4-5 markdown tables + 3 actionable "What to change this week" bullets. Won't surface findings if combined CSVs have <10 rows.
- **5th "Reports" tab in `/job-dashboard`** — surfaces the v1.2 evaluation reports from `reports/` with a fit-score breakdown and recent-25 list. Keybinding: `5` to jump to the tab.
- **7-block A-G rubric** in `/job-coach` (Step 4 — slate scoring) and `/job-evaluate`. Each block scores 0-5; headline fit = total ÷ 7 rounded to one decimal. Threshold: 3.0 = drop, 4.0 = high-confidence apply.
- **`scripts/generate-tailored-cv.mjs`** — markdown → PDF renderer via Playwright Chromium. JSON payload on stdin (cv, outputPath, title, format). Default CSS is one-column serif, ATS-tested.
- **`scripts/mirror-tracker.mjs`** — generates `data/applications.md` + `data/outreach.md` from the CSVs. Run via `npm run mirror` or `npm run mirror:watch` (fs.watch, regenerates on every CSV change). Both `data/*.md` files are gitignored.
- **`bin/doctor.sh`** — health check on the real user environment. Inspects toolchain, repo paths, personal config, msmtp plumbing, gcloud, skill files. Run via `npm run doctor`. Exits 0 if no FAILs, 1 otherwise.
- **`templates/search-plan.template.md`** — scaffold for `/job-coach`'s working brief. Used by Step 1 (intake) when building a new `config/search-plan.md`.
- **`templates/interview-prep.template.md`** — scaffold for `/job-interview`'s output doc.
- New gitignored output directories: `reports/`, `output/`, `interview-prep/`, `data/`.

### Changed

- `BUNDLED` array in `skills/install.sh` extended from 9 → 13 skills (adds `job-coach` was already present, plus `job-evaluate`, `job-cv`, `job-interview`, `job-patterns`).
- `/job-coach` Step 4 (slate presentation) now uses the structured 7-block A-G rubric instead of the previous fuzzy fit %.
- `/job-evaluate` automatically chains into `/job-cv` when fit ≥ 4.0/5.0; user can override with "skip CV".
- Dashboard tab count: 4 → 5 (Reports added).
- `npm scripts` (in `package.json`) now include `mirror`, `mirror:watch`, `doctor`.

### Fixed

- `/job-coach` no longer hijacks specific verb requests — pasting a URL still routes directly to `/job-apply` (or `/job-evaluate` if "evaluate" / "score" / "deep-dive" appears in the same message).

## [1.1.0] — 2026-04-25

Hardening + UX release. The gstack-style install pattern, the persona-driven `/job-coach`, unified `npm run agent` mode, the new TUI improvements, threaded follow-ups, and the fresh-install smoke test all land here.

### Added

- **`/job-coach`** — the persona-driven orchestrator. Treats the user like a real career-coaching client: opens with intake (goals, target companies, timeline, geography, constraints), researches the market live, presents a ranked slate of next moves with suggestions, and chains into the verb skills. Persists the plan to `config/search-plan.md` so future sessions pick up where you left off. Triggered by open-ended phrases ("help me find a job", "what should I do next") — doesn't hijack specific verb requests.
- **`/job-setup`** — conversational onboarding. Auto-reads existing files (CLAUDE.md, `~/.brain`, Claude Code memory, existing candidate profile, `~/.msmtprc`) and scans for resume PDFs in `~/Downloads`, `~/Desktop`. Optional web research before asking the user. Writes all config files and registers the bundled skills.
- **`npm run agent`** — unified mode. Single terminal window with Claude Code on top and the live TUI dashboard on bottom (split via tmux). Auto-syncs via fs.watch — flip a status in chat and watch the funnel update within ~200ms. Falls back to opening two Terminal/iTerm tabs (macOS) or printing manual instructions (Linux) if tmux is declined. Launcher: `bin/job-agent.sh`.
- **TUI v2 improvements:** `?` help overlay, `/` fuzzy filter on every tab, fs.watch-based live reload (no manual refresh), Pipeline tab with cumulative funnel math, split-pane support inside tmux.
- **Threaded follow-ups in `/job-followup`** — `send-cold-email.js` now sets `In-Reply-To` and `References` headers when sending follow-ups, so they appear in the same Gmail thread as the original outreach.
- **Reply auto-detection in `/job-triage`** — cross-references inbound emails against `outreach-log.csv` `to_email` column. If match, suggest auto-marking the matching outreach row as `replied` and prompt the user to flip the application status.
- **`bin/smoke-test.sh`** — fresh-install smoke test. Sandboxes `$HOME`, runs `install.sh`, exercises every script that doesn't need real network/credentials. CI-safe. Run via `npm run smoke`.

### Changed

- **gstack-style install path:** the canonical clone location is now `~/.claude/skills/ai-job-agent/`. The `install.sh` script symlinks each skill into `~/.claude/skills/<name>` and writes a `REPO_PATH` marker file so scripts can find the repo regardless of cwd. Skills resolve the root in this order: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker → `~/ai-job-agent/`.
- **All skills now follow the gstack "Proactively invoke" trigger pattern** — every `SKILL.md`'s YAML `description` ends with `"Proactively invoke this skill (do NOT answer conversationally) when the user says X / Y / Z, or invokes /skill-name."` This is what makes Claude Code dispatch on natural speech.
- README, CLAUDE.md, docs/SETUP.md all lead with the gstack-style paste-to-Claude install path. `bash wizard.sh` and `bash setup.sh` demoted to fallbacks for non-Claude-Code users.

### Fixed

- **Header-injection guard in `send-cold-email.js`** — strips CRLF from `To` and `Subject` before composing the RFC822 envelope. Closes a header-injection vector if the user pastes attacker-controlled email lists.
- Pipeline tab funnel math: was raw counts, now cumulative (how many reached this stage at any point, not currently in this stage).

### Security

- Header-injection fix in `send-cold-email.js` (see above).

## [1.0.0] — 2026-04-22

Initial bundled-skills release. Wraps the existing Node + Python scripts (LinkedIn Easy Apply, Greenhouse, Lever, Jobvite, Ashby, Outlook triage, Google Sheets sync, batch status updater) into 4 verb skills you can invoke from any Claude Code session.

### Added

- **`/job-apply <url>`** — apply to a job by URL. Auto-routes to the right ATS filler (LinkedIn / Greenhouse / Lever / Jobvite / Ashby). Dry-run by default; pass `--submit` to actually submit. Renders an emoji-tagged result table.
- **`/job-track [sync]`** — show the local tracker grouped by status. Optionally sync to Google Sheets.
- **`/job-triage [query]`** — search Outlook Web, classify results (rejection / interview / confirmation / action-required / recruiter / other), step through extract / mark-read.
- **`/job-status <updates.json>`** — batch-update statuses in both the Google Sheet and local CSV. Diffs before applying.
- **`/job-outreach <target>`** — research a company or hiring manager, draft a personalized cold email in chat, approve, send via local msmtp, log for day-7 follow-up tracking.
- **`/job-followup [send]`** — walk the day-7 follow-ups. Reads `outreach-log.csv`, computes urgency (max 2 follow-ups per contact), drafts and sends one at a time.
- **`/job-dashboard [live]`** — ANSI-colored terminal dashboard. 4 tabs (Applications · Outreach · Follow-ups · Pipeline). Snapshot in chat by default; `live` prints the command for the interactive TUI.
- **`skills/install.sh`** — registers the bundled skills as symlinks in `~/.claude/skills/`. Idempotent; supports `--uninstall`.
- **5 ATS form-fillers** (`scripts/linkedin-easy-apply.js`, `greenhouse-apply.js`, `lever-apply.js`, `jobvite-apply.js`, `ashby-apply.js`) with consistent exit codes (0 ok / 2 blocked / 3 captcha-timeout / 4 step-limit).
- **Outlook integration** (`scripts/outlook-triage.js`, `outlook-send.js`) via Chrome CDP.
- **Cold-email sender** (`scripts/send-cold-email.js`) via local msmtp.
- **Tracking pipeline:** local CSV (`application-tracker.csv`) + daily log (`submitted-applications-YYYY-MM-DD.md`) + Google Sheet sync (`scripts/google-sheet-sync.py`).
- **Configuration:** template-driven config files (`config/linkedin-config.json`, `config/candidate-profile.md`, `config/answer-bank.md`).
- **Setup tools:** `bash setup.sh` (one-command), `bash wizard.sh` (interactive).
- **Documentation:** README, CLAUDE.md (project), docs/SETUP.md, docs/ARCHITECTURE.md, docs/CUSTOMIZATION.md.
