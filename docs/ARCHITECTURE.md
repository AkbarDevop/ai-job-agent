# Architecture

This document explains how the AI Job Application Agent works end-to-end — from the persona-driven orchestrator down to the ATS form-fillers, the CSV sources of truth, and the markdown / PDF / TUI artifacts the system produces.

It supersedes the original "5 ATS scripts + Outlook triage" architecture (v1.0, April 22). Today the system is a 13-skill orchestrated flow with `/job-coach` as the entry point and verb skills underneath, all backed by a small set of zero-dep Node + Python scripts.

## System Overview

```
                                 +-----------------+
                                 |   /job-coach    |   <-- the persona; user talks to this
                                 |  (orchestrator) |
                                 +--------+--------+
                                          | dispatches
                                          v
   +----------+   +-------------+   +-----+-----+   +-----------+   +-------------+
   |/job-setup|   |/job-evaluate|   |/job-apply |   |/job-cv    |   |/job-outreach|
   |onboarding|   |rubric+report|   |ATS router |   |tailor+PDF |   |draft+send   |
   +----+-----+   +------+------+   +-----+-----+   +-----+-----+   +------+------+
        |                |                |               |                |
        v                v                v               v                v
   reads/writes    writes report     drives one of   writes PDF       writes row
    config/*       to reports/       5 ATS scripts   to output/       to outreach-log.csv
                   (gitignored)      (LI/GH/Lev/                       sends via msmtp
                                      JV/Ashby)                        threaded via In-Reply-To
                                                                              |
                                                                              v
                                                                       +------+--------+
                                                                       | /job-followup |
                                                                       | day-7 cadence |
                                                                       | max 2 follow- |
                                                                       | ups per       |
                                                                       | contact       |
                                                                       +------+--------+
                                                                              |
   +-----------------------------+-----------------------------+---------------+
   |                             |                             |
   v                             v                             v

  Sources of truth (CSVs in repo root, all gitignored)

  +----------------------------+      +-----------------------------+
  | application-tracker.csv    |      | outreach-log.csv            |
  | date,company,role,status,  |      | sent_at,company,role,       |
  | location,source,applied_by,|      | to_name,to_email,subject,   |
  | url,notes,contact,         |      | body_file,message_id,       |
  | compensation,days_since,key|      | status,replied_at,          |
  +-------------+--------------+      | follow_up_count,...         |
                |                     +--------------+--------------+
                |                                    |
                +--+----------------+--+-------------+--+----+
                   |                |  |                |    |
                   v                v  v                v    v

   +---------------+  +-----------------+  +-------------+  +-----------------+
   | /job-track    |  | mirror-tracker  |  | /job-triage |  | /job-patterns   |
   | (status table)|  | -> data/*.md    |  | (Outlook +  |  | (diagnostics:   |
   | + sheet sync  |  | (npm run mirror)|  |  reply auto-|  |  ATS / time /   |
   +-------+-------+  +--------+--------+  |  detection) |  |  geography /    |
           |                   |           +------+------+  |  role-type /    |
           v                   v                  |         |  weekday)       |
   +-------+-------+   +-------+-------+          v         +-----------------+
   | google-sheet- |   | /job-dashboard|   +------+------+
   | sync.py       |   | 5-tab TUI:    |   | /job-status |
   | (gcloud OAuth)|   | Apps · Out-   |   | (batch flips|
   +---------------+   | reach · F-ups |   |  to CSV +   |
                       | · Pipeline ·  |   |  Sheet)     |
                       | Reports       |   +-------------+
                       | (zero deps,   |
                       |  fs.watch     |
                       |  live reload) |
                       +-------+-------+
                               |
                               v
                       +-------+--------+
                       | /job-interview |   uses tracker + outreach + WebSearch +
                       | STAR prep doc  |   candidate-profile.md to build prep
                       | -> interview-  |   docs grounded in real projects, not
                       | prep/*.md      |   generic STAR templates
                       +----------------+
```

The shape: **`/job-coach` is the only entry point a user needs to remember.** Verb skills are dispatched by the coach (or invoked directly when the user is specific). All persistent state lives in two CSVs at the repo root. Every artifact (reports / PDFs / interview docs / markdown mirrors / search-plan) is gitignored personal data.

## Data flow

```
User intent
    |
    | "I need an EE intern role for summer"  (open-ended)
    v
/job-coach
    |
    | reads candidate-profile.md, search-plan.md (if exists),
    | application-tracker.csv, outreach-log.csv
    | runs WebSearch / WebFetch for fresh roles + lookalikes
    | scores each candidate against 7-block A-G rubric
    | renders ranked slate, asks user to pick
    v
User picks #N (or pastes URL directly, bypassing /job-coach)
    |
    +--- "/job-evaluate <url>" (deep-dive single role)
    |       |
    |       v
    |   WebFetch the JD
    |       |
    |       v
    |   Score 7 blocks (A-G), cite sources for E/F/G
    |       |
    |       v
    |   Write reports/<date>-<co>-<role>.md (gitignored)
    |       |
    |       v
    |   Chain into /job-cv  (if fit >= 4.0)
    |       |
    |       v
    |   Append row to application-tracker.csv at status=evaluated
    |
    +--- "/job-cv <jd>"  (tailor base CV for one JD)
    |       |
    |       v
    |   Read cv.md  (or extract from candidate-profile.md)
    |       |
    |       v
    |   Claude rewrites bullets — never invents — to match JD vocab
    |       |
    |       v
    |   User approves the markdown
    |       |
    |       v
    |   generate-tailored-cv.mjs --> Playwright Chromium --> PDF
    |       |
    |       v
    |   Write output/cv-<co>-<date>.pdf
    |
    +--- "/job-apply <url>"  (actually apply)
    |       |
    |       v
    |   URL host detection -> route to one of:
    |     linkedin-easy-apply.js  (cookie-based auth)
    |     greenhouse-apply.js     (CDP or headless)
    |     lever-apply.js
    |     jobvite-apply.js
    |     ashby-apply.js
    |       |
    |       v
    |   Auto-answer engine fills standard fields
    |   Two-gate approval before submit
    |       |
    |       v
    |   Append row to application-tracker.csv at status=applied/submitted
    |
    +--- "/job-outreach <target>"  (cold email)
    |       |
    |       v
    |   Research company + person (WebSearch/WebFetch)
    |       |
    |       v
    |   Claude (this agent) drafts personalized email, no external LLM
    |       |
    |       v
    |   User approves
    |       |
    |       v
    |   send-cold-email.js  (msmtp with header-injection guard)
    |       |
    |       v
    |   Append row to outreach-log.csv (status=sent + message-id)
    |
    +--- "/job-followup [send]"   (day-7 cadence)
    |       |
    |       v
    |   Read outreach-log.csv
    |   Compute urgency (overdue / due / soon / waiting)
    |   Cap at 2 follow-ups per contact
    |       |
    |       v
    |   Draft each follow-up; user approves one at a time
    |       |
    |       v
    |   send-cold-email.js threaded via In-Reply-To header
    |   Append outreach-log.csv (status=followup-N + replied_at if any)
    |
    +--- "/job-triage [query]"   (Outlook reply detection)
    |       |
    |       v
    |   outlook-triage.js (Chrome CDP) searches Outlook Web
    |   Cross-references outreach-log.csv: any "from <to_email>" matches
    |   ==> auto-mark replied, prompt user to flip status
    |
    +--- "/job-status <updates.json>"  (batch flips)
    |       |
    |       v
    |   tracker-status-update.py
    |   Diff before applying, two-gate approval
    |       |
    |       v
    |   Update both application-tracker.csv and Google Sheet
    |
    +--- "/job-interview <company>"   (prep doc)
    |       |
    |       v
    |   Read tracker + outreach-log + candidate-profile.md
    |   WebSearch + WebFetch for company / interviewer / Glassdoor
    |       |
    |       v
    |   Claude synthesizes:
    |     - Company snapshot (3 lines)
    |     - 10-15 likely Qs (Tech / Behavioral / Culture / Curveball)
    |     - 5-8 STAR stories grounded in real projects
    |     - 5 smart Qs to ask
    |     - 3 red flags
    |       |
    |       v
    |   Write interview-prep/<date>-<co>-<role>.md
    |
    +--- "/job-patterns"   (diagnostics)
            |
            v
        Read tracker + outreach-log
        Compute 6 signals: ATS / time-to-rej / geography / role-type /
                           outreach-by-tier / day-of-week
            |
            v
        Render 4-5 markdown tables + "What to change this week" (3 bullets)


# Background sync, dashboards, and mirror

application-tracker.csv  --(npm run mirror)-->  data/applications.md
outreach-log.csv         --(npm run mirror)-->  data/outreach.md
                         --(npm run dashboard)--> 5-tab TUI live reload

application-tracker.csv  --(google-sheet-sync.py)--> Google Sheet (Job Tracker tab)

reports/                 --(npm run dashboard, Reports tab)--> artifact counter
```

## Component details

### 1. The orchestrator — `/job-coach`

`skills/job-coach/SKILL.md`. The only persona in the system. The user *talks* to this; it dispatches into verb skills.

Responsibilities:
- Read `candidate-profile.md`, `search-plan.md`, `application-tracker.csv`, `outreach-log.csv` on every invocation
- Intake interview if `search-plan.md` is missing
- Visible web research (narrate every WebSearch / WebFetch)
- Score every candidate role against the 7-block A-G rubric (Role / CV / Level / Comp / Personalization / Interview / Legitimacy)
- Render ranked slate, group into "do now / save for later / skip"
- Chain into the right verb skill based on user pick
- Persist plan back to `config/search-plan.md` (gitignored) on every change

Never auto-applies, never auto-sends. Always surfaces options and waits for user.

### 2. Setup — `/job-setup`

`skills/job-setup/SKILL.md`. Conversational onboarding. Auto-reads what the user already has on disk (CLAUDE.md, `~/.brain`, Claude memory, `~/.msmtprc`, resume PDFs in `~/Downloads`, `~/Desktop`) before asking anything. Optional web research for things it can't infer. Writes `config/candidate-profile.md`, `config/linkedin-config.json`, optionally `~/.msmtprc` for cold email.

### 3. The 7-block A-G rubric — `/job-evaluate`

`skills/job-evaluate/SKILL.md` ("career-ops's killer demo"). Single-shot pipeline:

| Block | What it measures |
|-------|------------------|
| A. Role match | JD's day-to-day vs candidate's primary archetype |
| B. CV match | JD's required skills present on candidate's CV |
| C. Level fit | Intern / new-grad / mid — matches candidate's stage |
| D. Compensation | At/above floor; disclosed? |
| E. Personalization angle | Non-obvious hook for cold email |
| F. Interview signal | Glassdoor / Blind / HN reputation |
| G. Posting legitimacy | Real role vs ghost listing — date, reqID, recruiter follow-through |

Each block 0-5; total 0-35; headline `total ÷ 7` rounded to one decimal. Threshold: 3.0 = drop, 4.0 = high-confidence apply. Sources for E/F/G are cited; user can verify.

### 4. ATS form-fillers — `/job-apply`

`skills/job-apply/SKILL.md` routes by URL host into one of 5 scripts:

| Host pattern | Script | Auth |
|--------------|--------|------|
| `linkedin.com/jobs/view/...` | `linkedin-easy-apply.js` | Chrome cookies (browser_cookie3) |
| `boards.greenhouse.io/...` | `greenhouse-apply.js` | None |
| `jobs.lever.co/...` | `lever-apply.js` | None |
| `jobs.jobvite.com/...` | `jobvite-apply.js` | None |
| `jobs.ashbyhq.com/...` | `ashby-apply.js` | None |

LinkedIn is the most complex — multi-step dialog flow with up to 12 steps, pattern-matched auto-answer engine for dropdowns / text fields / fieldsets. ATS scripts are simpler — config-driven explicit field mappings, two browser modes (CDP attach to existing Chrome, or headless launch). Exit codes are consistent (0=ok, 2=blocked-on-unknown, 3=captcha-timeout, 4=step-limit).

### 5. Cold outreach — `/job-outreach` + `/job-followup`

`send-cold-email.js` is the underlying sender. Talks to local `msmtp` (Gmail SMTP via app password). Two key safety properties:
- **Header-injection guard** — strips CRLF from To / Subject before composing the RFC822 envelope (fixed in `dff7a4f`)
- **Threaded follow-ups** — when `/job-followup` sends, it sets `In-Reply-To` and `References` headers to the original message-id, so the reply appears in the same Gmail thread

`/job-outreach` does the LLM work in-chat (Claude-this-agent drafts; no external API call). User approves before send. Logs to `outreach-log.csv`.

`/job-followup` reads `outreach-log.csv`, computes urgency (overdue / due / soon / waiting) using a 7-day cadence, caps at 2 follow-ups per contact, walks them one at a time.

### 6. Tailored CV PDF — `/job-cv`

`skills/job-cv/SKILL.md` + `scripts/generate-tailored-cv.mjs`. Claude rewrites — never invents — base CV bullets to match a specific JD's vocab. User approves the markdown. The Node script then renders the markdown to a single-page (or two-page) ATS-friendly PDF via Playwright Chromium. Output to `output/cv-<company>-<date>.pdf`. Default CSS is one-column serif, no icons, no multicol, parser-safe.

### 7. Interview prep — `/job-interview`

`skills/job-interview/SKILL.md`. Reads `application-tracker.csv` + `outreach-log.csv` + `candidate-profile.md` + does WebSearch/WebFetch for company / interviewer / Glassdoor. Synthesizes a single prep doc with: company snapshot · likely Qs · STAR stories grounded in *real projects* (every Result must reference a real metric from candidate-profile.md, no invented numbers) · smart Qs to ask · red flags. Writes to `interview-prep/<date>-<co>-<role>.md`.

### 8. Pipeline diagnostics — `/job-patterns`

`skills/job-patterns/SKILL.md`. Read-only on both CSVs. Computes 6 signals:

| Signal | Slice |
|--------|-------|
| A. Rejection rate by ATS | `linkedin / greenhouse / lever / jobvite / ashby / direct-email` |
| B. Time-to-rejection histogram | <24h (ATS filter), 1-3d (recruiter), 4-14d (HM), >14d (ghosted) |
| C. Geography | Bay Area / Remote / Midwest / NYC / Other |
| D. Role-type | software / electrical / research / product / other |
| E. Outreach response by tier | Tier 1 / Tier 2 / Tier 3 (from `search-plan.md`) or by recipient title |
| F. Day-of-week | weekday × interview-rate × reply-rate |

Renders tables + 3 actionable insights. Won't surface if combined CSVs have <10 rows ("not enough data").

### 9. Triage — `/job-triage`

`skills/job-triage/SKILL.md` + `outlook-triage.js`. Connects via Chrome CDP to a running Outlook Web tab. Searches, classifies (rejection / interview / confirmation / action-required / recruiter / other), extracts, marks read.

**Reply auto-detection (v1.1):** before classifying, cross-references the search results against `outreach-log.csv`. If an inbound email is from a logged contact (`from_address ∈ outreach-log.to_email`), suggest auto-marking the matching outreach row as `replied`.

### 10. Status batch updates — `/job-status`

`skills/job-status/SKILL.md` + `tracker-status-update.py`. Takes JSON of updates `[{sheet_row, company, role, status, note}]`, shows before/after diff, two-gate confirmation, then writes to both the local CSV and the Google Sheet.

### 11. The dashboard — `/job-dashboard`

`skills/job-dashboard/SKILL.md` + `scripts/job-dashboard.mjs`. Zero deps (pure Node ANSI + Unicode box chars). Two modes:

- **Snapshot:** `node scripts/job-dashboard.mjs --snapshot` → ANSI to stdout. Used by the `/job-dashboard` skill for in-chat output.
- **Interactive TUI:** `npm run dashboard` → 5 tabs (Applications · Outreach · Follow-ups · Pipeline · Reports). Keybindings: 1-5 jump to tab, `/` filter, ↑↓ scroll, Enter detail, `?` help, `r` reload, `q` quit. Live reload via `fs.watch` on both CSVs (~200ms re-render). The Reports tab (added in `e73b13c`) reads `reports/` to surface evaluation outputs.

Pairs with `npm run agent` for unified mode (Claude Code top pane + dashboard bottom pane via tmux).

### 12. Markdown mirror — `mirror-tracker.mjs`

`scripts/mirror-tracker.mjs`. CSVs are the source of truth, but humans read markdown better. `npm run mirror` regenerates `data/applications.md` + `data/outreach.md` from the CSVs (status breakdown + recent 25 rows, with status emojis). `npm run mirror:watch` keeps them fresh via fs.watch. Both `data/*.md` files are gitignored.

### 13. Health checks

| Script | Purpose |
|--------|---------|
| `bin/smoke-test.sh` (`npm run smoke`) | Sandboxed `$HOME`, fresh-install. Exercises every script that doesn't need real network/credentials. CI-safe. |
| `bin/doctor.sh` (`npm run doctor`) | Inspects the *real* user environment (toolchain, repo paths, configs, msmtp, gcloud, skill files, Playwright Chromium). Exits 0 on no FAILs, 1 otherwise. |

## Two-gate approval

Every send / submit goes through two gates:

1. **Preview:** the agent shows the full payload (form fields filled, email body, JSON updates, etc.) and asks "approve?"
2. **Send:** even after approval, scripts respect `autoSubmit: false` / `--dry-run` flags. The user can still abort by interrupting before the actual send/submit.

This is non-negotiable — applies to `/job-apply`, `/job-outreach`, `/job-followup`, `/job-status`. Diagnostic skills (`/job-track`, `/job-dashboard`, `/job-patterns`, `/job-interview`, `/job-evaluate`, `/job-cv`) don't write to send/submit endpoints, so no second gate is needed.

## Security model

- **No credentials in repo.** `gcloud auth application-default` for Sheets, Chrome cookies for LinkedIn, `~/.msmtprc` for SMTP, all live on the user's machine.
- **CDP is opt-in.** Outlook scripts only connect to a Chrome instance the user explicitly starts with `--remote-debugging-port=9224`.
- **Header-injection guard** in `send-cold-email.js` strips CRLF from `To` / `Subject` (CVE-2025-style attack vector if user pastes attacker-controlled email lists).
- **No data exfiltration.** Every artifact is local: CSVs, markdown mirror, PDFs, interview prep docs, evaluation reports, search-plan.

## Performance characteristics

| Component | Typical runtime | Network |
|-----------|----------------|---------|
| `/job-coach` intake | 5-10 min (interactive) | 5-15 WebSearch + WebFetch calls |
| `/job-evaluate` one URL | 30-90s | 1 WebFetch + 4-6 WebSearch |
| `/job-cv` render | 10-30s | 0 (Playwright local) |
| `/job-apply` LinkedIn | 15-45s | 10-20 page loads |
| `/job-apply` ATS (GH/Lever/JV/Ashby) | 5-15s | 3-5 page loads |
| `/job-outreach` draft+send | 10-30s | msmtp SMTP, 1 send |
| `/job-followup` per contact | 5-10s | msmtp SMTP, 1 send |
| `/job-interview` | 60-120s | 6-10 WebSearch+WebFetch |
| `/job-patterns` | <1s | 0 (CSV reads only) |
| `/job-dashboard` snapshot | <100ms | 0 (CSV reads only) |
| `/job-dashboard` live reload | ~200ms after CSV change | 0 |
| `npm run mirror` | <50ms per CSV | 0 |
