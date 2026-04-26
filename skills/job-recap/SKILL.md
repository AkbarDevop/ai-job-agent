---
name: job-recap
description: Friday-evening weekly retrospective across the whole job-search pipeline — reads application-tracker.csv, outreach-log.csv, reports/, interview-prep/, output/, git log, and config/search-plan.md, computes by-the-numbers tables for the time range, surfaces top 3 wins, top 3 risks, and 3 concrete next-week moves with named companies and slash commands. Proactively invoke this skill (do NOT answer conversationally) when the user asks "weekly recap", "what did I do this week", "Friday update", "job search retrospective", "this week's wins", "where am I", "what shipped this week in my search", "recap", or invokes /job-recap. Prefer this over `/job-dashboard` or `/job-patterns` when the user wants a time-bounded retro, not a status snapshot or a diagnosis.
argument-hint: "[7d | 14d | 30d | since YYYY-MM-DD]   (default 7d)"
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# Job Recap

Weekly retrospective for the job search. Reads every data source the pipeline writes to, slices it by the requested time range, and produces a single Friday-evening recap: numbers, wins, risks, and 3 concrete moves for next week.

Where `/job-dashboard` answers *"what does the pipeline look like right now"* and `/job-patterns` answers *"why is the pipeline shaped that way"*, `/job-recap` answers *"what actually happened in the last 7 days, and what should I do next week."*

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Status emoji (consistent with /job-track and /job-patterns)

📄 applied · 📬 submitted · 💼 interview · 🎯 offer · ❌ rejected · 🚫 blocked · 🚪 withdrawn

## Workflow

### Step 1 — Resolve repo + parse the time range

1. Resolve `$AI_JOB_AGENT_ROOT` (env var → default skills path → REPO_PATH marker → `~/ai-job-agent/`).
2. Parse `$ARGUMENTS`:
   - empty or `7d` → `start = today - 7 days`
   - `14d` → `start = today - 14 days`
   - `30d` → `start = today - 30 days`
   - `since YYYY-MM-DD` → `start = that date`
   - anything else → echo the arg, default to 7d, tell the user
3. Compute `prior_start = start - (today - start)` so we can show a delta against the prior window of equal length.
4. Print one line: *"Recap window: `<start>` → `<today>` (N days). Prior window for delta: `<prior_start>` → `<start>`."*

### Step 2 — Read all the data sources

Read in parallel; treat each missing/empty source as 0 (don't fabricate):

1. **`application-tracker.csv`** — filter to `date ≥ start`. Columns: `date, company, role, status, location, source, applied_by, url, notes, contact, compensation, days_since, key`.
2. **`outreach-log.csv`** — filter to `sent_at ≥ start` *and* separately collect rows where `last_follow_up_at ≥ start` (so a follow-up sent this week to an old contact still counts as activity).
3. **`reports/*.md`** — Glob the directory. Parse YAML frontmatter and filter by `evaluated_at ≥ start`. Pull out `fit_score` if present.
4. **`interview-prep/*.md`** — Glob, filter by file mtime ≥ start.
5. **`output/*.pdf`** — Glob, filter by mtime ≥ start. These are CV PDFs from `/job-cv` and `/job-evaluate`.
6. **Git log** — try `git -C $AI_JOB_AGENT_ROOT log --since="$start" --oneline`. If the repo is not a git repo (`fatal: not a git repository`), treat the result as empty and don't error.
7. **`config/search-plan.md`** — if it exists, read the file and pull the "Log" section's entries within range. Also note the file's mtime — if `today - mtime > 14d`, flag the plan as stale.

If the combined set has **fewer than 5 events total** across all sources, render this and stop:

> Only N events in the last `<window>`. That's a thin slice — patterns and recaps work better with 14d or 30d. Want me to broaden? (`/job-recap 14d` or `/job-recap 30d`)

### Step 3 — Compute the recap

Render four sections, all as markdown tables where possible. Skip a row entirely if its source is empty (don't pad with zeros for sources that don't exist for the user).

#### Section 1 — This week by the numbers

| Metric | Count | Δ vs prior window |
|--------|------:|------------------:|
| 📄 Applications submitted (LinkedIn / Greenhouse / Lever / Jobvite / Ashby / direct / other) | N (broken out) | +N or −N |
| Pipeline movement (applied→submitted, submitted→interview, …→rejected) | N transitions | — |
| ✉️ Cold emails sent | N | +N or −N |
| 💬 Follow-ups sent | N | +N or −N |
| 📥 Replies received | N | +N or −N |
| 🔍 Evaluations done | N (avg fit `X.X`) | +N or −N |
| 📝 Interview-prep notes generated | N | +N or −N |
| 📄 CV PDFs generated | N | +N or −N |
| 💼 Interviews scheduled or completed | N | +N or −N |
| 🎯 Offers | N | +N or −N |

Notes on computation:
- **Applications by ATS source**: bucket the `source` column (or infer from `url` host) into `linkedin / greenhouse / lever / jobvite / ashby / direct / other`. Show as a one-liner under the row, e.g. `(8 LI · 3 GH · 2 Lever · 1 direct)`.
- **Pipeline movement**: only countable if the tracker row's `notes` column contains a status-change timestamp within range, OR if `days_since` plus `status` implies the change happened in window. If the tracker doesn't capture state changes, say `— (tracker doesn't log transitions)` and skip the row, don't fabricate.
- **Cold emails sent vs Follow-ups sent**: a row is a cold email if `sent_at ≥ start` and `follow_up_count == 0`. It's a follow-up activity if `last_follow_up_at ≥ start`. Don't double-count: a row with both `sent_at` and `last_follow_up_at` in window counts once as a cold email and once as a follow-up — they're two different sends.
- **Replies received**: any outreach row with `replied_at ≥ start`.
- **Avg fit score**: mean of `fit_score` across reports in window. If no reports have `fit_score`, omit the parenthetical.
- **Interviews scheduled/completed**: tracker rows with `status == interview` whose row was either *added* or *transitioned* within window.
- **Δ vs prior window**: same metric on `[prior_start, start)`. Show absolute delta with sign. If prior window has 0 and current has N, show `+N (new)`. If both are 0, show `—`.

#### Section 2 — Top 3 wins

Three bullets max. Each cites the source row/file. Pick from:

- **Highest-fit eval** — the report with the top `fit_score` in window. Cite path + score.
- **Best reply** — any reply at all is a win when reply rate is low. Cite company + recipient name. Prefer a reply from a Tier 1 / VP / hiring manager over a recruiter auto-reply.
- **Pipeline movement** — e.g. "moved 3 from applied → interview", "first offer this quarter".
- **Volume milestone** — e.g. "first week >10 applications", "first week sending follow-ups consistently".

If nothing obvious qualifies:

> No clear wins this week — that's normal. Slow weeks are part of the search. Volume next week.

#### Section 3 — Top 3 risks / blockers

Three bullets max. Each names specific companies, not just counts. Pull from:

- **Overdue follow-ups** — apply the `/job-followup` rule: any non-done outreach row where `days_since_last_touch > 10` and `follow_up_count < 2`. Name them.
  > Example: "4 contacts overdue: Paul Young (GFT, 12d), Zulfiya Vafaeva (Worley, 11d), Hans Mueller (Siemens, 14d), Muhammad Mahmudov (P&P, 11d). Run `/job-followup send` Monday."
- **Ghosted apps** — tracker rows with `status ∈ {applied, submitted}` and `(today - date) > 14` and no status change in window. Name 2-3.
- **Low-fit pipeline** — if the avg fit score this week is below the prior window by ≥0.5, call it out.
- **Stale plan** — if `config/search-plan.md` mtime is >14d old, flag it and suggest `/job-coach refresh`.
- **Drying outreach** — if cold emails sent dropped to 0 this week and the prior week was >0, flag it.

If nothing qualifies:

> No blocking risks. Pipeline is moving.

#### Section 4 — Next week's top 3 moves

Concrete. Names, URLs, slash commands. Pick from the risks above, the wins, and the search-plan's saved-for-later list. Not "you could…" — "do this."

> 1. Run `/job-followup send` Monday — 4 contacts due (Paul Young, Zulfiya Vafaeva, Hans Mueller, Muhammad Mahmudov).
> 2. `/job-evaluate <url>` for the 3 SF Bay AI/ML roles bookmarked from `/job-coach` last week (paste the URLs from `config/search-plan.md` "Save for later" list).
> 3. `/job-cv` for the Anthropic Fellows posting before Friday's deadline (link in `config/search-plan.md`).

### Step 4 — Offer to save + Telegram-ize

End the recap with this exact prompt:

> Want me to save this as `~/Desktop/job-recap-<YYYY-MM-DD>.md` and prep a Telegram-ready short version (3 bullets max, lowercase, no fluff — matches @akbardaily voice)? (yes/no)

Wait for the user.

### Step 5 — On `yes`, save + Telegram-ize

1. Write the full recap to `~/Desktop/job-recap-<YYYY-MM-DD>.md`. Don't use `~`, expand to absolute path.
2. Generate the Telegram short version. Rules:
   - All lowercase
   - 3 bullets max
   - No exclamation points
   - No "I'm so excited" / "amazing week" / hype
   - Mirror @akbardaily voice: personal, factual, slightly dry
   - Lead with the one number that mattered most this week
   - Example shape:
     > week 14 of the search. 11 apps out, 1 reply (worley → recruiter screen), 4 follow-ups due monday.
     > the SF bay AI roles keep showing up but nothing replied yet. midwest still converting better.
     > next week: clear the follow-up backlog, evaluate the anthropic fellows posting, ship one cv tailor.
3. Print both: the saved file path and the Telegram message body. Do **not** auto-send to Telegram — just produce the message ready to copy-paste.

Final summary:

| Field | Value |
|-------|------:|
| Recap saved to | `<path>` |
| Telegram short version | (rendered above) |
| Window covered | `<start>` → `<today>` |
| Total events captured | N |

## Rules

1. **Don't fabricate numbers.** If the source CSV is empty for a metric, show 0 and footnote which file is empty (e.g. *"outreach-log.csv has no rows in window"*). Never invent activity.
2. **Don't double-count.** A row that appears in both the tracker and the outreach-log (someone the user both applied to and emailed) counts once per metric — a cold email is not also an application. Use `(company, role)` as the dedupe key when relevant.
3. **Telegram voice is sacred.** Lowercase, no exclamation points, no hype words, ≤3 bullets. If unsure, prefer fewer/shorter bullets to over-padding.
4. **Sparse data fallback.** If <5 events total in window, don't render half-empty tables — offer to broaden the range (14d / 30d) and stop.
5. **Read-only on CSVs.** Never mutate `application-tracker.csv` or `outreach-log.csv`. The only write is `~/Desktop/job-recap-<date>.md` after explicit user approval.
6. **Deltas are honest.** If the prior window has zero data (e.g. user just started), show `+N (new)`, not a misleading percentage.
7. **Git log is optional.** Non-git repos must not error — treat as empty.
8. **Stale plan is a risk, not a fix.** Flag it; don't auto-rewrite `search-plan.md`. That's `/job-coach refresh`'s job.
9. **One concrete name per risk.** "4 ghosted apps" is bad. "4 ghosted: Anthropic, Stripe, Figma, Notion" is good.

## Related

- `/job-dashboard` — point-in-time snapshot of applications + outreach + follow-ups. Use when the user wants *now*, not *this week*.
- `/job-patterns` — diagnostic across the whole tracker (rejections by ATS, time-to-rejection, etc.). Use when the user wants *why*, not *what happened*.
- `/job-followup` — chain into this from the "overdue follow-ups" risk row.
- `/job-coach refresh` — chain into this if `search-plan.md` is stale.
- `/job-track` — flat tracker view, no analysis.
