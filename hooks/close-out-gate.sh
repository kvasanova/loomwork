#!/usr/bin/env bash
# loomwork close-out gate: remind to run loomwork:close-out when
# finishing-a-development-branch is invoked via the Skill tool.
set -euo pipefail

input=$(cat)
skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
echo "$skill" | grep -q 'finishing-a-development-branch' || exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
plans_dir=$(jq -r '.plansDir // "docs/superpowers/plans"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/plans')
specs_dir=$(jq -r '.specsDir // "docs/superpowers/specs"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/specs')

msg="loomwork close-out gate: before integrating via Option 1 or 2, check for plan/spec artifacts in ${plans_dir}/ or ${specs_dir}/ for this branch. If any exist, invoke the loomwork:close-out skill AFTER tests pass and BEFORE merge — the close-out commit rides the same PR. Skip only if no SDD artifacts, or Option 3/4."
jq -n --arg msg "$msg" \
  '{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $msg } }'
