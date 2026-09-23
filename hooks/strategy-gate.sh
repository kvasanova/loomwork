#!/usr/bin/env bash
# loomwork strategy gate: inject the strategy file when brainstorming or
# writing-plans is invoked through a supported hook event; when no strategy
# file exists, nudge toward ce-strategy instead (ce owns the file — loomwork
# never writes it). Invocation discrimination happens here, not in a matcher.
set -euo pipefail

source "$(dirname "$0")/lib/resolve-repo-root.sh"

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
case "$event" in
  PostToolUse)
    invocation=$(echo "$input" | jq -r '.tool_input.skill // empty')
    skill_re='(^|:)brainstorming$|(^|:)writing-plans$'
    [[ "$invocation" =~ $skill_re ]] || exit 0
    ;;
  UserPromptSubmit)
    invocation=$(echo "$input" | jq -r '.prompt // empty')
    prompt_re='\$superpowers:(brainstorming|writing-plans)([^[:alnum:]_-]|$)'
    [[ "$invocation" =~ $prompt_re ]] || exit 0
    ;;
  *)
    exit 0
    ;;
esac

# No resolved project root: the gate cannot tell whether a strategy file is
# missing when it does not know where to look. Stay silent — never nudge from
# an unrelated directory. (Mirrors the Cursor gate's -z "$root" guard.)
# CLAUDE_PROJECT_DIR wins and is used exactly as given; a Codex payload's .cwd
# is a session directory, so walk up from it to the repository root instead.
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

strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="$root/$strategy_rel"
if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg event "$event" --arg nudge "$nudge" \
    '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $nudge } }'
  exit 0
fi

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work. Its content follows below — do NOT Read or open the strategy file (or any loomwork hook script); use this injected copy only. If your host truncated this output and saved it to a file, read that saved hook-output file (the host names it in its head/tail preview) to recover the rest. Current content:\n\n'
jq -n --rawfile strat "$strategy_file" --arg event "$event" --arg prefix "$prefix" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: ($prefix + $strat) } }'
