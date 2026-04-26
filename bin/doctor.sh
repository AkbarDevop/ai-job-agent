#!/usr/bin/env bash
#
# Health check / doctor for ai-job-agent.
#
# Different from bin/smoke-test.sh — that runs install.sh in a sandboxed HOME
# and exercises code paths. THIS script inspects the *real* user environment
# and surfaces every missing/broken/misconfigured piece a user might have:
#
#   - Toolchain (node, npm, python3, gcloud, msmtp, tmux, Playwright Chromium)
#   - Repo paths ($AI_JOB_AGENT_ROOT, ~/.claude/skills/ symlinks, node_modules)
#   - Personal config (linkedin-config.json shape, candidate-profile sections,
#     resume PDF on disk, application-tracker.csv header, outreach-log.csv)
#   - Cold email plumbing (~/.msmtprc exists, chmod 600, parses)
#   - Google Sheets (gcloud auth print-access-token, SPREADSHEET_ID)
#   - Skill files (YAML frontmatter, "Proactively invoke" trigger)
#
# Run: bash bin/doctor.sh   (or: npm run doctor)
# Exits 0 if no FAILs, 1 otherwise.

set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

# Track FAIL remediation hints for the final tail.
REMEDIATIONS=()

ok() {
  local name="$1"
  local detail="${2:-}"
  printf "  %-58s" "$name"
  echo -e "${GREEN}OK${NC}${detail:+ ${DIM}($detail)${NC}}"
  PASS=$((PASS + 1))
}

warn() {
  local name="$1"
  local reason="$2"
  printf "  %-58s" "$name"
  echo -e "${YELLOW}WARN${NC} ${DIM}($reason)${NC}"
  WARN=$((WARN + 1))
}

fail() {
  local name="$1"
  local reason="$2"
  local hint="${3:-}"
  printf "  %-58s" "$name"
  echo -e "${RED}FAIL${NC} ${DIM}($reason)${NC}"
  FAIL=$((FAIL + 1))
  if [ -n "$hint" ]; then
    REMEDIATIONS+=("$name: $hint")
  fi
}

# ---------- pre-flight ----------

TMP_DIR=$(mktemp -d /tmp/ajagent-doctor.XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

echo ""
echo -e "${BOLD}ai-job-agent doctor${NC}"
echo -e "${DIM}repo:  $REPO${NC}"
echo -e "${DIM}home:  $HOME${NC}"
echo ""

# ---------- 1. Toolchain ----------

echo -e "${BOLD}1. Toolchain${NC}"

if command -v node >/dev/null 2>&1; then
  NODE_V=$(node --version 2>/dev/null | sed 's/^v//')
  NODE_MAJOR=${NODE_V%%.*}
  if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
    ok "node >= 18.0.0" "v$NODE_V"
  else
    fail "node >= 18.0.0" "found v$NODE_V" "Install Node 18+ — https://nodejs.org or \`brew install node\`"
  fi
else
  fail "node installed" "not on PATH" "Install Node 18+ — https://nodejs.org or \`brew install node\`"
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm available" "$(npm --version 2>/dev/null)"
else
  fail "npm available" "not on PATH" "Comes with Node — reinstall Node from https://nodejs.org"
fi

if command -v python3 >/dev/null 2>&1; then
  ok "python3 available" "$(python3 --version 2>/dev/null | awk '{print $2}')"
else
  fail "python3 available" "not on PATH (needed for google-sheet-sync.py and tracker-status-update.py)" \
    "Install Python 3 — https://www.python.org or \`brew install python3\`"
fi

if command -v gcloud >/dev/null 2>&1; then
  ok "gcloud installed" "for Google Sheets sync"
else
  warn "gcloud installed" "missing — only needed for Google Sheets sync (\`/job-track sync\`)"
fi

if command -v msmtp >/dev/null 2>&1; then
  ok "msmtp installed" "for cold email"
else
  warn "msmtp installed" "missing — only needed for cold email (\`/job-outreach\`)"
fi

if command -v tmux >/dev/null 2>&1; then
  ok "tmux installed" "for unified \`npm run agent\`"
else
  warn "tmux installed" "missing — only needed for unified \`npm run agent\` mode"
fi

# Best-effort Playwright Chromium check. `playwright install --dry-run` prints
# something like "browser: chromium ... downloaded" if installed. We just look
# for any sign of chromium in the dry-run output. Skip silently if npx is gone.
if command -v npx >/dev/null 2>&1; then
  if (cd "$REPO" && npx --no-install playwright install --dry-run chromium >"$TMP_DIR/pw.out" 2>&1); then
    if grep -qi 'chromium' "$TMP_DIR/pw.out" 2>/dev/null; then
      # Check whether the dry-run says we still need to download.
      if grep -qiE 'will be downloaded|to install|missing' "$TMP_DIR/pw.out"; then
        warn "Playwright Chromium browsers" "not yet downloaded — run \`npx playwright install chromium\`"
      else
        ok "Playwright Chromium browsers" "installed"
      fi
    else
      warn "Playwright Chromium browsers" "could not verify (best-effort check)"
    fi
  else
    warn "Playwright Chromium browsers" "could not verify — try \`npx playwright install chromium\`"
  fi
else
  warn "Playwright Chromium browsers" "npx unavailable — skipped"
fi

echo ""

# ---------- 2. Repo paths ----------

echo -e "${BOLD}2. Repo paths${NC}"

# Resolution rule: $AI_JOB_AGENT_ROOT > ~/.claude/skills/ai-job-agent/REPO_PATH > ~/ai-job-agent
RESOLVED_ROOT=""
RESOLUTION=""
if [ -n "${AI_JOB_AGENT_ROOT:-}" ] && [ -f "$AI_JOB_AGENT_ROOT/package.json" ]; then
  RESOLVED_ROOT="$AI_JOB_AGENT_ROOT"
  RESOLUTION="\$AI_JOB_AGENT_ROOT"
elif [ -d "$HOME/.claude/skills/ai-job-agent" ] && [ -f "$HOME/.claude/skills/ai-job-agent/package.json" ]; then
  RESOLVED_ROOT="$HOME/.claude/skills/ai-job-agent"
  RESOLUTION="canonical clone at ~/.claude/skills/ai-job-agent"
elif [ -f "$HOME/.claude/skills/ai-job-agent/REPO_PATH" ]; then
  MARKER=$(cat "$HOME/.claude/skills/ai-job-agent/REPO_PATH" 2>/dev/null)
  if [ -n "$MARKER" ] && [ -f "$MARKER/package.json" ]; then
    RESOLVED_ROOT="$MARKER"
    RESOLUTION="REPO_PATH marker"
  fi
elif [ -f "$HOME/ai-job-agent/package.json" ]; then
  RESOLVED_ROOT="$HOME/ai-job-agent"
  RESOLUTION="default ~/ai-job-agent"
fi

if [ -n "$RESOLVED_ROOT" ]; then
  ok "repo discoverable from any directory" "$RESOLUTION"
else
  fail "repo discoverable from any directory" "no resolution path works" \
    "Run \`bash skills/install.sh\` from the repo to write the REPO_PATH marker, or set \$AI_JOB_AGENT_ROOT"
fi

# Symlinks for all 13 bundled skills
SKILL_NAMES=(job-coach job-setup job-evaluate job-apply job-track job-triage job-status job-outreach job-followup job-dashboard job-cv job-interview job-patterns job-recap)
MISSING_SKILLS=()
for s in "${SKILL_NAMES[@]}"; do
  if [ ! -L "$HOME/.claude/skills/$s" ] && [ ! -d "$HOME/.claude/skills/$s" ]; then
    MISSING_SKILLS+=("$s")
  fi
done
if [ ${#MISSING_SKILLS[@]} -eq 0 ]; then
  ok "all 14 skills registered in ~/.claude/skills/"
else
  fail "all 14 skills registered in ~/.claude/skills/" "missing: ${MISSING_SKILLS[*]}" \
    "Run \`bash $REPO/skills/install.sh\` to (re)create the symlinks"
fi

# node_modules
if [ -d "$REPO/node_modules" ]; then
  ok "node_modules/ present" "deps installed"
else
  fail "node_modules/ present" "not installed" "Run \`cd $REPO && npm install\`"
fi

echo ""

# ---------- 3. Personal config ----------

echo -e "${BOLD}3. Personal config${NC}"

LINKEDIN_CONFIG="$REPO/config/linkedin-config.json"
if [ -f "$LINKEDIN_CONFIG" ]; then
  # Pass path via env to avoid quote-injection on weird repo paths
  if AJA_CFG="$LINKEDIN_CONFIG" node -e "JSON.parse(require('fs').readFileSync(process.env.AJA_CFG,'utf8'))" >/dev/null 2>&1; then
    ok "config/linkedin-config.json exists & is valid JSON"

    # Fields where the placeholder = a real fail (required to use the agent at all).
    REQUIRED=(firstName lastName email phone resumePath)
    # Fields where the placeholder = warn (you'll want it eventually).
    OPTIONAL=(linkedin github citizenship visaStatus expectedGraduation school major projectPitch)

    MISSING_REQUIRED=()
    for f in "${REQUIRED[@]}"; do
      val=$(AJA_CFG="$LINKEDIN_CONFIG" AJA_FIELD="$f" node -e "
        const c = JSON.parse(require('fs').readFileSync(process.env.AJA_CFG,'utf8'));
        const k = process.env.AJA_FIELD;
        process.stdout.write(c[k] == null ? '' : String(c[k]));
      " 2>/dev/null)
      if [ -z "$val" ] || [[ "$val" == YOUR_* ]] || [[ "$val" == /path/to/* ]]; then
        MISSING_REQUIRED+=("$f")
      fi
    done

    MISSING_OPTIONAL=()
    for f in "${OPTIONAL[@]}"; do
      val=$(AJA_CFG="$LINKEDIN_CONFIG" AJA_FIELD="$f" node -e "
        const c = JSON.parse(require('fs').readFileSync(process.env.AJA_CFG,'utf8'));
        const k = process.env.AJA_FIELD;
        process.stdout.write(c[k] == null ? '' : String(c[k]));
      " 2>/dev/null)
      if [ -z "$val" ] || [[ "$val" == YOUR_* ]]; then
        MISSING_OPTIONAL+=("$f")
      fi
    done

    if [ ${#MISSING_REQUIRED[@]} -eq 0 ]; then
      ok "linkedin-config.json required fields filled"
    else
      fail "linkedin-config.json required fields filled" \
        "still placeholder: ${MISSING_REQUIRED[*]}" \
        "Edit $LINKEDIN_CONFIG (or run \`/job-setup\`) to fill in your real values"
    fi

    if [ ${#MISSING_OPTIONAL[@]} -eq 0 ]; then
      ok "linkedin-config.json optional fields filled"
    else
      warn "linkedin-config.json optional fields filled" \
        "still placeholder: ${MISSING_OPTIONAL[*]}"
    fi

    # Resume PDF actually on disk?
    RESUME_PATH=$(AJA_CFG="$LINKEDIN_CONFIG" node -e "
      const c = JSON.parse(require('fs').readFileSync(process.env.AJA_CFG,'utf8'));
      process.stdout.write(c.resumePath || '');
    " 2>/dev/null)
    if [ -z "$RESUME_PATH" ] || [[ "$RESUME_PATH" == /path/to/* ]]; then
      fail "resumePath points at a real file" "resumePath unset" \
        "Set resumePath in linkedin-config.json to your resume PDF"
    elif [ -f "$RESUME_PATH" ]; then
      ok "resumePath points at a real file" "$(basename "$RESUME_PATH")"
    else
      fail "resumePath points at a real file" "missing on disk: $RESUME_PATH" \
        "Update resumePath in linkedin-config.json or move the PDF to that location"
    fi
  else
    fail "config/linkedin-config.json exists & is valid JSON" "invalid JSON syntax" \
      "Open $LINKEDIN_CONFIG and fix the JSON syntax — compare against config/linkedin-config.template.json"
  fi
else
  fail "config/linkedin-config.json exists" "not found" \
    "Run \`/job-setup\` in Claude Code, or copy config/linkedin-config.template.json → config/linkedin-config.json"
fi

# candidate-profile.md sections
PROFILE="$REPO/config/candidate-profile.md"
if [ -f "$PROFILE" ]; then
  REQUIRED_SECTIONS=("Candidate" "Resume files" "Search preferences" "Application rules")
  MISSING_SECTIONS=()
  for sec in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -qE "^#{1,4} +${sec}$" "$PROFILE"; then
      MISSING_SECTIONS+=("$sec")
    fi
  done
  if [ ${#MISSING_SECTIONS[@]} -eq 0 ]; then
    ok "candidate-profile.md has standard sections"
  else
    fail "candidate-profile.md has standard sections" \
      "missing: ${MISSING_SECTIONS[*]}" \
      "Re-copy from config/candidate-profile.template.md or run \`/job-setup\`"
  fi
else
  fail "config/candidate-profile.md exists" "not found" \
    "Run \`/job-setup\` or copy config/candidate-profile.template.md → config/candidate-profile.md"
fi

# application-tracker.csv header
TRACKER="$REPO/application-tracker.csv"
TEMPLATE_TRACKER="$REPO/templates/tracker.template.csv"
if [ -f "$TRACKER" ]; then
  HEADER_HAVE=$(head -1 "$TRACKER" 2>/dev/null | tr -d '\r')
  HEADER_WANT=$(head -1 "$TEMPLATE_TRACKER" 2>/dev/null | tr -d '\r')
  if [ "$HEADER_HAVE" = "$HEADER_WANT" ]; then
    ok "application-tracker.csv header matches template"
  else
    fail "application-tracker.csv header matches template" "header drift" \
      "Compare against $TEMPLATE_TRACKER — fix the column order or recreate from the template"
  fi
else
  fail "application-tracker.csv exists" "not found" \
    "Run \`bash $REPO/setup.sh\` or copy templates/tracker.template.csv → application-tracker.csv"
fi

# outreach-log.csv: only WARN if missing — cold email is opt-in
OUTREACH="$REPO/outreach-log.csv"
TEMPLATE_OUTREACH="$REPO/templates/outreach-log.template.csv"
if [ -f "$OUTREACH" ]; then
  HEADER_HAVE=$(head -1 "$OUTREACH" 2>/dev/null | tr -d '\r')
  HEADER_WANT=$(head -1 "$TEMPLATE_OUTREACH" 2>/dev/null | tr -d '\r')
  if [ "$HEADER_HAVE" = "$HEADER_WANT" ]; then
    ok "outreach-log.csv header matches template"
  else
    fail "outreach-log.csv header matches template" "header drift" \
      "Compare against $TEMPLATE_OUTREACH — fix the column order or recreate from the template"
  fi
else
  warn "outreach-log.csv exists" "missing — only needed if you'll use \`/job-outreach\` cold email"
fi

echo ""

# ---------- 4. Cold email plumbing ----------

echo -e "${BOLD}4. Cold email (msmtp + ~/.msmtprc)${NC}"

if ! command -v msmtp >/dev/null 2>&1; then
  warn "~/.msmtprc presence" "msmtp not installed — skipping (only needed for /job-outreach)"
  warn "~/.msmtprc chmod 600" "msmtp not installed — skipping"
  warn "~/.msmtprc parses" "msmtp not installed — skipping"
else
  if [ -f "$HOME/.msmtprc" ]; then
    ok "~/.msmtprc exists"

    # chmod 600 — msmtp refuses to use the file otherwise.
    PERM=$(stat -f "%Lp" "$HOME/.msmtprc" 2>/dev/null || stat -c "%a" "$HOME/.msmtprc" 2>/dev/null)
    if [ "$PERM" = "600" ]; then
      ok "~/.msmtprc chmod 600" "perms=$PERM"
    else
      fail "~/.msmtprc chmod 600" "perms=$PERM (msmtp will refuse)" \
        "Run \`chmod 600 ~/.msmtprc\`"
    fi

    # Basic syntax check: required = `account` + `host`; `defaults` is optional.
    MISSING_DIRECTIVES=()
    grep -qE "^[[:space:]]*account\b" "$HOME/.msmtprc" || MISSING_DIRECTIVES+=("account")
    grep -qE "^[[:space:]]*host\b"    "$HOME/.msmtprc" || MISSING_DIRECTIVES+=("host")
    if [ ${#MISSING_DIRECTIVES[@]} -eq 0 ]; then
      if grep -qE "^[[:space:]]*defaults\b" "$HOME/.msmtprc"; then
        ok "~/.msmtprc parses (defaults / account / host present)"
      else
        ok "~/.msmtprc parses (account / host present; no defaults block)"
      fi
    else
      fail "~/.msmtprc parses" \
        "missing directives: ${MISSING_DIRECTIVES[*]}" \
        "See docs/SETUP.md#cold-email-setup-msmtp--gmail for a working ~/.msmtprc template"
    fi
  else
    warn "~/.msmtprc exists" "msmtp installed but ~/.msmtprc missing — cold email won't work until configured (see docs/SETUP.md#cold-email-setup-msmtp--gmail)"
  fi
fi

echo ""

# ---------- 5. Google Sheets ----------

echo -e "${BOLD}5. Google Sheets (gcloud + SPREADSHEET_ID)${NC}"

if ! command -v gcloud >/dev/null 2>&1; then
  warn "gcloud application-default token" "gcloud not installed — skipping (only needed for sheet sync)"
else
  if gcloud auth application-default print-access-token >/dev/null 2>&1; then
    ok "gcloud application-default token" "authenticated"
  else
    warn "gcloud application-default token" "not authenticated — run \`gcloud auth application-default login\` if you'll use sheet sync"
  fi
fi

# SPREADSHEET_ID env var OR the script doesn't still have YOUR_SHEET_ID baked in
SHEET_PY="$REPO/scripts/google-sheet-sync.py"
if [ -n "${SPREADSHEET_ID:-}" ]; then
  ok "SPREADSHEET_ID configured" "via env var"
elif [ -f "$SHEET_PY" ] && ! grep -q "YOUR_SHEET_ID" "$SHEET_PY"; then
  ok "SPREADSHEET_ID configured" "no YOUR_SHEET_ID placeholder in script"
else
  warn "SPREADSHEET_ID configured" "set \$SPREADSHEET_ID env var or replace YOUR_SHEET_ID in scripts/google-sheet-sync.py before running sheet sync"
fi

echo ""

# ---------- 6. Skill files ----------

echo -e "${BOLD}6. Skill file integrity${NC}"

YAML_BAD=()
TRIGGER_BAD=()
for s in "${SKILL_NAMES[@]}"; do
  SKILL_MD="$REPO/skills/$s/SKILL.md"
  if [ ! -f "$SKILL_MD" ]; then
    YAML_BAD+=("$s (missing)")
    TRIGGER_BAD+=("$s (missing)")
    continue
  fi
  # YAML frontmatter: line 1 == "---", and a "name:" field within first 10 lines.
  if [ "$(head -1 "$SKILL_MD" | tr -d '\r')" != "---" ]; then
    YAML_BAD+=("$s")
  elif ! head -10 "$SKILL_MD" | grep -qE "^name:[[:space:]]+"; then
    YAML_BAD+=("$s (no name:)")
  fi
  # Trigger phrase
  if ! grep -q "Proactively invoke" "$SKILL_MD"; then
    TRIGGER_BAD+=("$s")
  fi
done

if [ ${#YAML_BAD[@]} -eq 0 ]; then
  ok "all 9 SKILL.md files have YAML frontmatter + name:"
else
  fail "all 9 SKILL.md files have YAML frontmatter + name:" \
    "broken: ${YAML_BAD[*]}" \
    "Open the listed SKILL.md files and ensure line 1 is \`---\` and a \`name:\` field exists in the frontmatter"
fi

if [ ${#TRIGGER_BAD[@]} -eq 0 ]; then
  ok "all 9 SKILL.md files have 'Proactively invoke' trigger"
else
  fail "all 9 SKILL.md files have 'Proactively invoke' trigger" \
    "missing in: ${TRIGGER_BAD[*]}" \
    "Add a 'Proactively invoke this skill ...' line to each missing SKILL.md description"
fi

echo ""

# ---------- summary ----------

echo -e "${BOLD}Summary${NC}"
echo -e "  ${GREEN}PASS:${NC}   $PASS"
echo -e "  ${YELLOW}WARN:${NC}   $WARN"
echo -e "  ${RED}FAIL:${NC}   $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  if [ "$WARN" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All checks pass.${NC} Your environment is fully configured."
  else
    echo -e "${GREEN}${BOLD}Core flows healthy.${NC} ${YELLOW}$WARN warning(s)${NC} are optional features you may want to set up later."
  fi
  exit 0
else
  echo -e "${RED}${BOLD}$FAIL check(s) failed.${NC} Fix these before running the agent:"
  echo ""
  for hint in "${REMEDIATIONS[@]}"; do
    echo -e "  ${RED}•${NC} $hint"
  done
  echo ""
  exit 1
fi
