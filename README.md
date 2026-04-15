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

## What This Does

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

## Get Started in 5 Minutes

### Option 1: Interactive Wizard (recommended)

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash wizard.sh
```

The wizard walks you through everything step by step:

```
Step 1 of 6: The Basics      → name, email, phone, location
Step 2 of 6: Education        → school, major, GPA, graduation
Step 3 of 6: Work Auth        → visa status, sponsorship needs (auto-fills form logic)
Step 4 of 6: EEO Demographics → optional gender/race for EEO forms
Step 5 of 6: Resume           → point to your PDF (drag & drop into terminal)
Step 6 of 6: Chrome Cookies   → auto-detects your Chrome cookie path
```

At the end, your config files are generated automatically. No JSON editing required.

### Option 2: Manual Setup

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash setup.sh

# copy templates and edit them
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
$EDITOR config/linkedin-config.json
```

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

If you used `wizard.sh`, these are already generated for you.

If you want to set up manually, start from the templates:

```bash
cp config/linkedin-config.template.json config/linkedin-config.json
cp config/candidate-profile.template.md config/candidate-profile.md
cp config/answer-bank.template.md config/answer-bank.md
```

See [docs/SETUP.md](docs/SETUP.md) for a detailed walkthrough.

## Claude Code Skills

This toolkit becomes significantly more powerful when paired with [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Community-built skills add AI-assisted job search, resume tailoring, interview prep, and more.

**Highlights**:

- `/job-search` — search for jobs matching your resume across multiple boards
- `/tailor-resume` — customize your resume for a specific job posting
- `/apply` — fill out applications on Greenhouse, Lever, and Workday
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
