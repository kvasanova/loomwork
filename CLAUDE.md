# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The imported guidelines above are the shared, tool-agnostic ones. What follows applies only to Claude Code.

## Claude Code is both a host and a target

This repository is a portable Agent Plugins package that retains Claude-specific runtime surfaces, so a Claude Code session editing it may also be running it. Changes to `hooks/hooks.json` or `hooks/*.sh` take effect only after the plugin reloads — a gate that misbehaves mid-session is usually the old copy still loaded, not a bug in the edit.

## Path variables

- `${CLAUDE_PLUGIN_ROOT}` — the plugin's own root. Claude's hook registration uses it; portable skills resolve their CLIs relative to the installed `SKILL.md` instead. Never hardcode an installation-specific path to `scripts/` in skill Markdown.
- `CLAUDE_PROJECT_DIR` — the consumer repository root. `resolveRepoRoot()` prefers it, then walks up for `.git` or `.loomwork.json`. Set it to a disposable directory when testing `init.mjs`, and to a temporary directory in hook tests.
- The shared gates prefer `CLAUDE_PROJECT_DIR`, then the hook payload's `.cwd`. The gates exit silently when neither resolves, so they never nudge from an unrelated directory. Keep that guard.

## Hook contract

Each gate emits a single JSON object on stdout, echoing the incoming event name: `PostToolUse` for the close-out gate (matcher `Skill`), `SessionStart` for the doctrine gate.

```json
{ "hookSpecificOutput": { "hookEventName": "<incoming event>", "additionalContext": "..." } }
```

Anything else on stdout corrupts the injection. A gate that does not apply exits 0 with no output.

## Skills in this repository

The skills under `skills/` are instructions for Claude, not code — a SKILL.md frontmatter `description` is what makes the skill fire, so treat it as the trigger surface and edit it with that in mind (`model-assignment` and `split-agents-md` set `disable-model-invocation` and run only when invoked by name). `audit`, `close-out`, and `init` preflight for the superpowers plugin before doing anything.

The plugin depends on superpowers skills by exact name; see the pinned-names section in the imported guidelines.
