# AI Job Application Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/AkbarDevop/ai-job-agent/pulls)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)

---

## The Story

I'm Akbar. An electrical engineering junior at Mizzou, from Uzbekistan.

During the winter 2025 internship season, I was spending 1-2 hours every day filling out the same forms — name, email, school, major, graduation date, resume, work authorization, sponsorship status. Over and over. 10-20 applications a day. Same information. Different portals. I had a half-updated Google Sheet that was supposed to be my tracker, but half the applications were slipping through the cracks.

A friend asked me: can't a terminal agent just do this?

So I tried it. I gave Claude Code access to my resume, my transcript, and my real application data. I told it the truth about my work authorization (F-1 student, Uzbek citizen, CPT-eligible, no sponsorship needed now, will need it later). I said: apply to internships for me. Log everything. Don't lie.

**It worked.** The agent submitted 228+ real applications across 5 ATS platforms. It split my resume into two variants (software vs. EE) and routed each application to the right one. It tracked everything in a Google Sheet. It skipped roles that required citizenship. It logged CAPTCHAs honestly as "blocked" instead of pretending it submitted.

But that was just the beginning.

I'm from Uzbekistan, and Plan B for this summer was going back home and working in the energy/engineering sector there. So I told the agent: research Uzbekistan's engineering companies and find me people to reach out to. In one session, it mapped the entire tech and energy ecosystem — Siemens Energy, Masdar, Worley, ERIELL, Huawei, Schneider Electric. It found 9 professionals on LinkedIn, wrote personalized connection notes (some mixing in Uzbek), and sent all the requests.

Next day, I said: check if anyone accepted. The agent opened LinkedIn, scrolled through my sent invitations, and found that **2 of 8 had already accepted within 24 hours.** One of them — a director at Worley — had replied. In Uzbek. The agent read the message, translated it, and extracted a direct HR email: `zulfiya.vafaeva@worley.com`. "If you're interested, contact the head of HR."

That's not a copilot filling out forms. That's an agent running a job search.

The agent also ran 6 subagents in parallel: one sending cold emails to startup founders, one connecting with engineers in Uzbekistan on LinkedIn, one applying to internships on Handshake, one researching companies, and two checking for replies. All at the same time. All personalized.

I'm open-sourcing the whole thing because nobody should have to type their graduation date into 200 different text fields.

**[akbar.one](https://akbar.one)** | **[@mendurmen](https://x.com/mendurmen)** | **[LinkedIn](https://linkedin.com/in/akbarjon-kamoldinov)**

---

## What this actually is

**A career coach you talk to inside Claude Code.** Not a CLI. Not a wizard. A persona.

You install it once. You tell it you want an internship. It interviews you for 5 minutes (or reads your memory and skips the interview), researches the market live, comes back with a ranked slate of target roles + people, and drives every action from there. You don't memorize slash commands — you just talk:

```
> I need an EE internship for summer 2026, prefer US or Uzbekistan
    (coach runs /job-coach — 5-min intake, then market research + slate)

> Apply to #1 and #2, draft outreach for #3
    (coach chains: /job-apply + /job-apply + /job-outreach)

> How am I doing this week
    (coach runs /job-dashboard — snapshot + tomorrow's 3 moves)

> I got rejected from Acme
    (coach chains to /job-status — flip the row, remove from pipeline)

> Who should I follow up with today
    (coach runs /job-followup — 🚨 overdue first, draft + send one-by-one)
```

Under the hood, there are **13 skills** (one orchestrator + 12 verbs) that wrap Node and Python scripts for LinkedIn Easy Apply, Greenhouse / Lever / Jobvite / Ashby, Outlook Web triage, Gmail msmtp, JD scoring with the 7-block A-G rubric, tailored-PDF rendering, interview prep, pattern analysis, and a zero-dep terminal TUI. You can invoke them by slash command if you want explicit control. You rarely need to.

---

## Install — 30 seconds

Requirements: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Git, Node.js 18+. msmtp is optional — only needed if you want the cold-email skills.

**Open Claude Code and paste this:**

> Install ai-job-agent: run `git clone --single-branch --depth 1 https://github.com/AkbarDevop/ai-job-agent ~/.claude/skills/ai-job-agent && cd ~/.claude/skills/ai-job-agent && bash skills/install.sh` then add an "ai-job-agent" section to my CLAUDE.md with this exact text:
>
> > Treat the user like a career-coaching client. For any open-ended job-search talk ("help me find a job", "I need an internship", "what should I do next", "start my search"), run `/job-coach` — it interviews them, researches the market, presents a ranked slate of moves, and chains into the right verb skill based on their pick. For specific verbs, route directly:
> >
> > - Job URL pasted (LinkedIn / Greenhouse / Lever / Jobvite / Ashby) → `/job-apply`
> > - Reach out to a hiring manager / VP / recruiter, or LinkedIn profile pasted → `/job-outreach`
> > - "Who should I follow up with" / "any contacts cold" → `/job-followup`
> > - "How am I doing" / "overview" / "big picture" → `/job-dashboard`
> > - "What have I applied to" / "show my tracker" → `/job-track`
> > - Rejection / interview / offer update to log → `/job-status`
> > - "Check my inbox" / Outlook for job emails → `/job-triage`
> > - First-time setup or missing config → `/job-setup`
> >
> > Never answer job-search questions conversationally — always dispatch.
>
> Then tell me it's done and run /job-setup, and when that finishes chain straight into /job-coach intake so we have a real plan.

Claude does the rest — clones into `~/.claude/skills/ai-job-agent/`, registers all 13 skills globally, writes the coach-first routing block into your CLAUDE.md, runs `/job-setup` (identity, resume, optional msmtp), and drops you into `/job-coach intake` (target roles, companies, timeline, geography — builds the live search plan).

### Daily driver: `npm run agent` (unified Claude + live TUI)

After install, the recommended way to actually use this is:

```bash
cd ~/.claude/skills/ai-job-agent && npm run agent
```

That opens a single terminal window with **Claude Code on top** and the **live TUI dashboard on bottom** (split via tmux). They auto-sync — flip a status in chat ("got rejected from X") and watch the funnel update in the bottom pane within ~200ms. No tab switching, no manual reloads.

If `tmux` isn't installed, the launcher offers to `brew install` (macOS) or `apt install` (Linux) it for you with one keypress — strongly recommended for the unified experience. On decline, it falls back to opening two terminal tabs (macOS) or printing instructions (Linux).

You can still run them separately if you want:
- `claude` alone → just chat
- `npm run dashboard` alone → just the live TUI

### Want to hack on the skills?

If you're modifying the skill prompts or scripts, clone normally and the `install.sh` handles it:

```bash
git clone https://github.com/AkbarDevop/ai-job-agent ~/wherever
cd ~/wherever
bash skills/install.sh   # writes a REPO_PATH marker; skills find this clone
```

### No Claude Code? (legacy)

You can still drive it as standalone CLI tools — `bash wizard.sh` for interactive config, then call `node scripts/linkedin-easy-apply.js <url>` etc. directly. See [docs/SETUP.md](docs/SETUP.md#installation) for the full bash-first path.

### Apply to Your First Job

```bash
# dry run — fills the form but does NOT submit
node scripts/linkedin-easy-apply.js \
  "https://www.linkedin.com/jobs/view/1234567890" \
  config/linkedin-config.json

# when ready, set "autoSubmit": true in your config
```

Each script outputs structured JSON so it can be piped to other tools or consumed by an AI agent.

---

## Real Results

This isn't a side project with synthetic benchmarks. It was built during an actual job search, refined across 228+ real applications.

### Applications
- **228+ applications submitted** across LinkedIn Easy Apply, Greenhouse, Lever, Jobvite, and Ashby
- **5 ATS platforms** fully automated with config-driven form filling
- **Auto-answer engine** handles work authorization, EEO, screening questions, and custom fields
- Applications that hit CAPTCHAs are logged honestly as "blocked" — no fake submissions
- **Two-resume routing**: software/AI roles get one resume, EE/embedded roles get another

### LinkedIn Networking
- **65+ connection requests sent** across 4 rounds of outreach (energy companies, government, development banks, universities)
- **38+ connections accepted** — multiple led to HR referral chains (e.g., TotalEnergies: Joris → Lena → Gulbahor)
- **6 subagents running in parallel** — sending emails, LinkedIn requests, Handshake applications, and checking replies simultaneously
- Uses the `/preload/custom-invite/` URL method for reliable connection requests without hitting LinkedIn's invite limits
- Multilingual notes (English + Uzbek) personalized per recipient and company
- Researched Uzbekistan's energy sector, identified 9 professionals, sent personalized requests in under an hour
- **2 of 8 accepted within 24 hours** — one replied with a direct HR contact email
- Monitors which connections were accepted and sends tailored follow-up DMs
- Full lifecycle: research companies → find people → craft notes → send requests → track acceptances → follow up

### Cold Email & Outreach
- **228+ cold emails sent** to hiring managers, VPs, and HR contacts at target companies
- **2 VP interview callbacks** from cold emails alone at major engineering firms
- **Multiple internship offers** from both US and international companies via cold outreach
- **Panel interviews** at engineering firms, all originating from cold emails the agent sent
- **55 day-7 follow-ups sent** automatically to non-responders
- **10 Mizzou alumni emailed** via university Outlook for warm introductions
- **12 Handshake applications submitted** through the university job board
- Multiple HR referral chains built through persistent follow-up (TotalEnergies: Joris → Lena → Gulbahor)

### International Outreach
- Researched Uzbekistan's entire tech and engineering ecosystem in a single session
- Produced a comprehensive [research brief](uzbekistan-tech-ecosystem-guide-2026.md) covering 8 sectors
- Identified target companies, found LinkedIn profiles, and initiated outreach — all in one continuous workflow
- Handles multilingual messages (the Worley director replied in Uzbek — the agent translated it and extracted the lead)

### Multi-Session Continuity
```
Session 1: agent reads profile → applies to 30 jobs → updates tracker
Session 2: agent reads profile → continues from where Session 1 stopped
Session 3: agent researches international market → sends LinkedIn outreach
Session 4: agent checks for acceptances → reads uzbek reply → extracts HR email
```

The agent handoff system means you never re-explain context. Every session picks up exactly where the last one left off.

---

## Architecture

```
                                +-----------------+
                                |   /job-coach    |   <-- you talk to this
                                |  (orchestrator) |
                                +--------+--------+
                                         | dispatches into the verbs below
        +--------------------------------+--------------------------------+
        |              |               |               |                  |
        v              v               v               v                  v
  +-----+-----+  +-----+----+  +-------+------+  +-----+-----+  +---------+--------+
  |/job-setup |  |/job-eval |  | /job-apply   |  |/job-cv    |  |/job-outreach     |
  |onboarding |  |+ rubric  |  |  + ATS route |  |  + PDF    |  | + send-cold-email|
  +-----+-----+  +----+-----+  +-------+------+  +-----+-----+  +---------+--------+
                      |                |                |                 |
                      |          +-----+-------+        |          +------+-------+
                      |          | LinkedIn /  |        |          | /job-followup|
                      |          | Greenhouse /|        |          | (day-7 cadence)
                      |          | Lever /     |        |          +------+-------+
                      |          | Jobvite /   |        |                 |
                      |          | Ashby       |        |                 |
                      |          +-----+-------+        |                 |
                      |                |                |                 |
                      v                v                v                 v
              +-------+----------------+----------------+-----------------+--------+
              |                                                                    |
              |              application-tracker.csv  +  outreach-log.csv          |
              |              (CSVs are the source of truth)                        |
              +-------+----------------+----------------+-----------------+--------+
                      |                |                                  |
                      v                v                                  v
           +----------+----------+   +-+--------------+        +----------+----------+
           | mirror-tracker.mjs  |   | google-sheet-  |        | /job-status         |
           | -> data/*.md        |   | sync.py        |        | (batch flips)       |
           +----------+----------+   +----------------+        +---------------------+
                      |
                      v
              +-------+--------+        +---------------+        +------------------+
              | /job-track     |        | /job-triage   |        | /job-patterns    |
              | (status table) |        | (Outlook +    |        | (diagnostics)    |
              |                |        |  reply detect)|        |                  |
              +----------------+        +---------------+        +------------------+
                                                                          |
                                                                          v
                                                                +---------+--------+
                                                                | /job-dashboard   |
                                                                | (5-tab TUI:      |
                                                                |  Apps · Outreach |
                                                                |  · Follow-ups    |
                                                                |  · Pipeline      |
                                                                |  · Reports)      |
                                                                +------------------+
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical breakdown.

## Supported Platforms

| Platform | Method | Auth | Captcha Handling |
|----------|--------|------|-----------------|
| LinkedIn Easy Apply | Cookie import from Chrome | Automatic | N/A (no captcha) |
| Greenhouse | CDP or headless launch | None needed | reCAPTCHA detection + token retry |
| Lever | CDP or headless launch | None needed | hCaptcha detection |
| Jobvite | CDP or headless launch | None needed | reCAPTCHA detection |
| Ashby | CDP or headless launch | None needed | reCAPTCHA detection |
| Outlook Web | CDP to running Chrome | Manual login | N/A |
| LinkedIn Networking | Cookie import from Chrome | Automatic | N/A (profile pages) |

## Configuration

All personal details live in config files, not in the scripts:

```
config/
  linkedin-config.json          # Your identity, answers, resume path, cookie path
  candidate-profile.md          # Full profile for AI agent handoff
  answer-bank.md                # Reusable answers for common questions
  example-config.json           # Reference example with all fields
```

If you ran `/job-setup` (or `bash wizard.sh`) these are already generated for you.

If you want to set up manually, start from the templates:

```bash
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
cp config/answer-bank.template.md config/answer-bank.md
```

See [docs/SETUP.md](docs/SETUP.md) for a detailed walkthrough.

## Claude Code Skills

This toolkit ships with **13 bundled skills** — one orchestrator (`/job-coach`) plus 12 verbs (8 core verbs + 4 v1.2 career-ops parity skills: `/job-evaluate`, `/job-cv`, `/job-interview`, `/job-patterns`). It also pairs well with 27+ community-built skills for resume tailoring, interview prep, and more.

### The orchestrator

| Skill | What it does |
|-------|--------------|
| `/job-coach` | **The persona.** Runs intake (goals, target companies, timeline, geography), researches the market live, presents a ranked slate with next-move suggestions, and chains into the verb skills based on your pick. Persists plan to `config/search-plan.md`. Invoked by open-ended phrases: "help me find a job", "I need an internship", "what should I do next". |

### The verbs (chained by /job-coach or invoked directly)

**Setup + apply + track**

| Skill | What it does |
|-------|--------------|
| `/job-setup` | Conversational onboarding. Auto-reads your files (CLAUDE.md, `~/.brain`, memory, `~/.msmtprc`), scans for resume PDFs, only asks for gaps. Writes every config file and registers all the skills. |
| `/job-apply <url>` | Apply to a job by URL. Auto-routes to the right ATS filler (LinkedIn / Greenhouse / Lever / Jobvite / Ashby). Dry-run by default; pass `--submit` to actually submit. |
| `/job-track [sync]` | Show your local tracker grouped by status. Pass `sync` to push new rows to Google Sheets. |
| `/job-triage [query]` | Search Outlook Web, classify results (rejection / interview / confirmation / …), step through extract/mark-read. Cross-references `outreach-log.csv` to auto-detect replies. |
| `/job-status <updates.json>` | Batch-update statuses in both the Google Sheet and local CSV. Diffs before applying. |

**Cold outreach**

| Skill | What it does |
|-------|--------------|
| `/job-outreach <target>` | Research a company or hiring manager, draft a personalized cold email in chat, approve, and send via your local msmtp. Logs to `outreach-log.csv`. The agent itself is the LLM — no external API. |
| `/job-followup [send]` | Walk the day-7 follow-ups. Reads `outreach-log.csv`, computes urgency (max 2 follow-ups per contact per career-ops cadence), threads via `In-Reply-To`, drafts and sends one at a time. |

**Deep-dive + analysis (v1.2 career-ops parity)**

| Skill | What it does |
|-------|--------------|
| `/job-evaluate <url>` | Auto-pipeline: fetch JD → score across the 7-block A-G rubric (Role / CV / Level / Comp / Personalization / Interview / Legitimacy) → write report to `reports/` → chain into `/job-cv` → append tracker row at status `evaluated`. The killer demo. |
| `/job-cv <jd>` | Tailor base CV for one specific JD (rewrite bullets, never invent), render ATS-friendly PDF via headless Chromium. Output to `output/cv-<company>-<date>.pdf`. |
| `/job-interview <company>` | Prep for an upcoming interview: company snapshot + 10-15 likely questions + 5-8 STAR stories (drawn from your real projects) + 5 smart questions to ask + 3 red flags. Written to `interview-prep/`. |
| `/job-patterns` | Diagnostic: read tracker + outreach log, surface rejection patterns (by ATS / time-to-rej / geography / role-type / day-of-week) + 3 actionable takeaways. |

**Terminal dashboard**

| Skill | What it does |
|-------|--------------|
| `/job-dashboard [live]` | ANSI-colored terminal dashboard — 5 tabs: Applications / Outreach / Follow-ups / Pipeline / Reports. Snapshot in chat by default; `live` gives you the command for the interactive TUI (tabs, arrow-key nav, fs.watch live reload) in a separate terminal tab. Zero deps. |

Run `/job-setup` and the skills register themselves. Or install manually:

```bash
bash skills/install.sh   # one-time — symlinks the 13 skills into ~/.claude/skills/
```

Each skill is just a markdown file at `skills/<name>/SKILL.md` — open one to see exactly what the agent is told to do. The skills render results as markdown tables so you can see what happened at a glance.

### Community skills

Highlights:

- `/job-search` — search for jobs matching your resume across multiple boards
- `/tailor-resume` — customize your resume for a specific job posting
- `/apply` — AI-assisted ATS form filling (complements the bundled `/job-apply`)
- `/interview-prep-generator` — generate STAR stories and practice questions
- `/resume-ats-optimizer` — optimize your resume for Applicant Tracking Systems
- `/salary-negotiation-prep` — research market rates and build counter-offer scripts

See [skills/README.md](skills/README.md) for the full list of 27+ recommended skills with install commands.

## Agent Handoff

The `config/candidate-profile.md` file enables multi-session continuity with AI agents. It contains your identity, application rules, search preferences, tracking locations, and session state.

When a new Claude Code session starts, the agent reads this file and picks up exactly where the last session left off. This turns an AI assistant into a persistent job search agent.

**Real example**: In one session, the agent researched Uzbekistan's engineering sector, identified 9 professionals at companies like Siemens Energy, Masdar, Worley, and ERIELL, crafted personalized connection notes (some in Uzbek), and sent all requests. The next session, it checked for acceptances, found 2 new connections, read a reply written in Uzbek, translated it, and extracted a direct HR email — all without re-explaining any context.

**Another example**: In one session, the agent cold-emailed a VP at a major engineering firm. He responded asking for a resume. Two interviews later, an offer was signed. The entire chain, from finding the contact to drafting the email to prepping for the interview, was orchestrated across multiple agent sessions using the same handoff file.

## Project Structure

```
.
|-- README.md                          # this file
|-- LICENSE                            # MIT License
|-- CLAUDE.md                          # Claude Code project instructions
|-- setup.sh                           # one-command setup
|-- wizard.sh                          # interactive setup wizard
|-- config/
|   |-- candidate-profile.template.md  # profile template
|   |-- answer-bank.template.md        # answer bank template
|   |-- linkedin-config.template.json  # linkedin config template
|   +-- example-config.json            # filled example
|-- bin/
|   |-- job-agent.sh                   # `npm run agent` — unified Claude + TUI launcher (tmux)
|   |-- smoke-test.sh                  # `npm run smoke` — fresh-install smoke test (sandboxed)
|   +-- doctor.sh                      # `npm run doctor` — health check on real environment
|-- scripts/
|   |-- linkedin-easy-apply.js         # LinkedIn Easy Apply automation
|   |-- lever-apply.js                 # Lever ATS automation
|   |-- greenhouse-apply.js            # Greenhouse ATS automation
|   |-- jobvite-apply.js               # Jobvite ATS automation
|   |-- ashby-apply.js                 # Ashby ATS automation
|   |-- outlook-triage.js              # Outlook inbox search and triage
|   |-- outlook-send.js                # Outlook email composer (CDP)
|   |-- send-cold-email.js             # Cold-email sender (msmtp + threaded follow-ups)
|   |-- job-dashboard.mjs              # Terminal TUI + snapshot dashboard (5 tabs)
|   |-- generate-tailored-cv.mjs       # /job-cv: markdown -> PDF via headless Chromium
|   |-- mirror-tracker.mjs             # CSV -> markdown mirror (data/applications.md, data/outreach.md)
|   |-- google-sheet-sync.py           # Google Sheets tracker sync
|   +-- tracker-status-update.py       # Batch status updater
|-- skills/
|   |-- install.sh                     # register bundled skills into ~/.claude/skills/
|   |-- job-coach/SKILL.md             # /job-coach — persona + orchestrator (entry point)
|   |-- job-setup/SKILL.md             # /job-setup — in-chat onboarding
|   |-- job-evaluate/SKILL.md          # /job-evaluate — JD score + report + chained CV
|   |-- job-apply/SKILL.md             # /job-apply — auto-routes ATS filler
|   |-- job-track/SKILL.md             # /job-track — tracker + sheet sync
|   |-- job-triage/SKILL.md            # /job-triage — Outlook search + classify + reply detect
|   |-- job-status/SKILL.md            # /job-status — batch status updates
|   |-- job-outreach/SKILL.md          # /job-outreach — cold email via msmtp
|   |-- job-followup/SKILL.md          # /job-followup — day-7 threaded cadence
|   |-- job-dashboard/SKILL.md         # /job-dashboard — 5-tab TUI + snapshot
|   |-- job-cv/SKILL.md                # /job-cv — tailored-CV PDF generator
|   |-- job-interview/SKILL.md         # /job-interview — STAR prep doc
|   |-- job-patterns/SKILL.md          # /job-patterns — pipeline diagnostics
|   +-- README.md                      # bundled + community skills guide
|-- templates/
|   |-- daily-log.template.md          # Daily submission log template
|   |-- tracker.template.csv           # CSV tracker headers
|   |-- outreach-log.template.csv      # Cold-email log headers
|   |-- search-plan.template.md        # /job-coach working brief
|   +-- interview-prep.template.md     # Interview prep template
|-- data/                              # gitignored — markdown mirror of CSVs (npm run mirror)
|-- reports/                           # gitignored — /job-evaluate output
|-- output/                            # gitignored — /job-cv tailored PDFs
|-- interview-prep/                    # gitignored — /job-interview prep notes
+-- docs/
    |-- SETUP.md                       # Detailed setup guide
    |-- CUSTOMIZATION.md               # Country, role, platform customization
    +-- ARCHITECTURE.md                # System design and data flow
```

## Customization

The toolkit is designed to be adapted:

- **Different countries**: Update phone format, work authorization rules, currency
- **Different roles**: Create resume variants, customize auto-answer patterns
- **Different ATS platforms**: Add new scripts following the existing pattern
- **Different email providers**: Adapt the Outlook scripts for Gmail or others
- **Different trackers**: Swap Google Sheets for Notion, Airtable, etc.

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the full guide.

## FAQ

**Q: is this legal?**
A: This toolkit fills out forms with your real information — the same thing you'd do manually. It does not scrape private data, bypass security measures, or violate terms of service beyond the gray area of browser automation. Use responsibly.

**Q: will LinkedIn ban my account?**
A: The LinkedIn script uses your real cookies and behaves like a normal user (no parallel requests, no scraping). The risk is comparable to using a browser extension. That said, any automation carries some risk. Use at your own discretion.

**Q: how does it handle CAPTCHAs?**
A: Invisible CAPTCHAs are sometimes solved automatically. Visible CAPTCHAs require manual solving (run with `HEADLESS=0`). Applications blocked by CAPTCHAs are logged honestly as "blocked" — never as "submitted".

**Q: can it work without Claude Code?**
A: Yes. The scripts are standalone Node.js and Python programs. Claude Code and its skills are optional enhancements that add AI-assisted search, resume tailoring, and conversational control.

**Q: what data leaves my machine?**
A: Application data goes to the job platforms you apply to (LinkedIn, Greenhouse, etc.) and optionally to your Google Sheet. Nothing is sent to third-party analytics, tracking, or AI services beyond what you explicitly configure.

**Q: i'm not in the US — will this work for me?**
A: Yes. The config is designed to be adapted for any country. Update phone format, work authorization fields, and currency. See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md). The toolkit has already been used for international outreach across Uzbekistan, UAE, and Central Asia.

## Contributing

Contributions are welcome. Here are some good first issues:

- Add support for a new ATS platform (Workday, iCIMS, SuccessFactors)
- Add Gmail support to the email triage scripts
- Add Notion/Airtable tracker integrations
- Improve the auto-answer engine with more question patterns
- Add tests for the form-filling logic
- Add a web UI for config management
- Add LinkedIn recruiter search automation (find recruiters at target companies)
- Add connection acceptance tracking dashboard
- Add support for other languages in outreach messages
- Add market research templates for other countries/regions

Please open an issue before starting significant work so we can discuss the approach.

## Credits

Built by [Akbar](https://akbar.one) during a real job search. Refined across 228+ actual applications using [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

This toolkit reflects the patterns that emerged from automating a job search at scale: cookie-based authentication, pattern-matching auto-answers, config-driven form filling, multi-platform tracking, LinkedIn networking automation, international market research, multilingual outreach, and agent handoff for session continuity.

Fork it. Improve it. Make it yours. And if you land an internship with it, [let me know](https://x.com/mendurmen).

## License

[MIT](LICENSE)
