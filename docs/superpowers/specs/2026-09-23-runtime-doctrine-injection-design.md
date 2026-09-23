---
issue: 17
status: approved
---

# Inject loomwork doctrine at runtime instead of copying it into consumer repos

## Problem

`/loomwork:init` copies two things into a consumer repository:

- the doctrine block (`templates/claude-md-block.md`) into `AGENTS.md` or `CLAUDE.md`, guarded by `<!-- loomwork:begin -->` / `<!-- loomwork:end -->` markers
- the Cursor gate scripts (`templates/cursor/*`) into `.cursor/hooks/` and `.cursor/hooks.json`

The plugin is installed globally, not per repo. When a plugin upgrade changes what init would write, every consumer repo that already ran init keeps the old copy — nothing prompts a re-run, and there is no per-repo mechanism to remember it. `scripts/init.mjs`'s marker-block write is guarded by `if (!alreadyPresent)`, so today even a manual re-run of init does not refresh an existing block; only a first-time write happens.

Concrete case: the model-assignment rework added a doctrine line about session-held model assignment and per-task `**Model:**` lines. A repo initialized before that change keeps the old doctrine text, so `subagent-driven-development` stops honoring per-task lines after context compaction or in a new session — the very case the doctrine line exists to cover.

## Governing decision

Stop copying the doctrine into consumer repos. Deliver it live from the installed plugin via a `SessionStart` hook, the same mechanism `superpowers:using-superpowers` uses to introduce itself each session. Scope injection to repos that have opted into loomwork. Updating the plugin then updates every repo's doctrine at once: no version stamp, no staleness check, no "re-run init" prompt, nothing to remember per repo.

This directly fixes the model-assignment case: `SessionStart` fires at session start and again after compaction, so the doctrine in context is always the version the installed plugin currently ships.

## Scope

**In scope:**
- A `SessionStart` hook that injects the current doctrine text into Claude Code sessions in opted-in repos.
- `scripts/init.mjs` stops writing the doctrine block; it strips a pre-existing legacy block on next run instead.
- Full removal of Cursor-specific support (templates, init logic, tests, docs).

**Out of scope (tracked in #20):** Codex delivery of the doctrine. codex-cli's `SessionStart` support for `additionalContext` is unresolved — the official docs and [openai/codex#45999](https://github.com/openai/codex/issues/45999) disagree, and #45999 was closed "not planned" against codex-cli 0.154.0. #20 covers probing this and implementing whichever path works (a Codex `SessionStart` hook, or folding the doctrine into the existing Codex `UserPromptSubmit` gates). This spec's removal of the in-repo doctrine block must not ship to Codex users until #20 lands a replacement — see Migration below.

## Design

### Opt-in scope check

A repo is "opted into loomwork" when root resolution (below) succeeds AND the resolved root contains `.loomwork.json` or the configured `specsDir` (default `docs/superpowers/specs`). This mirrors what `scripts/init.mjs` creates, so any repo that has run init qualifies, and repos that never ran init see no injection — matching today's behavior of "no new noise beyond existing nudges" for uninitialized repos.

Root resolution reuses the existing pattern from `strategy-gate.sh` / `close-out-gate.sh`: `CLAUDE_PROJECT_DIR` if set, else walk up from the payload's `.cwd` for `.git` or `.loomwork.json`, else stay silent. `SessionStart` payloads carry `.cwd`; no new resolution logic is needed beyond extracting the existing `resolve_repo_root` shell function into a shared location (see File Structure) so it isn't triple-maintained across three gate scripts.

### New hook: `hooks/doctrine-gate.sh`

Fires on `SessionStart` with `matcher: "startup|clear|compact"` — the same matcher value the superpowers plugin itself registers for its session-start hook (confirmed by reading its installed `hooks/hooks.json`), so loomwork's doctrine refreshes on the identical set of triggers superpowers uses, including after compaction. Registered in `hooks/hooks.json` under a new `SessionStart` block, command `"${CLAUDE_PLUGIN_ROOT}/hooks/doctrine-gate.sh"` — the same `${CLAUDE_PLUGIN_ROOT}`-relative form the existing `strategy-gate.sh` / `close-out-gate.sh` entries already use in this file, so the hook resolves the plugin's own template regardless of install location.

Behavior:
1. Read stdin JSON, extract `.cwd`.
2. Resolve repo root per above. If resolution fails or the repo is not opted in, exit 0 with no output.
3. Read `templates/claude-md-block.md` from the plugin's own install, resolved as `"$(dirname "$0")/../templates/claude-md-block.md"` — the same `$0`-relative pattern already implicit in how `strategy-gate.sh`/`close-out-gate.sh` sit under `hooks/` next to their own dependencies, and consistent with `CLAUDE.md`'s note that `${CLAUDE_PLUGIN_ROOT}` is for *registration* (the `hooks.json` command string) while a script locates its own sibling files relative to itself. Emit the template as `additionalContext` via `hookSpecificOutput`, matching the existing gates' JSON shape:

```json
{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<doctrine text>" } }
```

No "do not read this file yourself" instruction is needed (unlike the strategy gate) — `templates/claude-md-block.md` is a static plugin file, not a per-repo document an agent might redundantly re-open in the same way STRATEGY.md is.

### `scripts/init.mjs` changes

- Remove the "append doctrine block to AGENTS.md/CLAUDE.md" step entirely.
- Add a "strip legacy block" step: for each of `AGENTS.md`, `CLAUDE.md`, if the file exists and contains `<!-- loomwork:begin -->...<!-- loomwork:end -->` (with the surrounding blank line this repo's writer adds), remove that span and report `removed legacy loomwork block from <file>`. Idempotent: absent marker → no action, no report line.
- Remove all Cursor logic (directory creation, script copying, `hooks.json` merge/migration).
- Keep: spec/plan/solutions directory scaffolding, the missing-`STRATEGY.md` report line.

### Cursor removal

Per user decision: Cursor is not used; Cursor's own "run the Claude Code plugin" support is expected to cover it going forward, so no Cursor-specific gate is needed. Delete:

- `templates/cursor/` (all three files)
- The Cursor branch of `scripts/init.mjs` (directory creation, script copy loop, `hooks.json` merge/migrate loop, `CURSOR_SCRIPTS` constant)
- `scripts/lib/__tests__/cursor-hooks.test.mjs`
- Cursor mentions in `AGENTS.md`, `skills/init/SKILL.md`, `references/PLAYBOOK.md`

A repo that ran init before this change may still have `.cursor/hooks/loomwork-*.sh` and loomwork entries in `.cursor/hooks.json` on disk. These are inert once the plugin no longer maintains them, and are left alone — deleting a user's `.cursor/` files from a plugin update is a bigger blast radius than leaving stale, unreferenced scripts. `init.mjs` does not clean them up; this is a manual/documented step in the PR description, not code.

### File Structure

- `hooks/doctrine-gate.sh` — new. `SessionStart` hook, ~40 lines following the shape of `strategy-gate.sh`.
- `hooks/lib/resolve-repo-root.sh` — new. Extracts the `resolve_repo_root` bash function (currently duplicated in `strategy-gate.sh` and `close-out-gate.sh`) into one sourced file, `source`d by all three gates. Pure refactor of existing logic, no behavior change to the two existing gates.
- `hooks/hooks.json` — modify. Add `SessionStart` block pointing at `doctrine-gate.sh`.
- `scripts/init.mjs` — modify. Remove doctrine-write + all Cursor logic; add legacy-block-strip logic.
- `templates/cursor/` — delete (3 files).
- `scripts/lib/__tests__/cursor-hooks.test.mjs` — delete.
- `scripts/lib/__tests__/init.test.mjs` — modify. Remove Cursor assertions and the doctrine-append assertions; add legacy-block-strip tests.
- `scripts/lib/__tests__/hooks.test.mjs` — modify. Add `doctrine-gate.sh` test cases.
- `AGENTS.md`, `skills/init/SKILL.md`, `references/PLAYBOOK.md` — modify. Drop Cursor mentions; note doctrine is injected, not copied.

### Non-goals

- No version stamp or staleness comparison of any kind — the whole point is that runtime injection needs none.
- No change to the strategy gate or close-out gate's own logic beyond the shared root-resolution extraction.
- No automatic cleanup of a previously-initialized repo's stale `.cursor/` files.
- No Codex implementation here (tracked in #20).

## Migration / sequencing note

This spec's `init.mjs` change (removing the doctrine-block write, stripping legacy blocks) should not merge and release ahead of #20 landing Codex's replacement delivery path, per the Problem statement in #20: Codex users would otherwise lose the doctrine in the gap between this shipping and #20 shipping. Coordinate release, not necessarily implementation order.

## Acceptance

- [ ] A Claude Code session started inside a repo with `.loomwork.json` or `docs/superpowers/specs/` present receives the current doctrine text via `SessionStart` `additionalContext`, sourced from the plugin's own `templates/claude-md-block.md` (not a repo copy).
- [ ] A Claude Code session started inside a repo with neither marker receives no injection from `doctrine-gate.sh`.
- [ ] `doctrine-gate.sh` stays silent when neither `CLAUDE_PROJECT_DIR` nor a resolvable `.cwd` is available, matching the other two gates.
- [ ] Running `node scripts/init.mjs` on a repo whose `AGENTS.md` or `CLAUDE.md` contains a `<!-- loomwork:begin -->...<!-- loomwork:end -->` block removes that block and reports it.
- [ ] Running `node scripts/init.mjs` on a repo with no legacy block makes no doctrine-related change and reports nothing doctrine-related.
- [ ] `node scripts/init.mjs` no longer creates or touches `.cursor/hooks/` or `.cursor/hooks.json`.
- [ ] `templates/cursor/`, the Cursor branch of `init.mjs`, and `cursor-hooks.test.mjs` are removed from the repo.
- [ ] `AGENTS.md`, `skills/init/SKILL.md`, and `references/PLAYBOOK.md` no longer mention Cursor-specific init behavior.
- [ ] `strategy-gate.sh` and `close-out-gate.sh` behave identically to before (same test suite passes) after the shared root-resolution extraction.
- [ ] `node --test scripts/lib/__tests__/*.test.mjs` passes.
