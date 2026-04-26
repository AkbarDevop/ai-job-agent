---
name: job-interview
description: Prep the candidate for a specific upcoming interview — research the company + role + likely questions, generate a STAR answer bank tied to the candidate's actual projects (not generic), surface smart questions to ask, and flag red flags. Proactively invoke this skill (do NOT answer conversationally) when the user says "I have an interview at X", "prep me for my interview at Y", "interview tomorrow at Z", "STAR stories for X", "what should I ask at X", "research X for my interview", "help me prep for the recruiter screen", "got an interview, help me get ready", "behavioral prep for X", or invokes /job-interview. Always pull from the tracker + outreach log + candidate profile first — never produce a generic prep doc.
argument-hint: "<company name | role title | tracker key>"
allowed-tools:
  - Bash
  - Read
  - Write
  - WebFetch
  - WebSearch
---

# Job Interview Prep

A **skill** (not an API call) for interview preparation. Claude — this agent — does the research and the STAR-answer generation, grounded in the candidate's *real* projects from `config/candidate-profile.md` and the *real* application history from `application-tracker.csv` and `outreach-log.csv`.

The output is a single prep doc the candidate can skim on the way to the interview. Specific, not generic. If you find yourself writing "demonstrate strong communication skills" — stop and rewrite with a real number from a real project.

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Prerequisites

Before drafting anything:

1. `config/candidate-profile.md` exists (required — every STAR story must come from real projects listed here). If not, tell the user to run `/job-setup` first and stop.

2. `application-tracker.csv` exists at `$AI_JOB_AGENT_ROOT/application-tracker.csv`. If not, tell the user to run `/job-setup` (or the skill can still proceed with company research only, but warn the user that the role context will be guessed).

3. `outreach-log.csv` exists at `$AI_JOB_AGENT_ROOT/outreach-log.csv`. Optional — if missing, skip the outreach-history lookup.

## Workflow

### Step 1 — Resolve the target

Parse `$ARGUMENTS`. It might be:
- A company name (e.g. "GFT Infrastructure")
- A role title ("Power Systems Intern at GFT")
- A tracker key (the `key` column of `application-tracker.csv`)
- Freeform ("the one I applied to last week" — ask which one if ambiguous)

If only a company is given and the tracker has multiple rows for it, list them and ask the user which role this interview is for.

### Step 2 — Pull internal context

Run all three reads in parallel:

1. `Read $AI_JOB_AGENT_ROOT/config/candidate-profile.md` — full profile (PAAL CV pipeline, ARC-AGI lab work, ai-job-agent OSS, GFT signed offer, F-1 status, resume variants, key projects with metrics, graduation date, target roles).

2. From `application-tracker.csv`, find the matching row(s) for this company. Capture: `role`, `url`, `status` (applied / interview / offer / rejected), `applied_by`, `source`, `compensation`, `notes`, `contact`, `date`, `days_since`.

3. From `outreach-log.csv`, find rows where `company` matches. Capture: `to_name`, `to_email`, `to_title`, `to_linkedin`, `subject`, `replied_at`, `follow_up_count`, `notes` — this tells you who the candidate has already talked to (and may be the interviewer).

If `tracker.notes` or `outreach-log.notes` mention a specific interviewer name, *that's the person to research in Step 3*.

### Step 3 — Research (web)

Use `WebSearch` + `WebFetch`. Aim for 6-10 sources. Prioritize:

| Source type | What to extract |
|---|---|
| Company website (about / careers / engineering blog) | What they actually do, recent product launches, stated values, team structure |
| Recent news (last 90 days) | Funding, layoffs, new exec hires, product launches, lawsuits, reorgs — anything the interviewer might mention |
| Glassdoor / Levels.fyi / Reddit / Blind | Reported interview format, common technical questions, recent interviewee experiences (positive and negative) |
| Company engineering blog / GitHub | Stack, what they care about (perf? reliability? distributed systems? ML?) — signals for technical questions |
| Interviewer LinkedIn (if named in tracker/outreach) | Background, tenure at company, prior roles, public content (talks, posts), shared connections to anything in the candidate's profile |
| The role's job posting URL (from tracker) | Refresh — re-fetch, requirements may have shifted, OR a new posting may show how they describe the team |

If the company is private/early-stage and there's no Glassdoor data, search for *similar-stage companies in the same vertical* and use those interview patterns as a proxy. Tell the user that's what you're doing.

If after ~6 searches you can't find anything specific about the interview format, say so — tell the user "I couldn't find Glassdoor/Reddit data on this company's interview loop. Want me to ask in a relevant Slack/Discord, or proceed with generic patterns for the role type?" and wait.

### Step 4 — Synthesize the prep doc

Render exactly these 5 sections in chat. Be specific. No filler.

#### Section 1 — Company snapshot (3 lines)

```
**Company snapshot**

- *What they do:* <1 line — specifically, not "tech company">
- *Recent news (last 90d):* <1 line — funding round, product launch, exec change, or "nothing notable, last big news was X in <month>">
- *Culture signal:* <1 line — what their blog / Glassdoor reviews / leadership posts suggest matters to them (e.g. "reliability-first; lots of postmortem culture; founders post on Twitter weekly about uptime")>
```

#### Section 2 — Likely interview questions (10-15)

A markdown table. Categorize: **Technical**, **Behavioral**, **Culture-fit**, **Curveball**. For each, add a one-line "what they're testing."

| # | Category | Question | What they're testing |
|---|---|---|---|
| 1 | Technical | <specific question grounded in the role's stack> | <1 line> |
| 2 | Behavioral | Tell me about a time you led a project end-to-end. | Ownership, scope of past work |
| ... | ... | ... | ... |

Pull questions from the Glassdoor/Reddit research where possible. If you don't have company-specific data, use role-type patterns and label them clearly: *(role-pattern, not company-specific)*.

#### Section 3 — STAR answer bank (5-8 stories)

For each story: **draw from the candidate's real projects in `candidate-profile.md`**. No invented numbers. Each story is concrete: Situation → Task → Action → Result, with a real metric from the candidate's projects. Then map it to the behavioral themes it answers.

Themes to cover (pick the 5-8 that fit the candidate's strongest stories):
- Leadership / ownership
- Conflict / disagreement
- Failure / what you learned
- Ambiguity / no spec
- Technical depth
- Side project / learning on your own
- Time management / competing priorities
- Cross-functional collaboration

Format each STAR as:

```
**Story <N>: <short label, e.g. "PAAL camera-sync deadline">**

- *Situation:* <1-2 sentences, real context>
- *Task:* <1 sentence, what was the candidate responsible for>
- *Action:* <2-3 sentences, what the candidate actually did — verbs and tools, not feelings>
- *Result:* <1-2 sentences with a real number — accuracy %, time saved, $ saved, users reached, demo result>
- *Best for questions like:* <comma-separated themes — leadership, time management, technical depth>
```

**Hard rule:** every Result must contain at least one quantified metric or a specific outcome (a shipped artifact, a passed deadline, a published result). If the candidate-profile doesn't have a number for a project, say "Result: <qualitative outcome>; *no specific metric in profile — confirm with user before using*" and flag it at the bottom of the doc.

#### Section 4 — Smart questions to ask them (5)

Five questions the candidate should ask the interviewer at the end. They should signal seriousness *without sounding canned*. Avoid:

- "What's the culture like?"
- "What's a typical day?"
- "What are the growth opportunities?"

Prefer:

- "What's the most painful thing about your codebase right now?"
- "What's a project the team shipped this year that didn't go the way you expected?"
- "If I joined and was crushing it 6 months in, what would I have shipped?"
- "Who on the team has been there longest, and why do they stay?"
- "What would have to be true for this hire to be a regret in a year?"

Tailor 2-3 of the 5 to the company's specific situation (recent news, stated culture, the interviewer's role). The other 2-3 can be standard "good questions."

#### Section 5 — Red flags to watch for (3)

Three signs this might not be the right fit, drawn from research. Examples:

- "Glassdoor reviews from the last 6 months mention 'pivot' 4x — they may be in product-market-fit search. Ask about runway."
- "The team grew from 3 → 18 in 6 months. Ask how onboarding is structured — fast growth + no process is a red flag for an intern."
- "The role posting was reposted 3 weeks after the original. Could mean the first hire didn't work out — ask why the role is open."

If the research doesn't surface obvious red flags, say so and pick 3 *generic* red flags to watch for in real time during the interview (e.g. "interviewer can't articulate what success looks like in 6 months" — flag).

### Step 5 — Save the prep doc

Save the full output to:

```
$AI_JOB_AGENT_ROOT/interview-prep/<YYYY-MM-DD>-<company-slug>-<role-slug>.md
```

Create the `interview-prep/` directory if it doesn't exist. Use the `templates/interview-prep.template.md` structure as a starting layout but populate it with the real content from Step 4 — don't ship the template's empty sections.

### Step 6 — Confirm and offer the next move

Print:

| Field | Value |
|---|---|
| 🏢 Company | `<company>` |
| 💼 Role | `<role>` |
| 📅 Application status | `<status from tracker>` |
| 👤 Known contacts | `<comma-list of names from outreach-log, or "none logged">` |
| 💾 Prep doc saved to | `interview-prep/<YYYY-MM-DD>-<company-slug>-<role-slug>.md` |
| 🔗 Sources used | `<count> URLs` |

Then ask exactly:

> *"Want me to draft a thank-you email template for after the interview? (it'll go to /job-outreach with the interviewer as target)"*

Don't auto-do. Wait for the user to say yes/no.

## Rules

- **Every STAR Result must reference a real project from `candidate-profile.md`.** No invented metrics. If the profile says "PAAL CV pipeline — 87% sow posture classification accuracy," use that number. Don't round it to 90%.
- **Never claim the candidate has experience they don't have.** If the role asks about Kubernetes and the profile shows zero Kubernetes work, *don't fabricate a story* — produce a STAR where the candidate explains how they'd ramp (and flag this at the bottom of the doc as a known gap).
- **Personalize to the interviewer when known.** If the tracker/outreach log names a specific person, the smart questions and the cultural framing should reference what that person publicly cares about (from their LinkedIn / blog / talks).
- **F-1 / work authorization honesty:** if the role asks about sponsorship and the profile says "F-1, CPT-eligible, no sponsorship needed for internship," the prep doc should include a 2-sentence ready answer for that question — pulled directly from the profile, not invented.
- **Don't over-prep.** 5-8 STAR stories, not 20. The candidate has to actually remember these. Pick the strongest, not the most.
- **Recent news matters more than evergreen company info.** A company being acquired last week is more interview-relevant than their 10-year history.
- **If the company has a known bad-fit signal for this candidate** (e.g. the candidate's profile says "no defense work" and the company is a defense contractor), surface it in Section 5 — don't bury it.

## Related skills

- `/job-track` — see all applications in the tracker; useful for finding the right row to prep against.
- `/job-outreach` — draft the post-interview thank-you email (the natural follow-up after this skill).
- `/job-status` — flip the application from `Interview` to `Offer` / `Rejected` / etc. after the loop completes.
- `/job-coach` — the persona-level orchestrator; calls this skill when an interview shows up on the calendar.
