# loomwork

**One loom, one status surface.** An SDD lifecycle layer for
[superpowers](https://github.com/obra/superpowers): a status-frontmatter
convention, a drift audit, a pre-merge close-out procedure, and a hook gate
that enforces it.

## Why

superpowers is a good execution engine: brainstorm, plan, execute. It does not
say what happens to specs and plans after the work ships. Left alone, specs
keep saying `draft` long after merge, and plans drift away from what was built.
loomwork adds that lifecycle as a plugin:

- **One status-tracking surface.** Spec frontmatter + acceptance checkboxes
  are the only "what's built" tracker. No second tool buys a sync engine —
  only a second source of truth that drifts.
- **Plans freeze, specs live.** A merged plan gets a DONE banner and stops
  changing; the spec stays current as the code evolves.
- **Close out before merge.** The spec and plan updates ride the same PR as
  the feature, so there is no follow-up PR after merge.

Full doctrine: [references/PLAYBOOK.md](references/PLAYBOOK.md).

## Install

### Claude Code

```
/plugin marketplace add kvasanova/toolshed
/plugin install loomwork
```

Requires the superpowers plugin (loomwork checks and tells you how to install
it). Then, in each repo:

```
/loomwork:init
```

### Codex

```bash
codex plugin marketplace add kvasanova/toolshed
codex plugin add loomwork@toolshed
```

Then, in each repo:

```
$loomwork:init
```

Codex skips plugin-bundled hooks until you review and trust them through
`/hooks`.

Initialization scaffolds the docs layout. It also upgrades a repo set up by an
older loomwork version: it removes the old doctrine block and the old Cursor
hooks, and moves the useful parts of an old roadmap file into a short product
context section. Idempotent. Non-default paths: create `.loomwork.json` (keys
`specsDir`, `plansDir`) before running init.

**Upgrading to 0.5.0:** re-run `/loomwork:init` once in each repo. Init never
commits; review its changes and commit them yourself.

## What ships

| Piece | What it does |
| --- | --- |
| `loomwork:audit` skill | Drift linter: closed issues on `draft` specs, merged PRs on unbannered plans, missing/stale `verified` dates. Exit 0/1/2. Not a CI gate by design. |
| `loomwork:close-out` skill | Pre-merge procedure: freeze the plan and verify + update the spec — on the feature branch, same PR. |
| `loomwork:split-agents-md` skill | Manual-only: splits one oversized agent guidance file into a tool-agnostic `AGENTS.md` plus thin host files (`CLAUDE.md` and friends) that import or reference it, with no duplicated prose. Moves any marker-guarded block into `AGENTS.md` whole, so init can still find and remove it. |
| `loomwork:model-assignment` skill | Manual-only: right before execution, picks a model alias per task for `subagent-driven-development` implementer and reviewer dispatches. Held in the session by default; optionally written as a `**Model:**` line per task. No effect under `executing-plans`, which dispatches no subagents. |
| Hook gates (Claude Code + Codex) | Inject the close-out reminder when `finishing-a-development-branch` starts, and the loomwork doctrine at session start in opted-in repos. Codex observes explicit `$superpowers:...` prompts through `UserPromptSubmit`. |
| `/loomwork:init` | Idempotent scaffolder, upgrader, and dependency preflight. |

## Compatibility

Pinned upstream skill name this plugin's gate fires on:
`finishing-a-development-branch` (superpowers). The init preflight also checks
for `brainstorming` and `writing-plans`. Re-checked on upstream majors. A
renamed upstream skill makes the gate silently stop firing — if it goes quiet
after an upstream update, check this name first.

## Support posture

No SLA. This plugin exists because its author runs it on their own repos;
breakage from upstream majors is fixed when it bites those repos, not on
report. Issues may go unanswered. Price that in before adopting.
