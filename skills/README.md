# Claude Code Skills for Job Hunting

This toolkit ships with 6 bundled skills that wrap the scripts in `scripts/` so you can drive the whole flow from inside a Claude Code session. It also pairs well with a long list of community-built skills for resume tailoring, interview prep, and more.

---

## Bundled Skills (Built-In)

These live inside this repo at `skills/<name>/SKILL.md` and wrap the existing Node.js / Python scripts. They render results as markdown tables so you can see what happened at a glance.

### Apply & track

| Skill | What it does | Wraps |
|-------|--------------|-------|
| `/job-apply <url>` | Apply to a job via URL. Auto-routes to the right ATS filler, dry-run by default. | `linkedin-easy-apply.js`, `greenhouse-apply.js`, `lever-apply.js`, `jobvite-apply.js`, `ashby-apply.js` |
| `/job-track [sync]` | Show the local tracker grouped by status. Optionally sync to Google Sheets. | `google-sheet-sync.py`, `application-tracker.csv` |
| `/job-triage [query]` | Search Outlook, classify results (rejection / interview / confirmation / …), render counts + preview, step through extract / mark-read. | `outlook-triage.js` |
| `/job-status <updates.json>` | Batch-update statuses in both the Google Sheet and local CSV. Shows diff, asks to confirm. | `tracker-status-update.py` |

### Cold outreach (msmtp)

| Skill | What it does | Wraps |
|-------|--------------|-------|
| `/job-outreach <target>` | Research a company/person, draft a personalized cold email in-chat, approve, send via local msmtp, log. | `send-cold-email.js` + Claude (the LLM is *this* agent — no external API) |
| `/job-followup [send]` | Read `outreach-log.csv`, compute urgency using a 7-day cadence, walk follow-ups one at a time. Max 2 follow-ups per contact. | `outreach-log.csv` + `send-cold-email.js` |

See `docs/SETUP.md#cold-email-setup-msmtp--gmail` for msmtp configuration (Gmail app password).

### Install the bundled skills

From this repo root:

```bash
bash skills/install.sh
```

This symlinks each skill into `~/.claude/skills/` and writes your repo path to `~/.claude/skills/ai-job-agent/REPO_PATH` so the skills can find `scripts/` regardless of where you run Claude Code from.

The script is idempotent — re-run it any time. To remove:

```bash
bash skills/install.sh --uninstall
```

### Try them

Open a new Claude Code session and type one of:

```
/job-apply https://www.linkedin.com/jobs/view/1234567890
/job-track
/job-track sync
/job-triage application status
/job-status rejection-updates.json
/job-outreach "VP of Substation Engineering at GFT"
/job-followup
```

Each skill is just a markdown file — read `skills/job-apply/SKILL.md` etc. to see exactly what the agent is being told to do.

### Override the repo path

If you cloned this repo somewhere other than `~/ai-job-agent`, either:
- Re-run `bash skills/install.sh` from wherever the repo actually lives (it records the path), or
- Set `AI_JOB_AGENT_ROOT` in your shell environment.

The skills resolve the root in this order: `$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/REPO_PATH` → `~/ai-job-agent`.

---

## Recommended Community Skills

The skills below are *not* in this repo — they're installed from other sources with `claude install-skill <url>`. They complement the bundled skills above.

## Proficiently Claude Skills

Job search workflow skills from [proficiently/claude-skills](https://github.com/proficiently/claude-skills):

```bash
# One-time setup - upload resume, set preferences, work history interview
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/setup

# Search for jobs matching your resume and preferences
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/job-search

# Tailor your resume for a specific job posting
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/tailor-resume

# Write a tailored cover letter
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/cover-letter

# Fill out a job application on Greenhouse, Lever, or Workday
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/apply

# Scan your LinkedIn contacts' companies for matching job openings
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/network-scan

# Poll Telegram for job search messages and apply via chat
claude install-skill https://github.com/proficiently/claude-skills/tree/main/skills/jobsearch-telegram
```

**Usage**: After installing, use `/setup` first to configure your profile, then `/job-search` to find roles, `/tailor-resume` to customize, and `/apply` to submit.

## ResumeSkills

Resume optimization and career tools from [jmagar/ResumeSkills](https://github.com/jmagar/ResumeSkills):

```bash
# Interview prep with STAR stories and practice questions
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/interview-prep-generator

# Optimize resume for ATS (Applicant Tracking Systems)
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-ats-optimizer

# Research market rates and build negotiation strategy
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/salary-negotiation-prep

# Analyze job postings, calculate match scores, identify gaps
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/job-description-analyzer

# Optimize LinkedIn profile for recruiter visibility
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/linkedin-profile-optimizer

# Optimize resume for technical roles
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/tech-resume-optimizer

# Transform weak bullets into achievement-focused statements
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-bullet-writer

# Create personalized cover letters from resume and JD
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/cover-letter-generator

# Translate skills from one industry to another
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/career-changer-translator

# Find opportunities to add metrics and estimate numbers
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-quantifier

# Ensure ATS-friendly formatting and clean layouts
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-formatter

# Compare multiple job offers side-by-side
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/offer-comparison-analyzer

# Create targeted resume sections by experience level
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-section-builder

# Track different resume versions and manage tailored copies
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/resume-version-manager

# Transform resume bullets into portfolio case studies
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/portfolio-case-study-writer

# Format professional references
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/reference-list-builder

# Format academic CVs with publications, grants, teaching
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/academic-cv-builder

# Balance visual design with ATS compatibility for creative roles
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/creative-portfolio-resume

# C-suite and VP level resumes emphasizing strategic leadership
claude install-skill https://github.com/jmagar/ResumeSkills/tree/main/skills/executive-resume-writer
```

## python-jobspy

Multi-board job search across Indeed, Glassdoor, ZipRecruiter, and LinkedIn from [Bunsly/JobSpy](https://github.com/Bunsly/JobSpy):

```bash
pip install python-jobspy
```

**Usage**:

```python
from jobspy import scrape_jobs

jobs = scrape_jobs(
    site_name=["indeed", "linkedin", "glassdoor", "zip_recruiter"],
    search_term="software engineer intern",
    location="United States",
    results_wanted=50,
    hours_old=72,
)

print(f"Found {len(jobs)} jobs")
jobs.to_csv("job-leads.csv", index=False)
```

## Recommended Workflow

1. **Setup**: Run `/setup` to configure your profile and upload your resume
2. **Search**: Use `/job-search` or `python-jobspy` to find matching roles
3. **Analyze**: Use `/job-description-analyzer` to score your fit
4. **Tailor**: Use `/tailor-resume` and `/resume-ats-optimizer` for each application
5. **Apply**: Use the automation scripts in `scripts/` or `/apply` for supported ATS platforms
6. **Track**: Applications auto-sync to your CSV and Google Sheet
7. **Prep**: Use `/interview-prep-generator` when you get callbacks
8. **Negotiate**: Use `/salary-negotiation-prep` and `/offer-comparison-analyzer` for offers
