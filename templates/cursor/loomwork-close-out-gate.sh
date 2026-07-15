#!/usr/bin/env bash
# loomwork (Cursor) close-out gate: remind to run loomwork:close-out when
# finishing a development branch. Claude Code equivalent: the loomwork
# plugin's hooks/close-out-gate.sh.
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
root=$(echo "$input" | jq -r '.workspace_roots[0] // empty')

should_fire=false

case "$event" in
  beforeSubmitPrompt)
    prompt=$(echo "$input" | jq -r '.prompt // empty')
    if echo "$prompt" | grep -qiE '(^|[[:space:]/])finishing-a-development-branch([[:space:]/:]|$)|(^|[[:space:]/])finish(ing)?(-a)?(-development)?(-branch)?([[:space:]/:]|$)'; then
      should_fire=true
    fi
    ;;
  postToolUse)
    tool=$(echo "$input" | jq -r '.tool_name // empty')
    skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
    path=$(echo "$input" | jq -r '.tool_input.path // .tool_input.file_path // empty')

    if [[ "$tool" == "Skill" ]] && echo "$skill" | grep -q 'finishing-a-development-branch'; then
      should_fire=true
    elif [[ "$tool" == "Read" ]] && echo "$path" | grep -q 'finishing-a-development-branch/SKILL\.md'; then
      should_fire=true
    fi
    ;;
esac

if [[ "$should_fire" != true ]]; then
  exit 0
fi

plans_dir='docs/superpowers/plans'
specs_dir='docs/superpowers/specs'
if [[ -n "$root" && -f "$root/.loomwork.json" ]]; then
  plans_dir=$(jq -r '.plansDir // "docs/superpowers/plans"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/plans')
  specs_dir=$(jq -r '.specsDir // "docs/superpowers/specs"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/specs')
fi

msg="loomwork close-out gate: before integrating via Option 1 or 2, check for plan/spec artifacts in ${plans_dir}/ or ${specs_dir}/ for this branch. If any exist, invoke the loomwork:close-out skill AFTER tests pass and BEFORE merge — the close-out commit rides the same PR. Skip only if no SDD artifacts, or Option 3/4."

jq -n --arg msg "$msg" '{ additional_context: $msg }'
