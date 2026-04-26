---
name: job-patterns
description: Read application-tracker.csv and outreach-log.csv, find non-obvious patterns in rejections / non-responses / interview rates / stage-of-loss, surface insights as markdown tables plus 3 concrete actionable takeaways. Proactively invoke this skill (do NOT answer conversationally) when the user asks "what's working", "what's not working", "analyze my rejections", "find patterns", "why am I getting rejected", "what's holding me back", "rejection analysis", "where am I losing", "analyze my pipeline", "why no responses", or invokes /job-patterns. Prefer this over `/job-track` or `/job-dashboard` when the user wants diagnosis, not status.
argument-hint: "(no args — reads both CSVs and renders the analysis)"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Job Patterns

Diagnostic companion to `/job-track` and `/job-dashboard`. Reads the two CSV sources of truth (`application-tracker.csv` + `outreach-log.csv`), slices them along the dimensions that actually predict outcomes (ATS, time-to-rejection, geography, role-type, day-of-week, outreach response), and renders 4-5 markdown tables plus **3 concrete actionable insights**.

Where `/job-track` says *what* the pipeline looks like, `/job-patterns` says *why it looks that way and what to change*.

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Status emoji (consistent with /job-track)

📄 applied · 📬 submitted · 💼 interview · 🎯 offer · ❌ rejected · 🚫 blocked · 🚪 withdrawn

## Workflow

### Step 1 — Resolve repo + read both CSVs

1. Resolve `$AI_JOB_AGENT_ROOT` (env var → default skills path → REPO_PATH marker → `~/ai-job-agent/`).
2. Read `$AI_JOB_AGENT_ROOT/application-tracker.csv` (or `$LOCAL_TRACKER`).
   - Columns: `date, company, role, status, location, source, applied_by, url, notes, contact, compensation, days_since, key`
3. Read `$AI_JOB_AGENT_ROOT/outreach-log.csv` (or `$OUTREACH_LOG`).
   - Columns: `sent_at, company, role, to_name, to_email, to_title, to_linkedin, subject, body_file, message_id, status, replied_at, follow_up_count, last_follow_up_at, notes`
4. If `application-tracker.csv` is missing or has 0 rows, tell the user to run `/job-apply` or `bash setup.sh` and stop.
5. If both files combined have **fewer than 10 application rows**, render this and stop:

   > Not enough data yet (N applications). Patterns surface around 20-30 apps. Keep going for a week or two and re-run `/job-patterns`.

### Step 2 — Compute the six signals

For each signal below, compute the slice → render the table.

#### Signal A — Rejection rate by ATS source/platform

Group `application-tracker.csv` by `source` (or infer from `url` host if `source` is empty). Bucket into: `linkedin`, `greenhouse`, `lever`, `jobvite`, `ashby`, `workday`, `direct-email`, `other`.

For each platform: count total apps, count rejections, count interviews, compute rejection rate and interview rate.

| Platform | Apps | ❌ Rejected | 💼 Interview | Rejection % | Interview % |
|----------|-----:|-----------:|-------------:|------------:|------------:|
| greenhouse | 18 | 14 | 1 | 78% | 6% |
| lever | 12 | 7 | 2 | 58% | 17% |
| linkedin | 22 | 10 | 4 | 45% | 18% |
| ashby | 4 | 1 | 1 | 25% | 25% |
| direct-email | 6 | 1 | 3 | 17% | 50% |

Sort by rejection rate descending. Skip platforms with `apps < 3` (too noisy) or list them in a separate "low-volume" footnote.

#### Signal B — Time-to-rejection histogram

For every row where `status == rejected`, compute days between `date` (applied) and the rejection (use `notes` for the rejection date if logged; else fall back to `days_since` column or skip the row).

Bucket into:
- **<24h** = ATS keyword filter (resume didn't pass screen)
- **1-3 days** = recruiter screen kill (recruiter looked, said no)
- **4-14 days** = hiring manager kill (got past recruiter, lost to another candidate)
- **>14 days** = ghosted / silent (never decisioned)

| Bucket | Likely cause | Count | % of rejections |
|--------|--------------|------:|----------------:|
| ❌ <24h | ATS keyword filter | 9 | 38% |
| ❌ 1-3 days | Recruiter screen kill | 5 | 21% |
| ❌ 4-14 days | Hiring manager kill | 4 | 17% |
| ❌ >14 days | Ghosted / silent | 6 | 25% |

The biggest bucket is the user's biggest leak. Call it out explicitly.

#### Signal C — Geography signal

Group apps by `location` (normalize: "Remote", "Bay Area", "NYC", "Texas", "Other US", "International"). For each: app count, interview count, interview rate.

| Geography | Apps | 💼 Interviews | Interview % |
|-----------|-----:|--------------:|------------:|
| Bay Area | 14 | 0 | 0% |
| Remote | 18 | 3 | 17% |
| Midwest | 8 | 2 | 25% |
| NYC | 6 | 1 | 17% |

Sort by interview rate descending. Geographies with <3 apps go in a footnote.

#### Signal D — Role-type signal

Classify each row's `role` into a bucket via keyword match (case-insensitive):

- **software** — `software`, `swe`, `backend`, `frontend`, `full-stack`, `mobile`, `ml`, `ai`, `data`, `platform`
- **electrical** — `electrical`, `ee`, `power`, `substation`, `circuits`, `hardware`, `firmware`, `embedded`
- **research** — `research`, `scientist`, `phd`, `lab`, `grad`
- **product/design** — `product`, `pm`, `design`, `ux`
- **other** — anything else

| Role type | Apps | 💼 Interviews | ❌ Rejected | Interview % |
|-----------|-----:|--------------:|-----------:|------------:|
| software | 24 | 4 | 14 | 17% |
| electrical | 18 | 1 | 13 | 6% |
| research | 6 | 2 | 2 | 33% |
| product/design | 4 | 0 | 3 | 0% |

Sort by interview rate descending.

#### Signal E — Outreach response rate by company tier

Read `outreach-log.csv`. A row "replied" if `replied_at` is non-empty OR `status ∈ {replied, interview_scheduled}`.

If `config/search-plan.md` exists, read it and tag each company as Tier 1 / Tier 2 / Tier 3 based on the file's company list. If no search-plan, group by `to_title` instead (`vp`/`director`/`manager`/`recruiter`/`engineer`/`other`).

| Group | Sent | ✉️ Replied | Response % |
|-------|-----:|-----------:|-----------:|
| Tier 1 (target) | 8 | 3 | 38% |
| Tier 2 (warm) | 11 | 2 | 18% |
| Tier 3 (cold) | 14 | 1 | 7% |

Or, when no search-plan exists:

| Recipient title | Sent | ✉️ Replied | Response % |
|-----------------|-----:|-----------:|-----------:|
| VP / Director | 6 | 3 | 50% |
| Hiring Manager | 9 | 2 | 22% |
| Recruiter | 12 | 1 | 8% |
| Engineer (peer) | 5 | 2 | 40% |

Sort by response rate descending.

#### Signal F — Day-of-week signal

For each application row, parse `date` to weekday. For each weekday: count apps + count interviews + compute interview rate. Same for outreach: weekday of `sent_at` + reply rate.

| Weekday | Apps sent | 💼 Interview % | Outreach sent | ✉️ Reply % |
|---------|----------:|---------------:|--------------:|-----------:|
| Mon | 12 | 25% | 6 | 33% |
| Tue | 14 | 21% | 8 | 25% |
| Wed | 8 | 13% | 5 | 20% |
| Thu | 9 | 11% | 4 | 25% |
| Fri | 11 | 9% | 3 | 0% |
| Sat | 4 | 0% | 2 | 0% |
| Sun | 6 | 0% | 1 | 0% |

Skip weekdays with `apps < 2` (too noisy).

### Step 3 — Render the 3 actionable insights

After the tables, output a section titled **"What to change this week"** with exactly 3 bullets. Each bullet must:

1. Cite a specific number from one of the tables above (e.g., "Greenhouse 78% vs LinkedIn 45%").
2. State the *likely cause* in one phrase (e.g., "your Greenhouse-tailored resume is weaker than the LinkedIn one").
3. Propose **one concrete change** the user can do this week (e.g., "tailor a Greenhouse-specific resume variant — keywords, format, length — and re-run 5 Greenhouse apps with it").

Pick the 3 strongest signals — biggest gap, smallest p-value if you can eyeball it, biggest volume × biggest delta. Don't pad. If only 2 signals are strong, output 2 bullets and say "only 2 strong signals at this volume, more to come."

Example output:

> ### What to change this week
>
> 1. **Greenhouse rejection rate is 78% vs LinkedIn 45%** — your Greenhouse-tailored resume is weaker than the LinkedIn one (or you're not tailoring per-platform). Build a Greenhouse-specific variant this week and re-run your last 5 Greenhouse rejections with it.
> 2. **38% of rejections come within 24h** — that's pure ATS keyword filter, not a recruiter looking. Run `/resume-ats-optimizer` against your top 3 target JDs and rewrite the bullets that are missing keywords. Don't apply to anything else until that's done.
> 3. **Bay Area apps are 0/14 on interviews while Midwest is 2/8** — you're being filtered out as a non-local Mizzou student in the Bay Area pool. Either add a "willing to relocate, will pay own move" line to your Bay Area cover letter, or stop spending Bay Area applications and double down on Midwest + Remote where the conversion is happening.

### Step 4 — Footer

End with a one-liner pointing to the next move:

> Run `/job-track` to see the raw pipeline, `/job-followup` if you want to nudge the cold contacts, or paste a new job URL to apply with the lessons above.

## Rules

1. **No narrative prose dumps.** All findings go in tables. The only prose section is the 3-bullet "What to change this week."
2. **Show, don't editorialize.** Don't say "Greenhouse is bad" — show 78% vs 45% and let the user conclude.
3. **Honest about volume.** If a slice has <3 rows, footnote it as low-volume; don't draw conclusions from it.
4. **Cite specific numbers** in every actionable insight. "Greenhouse 78%" beats "Greenhouse seems high."
5. **Re-runnable.** Read-only on both CSVs. Never mutate `application-tracker.csv` or `outreach-log.csv`.
6. **Sparse data fallback.** <10 apps → tell the user to wait, don't fabricate patterns.
7. **Status mapping is case-insensitive.** Handle `Rejected`, `rejected`, `REJECTED` the same way.

## Related

- `/job-track` — flat view of the tracker, no analysis.
- `/job-dashboard` — applications + outreach + follow-ups in one snapshot.
- `/job-followup` — act on the cold-outreach signal once `/job-patterns` says response rates are low.
- `/resume-ats-optimizer` — fix the ATS keyword filter problem when Signal B's <24h bucket is winning.
- `/tailor-resume` — fix per-platform rejection deltas surfaced by Signal A.
