---
name: job-evaluate
description: Auto-pipeline for a single job posting. Pastes a URL → fetches the JD → scores it across the 7-block A-G rubric → writes a structured evaluation report → generates a tailored ATS-friendly PDF CV → appends a row to application-tracker.csv. Career-ops's killer demo, ported to our skill pack. Proactively invoke this skill (do NOT answer conversationally) when the user pastes a job URL with phrases like "evaluate this", "score this one", "should I apply to this", "what do you think of this role", "deep-dive this", "auto-pipeline this", or invokes /job-evaluate. For an actual fill-the-form-and-submit flow, use /job-apply instead — /job-evaluate is the analytical pre-step.
argument-hint: "<job URL>  (LinkedIn / Greenhouse / Lever / Jobvite / Ashby / direct careers page)"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - WebFetch
  - WebSearch
---

# Job Evaluate

The single-shot demo. Paste a URL, get a structured evaluation + PDF resume + tracker row out the other side. Career-ops calls this "auto-pipeline." This is what makes a recruiter say "wait, this thing is real."

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Prerequisites

1. `config/candidate-profile.md` exists (run `/job-setup` first if not)
2. `cv.md` exists at the repo root, OR a resume PDF path in `linkedin-config.json` that we can extract from
3. Playwright Chromium installed (`npx playwright install chromium` once) — needed for PDF generation

If any prereq is missing, fail with a clear message and stop. Don't half-run.

## Workflow

### Step 1 — Fetch and parse the JD

```bash
WebFetch "$URL"
```

Extract:
- **Company** (from URL host or page title)
- **Role title** (h1 / job title heading)
- **Posted date** (look for "Posted N days ago" / explicit ISO date)
- **Location** (city + remote/hybrid/onsite signal)
- **Required skills** (the bulleted "Requirements" / "Qualifications" section)
- **Nice-to-haves** (separate list if present)
- **Compensation range** (if disclosed)
- **Recruiter / hiring manager name** (if named)
- **ATS platform** (host: linkedin.com → LinkedIn Easy Apply; boards.greenhouse.io → Greenhouse; jobs.lever.co → Lever; etc.)

If the JD is behind auth (LinkedIn often is) or the fetch failed, ask the user to paste the JD text directly.

### Step 2 — Score across A-G blocks (rubric from `/job-coach`)

Each block scores 0-5. Reference the rubric in `/job-coach`'s SKILL.md if you need the exact definitions. Use the candidate's `config/candidate-profile.md` + `config/search-plan.md` (if it exists) to inform B/C/D.

For E (personalization angle) and F (interview signal), do additional research:

```
WebSearch "<Company> hiring intern review Glassdoor"
WebSearch "<Company> interview process site:reddit.com OR site:teamblind.com"
WebSearch "<Company> recent news 2026"
```

Cite sources for E and F in the eval (1 link each is enough — the user can drill in). Don't make up signal.

For G (legitimacy), check:
- Posted date ≤ 30 days
- A real reqID / job number is shown
- The company has other recent reqs (not a single ghost listing)
- The recruiter is reachable (LinkedIn search by name)

### Step 3 — Render the eval in chat

```
🎯 Evaluation: <Role> at <Company>

Headline fit: 4.3 / 5.0  (apply candidate)

| Block | Score | Why |
|-------|:-----:|-----|
| A. Role match     | 5/5 | "Substation Engineering Intern" exact match to your primary archetype |
| B. CV match       | 4/5 | All required skills present (CAD, SCADA, Python). Missing: PSCAD (mentioned in your interests, not on resume — bring up in cover letter) |
| C. Level fit      | 5/5 | Intern, Summer 2026 — exact match |
| D. Compensation   | 4/5 | $24-32/hr disclosed, above your $21 floor |
| E. Personalization| 5/5 | Their VP Paul Young recently spoke at IEEE PES — cite his keynote in cold email |
| F. Interview      | 4/5 | Glassdoor shows 4.1, mostly technical-on-substations questions, no leetcode. 2 candidates report "fair, conversational" |
| G. Legitimacy     | 4/5 | Posted 7 days ago, reqID iC-2026-1842, full team named on careers page |

Recommended next move: /job-apply (Greenhouse, dry-run first)

Sources used:
- E: https://ieeepes.org/keynote-2026-young
- F: https://glassdoor.com/Reviews/Ameren-...
- G: https://careers.ameren.com/...
```

### Step 4 — Write the structured report

Append to `reports/<YYYY-MM-DD>-<company-slug>-<role-slug>.md`. Use this exact structure (matches career-ops's report shape):

```markdown
---
title: <Role> at <Company>
company: <Company>
role: <Role>
url: <URL>
posted: <ISO date>
fit_score: 4.3
fit_breakdown: { A: 5, B: 4, C: 5, D: 4, E: 5, F: 4, G: 4 }
evaluated_at: <ISO timestamp>
status: evaluated
---

## TL;DR
<1-paragraph summary: why this is or isn't a fit>

## Block A — Role match
<details>

## Block B — CV match
<details>

... (one section per block)

## Sources
- <each link cited above>

## Recommended next move
<one of: /job-apply, /job-outreach, /job-cv first then /job-apply, skip>
```

Create the `reports/` directory if it doesn't exist. **Gitignored** (add `reports/` to `.gitignore` if not already).

### Step 5 — Generate tailored PDF CV

If the recommended move involves applying (not skip), automatically chain into `/job-cv` to produce a tailored PDF for this specific role. Pass the JD context so `/job-cv` knows what to optimize for.

If the user explicitly says "skip CV" or the role is below 3.0/5.0 fit, skip Step 5.

### Step 6 — Append tracker row

Append to `application-tracker.csv` with status `evaluated` (not `applied` yet — the user hasn't actually applied; this is the evaluated stage):

| date | company | role | status | location | source | applied_by | url | notes | contact | compensation |
|------|---------|------|--------|----------|--------|-----------|-----|-------|---------|--------------|

`notes` should include the fit score, e.g. `"fit 4.3/5.0; report at reports/2026-04-26-ameren-substation-intern.md"`.

If the role scored ≥ 4.0, also offer to chain immediately into `/job-apply <url>` so the user can hit the actual application form right after evaluating.

### Step 7 — Final summary card

| Field | Value |
|-------|-------|
| 🎯 Fit | 4.3 / 5.0 |
| 📄 Report | `reports/2026-04-26-ameren-substation-intern.md` |
| 📑 Tailored CV | `output/cv-ameren-2026-04-26.pdf` |
| 📋 Tracker | row N appended (status: evaluated) |
| ➡️ Next | `/job-apply <url>` — recommended; do you want me to run it? |

## Rules

- **Never fabricate scores.** If you can't find a signal for a block (e.g. no Glassdoor data for an obscure UZ company), score it 3 (neutral) and say "no signal" in the breakdown — do not invent.
- **Always cite sources for E, F, G.** The user should be able to click a link and verify.
- **Don't auto-apply.** This skill stops at "evaluated"; chaining into `/job-apply` is the user's explicit next step.
- **One JD per invocation.** For batch evaluation, the user can run `/job-evaluate` repeatedly or use `/job-coach` which produces a slate.
- **If a row for this URL already exists in the tracker**, ask before re-evaluating: "Already evaluated 2026-04-15. Re-score? (y/n)"

## Related

- `/job-coach` — produces a *slate* of candidates; `/job-evaluate` deep-dives one of them.
- `/job-cv` — tailored PDF generation; chained into automatically when fit ≥ 4.0.
- `/job-apply` — actual form-filling; the natural next step after a positive eval.
- `/job-outreach` — if the eval surfaces a named hiring manager and recommends cold email instead of (or alongside) the form.
