#!/usr/bin/env bash
# loomwork doctrine gate: inject the current loomwork SDD doctrine at Claude
# Code session start (and after compaction) for repos that have opted into
# loomwork, sourced live from this plugin's own templates/claude-md-block.md.
# Replaces the old /loomwork:init-time copy into AGENTS.md/CLAUDE.md, so an
# upgraded plugin's doctrine reaches every opted-in repo without a re-run.
set -euo pipefail

source "$(dirname "$0")/lib/resolve-repo-root.sh"

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
[[ "$event" == "SessionStart" ]] || exit 0

payload_root=$(echo "$input" | jq -r '.cwd // empty')
if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
  root="$CLAUDE_PROJECT_DIR"
elif [[ -n "$payload_root" ]]; then
  root=$(resolve_repo_root "$payload_root")
else
  root=''
fi
if [[ -z "$root" ]]; then
  exit 0
fi

config_valid=false
specs_dir='docs/superpowers/specs'
if [[ -f "$root/.loomwork.json" ]]; then
  if parsed_specs_dir=$(jq -er '.specsDir // "docs/superpowers/specs"' "$root/.loomwork.json" 2>/dev/null); then
    config_valid=true
    specs_dir="$parsed_specs_dir"
  fi
fi

opted_in=false
if [[ "$config_valid" == true || -d "$root/$specs_dir" ]]; then
  opted_in=true
fi
[[ "$opted_in" == true ]] || exit 0

doctrine_file="$(dirname "$0")/../templates/claude-md-block.md"
if [[ ! -f "$doctrine_file" ]]; then
  exit 0
fi

jq -n --rawfile doctrine "$doctrine_file" --arg event "$event" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $doctrine } }'
