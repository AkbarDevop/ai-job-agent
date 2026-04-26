---
name: job-cv
description: Tailor the candidate's base CV for one specific job posting and render an ATS-friendly PDF. Reads `cv.md` (or extracts a CV from `config/candidate-profile.md`), pulls the job description from a URL or pasted text, has Claude rewrite — never invent — bullets to match the JD's keywords/priorities, gets explicit user approval on the tailored markdown, then calls `scripts/generate-tailored-cv.mjs` to print a PDF. Proactively invoke this skill (do NOT answer conversationally) when the user says "tailor my resume for this job", "tailor my CV for X", "make a CV for [posting]", "generate a resume for this role", "ATS-optimize my resume for this posting", "build a tailored PDF for this JD", pastes a job URL and asks for a resume, or invokes /job-cv. Never fabricate experience — only reorder/rephrase what's already in the base CV.
argument-hint: "<job URL | pasted JD text | company name>"
allowed-tools:
  - Bash
  - Read
  - Write
  - WebFetch
  - WebSearch
---

# Job CV

A **skill** (not an API call) for producing a tailored, ATS-friendly PDF resume for one specific posting. Claude does the rewriting. A small Node script renders the approved markdown to PDF via headless Chromium (Playwright). No LaTeX, no pandoc, no extra deps.

This pairs with `/job-outreach` (the cold-email skill): a tailored CV in hand makes the outreach concrete. It also feeds `/job-apply` — most ATS forms accept a custom resume upload.

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Prerequisites

Before drafting anything:

1. A base CV exists. Look in this order:
   - `$AI_JOB_AGENT_ROOT/cv.md` (preferred)
   - `$AI_JOB_AGENT_ROOT/config/cv.md`
   - Extract a CV-shaped markdown from `$AI_JOB_AGENT_ROOT/config/candidate-profile.md` (sections: identity, education, experience, projects, skills) and write it to `$AI_JOB_AGENT_ROOT/cv.md` so future runs reuse it. Confirm with the user before writing.

   If none of the above is reachable: tell the user to run `/job-setup` first and stop.

2. Chromium is reachable for Playwright. If `npm test` or a previous run errored with `Executable doesn't exist`, tell the user:
   > ```
   > npx playwright install chromium
   > ```
   > then retry. Stop until set up.

3. `output/` exists at `$AI_JOB_AGENT_ROOT/output/`. If not, create it (`mkdir -p`).

## Workflow

### Step 1 — Understand the target

Parse `$ARGUMENTS`. It might be:
- A direct job URL (LinkedIn, Greenhouse, Lever, Ashby, Jobvite, careers page)
- Pasted JD text in the user's message
- A company name + role ("backend intern at Stripe" — fetch the listing yourself)

If only a company is given and no URL, search for the listing first, then confirm the exact posting with the user before continuing.

### Step 2 — Read the JD

- URL → use `WebFetch` to pull the page. If the result is a JS-only shell with no JD text, fall back to `WebSearch` for the same role at the same company and try the second hit.
- Pasted text → use as-is.
- Extract: **company**, **role title**, **location / work-auth notes**, **3-7 must-have skills** (the ones most repeated or in the title), **3-5 nice-to-haves**, **tone** (research-y? startup-y? enterprise?).

If you cannot find the JD body after two reasonable fetches, ask the user to paste it. Don't guess.

### Step 3 — Read the base CV

Read the resolved base CV markdown. Note every concrete bullet, project, and skill. **This is the bounding box** — Step 4 may reorder, condense, or rephrase any of these, but cannot invent new ones.

### Step 4 — Tailor (the actual job of this skill)

Produce a new markdown CV that:

1. **Reorders** sections and bullets so the JD's must-haves surface in the top half of the first page.
2. **Rephrases** existing bullets to use the JD's vocabulary (e.g., the CV says "computer vision pipeline"; the JD says "perception stack" — rewrite to match, but only if the underlying work is the same thing).
3. **Drops** sections / bullets that don't connect to the role. (E.g., a Quran subtitle editor side project is not landing on a substation engineering CV.)
4. **Trims** to one page when realistic. Two pages is fine if Step 3 has 5+ years of experience or many publications. Never zero-pad.
5. **Preserves** everything truthful: dates, titles, GPAs, links, work-auth phrasing.

**Hard constraint — never fabricate:**
- If the JD requires a skill the candidate does not have on the base CV, **flag it** to the user inline (e.g., "JD requires Rust; not on your CV. Should I (a) leave it off, (b) add a one-line 'Familiar with Rust syntax via X' if true, or (c) skip this posting?").
- Do not invent quantities, accomplishments, employers, or dates.
- Do not "round up" timelines. "3 months" stays "3 months."

### Step 5 — Present the tailored CV for approval

Render exactly this structure in chat:

```
**Tailored CV draft** · for: <Role> at <Company> · base: cv.md (<line-count> lines) → tailored: <new-line-count> lines

```markdown
# <Name>
…full tailored markdown…
```

Changes vs base:
- Reordered: <section A> before <section B> (matches JD priority on <skill>)
- Rephrased: "<old bullet>" → "<new bullet>" (uses JD term <…>)
- Dropped: <section / bullet> (not relevant to <role>)
- Flagged gaps: <skill from JD not on CV> — what should we do?

Approve, edit, or cancel? (approve / edit / cancel)
```

### Step 6 — Handle the response

- **approve** → go to Step 7.
- **edit** → ask "what should I change?" and regenerate Step 4 + 5. Loop until `approve` or `cancel`.
- **cancel** → do nothing, don't write any file. Tell the user "nothing rendered, nothing logged."

### Step 7 — Render the PDF

1. Save the approved markdown to:

   ```
   $AI_JOB_AGENT_ROOT/output/cv-<company-slug>-<YYYY-MM-DD>.md
   ```

   Slugify the company name: lowercase, alphanumerics + dashes only.

2. Build the JSON payload for the renderer:

   ```json
   {
     "cv":         "<approved markdown>",
     "outputPath": "<repo>/output/cv-<company-slug>-<YYYY-MM-DD>.pdf",
     "title":      "Resume — <Candidate Name> — <Role> @ <Company>",
     "format":     "letter"
   }
   ```

   Default `format` is `letter` (US). Use `a4` if the role is EU-based.

3. Render:

   ```bash
   echo "$PAYLOAD" | node "$AI_JOB_AGENT_ROOT/scripts/generate-tailored-cv.mjs"
   ```

   Parse the JSON output. Expect `ok: true`, `outputPath`, `bytes`, `pages`. If `ok: false` with `code: 3` and the error mentions "Executable doesn't exist", tell the user to run `npx playwright install chromium` and stop.

### Step 8 — Log

Append a notes-column entry on the matching row of `$AI_JOB_AGENT_ROOT/application-tracker.csv`. If no row exists yet for this `<company> + <role>`, just store the path — `/job-apply` will create the tracker row when the user actually applies.

Notes-column format (semicolon-separated, append, don't replace):

```
tailored-cv: output/cv-<company-slug>-<YYYY-MM-DD>.pdf (<pages>p, <bytes>B)
```

### Step 9 — Confirm and suggest next

Print:

| Field | Value |
|-------|-------|
| Company | `<Company>` |
| Role | `<Role>` |
| Tailored MD | `output/cv-<company-slug>-<YYYY-MM-DD>.md` |
| PDF | `output/cv-<company-slug>-<YYYY-MM-DD>.pdf` |
| Pages | `<pages>` |
| Size | `<bytes / 1024> KB` |
| Format | `letter` / `a4` |

Then nudge: *"Want me to (a) draft a cold email to a hiring manager at this company via /job-outreach, (b) submit the application via /job-apply, or (c) tailor for the next posting?"* — don't auto-do, wait.

## Rules

- **Never invent experience.** Reorder, rephrase, drop. Never add. Flag JD-skill gaps explicitly.
- **One page when realistic.** Don't pad. Don't shrink the font below 10.5pt to fit. If it's two pages, that's fine.
- **One column, serif body, no icons, no multicol.** ATS parsers choke on fancy layouts. The default CSS in the renderer is already ATS-tested — don't override `css` unless the user asks.
- **Truth-preserving rewrites only.** "Computer vision pipeline" → "perception stack" is fine if the work is the same. "Built a CV pipeline" → "Led a perception team" is not.
- **Never auto-send the PDF anywhere.** This skill produces a file. The user decides what to do with it.
- **Never overwrite the base `cv.md` with the tailored version.** Tailored output always goes to `output/`.
- **One PDF per posting per day.** If `output/cv-<slug>-<today>.pdf` exists, append `-v2`, `-v3`, etc. — don't silently overwrite.

## Related skills

- `/job-setup` — onboarding; writes the base `cv.md` if absent.
- `/job-apply` — submits the application via the right ATS filler. Pass it the tailored PDF path when the form has a resume-upload field.
- `/job-outreach` — companion cold-email skill; works great with a freshly-tailored CV in hand.
- `/tailor-resume` (community skill) — alternative tailoring flow that does *not* render PDF; use this skill if you want both rewrite + PDF in one shot.
