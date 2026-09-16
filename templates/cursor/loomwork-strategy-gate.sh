#!/usr/bin/env bash
# loomwork (Cursor) strategy gate: inject the strategy file when brainstorming
# or writing-plans starts; when no strategy file exists, nudge toward
# ce-strategy instead (ce owns the file — loomwork never writes it). Claude
# Code equivalent: the loomwork plugin's hooks/strategy-gate.sh (PostToolUse +
# Skill matcher).
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
root=$(echo "$input" | jq -r '.workspace_roots[0] // empty')

should_fire=false

case "$event" in
  beforeSubmitPrompt)
    prompt=$(echo "$input" | jq -r '.prompt // empty')
    # Matched with bash's =~, never `echo | grep -q`: grep exits on its first
    # match, and the resulting write failure under `set -o pipefail` made the
    # gate exit 0 with no output — a silent no-op. This event carries raw user
    # prompts, so a pasted log past the 64KB pipe buffer was enough to trigger
    # it (measured: 200KB dropped the injection 10/10).
    prompt_re='(^|[[:space:]/])(writing-plans|brainstorming)([[:space:]/:]|$)'
    shopt -s nocasematch
    if [[ "$prompt" =~ $prompt_re ]]; then
      should_fire=true
    fi
    shopt -u nocasematch
    ;;
  postToolUse)
    tool=$(echo "$input" | jq -r '.tool_name // empty')
    skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
    path=$(echo "$input" | jq -r '.tool_input.path // .tool_input.file_path // empty')

    skill_re='brainstorming|writing-plans'
    path_re='(writing-plans|brainstorming)/SKILL\.md'
    if [[ "$tool" == "Skill" && "$skill" =~ $skill_re ]]; then
      should_fire=true
    elif [[ "$tool" == "Read" && "$path" =~ $path_re ]]; then
      should_fire=true
    fi
    ;;
esac

if [[ "$should_fire" != true ]]; then
  exit 0
fi

# No workspace root: the gate cannot tell whether a strategy file is missing
# when it does not know where to look. Stay silent — never nudge.
if [[ -z "$root" ]]; then
  exit 0
fi

strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="${root}/${strategy_rel}"

if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg nudge "$nudge" '{ additional_context: $nudge }'
  exit 0
fi

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work. Its full content is already injected below — do NOT Read or open the strategy file (or any loomwork hook script); use this inline copy only. Current content:\n\n'
jq -n \
  --rawfile strat "$strategy_file" \
  --arg prefix "$prefix" \
  '{ additional_context: ($prefix + $strat) }'
