# Customization Guide

This toolkit is designed to be adapted to your specific situation. Here's how to customize it for different countries, roles, platforms, and workflows.

The 13 bundled skills (`/job-coach`, `/job-setup`, `/job-evaluate`, `/job-apply`, `/job-track`, `/job-triage`, `/job-status`, `/job-outreach`, `/job-followup`, `/job-dashboard`, `/job-cv`, `/job-interview`, `/job-patterns`) are all just markdown files at `skills/<name>/SKILL.md`. You can fork them, edit them, or override individual skills locally — see [Customizing Skills](#customizing-skills) below.

## Table of Contents

- [Customizing the Search Plan (`/job-coach`)](#customizing-the-search-plan-job-coach)
- [Different Countries](#different-countries)
- [Different Roles](#different-roles)
- [Different ATS Platforms](#different-ats-platforms)
- [Localizing `/job-outreach` for Non-English Regions](#localizing-job-outreach-for-non-english-regions)
- [Different Email Providers](#different-email-providers)
- [Different Job Boards](#different-job-boards)
- [Adding New Form Patterns](#adding-new-form-patterns)
- [Custom Tracking Workflows](#custom-tracking-workflows)
- [Customizing Skills](#customizing-skills)
- [Customizing the A-G Rubric (`/job-evaluate`)](#customizing-the-a-g-rubric-job-evaluate)
- [Customizing the Tailored CV (`/job-cv`)](#customizing-the-tailored-cv-job-cv)

## Customizing the Search Plan (`/job-coach`)

`config/search-plan.md` is `/job-coach`'s working brief — target tiers, geography, timeline, comp floor, log of decisions. It's written by the intake interview and refreshed every time you run `/job-coach`. To override coach decisions, edit the file directly.

### Adjusting target tiers

Open `config/search-plan.md` and edit the company lists:

```markdown
### Tier 1 (apply to every opening)
- Ameren
- Evergy
- Xcel Energy
- ERIELL (UZ)

### Tier 2 (apply if fit is strong)
- Spire Energy
- TotalEnergies (UZ branch)

### Hard no (skip always)
- Defense / weapons companies
- Companies that previously rejected you twice
```

`/job-evaluate` reads this list and bumps Block A (role match) when a posting is at a Tier 1 company. `/job-patterns` Signal E groups outreach response rates by tier.

### Adjusting comp floor

Set `Comp floor` under "Compensation + constraints". Block D in `/job-evaluate` and `/job-coach`'s slate-scoring will use this number to score postings.

### Adjusting hard nos and never-apply patterns

Add to "Hard no" or "Other constraints" — coach reads these and skips matching roles in the slate.

### Plan version + log

The plan file has a `Log` section. Coach appends a one-liner per session ("YYYY-MM-DD: rejected from X, removed from Tier 2"). Useful as a paper trail — diff the file in git (it's gitignored, so use a private branch if you want history).

## Different Countries

### Phone Country Code

In `config/linkedin-config.json`, change the phone-related fields:

```json
{
  "phone": "+44 7911 123456",
  "phoneNational": "7911123456",
  "phoneCountryLabel": "United Kingdom (+44)"
}
```

The `phoneCountryLabel` must match the exact text that LinkedIn shows in its dropdown.

### Location

Update `location` and `city`:

```json
{
  "location": "London, England",
  "city": "London",
  "state": "England",
  "country": "United Kingdom",
  "postalCode": "SW1A 1AA"
}
```

### Work Authorization (Non-US)

The auto-answer engine in `linkedin-easy-apply.js` has US-centric defaults. For other countries:

1. Edit the `pickOption` function to match your country's authorization questions
2. Update work authorization answers in your config
3. Adjust the sponsorship answers

For example, for UK candidates:

```json
{
  "authorizedToWork": "Yes",
  "requireCurrentSponsorship": "No",
  "requireFutureSponsorship": "No",
  "visaStatus": "Tier 4 Student Visa"
}
```

### EU / India / Other Markets

The LinkedIn Easy Apply script works globally since LinkedIn's form structure is consistent. ATS scripts (Greenhouse, Lever, etc.) also work globally since those platforms serve international companies.

Key things to customize:
- EEO fields may not appear in non-US applications
- Salary expectations and currency
- Degree naming (e.g., "B.Tech" vs "Bachelor of Science")
- Date formats in the tracker

## Different Roles

### Resume Variants

Create multiple resume versions and select the right one per role. In your answer bank:

```markdown
### Resume selection
- Software / AI roles: `/path/to/software-resume.pdf`
- Product management: `/path/to/pm-resume.pdf`
- Design roles: `/path/to/design-resume.pdf`
- General fallback: `/path/to/general-resume.pdf`
```

### Auto-Answer Customization

The `fillTextForQuestion` function in `linkedin-easy-apply.js` returns answers based on question patterns. Customize for your field:

```javascript
// Example: If you're a business major
if (q.includes('field of study') || q.includes('major')) return 'Business Administration';

// Example: If you have 3 years of experience
if (q.includes('how many years')) return '3';
```

### Short Pitches

Update the pitch text in your answer bank for each role type. These are used for open-ended text fields on applications.

## Different ATS Platforms

### Adding a New ATS (Workday, iCIMS, etc.)

`/job-apply` routes by URL host. To add a new ATS, you'll do two things:

1. Write a new `scripts/<platform>-apply.js` script
2. Wire it into `/job-apply`'s URL routing in `skills/job-apply/SKILL.md`

**Step 1.** Use `scripts/greenhouse-apply.js` as the template — it has the cleanest single-page form pattern. Each ATS script follows:

1. **Navigate** to the application page
2. **Fill** form fields using the config
3. **Detect** missing required fields (return list, don't crash)
4. **Submit** (if `autoSubmit: true` and no missing fields)
5. **Monitor** for confirmation
6. **Exit** with one of the conventional codes: `0` ok, `1` crash, `2` blocked-on-unknown, `3` captcha-timeout

```javascript
// scripts/new-ats-apply.js
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function fillForm(page) {
  // Upload resume
  await page.locator('input[type="file"]').setInputFiles(config.resumePath);

  // Fill text fields
  for (const field of config.textValues || []) {
    await page.locator(`#${field.id}`).fill(field.value);
  }

  // Check for missing required fields
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('[required]')]
      .filter(el => !el.value)
      .map(el => el.id || el.name)
  );

  return missing;
}
```

**Step 2.** Open `skills/job-apply/SKILL.md` and add the URL host pattern to the routing table near the top. Add an entry to `package.json` if you want a direct CLI shortcut (`"my-ats": "node scripts/my-ats-apply.js"`).

### Workday

Workday is notably difficult to automate because:
- Each company has a custom Workday instance
- Forms are highly dynamic (React-based)
- Many require account creation

The Proficiently `/apply` skill has some Workday support. For manual automation, use the CDP approach (connecting to an existing Chrome session where you're logged in).

### iCIMS / SuccessFactors / Taleo

These legacy ATS platforms often require:
- Account creation before applying
- Multi-page form flows with server-side validation
- CAPTCHA on every page

Recommended approach: Use the CDP connection pattern from the Lever script:

```bash
# Start Chrome with debugging
google-chrome --remote-debugging-port=9223

# Connect your script
CDP_URL=http://127.0.0.1:9223 node scripts/lever-apply.js "https://..." config.json
```

## Localizing `/job-outreach` for Non-English Regions

`/job-outreach` is the cold-email skill. It does the LLM work in-chat (Claude itself drafts the email — no external LLM API), so localization is a matter of telling Claude what language and tone to use. Two paths:

### Path A — Set a default in `candidate-profile.md`

Add a section to your `config/candidate-profile.md`:

```markdown
## Outreach style preferences

- **Default language:** English
- **Russian/Uzbek for:** any UZ company (ERIELL, Worley UZ, Siemens Energy UZ, Masdar Astana branch, EBRD, ADB, Toshkent Davlat...). Russian first if recipient looks Russian-named; switch to Uzbek for Uzbek-named recipients in Tashkent.
- **Tone:** warm but specific. Mention a concrete project the recipient worked on. End with a one-sentence ask.
- **Sign-off:** my name in target language ("Akbarjon" in Uzbek/Russian, "Akbar" in English)
- **Localization tip for UZ:** lead with university connection (Mizzou EE) — "I'm an EE student at the University of Missouri" reads more credibly than "I'm a student in Uzbekistan from a US university"
```

`/job-outreach` reads this section before drafting and adapts. The agent will narrate in chat: *"Recipient looks Uzbek-named; drafting in Uzbek. Confirm before send."*

### Path B — Per-call override

Just say it in chat:

```
> /job-outreach "Zulfiya Vafaeva at Worley Uzbekistan" — write it in Russian, she replied in Uzbek last time so she's bilingual but Russian is more formal for an HR director
```

`/job-outreach` will use that and log the language to the `notes` column of `outreach-log.csv` for future reference.

### Multi-language follow-ups

`/job-followup` reads the language from the original outreach (logged in `outreach-log.csv` `notes` if you set Path A or B). Keeps the thread consistent — won't switch from Russian to English mid-thread.

### Adding a new language

For languages where Claude's drafting may be weak (Uzbek, Kazakh, Turkmen, etc.), add a "Reference phrases" sub-section to `candidate-profile.md`:

```markdown
## Outreach reference phrases — Uzbek

- "Hurmatli Zulfiya opa" — formal greeting to a woman senior in age
- "Sizning kompaniyangizda IT bo'limida ish izlayman" — "I'm looking for work in your IT department"
- "Vaqtingiz uchun rahmat" — closing thanks
- Avoid: "salom" (too casual for a hiring manager)
```

Claude will pull from this file before drafting. Real example: when Akbar's outreach to Worley UZ landed in Uzbek, the recipient replied in Uzbek with HR contact info — proper localization is a 10x multiplier on response rate in non-English markets.

## Different Email Providers

### Gmail

The Outlook scripts are specific to Outlook Web. For Gmail:

1. **Gmail API approach** (recommended): Use the Gmail API with OAuth2
2. **Browser automation approach**: Adapt `outlook-triage.js` for Gmail's DOM structure

Key differences:
- Gmail's compose window uses different aria labels
- Search interface is different
- Mark as read/unread uses different buttons

### Custom Email Triage

To adapt `outlook-triage.js` for another webmail client:

1. Update the search box selector
2. Update the message list selector (`[role="option"]`)
3. Update the read/unread button names
4. Update the compose form selectors in `outlook-send.js`

## Different Job Boards

### Indeed

Use `python-jobspy` for Indeed scraping:

```python
from jobspy import scrape_jobs

jobs = scrape_jobs(
    site_name=["indeed"],
    search_term="software engineer intern",
    location="United States",
    results_wanted=100,
    hours_old=24,
)
```

### Glassdoor / ZipRecruiter

Also supported by `python-jobspy`:

```python
jobs = scrape_jobs(
    site_name=["indeed", "glassdoor", "zip_recruiter"],
    search_term="your search term",
    location="your location",
)
```

### Handshake (College Students)

Handshake doesn't have a public API but can be automated via browser:
1. Start Chrome with debugging enabled
2. Log into Handshake
3. Use Playwright's CDP connection to automate searches

## Adding New Form Patterns

### LinkedIn Easy Apply

The auto-answer engine uses pattern matching. To add a new pattern:

1. Open `scripts/linkedin-easy-apply.js`
2. Find the `pickOption` function (for dropdowns) or `fillTextForQuestion` (for text fields)
3. Add your pattern:

```javascript
// In pickOption:
if (q.includes('your new question pattern')) {
  return exact('Your Answer') || contains('partial match');
}

// In fillTextForQuestion:
if (q.includes('your new question pattern')) return 'Your text answer';
```

### Debugging Unknown Questions

When the script exits with code 2 (blocked), the output includes the unknown fields:

```json
{
  "stage": "blocked",
  "unknown": [
    {
      "id": "some-field-id",
      "type": "select-one",
      "text": "What is your preferred work arrangement?"
    }
  ]
}
```

Use this information to add the right pattern to the auto-answer engine.

## Custom Tracking Workflows

### Using Notion Instead of Google Sheets

Replace `scripts/google-sheet-sync.py` with a Notion API integration:

```python
import requests

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
DATABASE_ID = os.environ["NOTION_DATABASE_ID"]

def append_to_notion(rows):
    for row in rows:
        requests.post(
            "https://api.notion.com/v1/pages",
            headers={
                "Authorization": f"Bearer {NOTION_TOKEN}",
                "Notion-Version": "2022-06-28",
            },
            json={
                "parent": {"database_id": DATABASE_ID},
                "properties": {
                    "Company": {"title": [{"text": {"content": row["company"]}}]},
                    "Role": {"rich_text": [{"text": {"content": row["role"]}}]},
                    "Status": {"select": {"name": row["status"]}},
                    # ... more properties
                }
            }
        )
```

### Using Airtable

Similar approach using the Airtable API.

### Adding Status Notifications

Send yourself a Slack or Telegram notification when applications are submitted:

```bash
# After each submission, call a webhook
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-type: application/json' \
  -d "{\"text\": \"Applied to $COMPANY - $ROLE via $PLATFORM\"}"
```

## Customizing Skills

Each of the 13 bundled skills (`/job-coach`, `/job-setup`, `/job-evaluate`, `/job-apply`, `/job-track`, `/job-triage`, `/job-status`, `/job-outreach`, `/job-followup`, `/job-dashboard`, `/job-cv`, `/job-interview`, `/job-patterns`) is just a markdown file at `skills/<name>/SKILL.md`. To customize:

1. Open `skills/<skill-name>/SKILL.md`
2. Edit the prompt — the YAML frontmatter (name, description, allowed-tools), the workflow, the tables, the rules
3. Re-run `bash skills/install.sh` (idempotent — refreshes symlinks)
4. Test in a fresh Claude Code session

Common customizations:

- **Tighten the trigger phrases:** edit the `description` field in the YAML frontmatter — the "Proactively invoke this skill when..." sentence. Add your own phrasing.
- **Skip the approval gate** (NOT recommended — both gates exist for safety): remove the "User approves" steps from the SKILL.md workflow.
- **Change the output format:** the SKILL.md tells Claude exactly which markdown tables to render. Reorder, rename, or expand them as you like.

To add a new bundled skill, copy any `SKILL.md` as a starting template, add the directory name to the `BUNDLED` array in `skills/install.sh`, document it in `skills/README.md` and `README.md`. See `CONTRIBUTING.md` for the full procedure.

## Customizing the A-G Rubric (`/job-evaluate`)

`/job-evaluate` and `/job-coach` both use the 7-block A-G rubric (Role / CV / Level / Comp / Personalization / Interview / Legitimacy). To re-weight:

1. Open `skills/job-coach/SKILL.md`, find the "Step 4 — Present the slate" section, edit the block table (the column descriptions and what 5/5 looks like).
2. Open `skills/job-evaluate/SKILL.md`, find "Step 2 — Score across A-G blocks" and update the block-by-block scoring guidance.
3. The headline fit is `total ÷ 7`. To change the threshold for "auto-chain into /job-cv" (currently 4.0/5.0), edit the rule in `skills/job-evaluate/SKILL.md` Step 5.

If you want a different rubric entirely (e.g. you're not in tech and the "leetcode/Glassdoor signal" block doesn't apply), rewrite the table block-by-block — Claude will follow the new rubric as written.

## Customizing the Tailored CV (`/job-cv`)

The PDF is rendered by `scripts/generate-tailored-cv.mjs` via headless Chromium. The default CSS is one-column serif — ATS-tested. To change visual style:

1. Open `scripts/generate-tailored-cv.mjs`. Find the `defaultCSS` constant.
2. Edit fonts / sizes / spacing. **Don't add icons, multi-column layouts, or background colors** — ATS parsers choke on those.
3. Test by piping a JSON payload manually:

```bash
echo '{"cv": "# Test\n## Section\n- bullet", "outputPath": "/tmp/test.pdf", "title": "Test"}' \
  | node scripts/generate-tailored-cv.mjs
open /tmp/test.pdf
```

To change paper size globally, set `format: 'a4'` in `skills/job-cv/SKILL.md` Step 7's payload (the skill currently defaults to `letter` and switches to `a4` for EU roles automatically).

To preserve a specific section across all tailored versions (e.g. you always want a "Languages" block at the top regardless of JD), add a `## Always include` section to your `cv.md` and document it in the rules in `skills/job-cv/SKILL.md`.
