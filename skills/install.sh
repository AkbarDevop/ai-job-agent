#!/usr/bin/env bash
#
# Register the bundled ai-job-agent skills with Claude Code by symlinking
# them into ~/.claude/skills/. Re-run any time to refresh. Idempotent.
#
# Two supported install locations:
#   1. Repo lives at ~/.claude/skills/ai-job-agent/     (gstack-style, recommended)
#   2. Repo lives anywhere else, e.g. ~/ai-job-agent/   (legacy)
#
# In both cases the skills get symlinked as ~/.claude/skills/<name>.
# In case 1 the repo IS the marker dir and we skip writing REPO_PATH
# (the location is obvious). In case 2 we write a REPO_PATH marker file
# so the scripts can find the repo regardless of cwd.
#
# Usage:
#   bash skills/install.sh           # install all bundled skills
#   bash skills/install.sh --uninstall   # remove the symlinks
#

set -eu

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SKILLS_DIR/.." && pwd)"
TARGET_ROOT="${HOME}/.claude/skills"
MARKER_DIR="${TARGET_ROOT}/ai-job-agent"

# Detect the gstack-style install: repo lives AT the marker dir. In that case
# we must not rm -rf the marker dir during uninstall (that would nuke the
# repo), and writing REPO_PATH inside the repo is redundant.
REPO_IS_MARKER=0
if [ "$REPO_ROOT" = "$MARKER_DIR" ]; then
  REPO_IS_MARKER=1
fi

BUNDLED=(job-coach job-setup job-apply job-track job-triage job-status job-outreach job-followup job-dashboard)

uninstall() {
  for name in "${BUNDLED[@]}"; do
    local link="${TARGET_ROOT}/${name}"
    if [ -L "$link" ]; then
      # only remove if it's our symlink, not a user-authored skill
      if readlink "$link" | grep -q "${SKILLS_DIR}/${name}$"; then
        rm "$link"
        echo "removed: $link"
      else
        echo "skipped (not ours): $link -> $(readlink "$link")"
      fi
    fi
  done
  # Only remove the marker dir if the repo does NOT live inside it.
  if [ "$REPO_IS_MARKER" -eq 0 ] && [ -d "$MARKER_DIR" ]; then
    rm -rf "$MARKER_DIR"
    echo "removed: $MARKER_DIR"
  elif [ "$REPO_IS_MARKER" -eq 1 ]; then
    echo "note: repo lives at $MARKER_DIR — skipping rm to avoid wiping the clone."
    echo "      delete the repo manually with: rm -rf $MARKER_DIR"
  fi
  echo "Uninstall complete."
}

if [ "${1:-}" = "--uninstall" ]; then
  uninstall
  exit 0
fi

mkdir -p "$TARGET_ROOT"

if [ "$REPO_IS_MARKER" -eq 1 ]; then
  echo "repo is at $MARKER_DIR (gstack-style) — skipping REPO_PATH marker file"
else
  mkdir -p "$MARKER_DIR"
  printf '%s\n' "$REPO_ROOT" > "${MARKER_DIR}/REPO_PATH"
  echo "wrote: ${MARKER_DIR}/REPO_PATH -> $REPO_ROOT"
fi

installed=()
skipped=()
for name in "${BUNDLED[@]}"; do
  src="${SKILLS_DIR}/${name}"
  link="${TARGET_ROOT}/${name}"

  if [ ! -f "${src}/SKILL.md" ]; then
    echo "  warn: ${src}/SKILL.md missing, skipping"
    continue
  fi

  if [ -L "$link" ]; then
    existing_target="$(readlink "$link")"
    if [ "$existing_target" = "$src" ]; then
      skipped+=("$name (already linked)")
      continue
    fi
    echo "  warn: ${link} -> ${existing_target} already exists. Replace? (y/N)"
    read -r reply
    if [ "$reply" != "y" ] && [ "$reply" != "Y" ]; then
      skipped+=("$name (existing link not ours, left alone)")
      continue
    fi
    rm "$link"
  elif [ -e "$link" ]; then
    echo "  warn: ${link} exists but is not a symlink. Back it up and rerun to install the bundled version."
    skipped+=("$name (non-symlink collision)")
    continue
  fi

  ln -s "$src" "$link"
  installed+=("$name")
done

echo ""
echo "Installed ${#installed[@]} skill(s): ${installed[*]:-(none)}"
if [ "${#skipped[@]}" -gt 0 ]; then
  echo "Skipped ${#skipped[@]}: ${skipped[*]}"
fi
echo ""
echo "Try them in a new Claude Code session:"
for name in "${installed[@]:-${BUNDLED[@]}}"; do
  echo "  /${name}"
done
echo ""
echo "To uninstall later: bash skills/install.sh --uninstall"
