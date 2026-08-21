#!/usr/bin/env bash
# loomwork strategy gate: inject the strategy file when brainstorming or
# writing-plans is invoked via the Skill tool; when no strategy file exists,
# nudge toward ce-strategy instead (ce owns the file — loomwork never writes
# it). Skill-name discrimination happens here (grep on .tool_input.skill),
# not in the hooks.json matcher.
set -euo pipefail

input=$(cat)
skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
echo "$skill" | grep -qE 'brainstorming|writing-plans' || exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="$root/$strategy_rel"
if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg nudge "$nudge" \
    '{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $nudge } }'
  exit 0
fi

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work. Its full content is already injected below — do NOT Read or open the strategy file (or any loomwork hook script); use this inline copy only. Current content:\n\n'
jq -n --rawfile strat "$strategy_file" --arg prefix "$prefix" \
  '{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ($prefix + $strat) } }'
