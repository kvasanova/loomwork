# Changelog

All notable changes to loomwork are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
