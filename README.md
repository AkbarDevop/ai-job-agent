# AI Job Application Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/AkbarDevop/ai-job-agent/pulls)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)

**An AI-powered job application automation toolkit that handles LinkedIn Easy Apply, ATS forms, recruiter outreach, LinkedIn networking, international job market research, and application tracking -- so you can focus on interview prep instead of filling out forms.**

---

## What This Does

This toolkit automates the most repetitive parts of a job search:

| Script | What It Automates |
|--------|------------------|
| **LinkedIn Easy Apply** | Fills multi-step Easy Apply dialogs including work authorization, EEO, and screening questions |
| **Greenhouse Apply** | Fills Greenhouse ATS application forms with React select support |
| **Lever Apply** | Fills Lever ATS forms with location autocomplete and hCaptcha detection |
| **Jobvite Apply** | Fills Jobvite applications including residence/consent gates |
| **Ashby Apply** | Fills Ashby ATS forms with autocomplete and checkbox support |
| **Outlook Triage** | Searches, reads, and manages job-related emails in Outlook Web |
| **Outlook Send** | Composes and sends emails (e.g., recruiter outreach) via Outlook Web |
| **Google Sheet Sync** | Appends applications to a Google Sheet tracker from a local CSV |
| **Tracker Status Update** | Batch-updates application statuses across Google Sheets and local CSV |
| **LinkedIn Networking** | Sends personalized connection requests to recruiters and professionals at target companies |
| **Recruiter Follow-up** | Monitors connection acceptances and sends tailored follow-up DMs to new connections |
| **Market Research** | Researches international job markets, identifies target companies, and finds the right people to contact |

All scripts are config-driven. Fill in your profile once, and the tools handle the rest.

## Quick Start

### 1. Clone and set up

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash setup.sh
```

### 2. Configure your profile

```bash
# Edit with your personal details
$EDITOR config/linkedin-config.json
$EDITOR config/candidate-profile.md
```

### 3. Apply to a job

```bash
# LinkedIn Easy Apply
node scripts/linkedin-easy-apply.js \
  "https://www.linkedin.com/jobs/view/1234567890" \
  config/linkedin-config.json

# Lever (uses same config format)
node scripts/lever-apply.js \
  "https://jobs.lever.co/company/job-id" \
  config/linkedin-config.json

# Greenhouse (uses same config format)
node scripts/greenhouse-apply.js \
  "https://boards.greenhouse.io/company/jobs/12345" \
  config/linkedin-config.json
```

Each script outputs structured JSON to stdout so it can be piped to other tools or consumed by an AI agent.

## Real Results

This toolkit was built and tested during a real job search. Here's what it achieved:

### Application Automation
- **200+ applications submitted** across LinkedIn Easy Apply, Greenhouse, Lever, Jobvite, and Ashby
- **5 ATS platforms** fully automated with config-driven form filling
- **Auto-answer engine** handles work authorization, EEO, screening questions, and custom fields
- Applications that hit CAPTCHAs are logged honestly as "blocked" -- no fake submissions

### LinkedIn Networking & Outreach
- **Automated recruiter outreach**: sent personalized connection requests to recruiters at target companies with context-aware notes referencing specific roles
- **International networking**: researched companies in Uzbekistan's energy/engineering sector, identified 9 key professionals, and sent personalized connection requests in under an hour
- **2 of 8 connections accepted within 24 hours** -- one replied with a direct HR contact and email for the hiring manager
- **Follow-up messaging**: monitors which connections were accepted and sends tailored follow-up DMs automatically
- The agent handles the full lifecycle: research companies -> find people -> craft personalized notes -> send requests -> track acceptances -> send follow-ups

### International Job Market Research
- **AI-powered market research**: the agent researched Uzbekistan's entire tech and engineering ecosystem in a single session -- startups, government initiatives, accelerators, conferences, university research labs, remote work infrastructure
- Produced a comprehensive [research brief](plan-b-uzbekistan-summer-2026.md) covering 8 sectors with actionable next steps
- Identified target companies, found LinkedIn profiles of key contacts, and initiated outreach -- all in one continuous workflow

### Multi-Session Continuity
- The agent handoff system (`candidate-profile.md`) lets Claude Code pick up exactly where the last session left off
- Real example: Session 1 researched companies and sent connection requests. Session 2 (next day) checked for acceptances, found 2 new connections, read a reply in Uzbek, translated it, and extracted an HR contact -- all without re-explaining context

## Architecture

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

Start from the templates:

```bash
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
cp config/answer-bank.template.md config/answer-bank.md
```

See [docs/SETUP.md](docs/SETUP.md) for a detailed walkthrough.

## Claude Code Skills

This toolkit becomes significantly more powerful when paired with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skills. Community-built skills add AI-assisted job search, resume tailoring, interview prep, and more.

**Highlights**:

- `/job-search` -- Search for jobs matching your resume across multiple boards
- `/tailor-resume` -- Customize your resume for a specific job posting
- `/apply` -- Fill out applications on Greenhouse, Lever, and Workday
- `/interview-prep-generator` -- Generate STAR stories and practice questions
- `/resume-ats-optimizer` -- Optimize your resume for Applicant Tracking Systems
- `/salary-negotiation-prep` -- Research market rates and build counter-offer scripts

See [skills/README.md](skills/README.md) for the full list of 27+ recommended skills with install commands.

## Agent Handoff

The `config/candidate-profile.md` file enables multi-session continuity with AI agents. It contains your identity, application rules, search preferences, tracking locations, and session state.

When a new Claude Code session starts, the agent reads this file and picks up exactly where the last session left off. This turns an AI assistant into a persistent job search agent.

```
Session 1: Agent reads profile --> applies to 30 jobs --> updates profile
Session 2: Agent reads profile --> continues from where Session 1 stopped
Session 3: Agent researches international market --> sends LinkedIn outreach
Session 4: Agent checks for acceptances --> sends follow-up DMs --> extracts leads
```

**Real example**: In one session, the agent researched Uzbekistan's engineering sector, identified 9 professionals at companies like Siemens Energy, Masdar, Worley, and ERIELL, crafted personalized connection notes (some in Uzbek), and sent all requests. The next session, it checked for acceptances, found 2 new connections, read a reply written in Uzbek, translated it, and extracted a direct HR email -- all without re-explaining any context.

## Project Structure

```
.
|-- README.md                          # This file
|-- LICENSE                            # MIT License
|-- CLAUDE.md                          # Claude Code project instructions
|-- setup.sh                           # One-command setup
|-- config/
|   |-- candidate-profile.template.md  # Profile template
|   |-- answer-bank.template.md        # Answer bank template
|   |-- linkedin-config.template.json  # LinkedIn config template
|   +-- example-config.json            # Filled example
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

## Customization

The toolkit is designed to be adapted:

- **Different countries**: Update phone format, work authorization rules, currency
- **Different roles**: Create resume variants, customize auto-answer patterns
- **Different ATS platforms**: Add new scripts following the existing pattern
- **Different email providers**: Adapt the Outlook scripts for Gmail or others
- **Different trackers**: Swap Google Sheets for Notion, Airtable, etc.

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the full guide.

## FAQ

**Q: Is this legal?**
A: This toolkit fills out forms with your real information, the same thing you'd do manually. It does not scrape private data, bypass security measures, or violate terms of service beyond the gray area of browser automation. Use responsibly.

**Q: Will LinkedIn ban my account?**
A: The LinkedIn script uses your real cookies and behaves like a normal user (no parallel requests, no scraping). The risk is comparable to using a browser extension. That said, any automation carries some risk. Use at your own discretion.

**Q: How does it handle CAPTCHAs?**
A: Invisible CAPTCHAs are sometimes solved automatically. Visible CAPTCHAs require manual solving (run with `HEADLESS=0`). Applications blocked by CAPTCHAs are logged honestly as "blocked", never as "submitted".

**Q: Can it work without Claude Code?**
A: Yes. The scripts are standalone Node.js and Python programs. Claude Code and its skills are optional enhancements that add AI-assisted search, resume tailoring, and conversational control.

**Q: What data leaves my machine?**
A: Application data goes to the job platforms you apply to (LinkedIn, Greenhouse, etc.) and optionally to your Google Sheet. Nothing is sent to third-party analytics, tracking, or AI services beyond what you explicitly configure.

**Q: How do I add a new ATS platform?**
A: Follow the pattern in any existing ATS script. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the common structure and [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for a step-by-step guide.

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

Created by [Akbarjon Kamoldinov](https://github.com/AkbarDevop) as part of a real job search. Built and refined across 200+ actual job applications using [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

This toolkit reflects the real-world patterns that emerged from automating a job search at scale: cookie-based authentication, pattern-matching auto-answers, config-driven form filling, multi-platform tracking, LinkedIn networking automation, international market research, multilingual outreach, and agent handoff for session continuity.

## License

[MIT](LICENSE)
