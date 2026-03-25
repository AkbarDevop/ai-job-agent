# Customization Guide

This toolkit is designed to be adapted to your specific situation. Here's how to customize it for different countries, roles, platforms, and workflows.

## Table of Contents

- [Different Countries](#different-countries)
- [Different Roles](#different-roles)
- [Different ATS Platforms](#different-ats-platforms)
- [Different Email Providers](#different-email-providers)
- [Different Job Boards](#different-job-boards)
- [Adding New Form Patterns](#adding-new-form-patterns)
- [Custom Tracking Workflows](#custom-tracking-workflows)

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

### Adding a New ATS

Each ATS script follows the same pattern:

1. **Navigate** to the application page
2. **Fill** form fields using the config
3. **Detect** missing required fields
4. **Submit** (if `autoSubmit: true`)
5. **Monitor** for confirmation

To add a new ATS:

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
