#!/bin/bash
set -euo pipefail

# ============================================================================
# AI Job Application Agent - Interactive Setup Wizard
# ============================================================================
# A friendly step-by-step setup that gets you from zero to first application
# in under 5 minutes. No config file editing required.
#
# Usage: bash wizard.sh
# ============================================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# State
FIRST_NAME=""
LAST_NAME=""
EMAIL=""
PHONE=""
LOCATION=""
SCHOOL=""
MAJOR=""
GRADUATION=""
GPA=""
RESUME_PATH=""
CITIZENSHIP=""
VISA_STATUS=""
AUTHORIZED=""
SPONSOR_NOW=""
SPONSOR_FUTURE=""
GENDER=""
RACE=""

clear

echo ""
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
    _    ___   _         _       _                    _
   / \  |_ _| | |  ___  | |__   / \   __ _  ___ _ __ | |_
  / _ \  | |  | | / _ \ | '_ \ / _ \ / _` |/ _ \ '_ \| __|
 / ___ \ | |  | || (_) || |_) / ___ \ (_| |  __/ | | | |_
/_/   \_\___| |_| \___/ |_.__/_/   \_\__, |\___|_| |_|\__|
                                      |___/
BANNER
echo -e "${NC}"
echo -e "${BOLD}Welcome to the AI Job Application Agent Setup Wizard${NC}"
echo ""
echo -e "${DIM}This will walk you through setting up your profile step by step."
echo -e "Your answers will be saved to config files automatically."
echo -e "You can always edit them later.${NC}"
echo ""
echo -e "${YELLOW}Heads up:${NC} if you're using ${CYAN}Claude Code${NC}, the in-chat version is simpler."
echo -e "Just run ${BOLD}claude${NC} in this directory and type ${CYAN}/job-setup${NC}."
echo -e "It also handles msmtp cold-email setup + registers all 7 skills."
echo ""
echo -e "Press ${BOLD}Enter${NC} to skip any question. Press ${BOLD}Ctrl+C${NC} to quit."
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Helper function
ask() {
  local prompt="$1"
  local default="${2:-}"
  local var_name="$3"

  if [[ -n "$default" ]]; then
    echo -ne "${BOLD}${prompt}${NC} ${DIM}[${default}]${NC}: "
  else
    echo -ne "${BOLD}${prompt}${NC}: "
  fi

  read -r answer
  if [[ -z "$answer" && -n "$default" ]]; then
    answer="$default"
  fi

  eval "$var_name=\"\$answer\""
}

ask_choice() {
  local prompt="$1"
  shift
  local options=("$@")

  echo -e "${BOLD}${prompt}${NC}"
  for i in "${!options[@]}"; do
    echo -e "  ${CYAN}$((i+1))${NC}) ${options[$i]}"
  done
  echo -ne "${BOLD}Choice${NC} [1]: "
  read -r choice
  choice=${choice:-1}
  echo "${options[$((choice-1))]}"
}

# ============================================================================
# Step 1: The Basics
# ============================================================================

echo -e "${GREEN}${BOLD}Step 1 of 6: The Basics${NC}"
echo -e "${DIM}Let's start with who you are.${NC}"
echo ""

ask "First name" "" FIRST_NAME
ask "Last name" "" LAST_NAME
ask "Email" "" EMAIL
ask "Phone (e.g., (555) 123-4567)" "" PHONE
ask "City, State (e.g., Austin, Texas)" "" LOCATION

echo ""
echo -e "${GREEN}  Got it, ${FIRST_NAME}!${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Step 2: Education
# ============================================================================

echo -e "${GREEN}${BOLD}Step 2 of 6: Education${NC}"
echo -e "${DIM}Where are you studying?${NC}"
echo ""

ask "University" "" SCHOOL
ask "Major (e.g., Computer Science, Electrical Engineering)" "" MAJOR
ask "Expected graduation (e.g., May 2027)" "" GRADUATION
ask "GPA (e.g., 3.5)" "" GPA

DEGREE_TYPE=$(ask_choice "Degree type?" "Bachelor's" "Master's" "PhD" "Associate's")

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Step 3: Work Authorization
# ============================================================================

echo -e "${GREEN}${BOLD}Step 3 of 6: Work Authorization${NC}"
echo -e "${DIM}This determines how forms get filled out. Be truthful — the agent will"
echo -e "skip roles that require authorization you don't have.${NC}"
echo ""

AUTH_STATUS=$(ask_choice "What's your work authorization status?" \
  "US Citizen" \
  "Permanent Resident (Green Card)" \
  "F-1 Student Visa (CPT/OPT)" \
  "H-1B Visa" \
  "Other visa" \
  "Not authorized to work in US")

case "$AUTH_STATUS" in
  "US Citizen")
    CITIZENSHIP="United States"
    VISA_STATUS="N/A"
    AUTHORIZED="Yes"
    SPONSOR_NOW="No"
    SPONSOR_FUTURE="No"
    ;;
  "Permanent Resident (Green Card)")
    ask "Country of citizenship" "" CITIZENSHIP
    VISA_STATUS="Permanent Resident"
    AUTHORIZED="Yes"
    SPONSOR_NOW="No"
    SPONSOR_FUTURE="No"
    ;;
  "F-1 Student Visa (CPT/OPT)")
    ask "Country of citizenship" "" CITIZENSHIP
    VISA_STATUS="F-1 student visa"
    AUTHORIZED="Yes"
    SPONSOR_NOW="No"
    SPONSOR_FUTURE="Yes"
    ;;
  "H-1B Visa")
    ask "Country of citizenship" "" CITIZENSHIP
    VISA_STATUS="H-1B"
    AUTHORIZED="Yes"
    SPONSOR_NOW="No"
    SPONSOR_FUTURE="Yes"
    ;;
  "Other visa")
    ask "Country of citizenship" "" CITIZENSHIP
    ask "Visa type" "" VISA_STATUS
    AUTHORIZED="Yes"
    SPONSOR_NOW="No"
    SPONSOR_FUTURE="Yes"
    ;;
  "Not authorized to work in US")
    ask "Country of citizenship" "" CITIZENSHIP
    VISA_STATUS="None"
    AUTHORIZED="No"
    SPONSOR_NOW="Yes"
    SPONSOR_FUTURE="Yes"
    ;;
esac

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Step 4: EEO (Optional)
# ============================================================================

echo -e "${GREEN}${BOLD}Step 4 of 6: EEO Demographics${NC}"
echo -e "${DIM}Optional. Many applications ask these. Press Enter to skip any.${NC}"
echo ""

GENDER=$(ask_choice "Gender (for EEO forms)?" "Male" "Female" "Non-binary" "Prefer not to say" "Skip")
[[ "$GENDER" == "Skip" ]] && GENDER=""

RACE=$(ask_choice "Race/Ethnicity (for EEO forms)?" \
  "Asian" "Black or African American" "Hispanic or Latino" \
  "White" "Two or more races" "Native American" \
  "Pacific Islander" "Prefer not to say" "Skip")
[[ "$RACE" == "Skip" ]] && RACE=""

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Step 5: Resume
# ============================================================================

echo -e "${GREEN}${BOLD}Step 5 of 6: Resume${NC}"
echo -e "${DIM}Point to your resume PDF. The agent will upload it to applications.${NC}"
echo ""

while true; do
  ask "Path to your resume PDF" "" RESUME_PATH
  if [[ -z "$RESUME_PATH" ]]; then
    echo -e "${YELLOW}  You can add this later in config/linkedin-config.json${NC}"
    break
  elif [[ -f "$RESUME_PATH" ]]; then
    echo -e "${GREEN}  Found it!${NC}"
    break
  else
    echo -e "${RED}  File not found: $RESUME_PATH${NC}"
    echo -e "${DIM}  Tip: drag the file into the terminal to paste its path${NC}"
  fi
done

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Step 6: Chrome Cookies
# ============================================================================

echo -e "${GREEN}${BOLD}Step 6 of 6: Chrome Cookie Path${NC}"
echo -e "${DIM}The LinkedIn scripts need your Chrome cookies to stay logged in.${NC}"
echo ""

# Auto-detect
COOKIE_PATH=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  COOKIE_PATH="$HOME/Library/Application Support/Google/Chrome/Default/Cookies"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  COOKIE_PATH="$HOME/.config/google-chrome/Default/Cookies"
fi

if [[ -n "$COOKIE_PATH" && -f "$COOKIE_PATH" ]]; then
  echo -e "${GREEN}  Auto-detected:${NC} $COOKIE_PATH"
  echo -ne "${BOLD}Use this path?${NC} [Y/n]: "
  read -r use_detected
  if [[ "$use_detected" =~ ^[Nn]$ ]]; then
    ask "Custom Chrome cookie path" "" COOKIE_PATH
  fi
else
  echo -e "${YELLOW}  Could not auto-detect Chrome cookies.${NC}"
  ask "Chrome cookie path (or press Enter to skip)" "" COOKIE_PATH
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Generate configs
# ============================================================================

echo -e "${BOLD}Generating your config files...${NC}"
echo ""

# Extract city and state from location
CITY=$(echo "$LOCATION" | cut -d',' -f1 | xargs 2>/dev/null || echo "")
STATE=$(echo "$LOCATION" | cut -d',' -f2 | xargs 2>/dev/null || echo "")

# Phone digits only
PHONE_NATIONAL=$(echo "$PHONE" | tr -dc '0-9')

# Generate linkedin-config.json
cat > config/linkedin-config.json << CONFIGEOF
{
  "firstName": "${FIRST_NAME}",
  "lastName": "${LAST_NAME}",
  "preferredName": "${FIRST_NAME}",
  "email": "${EMAIL}",
  "phone": "${PHONE}",
  "phoneNational": "${PHONE_NATIONAL}",
  "phoneCountryLabel": "United States (+1)",
  "location": "${LOCATION}",
  "city": "${CITY}",
  "state": "${STATE}",
  "country": "United States",
  "postalCode": "",
  "address": "",
  "currentCompany": "${SCHOOL}",
  "website": "",
  "linkedin": "",
  "github": "",
  "citizenship": "${CITIZENSHIP}",
  "visaStatus": "${VISA_STATUS}",
  "compensation": "",
  "startDate": "",
  "expectedGraduation": "${GRADUATION}",
  "school": "${SCHOOL}",
  "major": "${MAJOR}",
  "gpa": "${GPA}",
  "gpaRange": "",
  "degreeType": "${DEGREE_TYPE}",
  "degreeCompleted": "No",
  "yearsExperience": "0",
  "authorizedToWork": "${AUTHORIZED}",
  "requireCurrentSponsorship": "${SPONSOR_NOW}",
  "requireFutureSponsorship": "${SPONSOR_FUTURE}",
  "pursuingAdvancedDegree": "No",
  "eeoGender": "${GENDER}",
  "eeoRace": "${RACE}",
  "eeoVeteran": "No",
  "projectPitch": "",
  "resumePath": "${RESUME_PATH}",
  "chromeCookiePath": "${COOKIE_PATH}",
  "name": "${FIRST_NAME} ${LAST_NAME}",
  "autoSubmit": false
}
CONFIGEOF

echo -e "${GREEN}  Created${NC} config/linkedin-config.json"

# Generate candidate-profile.md
cat > config/candidate-profile.md << PROFILEEOF
## Job Search Agent Handoff

Last updated: $(date +%Y-%m-%d)

### Candidate

- Name: ${FIRST_NAME} ${LAST_NAME}
- Email: ${EMAIL}
- Phone: ${PHONE}
- Current location: ${LOCATION}
- School: ${SCHOOL}
- Degree: ${DEGREE_TYPE} in ${MAJOR}
- Expected graduation: ${GRADUATION}
- GPA: ${GPA} / 4.000
- Citizenship: ${CITIZENSHIP}
- Visa status: ${VISA_STATUS}
- Authorized to work in the United States: ${AUTHORIZED}
- Require sponsorship now: ${SPONSOR_NOW}
- Require future sponsorship: ${SPONSOR_FUTURE}

### Resume files

- General: \`${RESUME_PATH}\`

### Search preferences

- Roles: Add your target roles here
- Locations: Add preferred locations here
- Remote: Yes/No

### Application rules

1. Truthfulness first: prefer truthful, submittable applications over volume
2. Skip hard citizen/green-card gated roles unless there's a truthful path
3. If CAPTCHA blocks, log as "blocked" -- never inflate submitted counts
PROFILEEOF

echo -e "${GREEN}  Created${NC} config/candidate-profile.md"

# Create answer bank from template if it doesn't exist
if [[ ! -f "config/answer-bank.md" ]]; then
  cp config/answer-bank.template.md config/answer-bank.md
  echo -e "${GREEN}  Created${NC} config/answer-bank.md"
fi

# Create tracker if it doesn't exist
if [[ ! -f "application-tracker.csv" ]]; then
  cp templates/tracker.template.csv application-tracker.csv
  echo -e "${GREEN}  Created${NC} application-tracker.csv"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Install dependencies
# ============================================================================

echo -e "${BOLD}Installing dependencies...${NC}"
echo ""

# Node.js
if command -v npm &>/dev/null; then
  npm install --silent 2>/dev/null
  echo -e "${GREEN}  Installed${NC} Node.js dependencies"
else
  echo -e "${RED}  npm not found${NC} — install Node.js from https://nodejs.org/"
fi

# Python
if command -v pip3 &>/dev/null; then
  pip3 install -q browser-cookie3 2>/dev/null || true
  echo -e "${GREEN}  Installed${NC} Python dependencies"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# Summary & Next Steps
# ============================================================================

echo -e "${BOLD}${GREEN}"
cat << 'DONE'
  Setup complete! You're ready to go.
DONE
echo -e "${NC}"

echo -e "${BOLD}Your profile:${NC}"
echo -e "  Name:       ${CYAN}${FIRST_NAME} ${LAST_NAME}${NC}"
echo -e "  Email:      ${CYAN}${EMAIL}${NC}"
echo -e "  School:     ${CYAN}${SCHOOL}${NC}"
echo -e "  Major:      ${CYAN}${MAJOR}${NC}"
echo -e "  Auth:       ${CYAN}${AUTH_STATUS}${NC}"
[[ -n "$RESUME_PATH" ]] && echo -e "  Resume:     ${CYAN}${RESUME_PATH}${NC}"
echo ""

echo -e "${BOLD}Try it out:${NC}"
echo ""
echo -e "  ${CYAN}# Dry run — fills the form but does NOT submit${NC}"
echo -e "  node scripts/linkedin-easy-apply.js \\"
echo -e "    'https://linkedin.com/jobs/view/12345' \\"
echo -e "    config/linkedin-config.json"
echo ""
echo -e "  ${CYAN}# When ready to submit for real, set autoSubmit to true:${NC}"
echo -e "  # Edit config/linkedin-config.json → \"autoSubmit\": true"
echo ""

echo -e "${BOLD}Want AI-powered job hunting?${NC}"
echo -e "  Install ${CYAN}Claude Code${NC} (https://docs.anthropic.com/en/docs/claude-code)"
echo -e "  Then try: ${CYAN}/job-search${NC}, ${CYAN}/apply${NC}, ${CYAN}/tailor-resume${NC}"
echo ""

echo -e "${GREEN}Happy job hunting, ${FIRST_NAME}!${NC}"
echo ""
