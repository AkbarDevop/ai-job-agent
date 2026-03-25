# Architecture

This document explains how the AI Job Application Agent system works, from job discovery through application tracking.

## System Overview

```
                         +------------------+
                         |   Job Discovery  |
                         |  (LinkedIn, etc) |
                         +--------+---------+
                                  |
                                  v
                    +-------------+--------------+
                    |     Application Router     |
                    |  (Agent or manual choice)  |
                    +----+----+----+----+--------+
                         |    |    |    |
              +----------+    |    |    +----------+
              v               v    v               v
      +-------+------+ +-----+--+ +--+-----+ +----+-------+
      | LinkedIn EA  | | Lever  | | GH     | | Jobvite    |
      | (cookies)    | | (CDP)  | | (CDP)  | | (CDP)      |
      +-+------------+ +--+-----+ +---+----+ +-----+------+
        |                  |           |            |
        v                  v           v            v
   +----+------------------+-----------+------------+----+
   |              Submission Monitor                     |
   |     (detects confirmation / captcha / timeout)      |
   +------------------------+----------------------------+
                            |
                            v
            +---------------+--------------+
            |       Tracking Pipeline      |
            |  CSV --> Google Sheet Sync   |
            |  Daily Log --> Email Triage  |
            +------------------------------+
```

## Component Details

### 1. LinkedIn Easy Apply (`linkedin-easy-apply.js`)

The most complex script because LinkedIn Easy Apply is a multi-step dialog-based flow.

**Authentication**: Imports cookies from your local Chrome browser using `browser_cookie3`. This avoids needing to handle LinkedIn's login flow, 2FA, and security challenges.

```
Chrome Cookies DB --> browser_cookie3 --> JSON cookies --> Playwright context
```

**Form Filling Pipeline**:

1. **Navigate** to the job URL with the `openSDUIApplyFlow=true` parameter to trigger the Easy Apply dialog directly
2. **Wait** for the `[role="dialog"]` element to appear
3. **Loop** through up to 12 steps:
   a. **Fill standard inputs**: email select, first/last name, phone, location (with autocomplete), resume upload
   b. **Fill dropdowns**: Pattern-match question text against known patterns (`pickOption`)
   c. **Fill text fields**: Pattern-match against known patterns (`fillTextForQuestion`)
   d. **Fill fieldsets**: Handle checkboxes and radio buttons (`pickChoice`)
   e. **Detect unknown required fields**: Scan for unfilled required elements
   f. **Fallback pass**: Retry unknown fields by element ID
   g. **Click continue**: Advance to next step or submit
   h. **Check for completion**: Look for "application submitted" text

**Auto-Answer Engine**: The `pickOption`, `pickChoice`, and `fillTextForQuestion` functions form a rule-based auto-answer engine. Each function:
- Normalizes the question text (lowercase, collapse whitespace)
- Matches against known patterns (e.g., "authorized to work", "require sponsorship")
- Returns the appropriate answer from the config

**Exit Codes**:
- 0: Application submitted
- 2: Blocked on unknown required field (output includes the field details)
- 3: No continue/submit button found
- 4: Step limit (12) exceeded

### 2. ATS Scripts (Lever, Greenhouse, Jobvite, Ashby)

These follow a simpler pattern because ATS forms are typically single-page.

**Browser Connection**: Two modes:
- **Launch**: Start a fresh headless Chromium instance
- **CDP**: Connect to an existing Chrome instance via Chrome DevTools Protocol

```
CDP mode:  Chrome (port 9223) <-- Playwright connectOverCDP
Launch mode: Playwright launch() --> headless Chromium
```

**Config-Driven Fill**: Unlike the LinkedIn script's pattern-matching approach, ATS scripts use explicit field mappings in the config:

```json
{
  "textValues": [
    { "id": "first_name", "value": "Jane" },
    { "name": "email", "value": "jane@example.com" }
  ],
  "selectValues": [
    { "id": "location", "value": "Austin, TX" }
  ],
  "fileValues": [
    { "id": "resume", "path": "/path/to/resume.pdf" }
  ]
}
```

This means the agent (or user) inspects the form once to determine the field IDs, then passes them in the config.

**Platform-Specific Details**:

| Platform | Form Type | Key Challenge |
|----------|----------|---------------|
| Lever | Standard HTML | Location autocomplete + hCaptcha |
| Greenhouse | React-based selects | React state management for dropdowns |
| Jobvite | Multi-step | Residence/consent gate before form |
| Ashby | Modern SPA | Autocomplete fields + reCAPTCHA |

### 3. Tracking Pipeline

```
Application Submitted
        |
        v
+-------+--------+
|  Local CSV     |  <-- application-tracker.csv
|  (append row)  |
+-------+--------+
        |
        v
+-------+--------+
|  Daily Log     |  <-- submitted-applications-YYYY-MM-DD.md
|  (append entry)|
+-------+--------+
        |
        v
+-------+-----------+
|  Google Sheet     |  <-- google-sheet-sync.py
|  (API append)     |
+-------+-----------+
        |
        v
+-------+-----------+
|  Status Updates   |  <-- tracker-status-update.py
|  (batch update)   |
+-------------------+
```

**CSV Structure**: The local tracker CSV has these columns:
```
date, company, role, status, location, source, applied_by, url, notes, contact, compensation, days_since, key
```

The `key` column is a normalized deduplication key: `company|role|location` lowercased with non-alphanumeric characters replaced by hyphens.

**Google Sheets Sync** (`google-sheet-sync.py`):
- Reads the local CSV
- Fetches the next empty row from the Google Sheet
- Appends rows using the Sheets API
- Uses `gcloud auth application-default` for OAuth2 tokens

**Status Updater** (`tracker-status-update.py`):
- Reads a JSON file specifying updates: `[{sheet_row, company, role, status, note}]`
- Updates both the Google Sheet (by row number) and local CSV (by company+role match)
- Appends notes rather than overwriting them

### 4. Email Triage (`outlook-triage.js`)

Connects to a Chrome instance where Outlook Web is open via CDP.

**Commands**:
- `search <query>`: Types into the Outlook search box and collects results
- `extract <index>`: Clicks a result, extracts sender and full body text
- `mark-read <index>`: Opens a message to mark it as read
- `clear-search`: Closes the search panel

**Use Case**: After a batch of applications, the agent searches for confirmation emails, extracts them, and marks them as read. Interview invitations and recruiter outreach are left unread for manual attention.

### 5. Email Sender (`outlook-send.js`)

Also connects via CDP to Outlook Web.

**Flow**:
1. Click "New" to open compose form
2. Fill the "To" field (contenteditable div with autocomplete)
3. Fill the Subject (standard input)
4. Type the body line-by-line to preserve formatting
5. Optionally attach a file (triggers native file chooser)
6. Click "Send"

### 6. Agent Handoff Pattern

The `candidate-profile.md` file is the key to multi-session continuity. It contains:

- **Identity**: Name, contact info, education, work authorization
- **Rules**: How to answer different types of questions
- **State**: What was done in the last session, what's next
- **Paths**: Where scripts, configs, trackers, and resumes live

When a new Claude Code session starts, the agent reads this file to understand the full context without needing to re-ask questions.

```
Session 1: Agent reads profile --> applies to 30 jobs --> updates profile with state
Session 2: Agent reads updated profile --> picks up where Session 1 left off
Session 3: ...
```

This pattern turns an AI assistant into a persistent job search agent that maintains context across sessions.

## Data Flow

```
User's Chrome (LinkedIn logged in)
    |
    | cookies via browser_cookie3
    v
linkedin-easy-apply.js
    |
    | JSON stdout (step reports, submission confirmation)
    v
Claude Code Agent (or manual pipeline)
    |
    | writes CSV row + daily log entry
    v
google-sheet-sync.py
    |
    | Sheets API (gcloud OAuth2)
    v
Google Sheets (source of truth)
    ^
    |
tracker-status-update.py (batch status updates from email triage)
    ^
    |
outlook-triage.js (reads confirmation/rejection emails)
```

## Security Model

- **No credentials stored**: Scripts use `gcloud auth` for Google Sheets and Chrome cookies for LinkedIn. No passwords or API keys are saved in the codebase.
- **Cookie extraction**: `browser_cookie3` reads cookies from Chrome's encrypted cookie store. This requires either Chrome to be closed or the appropriate OS-level permissions (e.g., Full Disk Access on macOS).
- **CDP access**: Outlook scripts connect to a Chrome instance you explicitly start with `--remote-debugging-port`. No external services can connect unless you expose the port.
- **No data exfiltration**: All scripts write to local files or your own Google Sheet. Nothing is sent to third-party servers.

## Performance Characteristics

| Script | Typical Runtime | Network Calls |
|--------|----------------|---------------|
| LinkedIn Easy Apply | 15-45s per application | ~10-20 (page loads + form steps) |
| Lever Apply | 5-15s | ~3-5 |
| Greenhouse Apply | 5-15s | ~3-5 |
| Jobvite Apply | 5-15s | ~3-5 |
| Ashby Apply | 5-15s | ~3-5 |
| Google Sheet Sync | 2-5s per batch | 2 (fetch row count + append) |
| Outlook Search | 3-5s | 1 (browser interaction) |

## Captcha Handling

Many ATS platforms use reCAPTCHA or hCaptcha. The scripts handle this in three ways:

1. **Invisible reCAPTCHA**: Some sites solve this automatically. The scripts check for a token and retry submission if one appears.
2. **Visible CAPTCHA with CDP**: When using `HEADLESS=0` or CDP mode, the user can solve the CAPTCHA manually in the browser window.
3. **Blocked**: When running headless without a visible window, CAPTCHA-protected forms are logged as "blocked" with exit code 3.

The honest approach is to log blocked applications and either:
- Switch to `HEADLESS=0` to solve manually
- Skip the role if there are enough alternatives
- Use the CDP approach with a persistent browser session
