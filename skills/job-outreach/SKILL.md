---
name: job-outreach
description: Research a company or hiring manager, draft a personalized cold email in chat, get the user's approval, then send it via local msmtp (Gmail app password). Logs the send to outreach-log.csv for day-7 follow-up tracking. Use when the user asks to "cold email this person", "reach out to the VP at X", "draft an email to this hiring manager", "send outreach to this lead", or invokes /job-outreach.
argument-hint: "<company | LinkedIn URL | email address | freeform target>"
allowed-tools:
  - Bash
  - Read
  - Write
  - WebFetch
  - WebSearch
---

# Job Outreach

A **skill** (not an API call) for cold outreach. Claude — this agent — does the research and drafting. A small Node script sends via msmtp. A CSV logs the send.

This is the pattern behind the 228+ cold emails that led to the GFT offer in 12 days. Keep it short, honest, and specific to the person. Never auto-send.

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/REPO_PATH` → `~/ai-job-agent`.

## Prerequisites

Before drafting anything:

1. `msmtp` installed (`command -v msmtp` should resolve). If not, tell the user:
   > ```
   > brew install msmtp
   > ```
   > and configure `~/.msmtprc` with their Gmail app password. See `docs/SETUP.md#cold-email-setup-msmtp--gmail`. Stop until set up.

2. `config/candidate-profile.md` exists (required for personalization). If not, tell the user to run `bash wizard.sh` first.

3. `outreach-log.csv` exists at `$AI_JOB_AGENT_ROOT/outreach-log.csv`. If not, copy from `templates/outreach-log.template.csv`.

## Workflow

### Step 1 — Understand the target

Parse `$ARGUMENTS`. It might be:
- A company name (e.g. "GFT Infrastructure")
- A LinkedIn profile URL (`linkedin.com/in/...`)
- A direct email (`paul.young@gft.com`)
- Freeform ("the VP of Power Services at GFT" — ask a clarifying question if ambiguous)

Load `config/candidate-profile.md` so you know *who is sending* (Akbar's pitch, resume variants, work auth, graduation date, key projects).

### Step 2 — Research

Use `WebSearch` + `WebFetch` to pull 3-5 facts about the company and the person. Aim for:

- **What the company actually does** (not the generic pitch — specifically: what project, what market, what recent news)
- **The person's role and relevant recent activity** (recent post, team they lead, quoted in an article)
- **A credible hook** — one thing the sender has actually done that connects to their work (not "passionate about your mission")

If you can't find anything specific after ~3 searches, tell the user "I can't find anything concrete to personalize with — do you have any context (a mutual connection, a talk they gave, an article)?" and wait for them.

### Step 3 — Draft (framework, not template)

Write one email — 4 short paragraphs, ~130-160 words total. No fluff.

| Block | Length | Content |
|-------|--------|---------|
| Hook | 1-2 sentences | The *specific* thing about this person/company (from Step 2). Not "I was impressed by…" — a concrete observation. |
| Who you are | 1-2 sentences | Name, school/year, the single most relevant fact for them (not a résumé dump). |
| Proof | 1-2 sentences | One thing you've actually built/done that connects to their work. Link if possible. |
| Ask | 1 sentence | A low-cost ask — 15 minutes to chat, a resume review, or "is there anyone on your team I should reach out to." Never "a job." |

**Hard rules:**

- First person, conversational. Contractions fine.
- No "passionate about" / "excited about" / "I hope this email finds you well."
- No buzzwords ("synergy", "leverage", "align").
- If the target is non-English-speaking (e.g. Uzbekistan) and the candidate profile supports it, offer a multilingual version as a second draft.
- If the recipient is in Uzbek/Russian-speaking context, slip one line in their language (per Akbar's actual past practice).

### Step 4 — Present the draft for approval

Render exactly this structure in chat:

```
**Draft #1** · to: Paul Young <paul.young@gft.com> · from: k.akbarme@gmail.com

Subject: Intern interest — substation engineering, 60+ active projects

<4 paragraphs>

---

Sources I used to personalize this:
- <url 1> — <1-line what it gave you>
- <url 2> — <…>

Send, edit, or cancel? (send / edit / cancel)
```

### Step 5 — Handle the response

- **send** → go to Step 6.
- **edit** → ask "what should I change?" and regenerate. Loop until `send` or `cancel`.
- **cancel** → do nothing, don't log. Tell the user "nothing sent, nothing logged."

### Step 6 — Save and send

1. Save the body to a file so it's recoverable:

   ```
   $AI_JOB_AGENT_ROOT/outreach/<YYYY-MM-DD>-<company-slug>-<recipient-slug>.txt
   ```

   Create the `outreach/` directory if it doesn't exist.

2. Build a JSON payload:

   ```json
   {
     "from": "Akbar Kamoldinov <k.akbarme@gmail.com>",
     "to": "paul.young@gft.com",
     "subject": "…",
     "body": "…full body…",
     "reply_to": "k.akbarme@gmail.com"
   }
   ```

   Source the `from` from the candidate profile; default to `k.akbarme@gmail.com`. Ask the user if you're unsure whose inbox to send from.

3. Always dry-run first:

   ```bash
   echo "$PAYLOAD" | node "$AI_JOB_AGENT_ROOT/scripts/send-cold-email.js" --dry-run
   ```

   Show the user the raw RFC822 preview. Confirm one more time: "**Actually send?** (y/n)"

4. On `y`, send for real:

   ```bash
   echo "$PAYLOAD" | node "$AI_JOB_AGENT_ROOT/scripts/send-cold-email.js"
   ```

5. Parse the JSON output. `ok: true` + a `messageId` + `sentAt` means it went.

### Step 7 — Log

Append one row to `$AI_JOB_AGENT_ROOT/outreach-log.csv`:

| column | value |
|--------|-------|
| `sent_at` | `sentAt` from the script output |
| `company` | target company |
| `role` | role you're pitching for (often "Intern — Substation Engineering") |
| `to_name` | full name |
| `to_email` | email |
| `to_title` | their title at the company |
| `to_linkedin` | LinkedIn URL if used |
| `subject` | subject line |
| `body_file` | relative path to the saved body file |
| `message_id` | `messageId` from the script output |
| `status` | `sent` |
| `replied_at` | empty |
| `follow_up_count` | `0` |
| `last_follow_up_at` | empty |
| `notes` | 1-line summary of the personalization hook (useful for follow-up) |

### Step 8 — Confirm and suggest next

Print:

| Field | Value |
|-------|-------|
| ✉️ To | `Paul Young <paul.young@gft.com>` |
| 📝 Subject | `…` |
| 🔗 Message-ID | `<…>` |
| ⏱️ Sent | `2026-04-22T23:11:00Z` |
| 💾 Body saved to | `outreach/2026-04-22-gft-paul-young.txt` |
| 📒 Logged | `outreach-log.csv` (row N) |

Then nudge: *"Want me to draft another for a different person at the same company?"* — don't auto-do, wait.

## Safety rails

- **Never send without the explicit `send` confirmation after seeing the draft, AND a second `y` after the dry-run preview.** Two gates.
- **Never lie about credentials, projects, or authorization.** If the profile says "F-1 CPT-eligible, no current sponsorship needed," don't write "authorized to work with no restrictions."
- **If the subject line needs a company name, verify the spelling from the research sources** — "Worley" vs "Worleyparsons" is a cold-email dealbreaker.
- **If the email address was guessed (not verified in research), flag it clearly to the user** before sending.
- **Do not send more than 1 email to the same `to_email` in the same day** — check the log before sending.

## Related skills

- `/job-followup` — day-7 follow-up checker for rows in `outreach-log.csv` that haven't replied.
- `/job-track` — the Google-Sheet–backed *application* tracker (a different file; formal ATS applications).
