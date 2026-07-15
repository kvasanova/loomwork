---
description: Scaffold the SDD layout (docs dirs, STRATEGY.md seed, Cursor hooks, CLAUDE.md block) in the current repo
---

# /loomwork:init

Initialize the current repository for loomwork's SDD lifecycle. Idempotent —
re-running on an initialized repo is a no-op.

## Step 1 — dependency preflight (BEFORE any write)

loomwork glues two upstream plugins; Claude Code has no plugin-dependency
mechanism, so check availability yourself. In your available-skills list,
verify BOTH:

- **superpowers** — skills `superpowers:brainstorming`,
  `superpowers:writing-plans`, `superpowers:finishing-a-development-branch`
- **compound-engineering** — skills `compound-engineering:ce-strategy`,
  `compound-engineering:ce-compound`

If either plugin is missing, STOP without writing anything and tell the user:

> loomwork requires the superpowers and compound-engineering plugins.
> Install them first:
> `/plugin install superpowers@claude-plugins-official`
> `/plugin marketplace add EveryInc/compound-engineering-plugin` then
> `/plugin install compound-engineering`
> Then re-run `/loomwork:init`.

## Step 2 — run the scaffolder

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"
```

It creates (only what is missing): the specs/plans/solutions directories,
a STRATEGY.md seed, `.cursor/hooks.json` + `.cursor/hooks/loomwork-*.sh`
(merging with existing Cursor hooks), and a marker-guarded loomwork block in
CLAUDE.md (or AGENTS.md). Paths come from `.loomwork.json` if present,
defaults otherwise. If the user wants non-default paths, write
`.loomwork.json` (keys: `specsDir`, `plansDir`, `strategyFile`) BEFORE
running the scaffolder.

## Step 3 — report

Relay the script's action list. If STRATEGY.md was seeded, suggest filling it
in (the `ce-strategy` skill does this well) and committing the new files.
Point the user at the loomwork README for the doctrine.
