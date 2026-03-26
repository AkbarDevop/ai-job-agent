# AI Job Application Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/AkbarDevop/ai-job-agent/pulls)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)

> "butun kompga access bering. keyin nafas olasiz faqat."
> ("give it access to the whole machine, then just breathe.")
> — a friend, after watching the agent apply to 30 jobs in one sitting

---

## the story

i'm akbar. an electrical engineering junior at mizzou, from uzbekistan.

during the winter 2025 internship season, i was spending 1-2 hours every day filling out the same forms — name, email, school, major, graduation date, resume, work authorization, sponsorship status. over and over. 10-20 applications a day. same information. different portals. i had a half-updated google sheet that was supposed to be my tracker, but half the applications were slipping through the cracks.

a friend asked me: can't a terminal agent just do this?

so i tried it. i gave claude code access to my resume, my transcript, and my real application data. i told it the truth about my work authorization (f-1 student, uzbek citizen, CPT-eligible, no sponsorship needed now, will need it later). i said: apply to internships for me. log everything. don't lie.

**it worked.** the agent submitted 200+ real applications across 5 ATS platforms. it split my resume into two variants (software vs. EE) and routed each application to the right one. it tracked everything in a google sheet. it skipped roles that required citizenship. it logged CAPTCHAs honestly as "blocked" instead of pretending it submitted.

but that was just the beginning.

i'm from uzbekistan, and plan B for this summer was going back home and working in the energy/engineering sector there. so i told the agent: research uzbekistan's engineering companies and find me people to reach out to. in one session, it mapped the entire tech and energy ecosystem — siemens energy, masdar, worley, ERIELL, huawei, schneider electric. it found 9 professionals on linkedin, wrote personalized connection notes (some mixing in uzbek), and sent all the requests.

next day, i said: check if anyone accepted. the agent opened linkedin, scrolled through my sent invitations, and found that **2 of 8 had already accepted within 24 hours.** one of them — a director at worley — had replied. in uzbek. the agent read the message, translated it, and extracted a direct HR email: `zulfiya.vafaeva@worley.com`. "if you're interested, contact the head of HR."

that's not a copilot filling out forms. that's an agent running a job search.

i still haven't landed an internship yet. maybe it's the rough market for international students, maybe my CV still needs work, maybe it's both. but this toolkit turned a 2-hour daily grind into something that runs while i study.

i'm open-sourcing the whole thing because nobody should have to type their graduation date into 200 different text fields.

**[akbar.one](https://akbar.one)** | **[@mendurmen](https://x.com/mendurmen)** | **[linkedin](https://linkedin.com/in/akbarjon-kamoldinov)**

---

## what this does

| Capability | What It Automates |
|-----------|------------------|
| **LinkedIn Easy Apply** | Fills multi-step Easy Apply dialogs including work authorization, EEO, and screening questions |
| **Greenhouse Apply** | Fills Greenhouse ATS application forms with React select support |
| **Lever Apply** | Fills Lever ATS forms with location autocomplete and hCaptcha detection |
| **Jobvite Apply** | Fills Jobvite applications including residence/consent gates |
| **Ashby Apply** | Fills Ashby ATS forms with autocomplete and checkbox support |
| **LinkedIn Networking** | Sends personalized connection requests to recruiters and professionals at target companies |
| **Recruiter Follow-up** | Monitors connection acceptances and sends tailored follow-up DMs |
| **Market Research** | Researches international job markets, identifies target companies, finds the right people |
| **Outlook Triage** | Searches, reads, and manages job-related emails in Outlook Web |
| **Google Sheet Sync** | Appends applications to a Google Sheet tracker from a local CSV |

---

## get started in 5 minutes

### option 1: interactive wizard (recommended)

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash wizard.sh
```

the wizard walks you through everything step by step:

```
Step 1 of 6: The Basics      → name, email, phone, location
Step 2 of 6: Education        → school, major, GPA, graduation
Step 3 of 6: Work Auth        → visa status, sponsorship needs (auto-fills form logic)
Step 4 of 6: EEO Demographics → optional gender/race for EEO forms
Step 5 of 6: Resume           → point to your PDF (drag & drop into terminal)
Step 6 of 6: Chrome Cookies   → auto-detects your Chrome cookie path
```

at the end, your config files are generated automatically. no JSON editing required.

### option 2: manual setup

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash setup.sh

# copy templates and edit them
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
$EDITOR config/linkedin-config.json
```

### apply to your first job

```bash
# dry run — fills the form but does NOT submit
node scripts/linkedin-easy-apply.js \
  "https://www.linkedin.com/jobs/view/1234567890" \
  config/linkedin-config.json

# when ready, set "autoSubmit": true in your config
```

each script outputs structured JSON so it can be piped to other tools or consumed by an AI agent.

---

## real results

this isn't a side project with synthetic benchmarks. it was built during an actual job search, refined across 200+ real applications.

### applications
- **200+ applications submitted** across LinkedIn Easy Apply, Greenhouse, Lever, Jobvite, and Ashby
- **5 ATS platforms** fully automated with config-driven form filling
- **auto-answer engine** handles work authorization, EEO, screening questions, and custom fields
- applications that hit CAPTCHAs are logged honestly as "blocked" — no fake submissions
- **two-resume routing**: software/AI roles get one resume, EE/embedded roles get another

### linkedin networking
- sent personalized connection requests to recruiters at target companies with notes referencing specific roles
- researched uzbekistan's energy sector, identified 9 professionals, sent personalized requests in under an hour
- **2 of 8 accepted within 24 hours** — one replied with a direct HR contact email
- monitors which connections were accepted and sends tailored follow-up DMs
- full lifecycle: research companies → find people → craft notes → send requests → track acceptances → follow up

### international outreach
- researched uzbekistan's entire tech and engineering ecosystem in a single session
- produced a comprehensive [research brief](plan-b-uzbekistan-summer-2026.md) covering 8 sectors
- identified target companies, found linkedin profiles, and initiated outreach — all in one continuous workflow
- handles multilingual messages (the worley director replied in uzbek — the agent translated it and extracted the lead)

### multi-session continuity
```
Session 1: agent reads profile → applies to 30 jobs → updates tracker
Session 2: agent reads profile → continues from where Session 1 stopped
Session 3: agent researches international market → sends LinkedIn outreach
Session 4: agent checks for acceptances → reads uzbek reply → extracts HR email
```

the agent handoff system means you never re-explain context. every session picks up exactly where the last one left off.

---

## architecture

```
                    +------------------+
                    |   Job Discovery  |
                    | python-jobspy /  |
                    | LinkedIn search  |
                    +--------+---------+
                             |
                +------------+------------+
                |                         |
                v                         v
  +-------------+--------------+  +------+--------+
  |     Application Router     |  |   Networking   |
  |  (Claude Code / manual)    |  |    Engine      |
  +----+----+----+----+-------+  +--+----+----+--+
       |    |    |    |            |    |       |
  +----+    |    |    +----+       |    |       |
  v         v    v         v       v    v       v
+------+ +-----+ +------+ +-----+ +------+ +--------+
|Linke-| |Lever| |Green-| |Jobv-| |Conn  | |Follow- |
|din   | |Apply| |house | |ite/ | |Reqs  | |up DMs  |
|Easy  | |     | |      | |Ashby| |      | |        |
+------+ +-----+ +------+ +-----+ +------+ +--------+
  |        |        |        |       |          |
  +----+---+---+----+--------+       +----+-----+
       |       |                          |
       v       v                          v
 +----------+ +-----------+    +------------------+
 | Local CSV| | Google    |    | Market Research  |
 | Tracker  | | Sheets    |    | & Intl Outreach  |
 +----------+ +-----------+    +------------------+
       |
       v
 +-----------+
 | Outlook   |
 | Triage    |
 +-----------+
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical breakdown.

## supported platforms

| Platform | Method | Auth | Captcha Handling |
|----------|--------|------|-----------------|
| LinkedIn Easy Apply | Cookie import from Chrome | Automatic | N/A (no captcha) |
| Greenhouse | CDP or headless launch | None needed | reCAPTCHA detection + token retry |
| Lever | CDP or headless launch | None needed | hCaptcha detection |
| Jobvite | CDP or headless launch | None needed | reCAPTCHA detection |
| Ashby | CDP or headless launch | None needed | reCAPTCHA detection |
| Outlook Web | CDP to running Chrome | Manual login | N/A |
| LinkedIn Networking | Cookie import from Chrome | Automatic | N/A (profile pages) |

## configuration

all personal details live in config files, not in the scripts:

```
config/
  linkedin-config.json          # your identity, answers, resume path, cookie path
  candidate-profile.md          # full profile for AI agent handoff
  answer-bank.md                # reusable answers for common questions
  example-config.json           # reference example with all fields
```

if you used `wizard.sh`, these are already generated for you.

if you want to set up manually, start from the templates:

```bash
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
cp config/answer-bank.template.md config/answer-bank.md
```

See [docs/SETUP.md](docs/SETUP.md) for a detailed walkthrough.

## claude code skills

this toolkit becomes significantly more powerful when paired with [Claude Code](https://docs.anthropic.com/en/docs/claude-code). community-built skills add AI-assisted job search, resume tailoring, interview prep, and more.

**highlights**:

- `/job-search` — search for jobs matching your resume across multiple boards
- `/tailor-resume` — customize your resume for a specific job posting
- `/apply` — fill out applications on Greenhouse, Lever, and Workday
- `/interview-prep-generator` — generate STAR stories and practice questions
- `/resume-ats-optimizer` — optimize your resume for Applicant Tracking Systems
- `/salary-negotiation-prep` — research market rates and build counter-offer scripts

See [skills/README.md](skills/README.md) for the full list of 27+ recommended skills with install commands.

## agent handoff

the `config/candidate-profile.md` file enables multi-session continuity with AI agents. it contains your identity, application rules, search preferences, tracking locations, and session state.

when a new claude code session starts, the agent reads this file and picks up exactly where the last session left off. this turns an AI assistant into a persistent job search agent.

**real example**: in one session, the agent researched uzbekistan's engineering sector, identified 9 professionals at companies like siemens energy, masdar, worley, and ERIELL, crafted personalized connection notes (some in uzbek), and sent all requests. the next session, it checked for acceptances, found 2 new connections, read a reply written in uzbek, translated it, and extracted a direct HR email — all without re-explaining any context.

## project structure

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
|-- scripts/
|   |-- linkedin-easy-apply.js         # LinkedIn Easy Apply automation
|   |-- lever-apply.js                 # Lever ATS automation
|   |-- greenhouse-apply.js            # Greenhouse ATS automation
|   |-- jobvite-apply.js               # Jobvite ATS automation
|   |-- ashby-apply.js                 # Ashby ATS automation
|   |-- outlook-triage.js              # Outlook inbox search and triage
|   |-- outlook-send.js                # Outlook email composer
|   |-- google-sheet-sync.py           # Google Sheets tracker sync
|   +-- tracker-status-update.py       # Batch status updater
|-- skills/
|   +-- README.md                      # Recommended Claude Code skills
|-- templates/
|   |-- daily-log.template.md          # Daily submission log template
|   |-- tracker.template.csv           # CSV tracker headers
|   +-- interview-prep.template.md     # Interview prep template
+-- docs/
    |-- SETUP.md                       # Detailed setup guide
    |-- CUSTOMIZATION.md               # Country, role, platform customization
    +-- ARCHITECTURE.md                # System design and data flow
```

## customization

the toolkit is designed to be adapted:

- **different countries**: update phone format, work authorization rules, currency
- **different roles**: create resume variants, customize auto-answer patterns
- **different ATS platforms**: add new scripts following the existing pattern
- **different email providers**: adapt the Outlook scripts for Gmail or others
- **different trackers**: swap Google Sheets for Notion, Airtable, etc.

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the full guide.

## FAQ

**Q: is this legal?**
A: this toolkit fills out forms with your real information — the same thing you'd do manually. it does not scrape private data, bypass security measures, or violate terms of service beyond the gray area of browser automation. use responsibly.

**Q: will LinkedIn ban my account?**
A: the LinkedIn script uses your real cookies and behaves like a normal user (no parallel requests, no scraping). the risk is comparable to using a browser extension. that said, any automation carries some risk. use at your own discretion.

**Q: how does it handle CAPTCHAs?**
A: invisible CAPTCHAs are sometimes solved automatically. visible CAPTCHAs require manual solving (run with `HEADLESS=0`). applications blocked by CAPTCHAs are logged honestly as "blocked" — never as "submitted".

**Q: can it work without Claude Code?**
A: yes. the scripts are standalone Node.js and Python programs. Claude Code and its skills are optional enhancements that add AI-assisted search, resume tailoring, and conversational control.

**Q: what data leaves my machine?**
A: application data goes to the job platforms you apply to (LinkedIn, Greenhouse, etc.) and optionally to your Google Sheet. nothing is sent to third-party analytics, tracking, or AI services beyond what you explicitly configure.

**Q: i'm not in the US — will this work for me?**
A: yes. the config is designed to be adapted for any country. update phone format, work authorization fields, and currency. see [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md). the toolkit has already been used for international outreach across uzbekistan, UAE, and central asia.

## contributing

contributions are welcome. here are some good first issues:

- add support for a new ATS platform (Workday, iCIMS, SuccessFactors)
- add Gmail support to the email triage scripts
- add Notion/Airtable tracker integrations
- improve the auto-answer engine with more question patterns
- add tests for the form-filling logic
- add a web UI for config management
- add LinkedIn recruiter search automation (find recruiters at target companies)
- add connection acceptance tracking dashboard
- add support for other languages in outreach messages
- add market research templates for other countries/regions

please open an issue before starting significant work so we can discuss the approach.

## credits

built by [akbar](https://akbar.one) during a real job search. refined across 200+ actual applications using [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

this toolkit reflects the patterns that emerged from automating a job search at scale: cookie-based authentication, pattern-matching auto-answers, config-driven form filling, multi-platform tracking, LinkedIn networking automation, international market research, multilingual outreach, and agent handoff for session continuity.

fork it. improve it. make it yours. and if you land an internship with it, [let me know](https://x.com/mendurmen).

## License

[MIT](LICENSE)
