# Contributing to AI Job Agent

Thanks for your interest in contributing! This project was built to help job seekers automate the tedious parts of applying, and contributions make it better for everyone.

## Project conventions

Before writing code or skill prompts, read these:

- **Zero deps where possible.** The `dashboard`, `mirror-tracker`, `generate-tailored-cv`, `send-cold-email`, and the 5 ATS scripts all run on stdlib + Playwright (the only npm dependency). Don't add a dep unless there's no way around it. The TUI dashboard is pure ANSI + Unicode box chars on purpose.
- **All skills follow the gstack "Proactively invoke" trigger pattern.** Every `SKILL.md`'s YAML `description` ends with: `"Proactively invoke this skill (do NOT answer conversationally) when the user says X / Y / Z, or invokes /skill-name."` — this is what makes Claude Code dispatch on natural speech. Keep the trigger list specific and exhaustive.
- **ANSI for terminal output, never raw escapes inline.** `scripts/job-dashboard.mjs` defines a single `ANSI` object near the top. Use `color(ANSI.red, "text")`. Don't paste `\x1b[31m` strings throughout.
- **`fs.watch` for live reload.** When a script needs to re-render on CSV changes (`mirror-tracker.mjs --watch`, `job-dashboard.mjs` interactive mode), use `fs.watch` with a 250ms debounce. Don't poll.
- **Two-gate approval for any send/submit.** `/job-apply`, `/job-outreach`, `/job-followup`, `/job-status` all show a preview, ask "approve?", then send. Even after approval, the underlying scripts respect `--dry-run` / `autoSubmit: false`. Don't ship a skill or script that bypasses both gates.
- **CSVs are the source of truth.** Markdown mirror, Google Sheet, dashboard, reports — all are derived from `application-tracker.csv` + `outreach-log.csv`. Never write to derived artifacts as primary; always update the CSV first.
- **Status emojis are consistent.** `STATUS_EMOJI` is duplicated in `job-dashboard.mjs` and `mirror-tracker.mjs`. If you change one, change both. Same goes for the urgency icons (`overdue` = 🚨, `due` = ⏰, `soon` = 👀, `waiting` = 💤).

## How to Contribute

### Report Bugs
- Open an issue with the ATS platform name, what happened, and what you expected
- Include the error output if possible (redact any personal info)
- Attach the relevant rows from `application-tracker.csv` if a tracker bug; redact company / URL

### Add a New ATS Platform (Workday, iCIMS, SuccessFactors, etc.)

1. **Use `scripts/greenhouse-apply.js` as the template** — it has the cleanest single-page form pattern. For multi-step Workday-style forms, model on `scripts/linkedin-easy-apply.js` instead.
2. **Match the conventions:**
   - Connect via CDP (`connectOverCDP`) when `CDP_URL` is set; else launch headless via Playwright
   - Use `headless: !!process.env.HEADLESS && process.env.HEADLESS !== '0'` (defaults to headless)
   - Read config from `argv[3]` (JSON path) — not env vars
   - Write JSON to stdout per step (`stage: 'navigate' | 'fill' | 'submit'`) so the agent can pipe and parse
   - Exit codes: `0` = ok, `1` = crash, `2` = blocked-on-unknown-required-field (output the field details), `3` = captcha/submission-timeout, `4` = step-limit-exceeded (multi-step only)
3. **Wire into `/job-apply`:** edit `skills/job-apply/SKILL.md` and add the URL host pattern to its routing table.
4. **Add an npm script shortcut** in `package.json` (optional but useful for direct CLI calls).
5. **Test with a real job listing** in dry-run mode (autoSubmit: false). Include the JSON output in the PR description.
6. **Update docs:** add the platform to `README.md`'s Supported Platforms table and `docs/ARCHITECTURE.md`.

### Add a New Bundled Skill

1. **Copy any existing `SKILL.md` as a starting template.** Good candidates:
   - Workflow + verb skill: `skills/job-cv/SKILL.md`
   - Diagnostic / read-only: `skills/job-patterns/SKILL.md`
   - Orchestrator-style: `skills/job-coach/SKILL.md`
2. **Set the YAML frontmatter:**
   - `name`: kebab-case skill name (matches the directory)
   - `description`: end with the **"Proactively invoke this skill (do NOT answer conversationally) when..."** trigger sentence
   - `argument-hint`: one-line example of args
   - `allowed-tools`: only the tools the skill actually needs (Bash, Read, Write, WebFetch, etc.)
3. **Register it in the install script:** open `skills/install.sh` and add the new directory name to the `BUNDLED` array (preserve the order: `job-coach` and `job-setup` first, then verb skills in roughly the order they're invoked).
4. **Add it to the docs:**
   - `README.md` skills table (group by purpose)
   - `skills/README.md` bundled-skills table
   - `CLAUDE.md` skills table
   - `docs/ARCHITECTURE.md` if it has a notable role in the data flow
5. **Reinstall locally to test:** `bash skills/install.sh` is idempotent.

### Improve Form Filling Logic

The LinkedIn Easy Apply helper (`scripts/linkedin-easy-apply.js`) has the most sophisticated form-filling logic. Key areas for improvement:
- New dropdown question patterns in `pickOption()`
- New text field patterns in `fillTextForQuestion()`
- Better handling of multi-step forms
- Country-specific adaptations (see `docs/CUSTOMIZATION.md`)

### Internationalization

The toolkit was built for US job searching. To adapt for other countries:
- Add country-specific answer patterns (e.g., Indian work authorization options)
- Add support for local job boards
- Translate dropdown matching patterns
- For non-English cold-email regions (Russian / Uzbek / etc.), see `docs/CUSTOMIZATION.md` Localizing `/job-outreach` section
- See `docs/CUSTOMIZATION.md` for the full guide

## Development Setup

```bash
git clone https://github.com/AkbarDevop/ai-job-agent.git
cd ai-job-agent
npm install
pip install -r requirements.txt  # optional, for cookie import
bash skills/install.sh           # symlink the 13 bundled skills into ~/.claude/skills/
```

To uninstall later: `bash skills/install.sh --uninstall`.

## Pre-PR checklist

Run both health checks locally before opening a PR:

```bash
npm run smoke    # fresh-install smoke test in a sandboxed $HOME
npm run doctor   # health check on your real environment
```

`npm run smoke` exercises every script that doesn't need real network/credentials. Exits 0 on full pass. CI-safe.

`npm run doctor` inspects your real toolchain (node, npm, python3, gcloud, msmtp, tmux, Playwright Chromium), repo paths, personal config (linkedin-config.json shape, candidate-profile sections, resume PDF, application-tracker.csv header, outreach-log.csv), cold email plumbing (`~/.msmtprc` exists, chmod 600, parses), Google Sheets auth, and skill files (YAML frontmatter, "Proactively invoke" trigger). Exits 0 if no FAILs, 1 otherwise.

If `npm run smoke` or `npm run doctor` fail, fix the issue and re-run before pushing.

## Code Style

- **JavaScript:** prefer ESM (`.mjs`) for new scripts, CommonJS (`.js`) only when matching existing scripts (the 5 ATS fillers use CommonJS). async/await for Playwright.
- **Python:** stdlib only where possible, Python 3.10+. No external deps in `requirements.txt` unless absolutely necessary.
- **Bash:** `set -eu` at the top, quote all variables, prefer absolute paths.
- **Self-contained scripts:** each script should work independently. The dashboard reads CSVs without going through any other script. The mirror script reads CSVs without going through the dashboard. Etc.
- **No emojis in code or docs unless the user explicitly asks.** Status emojis in CSV / dashboard output are an exception (the user wants them).
- **Comment non-obvious form-filling patterns** with what they match.

## Pull Request Process

1. Fork the repo and create a branch from `main` (e.g. `feat/workday-support`, `fix/header-injection`).
2. Make your changes.
3. Test with at least one real job listing (dry-run mode if available).
4. Run `npm run smoke && npm run doctor` and confirm both pass.
5. Update `README.md`, `CLAUDE.md`, and `skills/README.md` if you added a new feature, skill, or ATS.
6. Open a PR with a clear description of what changed and why. Reference any related issue.

### Git conventions

- Branch from `main`, PR back to `main`. No rebase merges; squash-and-merge is fine for small PRs.
- Standing rule for Akbar's other projects: **never use Vercel; always Netlify.** Doesn't apply to this OSS repo (it has no deploy target — it's a CLI tool), but if you fork this for a derivative web project, prefer Netlify.

### Commit messages

Match the existing style (see `git log --oneline`):

- One-line summary, lowercase verb, no trailing period
- For multi-skill changes, group by version (`v1.2: ...`)
- Examples: `"job-dashboard: 5th tab Reports + artifact counter"`, `"v1.2: 4 new skills + scoring rubric + tracker mirror + doctor"`, `"Threaded follow-ups + header-injection fix"`

## Code of Conduct

Be kind. We're all just trying to find jobs.
