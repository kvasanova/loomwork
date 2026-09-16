# Repository Guidelines

## Project Structure & Module Organization

Loomwork integrates superpowers and compound-engineering workflows. `scripts/` contains the Node.js entry points (`init.mjs`, `sdd-audit.mjs`); `scripts/lib/` holds configuration, parsing, pairing, GitHub access, rules, and reporting. Tests and Markdown fixtures live in `scripts/lib/__tests__/`.

`hooks/` contains shared Claude Code and Codex gates plus their runtime registrations; `templates/cursor/` contains the Cursor counterparts. Other scaffolding assets live in `templates/`. The portable manifest is `plugin.json`; `.claude-plugin/plugin.json` is the Claude compatibility manifest. Command instructions live in `commands/`, and skills in `skills/`. See `references/PLAYBOOK.md` for lifecycle conventions and `docs/superpowers/{specs,plans}/` for design records.

## This is a plugin, not an application

There is no `package.json`, no dependencies, and no build step. The repository ships CLIs, Bash hook gates, Cursor mirrors of those gates, and instructions-only Markdown (skills and commands).

The **consumer repository** — some other repository that installs loomwork — is the runtime target of everything here. Keep the two separate: `repoRoot` in the code always means the consumer repository, resolved by `resolveRepoRoot()`. The plugin's own root is a separate argument (`pluginRoot`).

## Build, Test, and Development Commands

Use Node.js with its built-in test runner. Hook execution also requires Bash and `jq`; online auditing uses authenticated GitHub CLI (`gh`). There is no package installation, build step, or development server.

- `node --test scripts/lib/__tests__/*.test.mjs` — run the full suite.
- `node --test scripts/lib/__tests__/init.test.mjs` — run one test file.
- `node scripts/sdd-audit.mjs --offline` — audit local spec/plan drift; add `--json` for structured output, `--stale-days N` to override the verified age threshold. Exit codes: 0 clean, 1 findings, 2 error. This audit is advisory, not a CI gate.
- `node scripts/init.mjs` — scaffold the resolved repository, updating documentation and Cursor hooks. Use a disposable consumer repository when testing initialization.

## Domain model

Loomwork enforces one convention: **specs live, plans freeze.**

- A **spec** (`docs/superpowers/specs/YYYY-MM-DD-slug-design.md`) carries frontmatter `issue`, `status` (`draft|approved|in-progress|partial|implemented|superseded`), `implemented_in`, and `verified`, plus acceptance checkboxes in the body. It stays current as the code evolves.
- A **plan** (`docs/superpowers/plans/YYYY-MM-DD-slug.md`) gets a `> **Status: DONE` banner at merge and never changes again.
- Plan-to-spec pairing is **filename-slug-based only**: `pair.mjs` strips the date prefix and the `-design` suffix. There is no explicit link field, so renaming either file silently breaks pairing.
- `STRATEGY.md` is owned by `compound-engineering:ce-strategy`. Loomwork **never authors or seeds it** — init only reports it missing, and close-out only routes to `ce-strategy`. Preserve this in any change.

The audit pipeline is a straight line: `config → parse → pair → rules → report`. `rules.mjs` is pure — it takes already-read specs and plans plus a `githubState` map — so drift rules are unit-testable without filesystem or network access. Keep it that way: put I/O in `parse.mjs` and `github.mjs`, decisions in `rules.mjs`.

`parse.mjs` hand-rolls frontmatter parsing with a regex (`^([a-z_]+):\s*(.*)$`) and takes no YAML dependency. Nested or multiline frontmatter will not parse.

## Hooks: three runtimes, one behavior

Claude Code reads `hooks/hooks.json` as its `PostToolUse` registration. Codex reads `hooks/codex-hooks.json` as its `UserPromptSubmit` registration and can therefore observe only explicit `$superpowers:...` prompts. **Cursor does not read either plugin registration** — it reads `.cursor/hooks.json` from the workspace, so `scripts/init.mjs` is the installer for the Cursor copies. A change to `templates/cursor/*` therefore reaches an already-initialized repository only when the user re-runs init. `init.mjs` migrates entries in place, rewriting stale `command` and `matcher` values rather than appending duplicates.

The Claude and Cursor `hooks.json` files match broadly on the `Skill` tool and discriminate on skill name **inside the script**, via `jq` on `.tool_input.skill`. Keep matching there, not in the matcher. The shared gate scripts accept both Claude `PostToolUse` and Codex `UserPromptSubmit` payloads and emit the incoming event name in `hookSpecificOutput`. Root resolution is ordered: a non-empty `CLAUDE_PROJECT_DIR` is used exactly as given; otherwise the payload's `.cwd` walks **up** to the nearest ancestor holding `.git` or `.loomwork.json` (Codex may start in a subdirectory), falling back to the raw `.cwd` when no marker is found so uninitialized repositories still get nudged. Both gates exit silently when neither resolves. The walk tests `.git` with `-e`, not `-d`, so a worktree's `.git` **file** counts.

The gates match with Bash's `=~` against a pattern variable referenced **unquoted** — never `echo … | grep -q`. Quoting the pattern would make it a literal string and silently break every match. The pipeline form is a fixed bug, not a style preference: `grep -q` exits on its first match, and the resulting write failure under `set -o pipefail` combined with `|| exit 0` turned a real prompt into a silent no-op (measured: a trigger line followed by a ≥128KB tail was dropped 10/10). `hooks.test.mjs` guards this with a newline-led 192KB prompt; keep both the newline and the size, or the guard passes against the very bug it exists to catch.

Cursor commands must be spelled `bash .cursor/hooks/loomwork-*.sh`. A bare `.sh` path makes Cursor open the file in an editor tab on Windows instead of executing it.

The strategy gate injects the whole strategy file into context and explicitly instructs the agent **not** to read that file or the hook scripts, which would place a second copy in context. Any edit to that message must keep the instruction; `hooks.test.mjs` asserts it.

Bash scripts must stay LF — `.gitattributes` forces it, and CRLF breaks them.

## Pinned upstream names

Gates fire on these skill names and go quiet without error if upstream renames them: `brainstorming`, `writing-plans`, `finishing-a-development-branch` (superpowers); `ce-strategy`, `ce-compound`, `ce-doc-review` (compound-engineering). Check these first when a gate stops working.

## Coding Style & Naming Conventions

Match existing JavaScript: ES modules (`.mjs`), `node:` imports, two-space indentation, single quotes, semicolons, and camelCase functions and variables. Use kebab-case script names and `*.test.mjs` test files. No formatter or lint configuration is checked in. Preserve LF endings as required by `.gitattributes`, especially for Bash scripts.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. They are behavior-level rather than unit-level: `init.test.mjs` and `cursor-hooks.test.mjs` scaffold a real temporary directory and assert files on disk, `hooks.test.mjs` spawns the actual Bash gates with JSON on stdin and asserts the emitted `hookSpecificOutput`, and `rules.test.mjs` and `parse.test.mjs` use Markdown fixtures in `__tests__/fixtures/`.

Use descriptive behavior-focused test names, temporary consumer repositories, and fixtures for parsing cases. Cover changed behavior and failure paths; hook changes should exercise both Claude Code and Cursor variants. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

History commonly uses `feat:`, `fix:`, `docs:`, and scoped forms such as `fix(hooks):`. Keep subjects concise. PRs should describe the behavior change, link relevant issues, and report validation commands and results.

When work has a plan/spec, include close-out updates in the same PR: add the plan’s DONE banner and update verified spec status and acceptance checkboxes. Freeze merged plans. Loomwork must not author or seed `STRATEGY.md`; route strategy changes through `compound-engineering:ce-strategy`.

Loomwork applies its own doctrine to itself: its specs and plans live in `docs/superpowers/{specs,plans}/`. When a change is tracked by one of those, run the close-out procedure on the feature branch before merge — the close-out commit rides the same PR.

<!-- loomwork:begin -->
## Spec-Driven Development (loomwork)

SDD lifecycle via the **loomwork** plugin — glue for **superpowers** (execution
engine) + **compound-engineering** (`ce-strategy` → `STRATEGY.md`, `ce-compound`
→ `docs/solutions/`, `ce-doc-review`). Doctrine: loomwork playbook
(`references/PLAYBOOK.md` in the plugin).

- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`
  (paths configurable via `.loomwork.json`); roadmap anchor `STRATEGY.md`;
  learnings in `docs/solutions/`.
- Spec frontmatter: only `issue`, `status`
  (`draft|approved|in-progress|partial|implemented|superseded`),
  `implemented_in`, `verified`. Acceptance checkboxes live in the body only.
- Plans freeze after merge (DONE banner + ticked boxes); specs stay current.
- Drift check: `loomwork:audit` skill (periodic, not CI). Close-out before
  merge: `loomwork:close-out` skill — hook-enforced on
  `finishing-a-development-branch`.
<!-- loomwork:end -->
