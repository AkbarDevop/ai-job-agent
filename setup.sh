#!/bin/bash
set -euo pipefail

# ============================================================================
# AI Job Application Agent - Setup Script
# ============================================================================
# One-command setup for the job search automation toolkit.
# Run: bash setup.sh
# ============================================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
  echo ""
  echo -e "${BOLD}${CYAN}========================================${NC}"
  echo -e "${BOLD}${CYAN}  AI Job Application Agent - Setup${NC}"
  echo -e "${BOLD}${CYAN}========================================${NC}"
  echo ""
}

print_step() {
  echo -e "${BOLD}${GREEN}[Step $1]${NC} $2"
}

print_warn() {
  echo -e "${YELLOW}  WARNING:${NC} $1"
}

print_error() {
  echo -e "${RED}  ERROR:${NC} $1"
}

print_ok() {
  echo -e "${GREEN}  OK:${NC} $1"
}

# ============================================================================
# Step 1: Check prerequisites
# ============================================================================

print_header
print_step "1/6" "Checking prerequisites..."

# Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  print_ok "Node.js $NODE_VERSION found"
else
  print_error "Node.js not found. Install from https://nodejs.org/"
  exit 1
fi

# Python 3
if command -v python3 &>/dev/null; then
  PYTHON_VERSION=$(python3 --version)
  print_ok "$PYTHON_VERSION found"
else
  print_error "Python 3 not found. Install from https://python.org/"
  exit 1
fi

# npm
if command -v npm &>/dev/null; then
  NPM_VERSION=$(npm --version)
  print_ok "npm $NPM_VERSION found"
else
  print_error "npm not found. It should come with Node.js."
  exit 1
fi

# Chrome
CHROME_FOUND=false
if command -v google-chrome &>/dev/null || command -v google-chrome-stable &>/dev/null; then
  CHROME_FOUND=true
  print_ok "Google Chrome found"
elif [[ -d "/Applications/Google Chrome.app" ]]; then
  CHROME_FOUND=true
  print_ok "Google Chrome found (macOS)"
else
  print_warn "Google Chrome not detected. Some scripts require Chrome for cookie import."
fi

# gcloud (optional)
if command -v gcloud &>/dev/null; then
  print_ok "gcloud CLI found (for Google Sheets integration)"
else
  print_warn "gcloud CLI not found. Google Sheets sync will not work without it."
  echo "         Install from https://cloud.google.com/sdk/docs/install"
fi

# ============================================================================
# Step 2: Install Node.js dependencies
# ============================================================================

echo ""
print_step "2/6" "Installing Node.js dependencies..."

npm init -y 2>/dev/null || true
npm install playwright-core 2>/dev/null

print_ok "playwright-core installed"

echo ""
echo "  Do you want to install Playwright browsers? (needed for headless automation)"
echo "  This downloads Chromium (~150MB). You can skip if you'll use your system Chrome."
if [[ -t 0 ]]; then
  read -p "  Install Playwright browsers? [y/N] " -n 1 -r
  echo ""
else
  REPLY="n"
  echo "  Non-interactive mode detected — skipping Playwright browser install."
fi
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx playwright install chromium
  print_ok "Playwright Chromium installed"
else
  echo "  Skipped. You can install later with: npx playwright install chromium"
fi

# ============================================================================
# Step 3: Install Python dependencies
# ============================================================================

echo ""
print_step "3/6" "Installing Python dependencies..."

pip3 install browser-cookie3 2>/dev/null || {
  print_warn "Could not install browser-cookie3. LinkedIn cookie import may not work."
  echo "         Try: pip3 install browser-cookie3"
}

print_ok "Python dependencies installed"

# ============================================================================
# Step 4: Copy config templates
# ============================================================================

echo ""
print_step "4/6" "Setting up config files..."

CONFIG_DIR="config"

if [[ ! -f "$CONFIG_DIR/linkedin-config.json" ]]; then
  cp "$CONFIG_DIR/linkedin-config.template.json" "$CONFIG_DIR/linkedin-config.json"
  print_ok "Created config/linkedin-config.json from template"
else
  print_ok "config/linkedin-config.json already exists"
fi

if [[ ! -f "$CONFIG_DIR/candidate-profile.md" ]]; then
  cp "$CONFIG_DIR/candidate-profile.template.md" "$CONFIG_DIR/candidate-profile.md"
  print_ok "Created config/candidate-profile.md from template"
else
  print_ok "config/candidate-profile.md already exists"
fi

if [[ ! -f "$CONFIG_DIR/answer-bank.md" ]]; then
  cp "$CONFIG_DIR/answer-bank.template.md" "$CONFIG_DIR/answer-bank.md"
  print_ok "Created config/answer-bank.md from template"
else
  print_ok "config/answer-bank.md already exists"
fi

if [[ ! -f "application-tracker.csv" ]]; then
  cp "templates/tracker.template.csv" "application-tracker.csv"
  print_ok "Created application-tracker.csv from template"
else
  print_ok "application-tracker.csv already exists"
fi

# ============================================================================
# Step 5: Detect Chrome cookie path
# ============================================================================

echo ""
print_step "5/6" "Detecting Chrome cookie path..."

COOKIE_PATH=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  COOKIE_PATH="$HOME/Library/Application Support/Google/Chrome/Default/Cookies"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  COOKIE_PATH="$HOME/.config/google-chrome/Default/Cookies"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
  COOKIE_PATH="$LOCALAPPDATA/Google/Chrome/User Data/Default/Cookies"
fi

if [[ -n "$COOKIE_PATH" ]] && [[ -f "$COOKIE_PATH" ]]; then
  print_ok "Chrome cookies found at: $COOKIE_PATH"
  echo "  Update chromeCookiePath in config/linkedin-config.json with this path."
else
  print_warn "Chrome cookie file not found at expected location."
  echo "  You'll need to find your Chrome Cookies file and set chromeCookiePath in config/linkedin-config.json"
fi

# ============================================================================
# Step 6: Summary
# ============================================================================

echo ""
print_step "6/6" "Setup complete!"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. Edit ${CYAN}config/linkedin-config.json${NC} with your personal details"
echo "  2. Edit ${CYAN}config/candidate-profile.md${NC} with your full profile"
echo "  3. Edit ${CYAN}config/answer-bank.md${NC} with your reusable answers"
echo "  4. Place your resume PDF at the path specified in linkedin-config.json"
echo ""
echo -e "${BOLD}Quick test:${NC}"
echo ""
echo "  # Dry run (fills form but does not submit):"
echo "  node scripts/linkedin-easy-apply.js 'https://linkedin.com/jobs/view/12345' config/linkedin-config.json"
echo ""
echo "  # Set autoSubmit: true in your config to enable actual submission."
echo ""
echo -e "${BOLD}Optional: Install Claude Code skills for AI-assisted job hunting${NC}"
echo "  See skills/README.md for recommended skills and install commands."
echo ""
echo -e "${GREEN}Happy job hunting!${NC}"
