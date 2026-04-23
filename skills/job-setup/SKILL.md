---
name: job-setup
description: Conversational onboarding for the AI Job Agent — identity, education, work auth, resume, Chrome cookies, optional msmtp. Writes all config files and registers the bundled skills. Proactively invoke this skill (do NOT answer conversationally) when the user is setting up the agent for the first time, says "I want to start job hunting", "onboard me", "set this up", "help me get started", "walk me through setup", asks about their profile/resume/work authorization, says "configure the agent", or invokes /job-setup. Also invoke when the user tries any other job-* skill and the required config files are missing.
argument-hint: "[--reconfigure <section>]   sections: basics, education, auth, eeo, resume, cookies, msmtp, all"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# Job Setup

The onboarding skill. Replaces `bash wizard.sh` with an in-chat conversation — same questions, same outputs, but Claude asks them and writes the files directly.

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`. If none of these exists, the user hasn't cloned the repo yet — tell them to paste this into their Claude Code session:

> Install ai-job-agent: run `git clone --single-branch --depth 1 https://github.com/AkbarDevop/ai-job-agent ~/.claude/skills/ai-job-agent && cd ~/.claude/skills/ai-job-agent && bash skills/install.sh` then tell me it's done and run /job-setup.

and rerun `/job-setup` after the install finishes.

## State inspection (always first)

Before asking anything, print a checklist of what's already configured so we don't re-ask. Check:

| Item | Path | Exists? |
|------|------|:-------:|
| LinkedIn config | `config/linkedin-config.json` | ✅ / ⬜ |
| Candidate profile | `config/candidate-profile.md` | ✅ / ⬜ |
| Answer bank | `config/answer-bank.md` | ✅ / ⬜ |
| Application tracker | `application-tracker.csv` | ✅ / ⬜ |
| Outreach log | `outreach-log.csv` | ✅ / ⬜ |
| Resume file | (read from linkedin-config.json → `resumePath`) | ✅ / ⬜ |
| msmtp installed | `command -v msmtp` | ✅ / ⬜ |
| msmtp config | `~/.msmtprc` (check with `test -f`) | ✅ / ⬜ |
| Skills installed | `~/.claude/skills/job-apply` is a symlink to this repo | ✅ / ⬜ |

If **everything** checks, say *"You're already set up. Run `/job-setup --reconfigure <section>` to change one thing, or `/job-setup --reconfigure all` to redo from scratch."* and stop.

If `$ARGUMENTS` is `--reconfigure <section>`, jump directly to that section and skip the others.

Otherwise, walk only the missing sections in this order:

## Steps

### Step 1 — The Basics (skip if `linkedin-config.json` exists)

Ask these in one message (numbered list). Accept "skip" per-field.

1. First name
2. Last name
3. Email
4. Phone (e.g. `(555) 123-4567`)
5. City, State (e.g. `Columbia, Missouri`)

Validate: email has `@`, phone has at least 10 digits.

### Step 2 — Education

1. University
2. Major
3. Expected graduation (e.g. `May 2027`)
4. GPA (e.g. `3.5`)
5. Degree type (use `AskUserQuestion` with choices: Bachelor's / Master's / PhD / Associate's)

### Step 3 — Work Authorization

Use `AskUserQuestion` (this is a locked-choice field and drives the sponsorship flags):

| Answer | `authorizedToWork` | `requireCurrentSponsorship` | `requireFutureSponsorship` | `visaStatus` |
|--------|:-----:|:-----:|:-----:|--------|
| US Citizen | Yes | No | No | N/A |
| Permanent Resident (Green Card) | Yes | No | No | Permanent Resident |
| F-1 Student Visa (CPT/OPT) | Yes | No | **Yes** | F-1 student visa |
| H-1B Visa | Yes | No | **Yes** | H-1B |
| Other visa | Yes | No | **Yes** | *(ask for the type)* |
| Not authorized to work in US | No | **Yes** | **Yes** | None |

For every answer except "US Citizen", also ask for country of citizenship.

### Step 4 — EEO Demographics (optional)

Use `AskUserQuestion` with an explicit "Prefer not to say" + "Skip" option. Skip → empty string.

- Gender: Male / Female / Non-binary / Prefer not to say / Skip
- Race: Asian / Black or African American / Hispanic or Latino / White / Two or more races / Native American / Pacific Islander / Prefer not to say / Skip

### Step 5 — Resume

Ask for the path to the resume PDF. Validate with Bash:

```bash
test -f "$RESUME_PATH" && echo OK || echo MISSING
```

If MISSING: loop, tell the user to drag-and-drop into the terminal.

If they have both a software-focused and an EE-focused resume (as Akbar does — see the repo's README), ask for both paths. Write both into the candidate-profile.md under "Resume files".

### Step 6 — Chrome cookies

Auto-detect:

```bash
# macOS
test -f "$HOME/Library/Application Support/Google/Chrome/Default/Cookies" && echo MAC_DEFAULT

# Linux
test -f "$HOME/.config/google-chrome/Default/Cookies" && echo LINUX_DEFAULT
```

If one exists, show it and ask "use this path? (y/n)". On `n` or neither detected, ask for a custom path.

### Step 7 — Cold email (optional, for `/job-outreach` + `/job-followup`)

Ask: *"Want to set up cold email sending too? It uses Gmail + msmtp. You'll need a Gmail App Password (2-Step Verification must be on). (y/n)"*

If **no** → skip to Step 8.

If **yes**:

1. Check msmtp is installed:

   ```bash
   command -v msmtp && echo INSTALLED || echo MISSING
   ```

   If MISSING, print the right install command for the platform and stop until the user confirms they've installed it:
   - macOS: `brew install msmtp`
   - Debian/Ubuntu: `sudo apt install msmtp msmtp-mta`
   - Arch: `sudo pacman -S msmtp`

2. Check `~/.msmtprc` exists. If yes, ask "Use existing config? (y/n)". If yes, skip to 4.

3. Walk the Gmail App Password flow:
   - Open https://myaccount.google.com/apppasswords (the user does this in their browser)
   - Generate a password labeled "msmtp"
   - Paste the 16-char password when prompted in chat

   Ask for:
   - Gmail address (e.g. `you@gmail.com`)
   - App password (16 chars)

   Resolve the right `tls_trust_file` for the platform:

   ```bash
   test -f /etc/ssl/cert.pem && echo "/etc/ssl/cert.pem" \
     || test -f /opt/homebrew/etc/openssl@3/cert.pem && echo "/opt/homebrew/etc/openssl@3/cert.pem" \
     || test -f /etc/ssl/certs/ca-certificates.crt && echo "/etc/ssl/certs/ca-certificates.crt"
   ```

   Write `~/.msmtprc` via the Write tool:

   ```ini
   defaults
   auth           on
   tls            on
   tls_trust_file {{resolved_path}}
   logfile        ~/.msmtp.log

   account        gmail
   host           smtp.gmail.com
   port           587
   from           {{email}}
   user           {{email}}
   password       {{app_password}}

   account default : gmail
   ```

   Then `chmod 600 ~/.msmtprc` — msmtp refuses to run otherwise.

4. Smoke-test with the bundled sender (dry-run only, no real send):

   ```bash
   echo "{\"from\":\"$EMAIL\",\"to\":\"test@example.com\",\"subject\":\"msmtp test\",\"body\":\"hello\"}" \
     | node "$AI_JOB_AGENT_ROOT/scripts/send-cold-email.js" --dry-run
   ```

   If `ok: true`, say "cold email is live."

### Step 8 — Generate config files

Use the `Write` tool for each.

**`config/linkedin-config.json`** — use the exact schema from `wizard.sh` lines 298-342 (don't invent fields, the form fillers expect specific keys). Fill from collected answers. Key fields:

```json
{
  "firstName": "...",
  "lastName": "...",
  "preferredName": "<same as firstName>",
  "email": "...",
  "phone": "...",
  "phoneNational": "<digits only>",
  "phoneCountryLabel": "United States (+1)",
  "location": "...",
  "city": "<first comma-part of location>",
  "state": "<second comma-part of location>",
  "country": "United States",
  "postalCode": "",
  "address": "",
  "currentCompany": "<school>",
  "website": "",
  "linkedin": "",
  "github": "",
  "citizenship": "...",
  "visaStatus": "...",
  "compensation": "",
  "startDate": "",
  "expectedGraduation": "...",
  "school": "...",
  "major": "...",
  "gpa": "...",
  "gpaRange": "",
  "degreeType": "...",
  "degreeCompleted": "No",
  "yearsExperience": "0",
  "authorizedToWork": "Yes|No",
  "requireCurrentSponsorship": "Yes|No",
  "requireFutureSponsorship": "Yes|No",
  "pursuingAdvancedDegree": "No",
  "eeoGender": "...",
  "eeoRace": "...",
  "eeoVeteran": "No",
  "projectPitch": "",
  "resumePath": "<absolute path>",
  "chromeCookiePath": "<absolute path>",
  "name": "<firstName lastName>",
  "autoSubmit": false
}
```

**`config/candidate-profile.md`** — use the structure from `wizard.sh` lines 347-383 but do not include any invented data. Include real data collected and explicit `TODO: add`-markers for the free-fill sections.

**`config/answer-bank.md`** — if missing, `cp config/answer-bank.template.md config/answer-bank.md`.

**`application-tracker.csv`** — if missing, `cp templates/tracker.template.csv application-tracker.csv`.

**`outreach-log.csv`** — only if msmtp was set up in Step 7. `cp templates/outreach-log.template.csv outreach-log.csv`.

### Step 9 — Install deps + register skills

```bash
cd "$AI_JOB_AGENT_ROOT"
command -v npm && npm install --silent 2>/dev/null
command -v pip3 && pip3 install -q browser-cookie3 2>/dev/null || true
bash skills/install.sh
```

Report which dependencies installed and how many skills got registered.

### Step 10 — Summary table

| Field | Value |
|-------|-------|
| 👤 Name | `...` |
| 🏫 School | `...` |
| 🎓 Grad | `...` |
| 🛂 Auth | `...` |
| 📄 Resume | `...` |
| 🍪 Cookies | `...` |
| ✉️ Cold email | ✅ configured / ⬜ skipped |
| 🧩 Skills registered | N of 7 |

Then the "try it out" nudge:

```
Next:

  /job-apply https://www.linkedin.com/jobs/view/1234567890   # dry-run an application
  /job-outreach "VP of Engineering at Acme"                  # draft a cold email
  /job-track                                                 # see your tracker
```

## Reconfigure flow

`$ARGUMENTS` = `--reconfigure basics` → only redo Step 1 and regenerate `linkedin-config.json` + `candidate-profile.md` with the new values, keeping everything else from the existing files (read the old JSON first, merge).

Sections: `basics` · `education` · `auth` · `eeo` · `resume` · `cookies` · `msmtp` · `all`.

## Rules

- **Never overwrite `candidate-profile.md` or `linkedin-config.json` silently** if they exist and we didn't `--reconfigure`. Ask the user *"overwrite the existing config? (y/n)"* first.
- **Never commit these files** — they're gitignored. Don't run `git add` on anything in `config/` or the root-level trackers.
- **Show the values back to the user before writing** — they spot typos faster than I do. One confirmation gate.
- **The candidate's truthful work authorization drives downstream form-filling**. Don't coach them into lying.
- If the user is in a non-English-speaking context (Uzbek, Spanish, etc.), ask them in that language for the free-text fields — it tends to be more accurate.
