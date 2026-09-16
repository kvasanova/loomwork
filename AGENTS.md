# Repository Guidelines

## Project Structure & Module Organization

Loomwork integrates superpowers and compound-engineering workflows. `scripts/` contains the Node.js entry points (`init.mjs`, `sdd-audit.mjs`); `scripts/lib/` holds configuration, parsing, pairing, GitHub access, rules, and reporting. Tests and Markdown fixtures live in `scripts/lib/__tests__/`.

`hooks/` contains Claude Code gates; `templates/cursor/` contains their Cursor counterparts. Other scaffolding assets live in `templates/`. Plugin metadata is in `.claude-plugin/plugin.json`, command instructions in `commands/`, and skills in `skills/`. See `references/PLAYBOOK.md` for lifecycle conventions and `docs/superpowers/{specs,plans}/` for design records.

## Build, Test, and Development Commands

Use Node.js with its built-in test runner. Hook execution also requires Bash and `jq`; online auditing uses authenticated GitHub CLI (`gh`). There is no package installation, build step, or development server.

- `node --test scripts/lib/__tests__/*.test.mjs` — run the full suite.
- `node --test scripts/lib/__tests__/init.test.mjs` — run one test file.
- `node scripts/sdd-audit.mjs --offline` — audit local spec/plan drift; add `--json` for structured output. Exit codes: 0 clean, 1 findings, 2 error. This audit is advisory, not a CI gate.
- `node scripts/init.mjs` — scaffold the resolved repository, updating documentation and Cursor hooks. Use a disposable consumer repository via `CLAUDE_PROJECT_DIR` when testing initialization.

## Coding Style & Naming Conventions

Match existing JavaScript: ES modules (`.mjs`), `node:` imports, two-space indentation, single quotes, semicolons, and camelCase functions and variables. Use kebab-case script names and `*.test.mjs` test files. No formatter or lint configuration is checked in. Preserve LF endings as required by `.gitattributes`, especially for Bash scripts.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Use descriptive behavior-focused test names, temporary consumer repositories, and fixtures for parsing cases. Cover changed behavior and failure paths; hook changes should exercise both Claude Code and Cursor variants. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

History commonly uses `feat:`, `fix:`, `docs:`, and scoped forms such as `fix(hooks):`. Keep subjects concise. PRs should describe the behavior change, link relevant issues, and report validation commands and results.

When work has a plan/spec, include close-out updates in the same PR: add the plan’s DONE banner and update verified spec status and acceptance checkboxes. Freeze merged plans. Loomwork must not author or seed `STRATEGY.md`; route strategy changes through `compound-engineering:ce-strategy`.
