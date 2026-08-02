# loomwork

**One loom, one status surface.** SDD lifecycle glue for running
[superpowers](https://github.com/obra/superpowers) and
[compound-engineering](https://github.com/everyinc/compound-engineering-plugin)
in one repo without the conflict: a status-frontmatter convention, a drift
audit, a pre-merge close-out procedure, and hook gates that enforce both.

## Why

superpowers is an execution engine with no roadmap anchor, no solved-problem
knowledge base, and no document-review pass. compound-engineering has those,
but a looser execution pipeline. Installed together they collide: two
brainstorm→plan pipelines, two status surfaces that drift apart. loomwork is
the integration doctrine as a plugin:

- **One status-tracking surface.** Spec frontmatter + acceptance checkboxes
  are the only "what's built" tracker. No second tool buys a sync engine —
  only a second source of truth that drifts.
- **Cherry-pick, don't merge.** From compound-engineering take exactly:
  `ce-strategy` → `STRATEGY.md` (roadmap anchor), `ce-compound` →
  `docs/solutions/` (knowledge base), `ce-doc-review` (adversarial design
  review). Don't run `ce-brainstorm → ce-plan → ce-work` — superpowers is
  the execution engine.
- **Plans freeze, specs live.** A merged plan gets a DONE banner and stops
  changing; the spec stays current as the code evolves.

Full doctrine: [references/PLAYBOOK.md](references/PLAYBOOK.md).

## Install

```
/plugin marketplace add kvasanova/toolshed
/plugin install loomwork
```

Requires the superpowers and compound-engineering plugins (loomwork checks
and tells you how to install them). Then, in each repo:

```
/loomwork:init
```

Scaffolds the docs layout, a STRATEGY.md seed, Cursor hook mirrors, and a
CLAUDE.md block. Idempotent. Non-default paths: create `.loomwork.json`
(keys `specsDir`, `plansDir`, `strategyFile`) before running init.

**Re-run `/loomwork:init` after every plugin update.** Cursor reads hooks from
the workspace `.cursor/`, not from the plugin, so already-initialized repos
keep running whatever hook scripts were copied in at init time. Re-running
refreshes the scripts and migrates stale `.cursor/hooks.json` entries in place.

Cursor hooks invoke the scripts as `bash .cursor/hooks/loomwork-*.sh`. On
Windows that needs `bash` on PATH (Git Bash or MSYS) — without the explicit
`bash`, Cursor may open the `.sh` in an editor tab instead of running it.

## What ships

| Piece | What it does |
| --- | --- |
| `loomwork:audit` skill | Drift linter: closed issues on `draft` specs, merged PRs on unbannered plans, missing/stale `verified` dates. Exit 0/1/2. Not a CI gate by design. |
| `loomwork:close-out` skill | Pre-merge procedure: freeze the plan, verify + update the spec, touch the strategy file — on the feature branch, same PR. |
| Hook gates (Claude Code) | Inject STRATEGY.md when `brainstorming`/`writing-plans` starts; inject the close-out reminder when `finishing-a-development-branch` starts. |
| Cursor hook templates | Same gates for Cursor (written into `.cursor/` by init — Cursor reads hooks from the workspace, so the plugin is the installer, not the runtime). Covers slash-command invocations a Skill-only hook misses. |
| `/loomwork:init` | Idempotent scaffolder + dependency preflight. |

## Compatibility

Pinned upstream skill names this plugin references: `brainstorming`,
`writing-plans`, `finishing-a-development-branch` (superpowers);
`ce-strategy`, `ce-compound`, `ce-doc-review` (compound-engineering).
Re-checked on upstream majors. A renamed upstream skill makes a gate
silently stop firing — if a gate goes quiet after an upstream update, check
these names first.

## Support posture

No SLA. This plugin exists because its author runs it on their own repos;
breakage from upstream majors is fixed when it bites those repos, not on
report. Issues may go unanswered. Price that in before adopting.
