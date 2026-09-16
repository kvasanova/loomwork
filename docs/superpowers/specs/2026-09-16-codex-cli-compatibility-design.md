---
issue: 3
status: implemented
implemented_in: "PR #8"
verified: 2026-09-16
---

# Native Codex plugin compatibility

## Problem

Loomwork ships a Claude Code manifest, a Claude slash command, and hook gates
that only observe Claude's `Skill` tool. Codex can discover the existing
`skills/` directory when the repository is imported, but the repository is not
a portable plugin: it has no root Agent Plugins manifest, no `init` skill, and
no hook trigger for Codex skill invocations. A fresh initialization also creates
`CLAUDE.md` when no memory file exists, even though `AGENTS.md` is the shared
cross-agent convention.

The original issue predates Codex's current compatibility behavior. Current
Codex supports the Claude-shaped `hookSpecificOutput` envelope and provides
`CLAUDE_PLUGIN_ROOT` to plugin hooks for compatibility. The port therefore does
not need a second output format or a wholesale rewrite of the hook scripts. It
does need a native package entry point, a Codex-observable trigger, and portable
root selection.

## Goals

- Make the repository installable as a portable Agent Plugins package while
  retaining its existing Claude Code manifest.
- Expose initialization as `loomwork:init` through `skills/init/SKILL.md` while
  keeping `/loomwork:init` available to Claude Code.
- Run the strategy and close-out gates in Codex when the user explicitly invokes
  the pinned upstream skills with `$superpowers:...`.
- Let shared hook scripts obtain the consumer repository from either
  `CLAUDE_PROJECT_DIR` or the hook payload's `cwd`.
- Make a fresh initialization create `AGENTS.md`; preserve existing placement
  and duplicate-avoidance behavior for repositories that already have
  `AGENTS.md`, `CLAUDE.md`, or a loomwork marker block.
- Keep all existing Claude Code and Cursor behavior covered by regression tests.

## Non-goals

- Detecting an implicit Codex skill invocation that does not appear in the user
  prompt. Codex exposes prompt lifecycle hooks, not a post-skill event.
- Replacing `.claude-plugin/plugin.json`, Claude commands, or Cursor templates.
- Adding a repository marketplace file. The containing toolshed marketplace is
  responsible for catalog distribution.
- Adding dependencies, a build step, or a YAML parser.
- Creating or editing `STRATEGY.md`; it remains owned by
  `compound-engineering:ce-strategy`.

## Design

### Portable package manifest

Add `plugin.json` at the repository root using the Agent Plugins 1.0 schema.
The root manifest is the canonical portable identity; the existing
`.claude-plugin/plugin.json` remains the Claude Code entry point. The manifest
uses `extensions.com.openai.hooks` to select `./hooks/codex-hooks.json`.
Skills remain in the root `skills/` directory and are discovered automatically.

A manifest test parses both manifests, verifies the portable schema and hook
path, and pins shared identity fields (`name`, `version`, `description`) so the
two manifests cannot silently drift.

### Codex hook trigger

Add `hooks/codex-hooks.json` with a `UserPromptSubmit` matcher group that runs
both existing gate scripts via `${PLUGIN_ROOT}`. Codex has no `Skill` tool event
equivalent for skill loading, so each script recognizes explicit prompt forms:

- `$superpowers:brainstorming`
- `$superpowers:writing-plans`
- `$superpowers:finishing-a-development-branch`

The Claude `PostToolUse` path remains unchanged. The scripts derive the output
envelope's `hookEventName` from the incoming event, and select the consumer root
from `CLAUDE_PROJECT_DIR` first, then `.cwd`. Strategy injection remains silent
when no root resolves. The hook output stays concise and uses the already
compatible `hookSpecificOutput.additionalContext` envelope.

### Portable init workflow and roots

Add `skills/init/SKILL.md` as the skill equivalent of `commands/init.md`. It
performs the same dependency preflight, resolves `../../scripts/init.mjs`
relative to its own installed `SKILL.md` path, runs that absolute script path
with the consumer repository as the command working directory, and routes
missing strategy creation to `compound-engineering:ce-strategy`.

Update `skills/audit/SKILL.md` to resolve `../../scripts/sdd-audit.mjs` the same
way. Skill-driven CLI execution therefore does not depend on a host-specific
plugin-root environment variable. The Node CLIs already resolve the consumer
repository from the current directory by walking to `.git` or
`.loomwork.json`, so no Codex-specific project environment variable is
invented.

When neither memory file exists, `initRepo` creates `AGENTS.md`. If either file
already exists, current precedence and marker duplicate prevention remain
unchanged.

### Documentation and validation

README and contributor guidance describe Loomwork as a portable plugin with
Claude and Cursor compatibility surfaces. Installation examples include Codex's
`codex plugin marketplace add` / `codex plugin add` flow and explain that Codex
gates observe explicit `$skill` invocations.

The existing Node test suite covers manifests, initialization, and both hook
event shapes. `skillspector scan skills/ --no-llm` statically vets the new and
modified skills before handoff.

## Files touched

| File | Change |
| --- | --- |
| `plugin.json` | Add the portable Agent Plugins manifest and Codex hook pointer |
| `.claude-plugin/plugin.json` | No behavior change; identity remains aligned with `plugin.json` |
| `hooks/codex-hooks.json` | Add Codex `UserPromptSubmit` hook registration |
| `hooks/strategy-gate.sh` | Accept explicit Codex prompts, payload `cwd`, and dynamic event names |
| `hooks/close-out-gate.sh` | Accept explicit Codex prompts, payload `cwd`, and dynamic event names |
| `skills/init/SKILL.md` | Add portable initialization workflow |
| `skills/audit/SKILL.md` | Resolve the audit CLI relative to the installed skill path |
| `scripts/init.mjs` | Create `AGENTS.md` for a fresh repository |
| `scripts/lib/__tests__/plugin.test.mjs` | Validate package metadata and Codex hook registration |
| `scripts/lib/__tests__/hooks.test.mjs` | Cover Claude and Codex event contracts |
| `scripts/lib/__tests__/init.test.mjs` | Pin the fresh `AGENTS.md` behavior |
| `README.md` | Document Codex install, invocation, and hook limits |
| `AGENTS.md` | Document the portable manifest and Codex hook runtime |
| `commands/init.md` | Update shared init wording to say `AGENTS.md` first |

## Compatibility and migration

- Existing Claude installations continue reading `.claude-plugin/plugin.json`
  and `hooks/hooks.json`.
- Existing Cursor installations are unchanged; users still rerun init after
  updates to refresh copied scripts.
- Existing consumer repositories are not moved from `CLAUDE.md` to `AGENTS.md`.
  Only a repository with neither file gets the new default.
- Codex users must review and trust plugin-bundled hooks before they run.
- Codex hook gates fire for explicit `$superpowers:...` prompts. Implicit skill
  selection remains governed by the skill instructions themselves.

## Acceptance

- [x] A root `plugin.json` declares the Agent Plugins 1.0 schema, matches the
      Claude manifest's identity, and points Codex at `hooks/codex-hooks.json`.
- [x] Codex discovers `loomwork:init` from `skills/init/SKILL.md`.
- [x] A fresh consumer repository receives `AGENTS.md`, not `CLAUDE.md`.
- [x] Existing `AGENTS.md`/`CLAUDE.md` selection and marker idempotency remain
      unchanged.
- [x] Explicit Codex prompts for brainstorming/writing-plans receive strategy
      context or the existing missing-strategy nudge.
- [x] An explicit Codex finishing-a-development-branch prompt receives the
      close-out reminder.
- [x] Claude `PostToolUse` skill events and Cursor hook tests remain green.
- [x] Audit and init skill instructions resolve their CLIs relative to their
      installed `SKILL.md` paths without plugin-root environment variables.
- [x] The full Node test suite passes and SkillSpector reports no static skill
      findings that block installation.
