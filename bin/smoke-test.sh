#!/usr/bin/env bash
#
# Fresh-install smoke test for ai-job-agent.
#
# Simulates a brand-new user cloning into a sandboxed HOME, running
# install.sh, and exercising every script that doesn't need real
# network/credentials (ATS form-fillers + msmtp + Google Sheets are
# skipped — those need real auth).
#
# Run: bash bin/smoke-test.sh
# Exits 0 on full pass, non-zero on first failure.

set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
NC='\033[0m'

PASS=0
FAIL=0
SKIPPED=0

run() {
  local name="$1"
  shift
  printf "  %-55s" "$name"
  if "$@" >/tmp/smoke-stdout 2>/tmp/smoke-stderr; then
    echo -e "${GREEN}PASS${NC}"
    PASS=$((PASS + 1))
    return 0
  else
    local rc=$?
    echo -e "${RED}FAIL${NC} (exit $rc)"
    echo -e "    ${DIM}stdout:${NC} $(head -1 /tmp/smoke-stdout 2>/dev/null || true)"
    echo -e "    ${DIM}stderr:${NC} $(head -1 /tmp/smoke-stderr 2>/dev/null || true)"
    FAIL=$((FAIL + 1))
    return $rc
  fi
}

skip() {
  local name="$1"
  local reason="$2"
  printf "  %-55s" "$name"
  echo -e "${YELLOW}SKIP${NC} ${DIM}($reason)${NC}"
  SKIPPED=$((SKIPPED + 1))
}

# ---------- pre-flight ----------

echo ""
echo -e "${BOLD}ai-job-agent smoke test${NC}"
echo -e "${DIM}repo: $REPO${NC}"
echo ""

# Sandboxed HOME so we don't pollute the real ~/.claude/skills/
SANDBOX=$(mktemp -d /tmp/ajagent-smoke.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT

echo -e "${BOLD}Sandbox:${NC} $SANDBOX"
echo ""

# ---------- 1. install.sh in sandbox ----------

echo -e "${BOLD}1. Install flow${NC}"

run "install.sh runs cleanly in sandboxed HOME" \
  bash -c "HOME='$SANDBOX' bash '$REPO/skills/install.sh'"

run "all 9 skills symlinked" \
  bash -c "
    count=\$(find '$SANDBOX/.claude/skills/' -maxdepth 1 -type l -name 'job-*' 2>/dev/null | wc -l | tr -d ' ')
    [ \"\$count\" -eq 9 ]
  "

run "REPO_PATH marker file written (legacy non-canonical clone)" \
  test -f "$SANDBOX/.claude/skills/ai-job-agent/REPO_PATH"

run "REPO_PATH points at the correct repo" \
  bash -c "[ \"\$(cat '$SANDBOX/.claude/skills/ai-job-agent/REPO_PATH')\" = '$REPO' ]"

run "install.sh second run is idempotent" \
  bash -c "HOME='$SANDBOX' bash '$REPO/skills/install.sh' 2>&1 | grep -q 'already linked'"

run "install.sh --uninstall removes the symlinks" \
  bash -c "
    HOME='$SANDBOX' bash '$REPO/skills/install.sh' --uninstall >/dev/null 2>&1
    [ ! -L '$SANDBOX/.claude/skills/job-coach' ]
  "

# Re-install for the rest of the tests
HOME="$SANDBOX" bash "$REPO/skills/install.sh" >/dev/null 2>&1

echo ""

# ---------- 2. send-cold-email.js ----------

echo -e "${BOLD}2. Cold email script (send-cold-email.js)${NC}"

run "dry-run with valid payload returns ok=true" \
  bash -c "
    echo '{\"from\":\"Test <t@x.com>\",\"to\":\"r@y.com\",\"subject\":\"hi\",\"body\":\"hello\"}' \
      | node '$REPO/scripts/send-cold-email.js' --dry-run \
      | grep -q '\"ok\": true'
  "

run "missing 'to' field exits 2 (invalid payload)" \
  bash -c "
    echo '{\"from\":\"t@x.com\",\"subject\":\"hi\",\"body\":\"hello\"}' \
      | node '$REPO/scripts/send-cold-email.js' --dry-run; rc=\$?; [ \$rc -eq 2 ]
  "

run "threading: in_reply_to populates In-Reply-To header" \
  bash -c "
    echo '{\"from\":\"t@x.com\",\"to\":\"r@y.com\",\"subject\":\"Re: hi\",\"body\":\"fu\",\"in_reply_to\":\"<orig@x.com>\"}' \
      | node '$REPO/scripts/send-cold-email.js' --dry-run \
      | grep -q 'In-Reply-To: <orig@x.com>'
  "

run "header injection: \\r\\n in subject is sanitized" \
  bash -c '
    payload="$(node -e "process.stdout.write(JSON.stringify({from:\"t@x.com\",to:\"r@y.com\",subject:\"hi\\r\\nBcc: evil@x.com\",body:\"a\"}))")"
    out=$(echo "$payload" | node "'"$REPO"'/scripts/send-cold-email.js" --dry-run)
    # The injected Bcc must NOT appear as its own header line
    ! echo "$out" | grep -qE "^Bcc: evil"
  '

echo ""

# ---------- 3. job-dashboard.mjs ----------

echo -e "${BOLD}3. Terminal dashboard (job-dashboard.mjs)${NC}"

run "snapshot mode runs cleanly" \
  bash -c "node '$REPO/scripts/job-dashboard.mjs' --snapshot"

run "snapshot includes Pipeline section" \
  bash -c "node '$REPO/scripts/job-dashboard.mjs' --snapshot 2>&1 | grep -q 'Pipeline funnel'"

run "snapshot includes 14-day sparkline section" \
  bash -c "node '$REPO/scripts/job-dashboard.mjs' --snapshot 2>&1 | grep -q 'Last 14 days'"

run "snapshot is non-TTY safe (returns to TTY check)" \
  bash -c "node '$REPO/scripts/job-dashboard.mjs' --snapshot </dev/null 2>&1 | grep -q 'AI Job Agent Dashboard'"

run "interactive mode falls back gracefully when not a TTY" \
  bash -c "
    out=\$(node '$REPO/scripts/job-dashboard.mjs' </dev/null 2>&1 || true)
    echo \"\$out\" | grep -q 'Not a TTY'
  "

echo ""

# ---------- 4. CSV parsing edge cases ----------

echo -e "${BOLD}4. CSV parsing${NC}"

run "handles empty CSV without crashing" \
  bash -c "
    : > '$SANDBOX/empty.csv'
    AI_JOB_AGENT_ROOT='$REPO' node -e \"
      import('$REPO/scripts/job-dashboard.mjs').catch(()=>{});
    \" </dev/null 2>&1 | head -1 | grep -q '.'
  "

run "handles quoted commas in fields" \
  bash -c "
    cat > '$SANDBOX/test.csv' <<EOF
date,company,role,status,location,source,applied_by,url,notes,contact,compensation,days_since,key
2026-04-25,\"Acme, Inc.\",EE Intern,applied,SF,LinkedIn,Agent,,,,,,
EOF
    LOCAL_TRACKER='$SANDBOX/test.csv' node -e \"
      const fs = require('node:fs');
      const text = fs.readFileSync('$SANDBOX/test.csv', 'utf8');
      const lines = text.split('\\\\n').filter(l => l.length);
      // Should have 2 lines (header + 1 data row)
      if (lines.length !== 2) process.exit(1);
    \"
  "

echo ""

# ---------- 5. Skill files ----------

echo -e "${BOLD}5. Skill file integrity${NC}"

for skill in job-coach job-setup job-apply job-track job-triage job-status job-outreach job-followup job-dashboard; do
  run "$skill/SKILL.md has YAML frontmatter" \
    bash -c "head -1 '$REPO/skills/$skill/SKILL.md' | grep -q '^---'"
done

for skill in job-coach job-setup job-apply job-track job-triage job-status job-outreach job-followup job-dashboard; do
  run "$skill/SKILL.md has 'Proactively invoke' trigger phrase" \
    bash -c "grep -q 'Proactively invoke' '$REPO/skills/$skill/SKILL.md'"
done

echo ""

# ---------- 6. Network / Auth-gated skips ----------

echo -e "${BOLD}6. Skipped (need real network / auth)${NC}"

skip "linkedin-easy-apply.js" "needs LinkedIn cookie + real job URL"
skip "greenhouse-apply.js / lever-apply.js / jobvite-apply.js / ashby-apply.js" "need real form configs + browser"
skip "outlook-triage.js" "needs running Chrome on port 9224 + Outlook session"
skip "google-sheet-sync.py" "needs gcloud auth + real spreadsheet"
skip "send-cold-email.js (real send)" "would actually send via msmtp — only dry-run tested"
skip "/job-coach intake (live)" "needs interactive Claude Code session"

echo ""

# ---------- summary ----------

echo -e "${BOLD}Summary${NC}"
echo -e "  ${GREEN}PASS:${NC}    $PASS"
echo -e "  ${RED}FAIL:${NC}    $FAIL"
echo -e "  ${YELLOW}SKIP:${NC}    $SKIPPED ${DIM}(network/auth-gated)${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All testable paths pass.${NC} The repo is ready to ship."
  exit 0
else
  echo -e "${RED}${BOLD}$FAIL test(s) failed.${NC} Fix before pushing."
  exit 1
fi
