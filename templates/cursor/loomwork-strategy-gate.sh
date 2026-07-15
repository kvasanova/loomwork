#!/usr/bin/env bash
# loomwork (Cursor) strategy gate: inject the strategy file when brainstorming
# or writing-plans starts. Claude Code equivalent: the loomwork plugin's
# hooks/strategy-gate.sh (PostToolUse + Skill matcher).
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
root=$(echo "$input" | jq -r '.workspace_roots[0] // empty')

should_fire=false

case "$event" in
  beforeSubmitPrompt)
    prompt=$(echo "$input" | jq -r '.prompt // empty')
    if echo "$prompt" | grep -qiE '(^|[[:space:]/])(writing-plans|brainstorming)([[:space:]/:]|$)'; then
      should_fire=true
    fi
    ;;
  postToolUse)
    tool=$(echo "$input" | jq -r '.tool_name // empty')
    skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
    path=$(echo "$input" | jq -r '.tool_input.path // .tool_input.file_path // empty')

    if [[ "$tool" == "Skill" ]] && echo "$skill" | grep -qE 'brainstorming|writing-plans'; then
      should_fire=true
    elif [[ "$tool" == "Read" ]] && echo "$path" | grep -qE '(writing-plans|brainstorming)/SKILL\.md'; then
      should_fire=true
    fi
    ;;
esac

if [[ "$should_fire" != true ]]; then
  exit 0
fi

strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="${root}/${strategy_rel}"
if [[ -z "$root" || ! -f "$strategy_file" ]]; then
  exit 0
fi

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work — read it before brainstorming or planning. Current content:\n\n'
jq -n \
  --rawfile strat "$strategy_file" \
  --arg prefix "$prefix" \
  '{ additional_context: ($prefix + $strat) }'
