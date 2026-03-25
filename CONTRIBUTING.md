# Contributing to AI Job Agent

Thanks for your interest in contributing! This project was built to help job seekers automate the tedious parts of applying, and contributions make it better for everyone.

## How to Contribute

### Report Bugs
- Open an issue with the ATS platform name, what happened, and what you expected
- Include the error output if possible (redact any personal info)

### Add ATS Support
Want to add support for a new ATS (e.g., Workday, iCIMS, SmartRecruiters)?
1. Use an existing script (e.g., `scripts/greenhouse-apply.js`) as a template
2. Follow the same pattern: connect via CDP or launch headless, fill fields, handle captcha gracefully
3. Add the new script to `scripts/`, update `README.md` and `CLAUDE.md`

### Improve Form Filling Logic
The LinkedIn Easy Apply helper (`scripts/linkedin-easy-apply.js`) has the most sophisticated form-filling logic. Key areas for improvement:
- New dropdown question patterns in `pickOption()`
- New text field patterns in `fillTextForQuestion()`
- Better handling of multi-step forms
- Country-specific adaptations (see Customization below)

### Internationalization
The toolkit was built for US job searching. To adapt for other countries:
- Add country-specific answer patterns (e.g., Indian work authorization options)
- Add support for local job boards
- Translate dropdown matching patterns
- See `docs/CUSTOMIZATION.md` for the full guide

## Development Setup

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
npm install
pip install -r requirements.txt  # optional, for cookie import
```

## Code Style

- JavaScript: Node.js CommonJS (`require`), async/await for Playwright
- Python: stdlib only where possible, Python 3.8+
- Keep scripts self-contained — each script should work independently
- Comment non-obvious form-filling patterns with what they match

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test with at least one real job listing (dry-run mode if available)
4. Update README.md if you added new features
5. Open a PR with a clear description of what changed and why

## Code of Conduct

Be kind. We're all just trying to find jobs.
