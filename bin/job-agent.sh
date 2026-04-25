#!/usr/bin/env bash
#
# Unified launcher for the AI Job Agent.
#
# Opens Claude Code (chat) and the live TUI dashboard in a single terminal
# window via tmux split-pane. They auto-sync — anything Claude does in chat
# that touches application-tracker.csv or outreach-log.csv re-renders the
# dashboard within ~200ms (fs.watch).
#
# Usage:
#   npm run agent           # via package.json shortcut (recommended)
#   bash bin/job-agent.sh   # direct
#
# tmux is highly recommended for the unified experience. If missing, this
# script offers to install it (brew on macOS, apt/dnf/pacman on Linux). On
# decline, falls back to opening two terminal tabs (macOS only) or printing
# instructions for two manual tabs.

set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="ai-job-agent"
DASHBOARD_CMD="cd '${REPO}' && npm run dashboard"
CLAUDE_CMD="cd '${REPO}' && claude"

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
YELLOW='\033[33m'
GREEN='\033[32m'
RED='\033[31m'
NC='\033[0m'

# ---------- pre-flight ----------

if ! command -v claude >/dev/null 2>&1; then
  echo -e "${RED}Claude Code (\`claude\`) is not on PATH.${NC}"
  echo -e "Install: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

OS="unknown"
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
esac

# ---------- already inside tmux? ----------

if [ -n "${TMUX:-}" ]; then
  echo -e "${DIM}Already in a tmux session — splitting current window for the dashboard.${NC}"
  tmux split-window -v -p 40 "$DASHBOARD_CMD"
  tmux select-pane -U
  exit 0
fi

# ---------- tmux available? ----------

if command -v tmux >/dev/null 2>&1; then
  # If session already exists, attach (don't recreate — preserves user state).
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${DIM}Reattaching to existing 'ai-job-agent' tmux session.${NC}"
    exec tmux attach-session -t "$SESSION"
  fi

  # Create the session: top pane = claude (60%), bottom = dashboard (40%).
  tmux new-session -d -s "$SESSION" -n main "$CLAUDE_CMD"
  tmux split-window -v -p 40 -t "${SESSION}:main" "$DASHBOARD_CMD"
  tmux select-pane -t "${SESSION}:main.0"
  # Disable status bar — minimal chrome.
  tmux set-option -t "$SESSION" status off >/dev/null 2>&1 || true
  exec tmux attach-session -t "$SESSION"
fi

# ---------- no tmux: offer to install ----------

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  AI Job Agent — unified mode wants tmux${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}${YELLOW}  Highly recommended.${NC} ${DIM}tmux gives you Claude Code on top + the live${NC}"
echo -e "${DIM}  dashboard on bottom in a single terminal window. They auto-sync${NC}"
echo -e "${DIM}  via fs.watch — flip a status in chat, watch the funnel update.${NC}"
echo ""
echo -e "${DIM}  Without tmux, you'd be juggling two terminal tabs manually.${NC}"
echo ""

INSTALL_CMD=""
case "$OS" in
  macos)
    if command -v brew >/dev/null 2>&1; then
      INSTALL_CMD="brew install tmux"
    else
      echo -e "${YELLOW}  Homebrew not found.${NC} Install Homebrew first: https://brew.sh"
      echo -e "  Then re-run this command."
      exit 1
    fi
    ;;
  linux)
    if command -v apt >/dev/null 2>&1; then
      INSTALL_CMD="sudo apt update && sudo apt install -y tmux"
    elif command -v dnf >/dev/null 2>&1; then
      INSTALL_CMD="sudo dnf install -y tmux"
    elif command -v pacman >/dev/null 2>&1; then
      INSTALL_CMD="sudo pacman -S --noconfirm tmux"
    elif command -v zypper >/dev/null 2>&1; then
      INSTALL_CMD="sudo zypper install -y tmux"
    else
      echo -e "${YELLOW}  Couldn't detect your package manager.${NC} Install tmux manually and re-run."
      exit 1
    fi
    ;;
  *)
    echo -e "${YELLOW}  Unknown OS — install tmux manually for your platform and re-run.${NC}"
    exit 1
    ;;
esac

echo -e "${BOLD}  Install command:${NC} ${CYAN}${INSTALL_CMD}${NC}"
echo ""
printf "${BOLD}  Run it now? [Y/n]: ${NC}"
read -r REPLY
REPLY="${REPLY:-Y}"

if [ "$REPLY" = "Y" ] || [ "$REPLY" = "y" ]; then
  echo ""
  echo -e "${DIM}  Running: ${INSTALL_CMD}${NC}"
  echo ""
  if eval "$INSTALL_CMD"; then
    echo ""
    echo -e "${GREEN}  tmux installed. Relaunching ai-job-agent…${NC}"
    sleep 1
    exec "$0" "$@"
  else
    echo ""
    echo -e "${RED}  Install failed. Run the command manually and re-run \`npm run agent\`.${NC}"
    exit 1
  fi
fi

# ---------- declined: fall back ----------

echo ""
echo -e "${DIM}  Skipping tmux install. Falling back to two-tabs mode…${NC}"
echo ""

case "$OS" in
  macos)
    if [ -d "/Applications/iTerm.app" ]; then
      /usr/bin/osascript <<APPLESCRIPT
tell application "iTerm"
  activate
  create window with default profile
  tell current session of current window
    write text "${CLAUDE_CMD}"
  end tell
  tell current window
    create tab with default profile
    tell current session
      write text "${DASHBOARD_CMD}"
    end tell
  end tell
end tell
APPLESCRIPT
      echo -e "${GREEN}  Opened two iTerm tabs.${NC}"
    else
      /usr/bin/osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "${CLAUDE_CMD}"
  do script "${DASHBOARD_CMD}"
end tell
APPLESCRIPT
      echo -e "${GREEN}  Opened two Terminal tabs.${NC}"
    fi
    ;;
  linux)
    echo -e "${YELLOW}  No auto-tab support on Linux.${NC} Open two terminal windows yourself:"
    echo ""
    echo -e "    ${CYAN}Window 1:${NC} cd ${REPO} && claude"
    echo -e "    ${CYAN}Window 2:${NC} cd ${REPO} && npm run dashboard"
    ;;
  *)
    echo -e "${YELLOW}  Open two terminal windows manually:${NC}"
    echo -e "    ${CYAN}Window 1:${NC} cd ${REPO} && claude"
    echo -e "    ${CYAN}Window 2:${NC} cd ${REPO} && npm run dashboard"
    ;;
esac

echo ""
echo -e "${DIM}  (Install tmux any time and re-run \`npm run agent\` for the unified view.)${NC}"
echo ""
