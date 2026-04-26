# Detailed Setup Guide

This guide walks through every step of setting up the AI Job Application Agent toolkit.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Chrome Cookie Setup](#chrome-cookie-setup)
- [Google Sheets Integration](#google-sheets-integration)
- [Outlook Email Integration](#outlook-email-integration)
- [Testing Your Setup](#testing-your-setup)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Runs Playwright automation scripts |
| Python | 3.10+ | Runs Google Sheets sync and tracker scripts |
| npm | 9+ | Package manager (comes with Node.js) |
| Google Chrome | Latest | Cookie source for LinkedIn authentication |

### Optional

| Tool | Purpose |
|------|---------|
| gcloud CLI | Google Sheets API authentication |
| Claude Code | AI-assisted job hunting with skills |

## Installation

### Option A: Paste-to-Claude (Recommended, gstack-style)

Open Claude Code and paste this (one message, Claude interprets the rest):

> Install ai-job-agent: run `git clone --single-branch --depth 1 https://github.com/AkbarDevop/ai-job-agent ~/.claude/skills/ai-job-agent && cd ~/.claude/skills/ai-job-agent && bash skills/install.sh` then add an "ai-job-agent" section to my CLAUDE.md telling you to treat me like a career-coaching client — open-ended job-search talk → /job-coach (intake + research + slate), job URL → /job-apply, reach out to a person → /job-outreach, follow-ups → /job-followup, "how am I doing" → /job-dashboard, tracker → /job-track, status changes → /job-status, Outlook → /job-triage, first-time setup → /job-setup. Never answer job-search questions conversationally — always dispatch. Tell me it's done, run /job-setup, then chain into /job-coach intake.

Claude clones into `~/.claude/skills/ai-job-agent/`, registers all 13 skills globally (`/job-coach`, `/job-setup`, `/job-evaluate`, `/job-apply`, `/job-track`, `/job-triage`, `/job-status`, `/job-outreach`, `/job-followup`, `/job-dashboard`, `/job-cv`, `/job-interview`, `/job-patterns`), writes the coach-first routing block into CLAUDE.md, walks you through `/job-setup` (identity, education, work auth, EEO, resume, Chrome cookies, optional msmtp), then chains into `/job-coach intake` (target roles, companies, timeline, geography → live market research → ranked slate).

**After that, you just talk naturally** to Claude — "I need an internship for summer", "apply to this url", "email the VP at GFT", "who should I follow up with", "how am I doing" — and the skills auto-route. You never need to remember a slash command.

**Skip the rest of this page if you take this route** — the skills handle it all. The sections below are reference material if something needs manual repair.

### Option B: Clone-and-hack (if you're modifying the skill files)

```bash
git clone https://github.com/AkbarDevop/ai-job-agent ~/wherever
cd ~/wherever
bash skills/install.sh      # symlinks skills into ~/.claude/skills/ and
                            # writes a REPO_PATH marker so they find this clone
claude                      # start Claude Code anywhere
/job-setup                  # inside the session
```

### Option C: Bash Wizard (no Claude Code required)

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash wizard.sh
```

Same questions as `/job-setup`, driven by a terminal wizard. Does not register the skills or configure msmtp for cold email.

### Option D: Fully Manual

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
bash setup.sh

npm init -y
npm install playwright-core
npx playwright install chromium   # optional
pip3 install browser-cookie3
```

Then hand-edit the config files per the section below.

## Configuration

> Skip this entire section if you ran `/job-setup` — all files below are generated for you.

### 1. LinkedIn Config (Required for LinkedIn Easy Apply)

Copy the template and fill in your details:

```bash
cp config/linkedin-config.template.json config/linkedin-config.json
```

Edit `config/linkedin-config.json`:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@university.edu",
  "phone": "(555) 123-4567",
  "phoneNational": "5551234567",
  "location": "Austin, Texas",
  "resumePath": "/absolute/path/to/your/resume.pdf",
  "chromeCookiePath": "/path/to/Chrome/Cookies"
}
```

See `config/example-config.json` for a complete example.

### 2. Candidate Profile (Required for Agent Handoff)

```bash
cp config/candidate-profile.template.md config/candidate-profile.md
```

This file tells Claude Code (or any AI agent) everything about your background, preferences, and application rules. Fill it in thoroughly for best results.

### 3. Answer Bank (Recommended)

```bash
cp config/answer-bank.template.md config/answer-bank.md
```

Pre-written answers for common application questions. Saves time when the same question appears across different applications.

### 4. Application Tracker

```bash
cp templates/tracker.template.csv application-tracker.csv
```

Local CSV tracker for all your applications.

## Chrome Cookie Setup

The LinkedIn Easy Apply script authenticates by importing cookies from your Chrome browser. This means you need to be logged into LinkedIn in Chrome.

### Finding Your Cookie File

| OS | Default Cookie Path |
|----|-------------------|
| macOS | `~/Library/Application Support/Google/Chrome/Default/Cookies` |
| Linux | `~/.config/google-chrome/Default/Cookies` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cookies` |

If you use a Chrome profile other than "Default", replace "Default" with your profile name (e.g., "Profile 1").

### Setting the Cookie Path

Add the path to your `config/linkedin-config.json`:

```json
{
  "chromeCookiePath": "/Users/you/Library/Application Support/Google/Chrome/Default/Cookies"
}
```

Or set the environment variable:

```bash
export CHROME_COOKIE_PATH="$HOME/Library/Application Support/Google/Chrome/Default/Cookies"
```

### Troubleshooting Cookies

- **"browser_cookie3 not found"**: Run `pip3 install browser-cookie3`
- **"Permission denied"**: On macOS, Chrome must be closed when reading cookies, or grant Full Disk Access to Terminal
- **"Login page instead of application"**: Your LinkedIn session may have expired. Log into LinkedIn in Chrome and try again.

## Google Sheets Integration

### 1. Set Up gcloud

```bash
# Install gcloud CLI
# See: https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth application-default login
```

### 2. Create Your Google Sheet

Create a Google Sheet with these column headers in row 1:

```
Date | Company | Role | Status | Location | Source | Applied By | URL | Notes | Contact | Compensation | Days Since | Key
```

### 3. Get Your Sheet ID

The Sheet ID is in the URL:
```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
```

### 4. Configure

Set environment variables:

```bash
export SPREADSHEET_ID="your-sheet-id"
export SHEET_NAME="Job Tracker"
```

Or edit the defaults at the top of `scripts/google-sheet-sync.py` and `scripts/tracker-status-update.py`.

## Cold Email Setup (msmtp + Gmail)

Required only for `/job-outreach` and `/job-followup`. Skip this section if you're only using ATS fillers and Outlook triage.

### 1. Install msmtp

```bash
# macOS
brew install msmtp

# Debian / Ubuntu
sudo apt install msmtp msmtp-mta

# Arch
sudo pacman -S msmtp
```

Verify: `command -v msmtp` should print a path.

### 2. Create a Gmail App Password

Gmail requires an app password for SMTP (your regular password won't work with 2FA on). 

1. Go to https://myaccount.google.com/apppasswords (requires 2-Step Verification to be on).
2. Generate a new app password. Label it "msmtp" or similar.
3. Copy the 16-character password. You won't see it again.

### 3. Write `~/.msmtprc`

```ini
defaults
auth           on
tls            on
tls_trust_file /etc/ssl/cert.pem
logfile        ~/.msmtp.log

account        gmail
host           smtp.gmail.com
port           587
from           you@gmail.com
user           you@gmail.com
password       your-16-char-app-password

account default : gmail
```

On macOS the `tls_trust_file` path may be `/opt/homebrew/etc/openssl@3/cert.pem` — check with `ls /etc/ssl/cert.pem` first.

Tighten permissions (msmtp refuses to start if the file is world-readable):

```bash
chmod 600 ~/.msmtprc
```

### 4. Test it

```bash
echo "Subject: msmtp test

hello from msmtp" | msmtp your-test@example.com
```

If the email arrives, you're done. If not, check `~/.msmtp.log`.

### 5. Dry-run the bundled sender

```bash
echo '{
  "from": "You <you@gmail.com>",
  "to": "test@example.com",
  "subject": "dry-run",
  "body": "hello"
}' | node scripts/send-cold-email.js --dry-run
```

You should see a JSON block with `ok: true`, `dryRun: true`, and the raw RFC822 preview. No email is actually sent on `--dry-run`.

## Outlook Email Integration

The Outlook scripts connect to a running Chrome instance via Chrome DevTools Protocol.

### 1. Start Chrome with Remote Debugging

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 \
  --user-data-dir=/tmp/outlook-chrome-profile

# Linux
google-chrome --remote-debugging-port=9224 --user-data-dir=/tmp/outlook-chrome-profile
```

### 2. Navigate to Outlook

Open `https://outlook.office.com` in that Chrome window and sign in.

### 3. Use the Scripts

```bash
# Search emails
node scripts/outlook-triage.js search "job application confirmation"

# Read a specific result
node scripts/outlook-triage.js extract 0

# Mark as read
node scripts/outlook-triage.js mark-read 0
```

## Testing Your Setup

### LinkedIn Easy Apply (Dry Run)

Find any LinkedIn job posting URL and run:

```bash
node scripts/linkedin-easy-apply.js \
  "https://www.linkedin.com/jobs/view/1234567890" \
  config/linkedin-config.json
```

Watch the JSON output. If it reaches `stage: "step"` with filled fields, your setup works.

### Google Sheets Sync

Create a test CSV:

```bash
echo 'date,company,role,status,location,source,applied_by,url,notes
2026-01-01,Test Corp,Test Role,submitted,Remote,LinkedIn,Me,https://example.com,test' > /tmp/test-apps.csv

python3 scripts/google-sheet-sync.py /tmp/test-apps.csv
```

### ATS Scripts (Lever/Greenhouse/Jobvite/Ashby)

These require a job-specific config. See the script headers for the expected JSON format.

```bash
# Example: Lever dry run (autoSubmit: false)
echo '{"resumePath": "/path/to/resume.pdf", "name": "Jane Doe", "email": "jane@example.com", "phone": "555-123-4567", "autoSubmit": false}' > /tmp/lever-config.json

node scripts/lever-apply.js "https://jobs.lever.co/company/job-id" /tmp/lever-config.json
```

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `Cannot find module 'playwright-core'` | Run `npm install playwright-core` |
| `browser_cookie3` import error | Run `pip3 install browser-cookie3` |
| LinkedIn shows login page | Log into LinkedIn in Chrome, close Chrome, retry |
| Captcha blocks submission | Set `HEADLESS=0` and solve manually, or skip the role |
| Google Sheets 403 error | Run `gcloud auth application-default login` |
| Outlook scripts fail to connect | Ensure Chrome is running with `--remote-debugging-port=9224` |
| "No browser contexts" error | Ensure Outlook is open in the Chrome debug instance |

### Getting Help

- Check the script's header comment for usage details
- Look at `config/example-config.json` for a complete config example
- Open an issue on GitHub with the full error output
