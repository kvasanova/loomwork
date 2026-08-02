# Changelog

All notable changes to loomwork are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
