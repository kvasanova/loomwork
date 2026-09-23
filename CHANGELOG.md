# Changelog

All notable changes to loomwork are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.5] - 2026-09-23

### Removed

- **`commands/init.md`** deleted. Since 0.4.x, `skills/init/SKILL.md` covers
  the same dependency preflight, scaffolder invocation, and strategy-file
  routing, so Claude Code registered `/loomwork:init` twice — once per
  surface. Claude Code invokes skills as slash commands, so `/loomwork:init`
  keeps working through the skill alone; Codex was never affected, since it
  only ever read the skill.

## [0.4.1] - 2026-09-17

### Added

- **`skills/split-agents-md/SKILL.md`** splits one oversized agent guidance
  file into a tool-agnostic `AGENTS.md` plus thin host files that import or
  reference it. The skill is manual-only — its frontmatter description says so
  at the trigger surface, so it never fires on its own. It carries the
  classification procedure that decides what is shared knowledge and what is
  host mechanics, and it moves any marker-guarded block into `AGENTS.md` so
  `scripts/init.mjs` keeps finding exactly one block to update.

  A host file holding nothing but the import is still written when the host
  cannot read `AGENTS.md` natively. Claude Code is such a host: dropping its
  `CLAUDE.md` as "import-only" would leave it with no shared guidance at all.
  Only a host that reads `AGENTS.md` on its own — Codex — gets no file.

  The skill commits only when the user asks. The classification calls are the
  kind a human wants to review before they land in history.

## [0.4.0] - 2026-09-16

loomwork becomes a portable Agent Plugins package. Codex can install and run it
natively, and the lifecycle gates fire on explicit Codex skill prompts. Claude
Code and Cursor are unchanged as supported runtimes.

This release also fixes a bug that made the gates fail silently: they matched
with `echo "$x" | grep -q` under `set -euo pipefail`, where `grep -q` exits on
its first match and the resulting write failure, combined with `|| exit 0`,
turned the gate into a no-op — exit 0, no output, strategy never injected. It
read exactly like a gate that chose not to fire. Reproducing it needs a newline
after the trigger and a tail past the 64KB pipe buffer; a 200KB prompt dropped
the injection 10/10. The Cursor mirrors carried the same defect, where it
mattered more, because `beforeSubmitPrompt` receives the raw user prompt and an
ordinary pasted log was enough to disable the gate.

### Added

- **Root `plugin.json`** on the Agent Plugins 1.0 schema, selecting the Codex
  hook registration through `extensions["com.openai"]`. `.claude-plugin/plugin.json`
  remains as the Claude compatibility manifest, and a test keeps the two
  identities aligned.
- **`hooks/codex-hooks.json`** registers both gates on `UserPromptSubmit`.
  Codex observes explicit `$superpowers:...` prompts only — implicit skill
  selection produces no signal the gates can identify.
- **`skills/init/SKILL.md`** exposes the initializer as `loomwork:init`, so
  initialization no longer requires the Claude-only slash command.

### Changed

- **The shared gates accept both payload shapes** — Claude `PostToolUse` and
  Codex `UserPromptSubmit` — and echo the incoming event name back in
  `hookSpecificOutput`.
- **Root resolution is ordered.** A non-empty `CLAUDE_PROJECT_DIR` is used
  exactly as given; otherwise the payload's `.cwd` walks up to the nearest
  `.git` or `.loomwork.json`, since Codex may start in a subdirectory, falling
  back to the raw `.cwd` so uninitialized repositories still get nudged. `.git`
  is tested with `-e`, so a worktree's `.git` *file* counts.
- **The audit and init skills resolve their CLIs relative to the installed
  `SKILL.md`** instead of requiring a plugin-root environment variable.
- **A fresh consumer repository now receives `AGENTS.md`**, not `CLAUDE.md`.
  An existing `AGENTS.md` still wins, an existing `CLAUDE.md` is still
  supported, and marker-block idempotency is unchanged.
- **The strategy gate is spill-aware under Codex.** Output past
  `additionalContextLimit` (2500) is truncated and saved to a file, so the
  message no longer claims the whole strategy is inline; it points at the saved
  hook-output file when the host truncated. The Cursor mirror keeps the original
  wording on purpose — Cursor sets no limit and never spills.

### Fixed

- **Gate matching no longer uses a pipeline.** All matching moved to bash `=~`
  against an unquoted pattern variable, with `shopt -s nocasematch` preserving
  the case-insensitivity `grep -qiE` provided in the Cursor gates. Semantics
  were diffed against the original patterns across representative inputs with
  zero divergence.
- **`hooks/close-out-gate.sh` no longer reads `/.loomwork.json`** when no root
  resolves. It exits silently, matching `hooks/strategy-gate.sh`.
- **Tests no longer leak an ambient `CLAUDE_PROJECT_DIR`**, which would have
  made every payload-`.cwd` test pass vacuously.

## [0.3.0] - 2026-08-21

`STRATEGY.md` belongs to `compound-engineering:ce-strategy`. loomwork reads it,
points at it, and reminds people to run `ce-strategy` — it does not define the
file's shape and does not write to it. Close-out had been appending one
`## Milestones` bullet per merge, creating that section when absent, and bumping
`last_updated` on every ship, which is the content `ce-strategy` documents as
optional and skip-by-default. This release removes every loomwork write path to
the file.

### Changed

- **`loomwork:close-out` Step 3b is a decision, not a write.** It asks whether
  the ship introduced an externally visible milestone, changed what an
  investment area covers, retired a direction, or shifted the target problem. A
  yes routes to a `ce-strategy` run on the feature branch so the update rides
  the same PR; a no touches nothing. No `last_updated` bump, no Milestones
  append, no Tracks or `## Not working on` edit.
- **Doctrine restated** in `references/PLAYBOOK.md` and `README.md`, with the
  governing rule recorded so future changes to loomwork's handling of the
  strategy file can be tested against it.

### Added

- **Missing-file nudge in both hook gates.** `hooks/strategy-gate.sh` and
  `templates/cursor/loomwork-strategy-gate.sh` previously exited silently when
  no strategy file existed, giving no reminder at the moment grounding matters.
  Both now inject a one-sentence pointer to `ce-strategy`, each through its own
  output envelope. The gates check existence only, never shape; behavior when
  the file exists is unchanged.

### Removed

- **`templates/STRATEGY.md`** — a loomwork-authored variant of ce's template
  that drifted independently from it.
- **Strategy-file seeding in `/loomwork:init`.** `initRepo` now reports the file
  as missing and names `ce-strategy` instead of creating one. An existing
  strategy file is still left byte-identical, and no already-initialized repo
  loses content — accumulated `## Milestones` entries are left in place.

### Fixed

- `loomwork:close-out` Step 5 ran `git add docs/... STRATEGY.md`, which aborts
  with `fatal: pathspec 'STRATEGY.md' did not match any files` (exit 128) when
  the file is absent, so the commit on the next line never ran. Now guarded on
  existence. Reachable in practice as of this release, since init no longer
  seeds the file.
- `hooks/strategy-gate.sh` resolved its root as `${CLAUDE_PROJECT_DIR:-$PWD}`
  and could act on an unrelated directory's strategy file. It now requires a
  resolved `CLAUDE_PROJECT_DIR`, matching the Cursor gate.

[0.4.0]: https://github.com/kvasanova/loomwork/releases/tag/v0.4.0
[0.3.0]: https://github.com/kvasanova/loomwork/releases/tag/v0.3.0

## [0.2.1] - 2026-08-02

### Fixed

- Cursor hook commands now invoke gate scripts via explicit `bash
  .cursor/hooks/loomwork-*.sh` instead of the bare path — the bare path let
  Cursor/Windows open the `.sh` as an editor tab instead of executing it,
  stealing focus and letting stray keystrokes corrupt shebangs.
- Reworded the strategy gate's injected prefix (Claude Code + Cursor) so
  agents are told the content is already inlined and not to Read/open the
  strategy file or any loomwork hook script.
- `/loomwork:init` migrates legacy bare-command `.cursor/hooks.json` entries
  in place on re-run instead of appending duplicate gates.

[0.2.1]: https://github.com/kvasanova/loomwork/releases/tag/v0.2.1

## [0.2.0] - 2026-08-02

First working release. `0.1.0` was a skeleton; everything below is what turned it
into a usable plugin.

### Added

- **SDD drift audit engine** — `scripts/sdd-audit.mjs` plus `scripts/lib/`, ported
  from weavereads, with unit tests. Flags stale spec status, missing plan DONE
  banners, and missing/stale verified dates.
- **`loomwork:audit` skill** — runs the drift linter over the SDD docs dirs.
- **`loomwork:close-out` skill** — pre-merge close-out that commits and pushes to
  the feature branch, so the close-out lands in the same PR.
- **`/loomwork:init` command** — backed by an idempotent `scripts/init.mjs`
  scaffolder that lays down the SDD docs dirs, a STRATEGY.md seed, Cursor hooks,
  and the CLAUDE.md block.
- **Hook gates** — `hooks/strategy-gate.sh` and `hooks/close-out-gate.sh`, wired
  through the plugin's `hooks.json`.
- **Cursor hook templates** — dual-event support for `beforeSubmitPrompt` and
  `postToolUse`, with TDD tests.
- **Repo templates** — `templates/STRATEGY.md` and `templates/claude-md-block.md`.
- **Configuration** — `.loomwork.json` loading with repo-root walk-up resolution,
  configurable paths, and a CLI entry point.
- **Docs** — playbook doctrine and README.

### Fixed

- Force LF line endings via `.gitattributes`; bash scripts break on CRLF.
- Resolve `gh` invocations against the correct working directory.

[0.2.0]: https://github.com/kvasanova/loomwork/releases/tag/v0.2.0
