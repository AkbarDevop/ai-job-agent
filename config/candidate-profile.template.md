## Job Search Agent Handoff

Last updated: YYYY-MM-DD

### Candidate

- Name: YOUR_NAME
- Email: YOUR_EMAIL
- Phone: YOUR_PHONE
- Current location: YOUR_CITY, YOUR_STATE
- Mailing address: YOUR_ADDRESS
- LinkedIn: YOUR_LINKEDIN
- GitHub: YOUR_GITHUB
- Personal website / portfolio: YOUR_WEBSITE
- School: YOUR_UNIVERSITY
- Degree: YOUR_DEGREE
- Expected graduation: YOUR_GRADUATION_DATE
- GPA: YOUR_GPA / 4.000
- Citizenship: YOUR_CITIZENSHIP
- U.S. citizen: Yes/No
- Visa status: YOUR_VISA_STATUS (e.g., F-1 student visa, H-1B, N/A for citizens)
- Internship work authorization path: YOUR_AUTH_PATH (e.g., CPT / OPT, N/A)
- Authorized to work in the United States: Yes/No
- Unrestricted right to work in the United States: Yes/No
- Sponsorship rule:
  - internship-only forms: Yes/No
  - forms that ask `now or in the future` for general ongoing U.S. employment: Yes/No
- Willing to relocate: Yes/No
- Willing to work on-site: Yes/No
- Willing to travel: Yes, up to ____%
- Driver's license: Yes/No
- EEO defaults: gender YOUR_GENDER, race YOUR_RACE, veteran Yes/No, disability Yes/No
- Desired compensation: YOUR_COMPENSATION_RANGE

### Resume files

- General: `/path/to/your/general-resume.pdf`
- Variant 1: `/path/to/your/variant-resume.pdf`
- Transcript: `/path/to/your/transcript.pdf`

### Cover letters

- Template: `/path/to/your/cover-letter-template.tex`

### Search preferences

- Keep the search broad across technical roles (customize this section).
- Include roles you are qualified for even if you lack direct experience.
- Specify any constraints (location, visa, start dates, etc.).
- Specify whether co-ops or part-time roles are acceptable.

### Application rules

- Prefer truthful, submittable applications over aggressive volume.
- Skip hard U.S.-person / citizen / green-card gated roles unless the form provides a truthful path for your actual status.
- Use the appropriate resume variant for each role type.
- After submission, update:
  - local tracker: `application-tracker.csv`
  - daily log: `submitted-applications-YYYY-MM-DD.md`
  - Google Sheet tracker
- If a form stalls behind hCaptcha or reCAPTCHA, solve the captcha manually.
- Use a headless background browser by default.
- Do not open visible Chrome windows unless manual interaction is required.

### Tracking

- Local tracker: `application-tracker.csv`
- Google Sheet ID: YOUR_SHEET_ID
- Google Sheet name: YOUR_SHEET_NAME
- Scripts:
  - Google Sheet sync: `scripts/google-sheet-sync.py`
  - Tracker status updater: `scripts/tracker-status-update.py`
  - LinkedIn Easy Apply helper: `scripts/linkedin-easy-apply.js`
  - LinkedIn config: `config/linkedin-config.json`
  - Lever helper: `scripts/lever-apply.js`
  - Greenhouse helper: `scripts/greenhouse-apply.js`
  - Jobvite helper: `scripts/jobvite-apply.js`
  - Ashby helper: `scripts/ashby-apply.js`
  - Outlook triage: `scripts/outlook-triage.js`
  - Outlook send: `scripts/outlook-send.js`

### Known issues / cautions

- LinkedIn Easy Apply in headless mode works by importing cookies from your Chrome profile.
- Outlook cookie reuse is weaker than LinkedIn cookie reuse; sessions may expire.
- Some Greenhouse and Lever forms stall at invisible reCAPTCHA or hCaptcha. Log these as blocked honestly.

### Best next move for the next agent

- Describe what was done in the last session and what should happen next.
- List any pending manual applications.
- Note any recruiter outreach that needs follow-up.
