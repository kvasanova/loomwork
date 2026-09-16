#!/usr/bin/env bash
# loomwork strategy gate: inject the strategy file when brainstorming or
# writing-plans is invoked through a supported hook event; when no strategy
# file exists, nudge toward ce-strategy instead (ce owns the file — loomwork
# never writes it). Invocation discrimination happens here, not in a matcher.
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
case "$event" in
  PostToolUse)
    invocation=$(echo "$input" | jq -r '.tool_input.skill // empty')
    echo "$invocation" | grep -qE '(^|:)brainstorming$|(^|:)writing-plans$' || exit 0
    ;;
  UserPromptSubmit)
    invocation=$(echo "$input" | jq -r '.prompt // empty')
    echo "$invocation" | grep -qE '\$superpowers:(brainstorming|writing-plans)([^[:alnum:]_-]|$)' || exit 0
    ;;
  *)
    exit 0
    ;;
esac

# No resolved project root: the gate cannot tell whether a strategy file is
# missing when it does not know where to look. Stay silent — never nudge from
# an unrelated directory. (Mirrors the Cursor gate's -z "$root" guard.)
payload_root=$(echo "$input" | jq -r '.cwd // empty')
root="${CLAUDE_PROJECT_DIR:-$payload_root}"
if [[ -z "$root" ]]; then
  exit 0
fi

strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="$root/$strategy_rel"
if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg event "$event" --arg nudge "$nudge" \
    '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $nudge } }'
  exit 0
fi

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work. Its full content is already injected below — do NOT Read or open the strategy file (or any loomwork hook script); use this inline copy only. Current content:\n\n'
jq -n --rawfile strat "$strategy_file" --arg event "$event" --arg prefix "$prefix" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: ($prefix + $strat) } }'
