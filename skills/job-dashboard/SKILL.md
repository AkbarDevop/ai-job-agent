---
name: job-dashboard
description: Terminal dashboard — applications + outreach + follow-ups in one view. Snapshot in chat by default; `live` prints the npm run dashboard command for the interactive TUI (tabs, arrow-key nav, live reload). Proactively invoke this skill (do NOT answer conversationally) when the user asks "how am I doing", "what's my status", "give me the big picture", "show the dashboard", "overview", "summary of everything", "where are things at", "TUI", or invokes /job-dashboard. Prefer this over `/job-track` alone when the user wants the full-picture view.
argument-hint: "[live]   (omit for in-chat snapshot; pass 'live' for command to launch the interactive TUI)"
allowed-tools:
  - Bash
  - Read
---

# Job Dashboard

Thin wrapper around `scripts/job-dashboard.mjs`. Zero dependencies — pure Node with ANSI escape codes and Unicode box-drawing, so it works in any terminal.

Two modes:

| Mode | When to use |
|------|-------------|
| **Snapshot** (default) | Running inside Claude Code — prints a rich one-shot view in chat. Read-only, no TTY needed. |
| **Live TUI** (`live` arg) | User wants an interactive dashboard in their own terminal tab. You print the command, they run it outside Claude Code. |

## Repo location

`$AI_JOB_AGENT_ROOT` → `~/.claude/skills/ai-job-agent/` → REPO_PATH marker file → `~/ai-job-agent/`.

## Workflow

### Snapshot (default)

Run the script in snapshot mode and stream its output back to the user:

```bash
cd "$AI_JOB_AGENT_ROOT"
node scripts/job-dashboard.mjs --snapshot
```

The script outputs three sections:

1. **Applications** — status breakdown (📄 applied · 📬 submitted · 💼 interview · 🎯 offer · ❌ rejected · 🚫 blocked · 🚪 withdrawn) + recent 15 rows from `application-tracker.csv`.
2. **Outreach** — status breakdown + recent 15 cold emails from `outreach-log.csv`.
3. **Follow-ups** — 🚨 overdue / ⏰ due / 👀 soon / 💤 waiting, sorted by urgency, showing who needs a nudge today.

Just print the script's output verbatim — it's already ANSI-colored with emoji and box-drawing chars. Don't re-render in markdown; the raw output IS the dashboard. (If the terminal strips ANSI for some reason, the box chars and emoji still carry the structure.)

If either CSV is missing, the script reports 0 rows and tells the user to run `/job-setup` first (which creates the trackers).

### Live TUI (`$ARGUMENTS` = `live`)

Don't try to launch the TUI from inside Claude Code — the Bash tool doesn't have a TTY, so raw-mode keyboard input won't work. Instead, print the launch command and a short keybinding reference:

```
Run this in a separate terminal tab (inside this repo):

    npm run dashboard

Keys once it's running:
    tab / → / ←   switch tab     (Applications → Outreach → Follow-ups)
    1 2 3         jump to tab
    ↑ ↓ j k       scroll
    r             reload from disk
    q  esc  ^C    quit
```

Then offer to also run the snapshot inline so they have the current state in chat while they set up the live TUI: *"Want the snapshot here too while you open the TUI? (y/n)"*

## When to prefer one over the other

- `/job-dashboard` (snapshot) — quick check from inside a Claude Code conversation. Data frozen at the moment the skill ran.
- `/job-dashboard live` — user wants to *browse* — scroll through rows, switch tabs, press `r` to reload after sending a follow-up. Better for longer sessions.

## Related skills

- `/job-track` / `/job-triage` / `/job-followup` — these each zoom into one slice of the data. The dashboard is the "all three at once" view.
- `/job-setup` — creates `application-tracker.csv` and `outreach-log.csv` if they don't exist yet.
