#!/usr/bin/env bash
# loomwork close-out gate: remind to run loomwork:close-out when
# finishing-a-development-branch is invoked through a supported hook event.
set -euo pipefail

source "$(dirname "$0")/lib/resolve-repo-root.sh"

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
case "$event" in
  PostToolUse)
    invocation=$(echo "$input" | jq -r '.tool_input.skill // empty')
    skill_re='(^|:)finishing-a-development-branch$'
    [[ "$invocation" =~ $skill_re ]] || exit 0
    ;;
  UserPromptSubmit)
    invocation=$(echo "$input" | jq -r '.prompt // empty')
    prompt_re='\$superpowers:finishing-a-development-branch([^[:alnum:]_-]|$)'
    [[ "$invocation" =~ $prompt_re ]] || exit 0
    ;;
  *)
    exit 0
    ;;
esac

# CLAUDE_PROJECT_DIR wins and is used exactly as given; a Codex payload's .cwd
# is a session directory, so walk up from it to the repository root instead.
# With neither, stay silent rather than reading /.loomwork.json off the
# filesystem root. (Mirrors strategy-gate.sh.)
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

plans_dir=$(jq -r '.plansDir // "docs/superpowers/plans"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/plans')
specs_dir=$(jq -r '.specsDir // "docs/superpowers/specs"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/specs')

msg="loomwork close-out gate: before integrating via Option 1 or 2, check for plan/spec artifacts in ${plans_dir}/ or ${specs_dir}/ for this branch. If any exist, invoke the loomwork:close-out skill AFTER tests pass and BEFORE merge — the close-out commit rides the same PR. Skip only if no SDD artifacts, or Option 3/4."
jq -n --arg event "$event" --arg msg "$msg" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $msg } }'
