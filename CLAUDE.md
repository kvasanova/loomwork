# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The imported guidelines above are the shared, tool-agnostic ones. What follows applies only to Claude Code.

## Claude Code is both a host and a target

This repository is a portable Agent Plugins package that retains Claude-specific runtime surfaces, so a Claude Code session editing it may also be running it. Changes to `hooks/hooks.json` or `hooks/*.sh` take effect only after the plugin reloads — a gate that misbehaves mid-session is usually the old copy still loaded, not a bug in the edit.

## Path variables

- `${CLAUDE_PLUGIN_ROOT}` — the plugin's own root. Claude's hook registration and `/loomwork:init` command use it; portable skills resolve their CLIs relative to the installed `SKILL.md` instead. Never hardcode an installation-specific path to `scripts/` in skill or command Markdown.
- `CLAUDE_PROJECT_DIR` — the consumer repository root. `resolveRepoRoot()` prefers it, then walks up for `.git` or `.loomwork.json`. Set it to a disposable directory when testing `init.mjs`, and to a temporary directory in hook tests.
- The shared gates prefer `CLAUDE_PROJECT_DIR`, then the hook payload's `.cwd`. `strategy-gate.sh` exits silently when neither resolves, so the gate never nudges from an unrelated directory. Keep that guard.

## Hook contract

Gates run on `PostToolUse` with matcher `Skill` and emit a single JSON object on stdout:

```json
{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }
```

Anything else on stdout corrupts the injection. A gate that does not apply exits 0 with no output.

## Skills in this repository

`skills/audit` and `skills/close-out` are instructions for Claude, not code — their SKILL.md frontmatter `description` is what makes the skill fire, so treat it as the trigger surface and edit it with that in mind. Both skills preflight for the superpowers and compound-engineering plugins before doing anything.

The plugin depends on skills from those two plugins by exact name; see the pinned-names section in the imported guidelines.
