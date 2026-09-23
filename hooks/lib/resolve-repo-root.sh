#!/usr/bin/env bash
# Shared by strategy-gate.sh, close-out-gate.sh, and doctrine-gate.sh.
# Walk up from $1 to the nearest ancestor holding a repository marker. Falls
# back to the starting directory so an uninitialized repo still gets nudged.
resolve_repo_root() {
  local start="$1" dir
  dir=$(cd "$start" 2>/dev/null && pwd -P) || { printf '%s' "$start"; return; }
  while true; do
    if [[ -e "$dir/.git" || -e "$dir/.loomwork.json" ]]; then
      printf '%s' "$dir"
      return
    fi
    [[ "$dir" == "/" ]] && break
    dir=$(dirname "$dir")
  done
  printf '%s' "$start"
}
