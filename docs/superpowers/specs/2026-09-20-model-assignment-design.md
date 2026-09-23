---
issue: 11
status: in-progress
implemented_in: "PR #13"
verified: 2026-09-20
---

# loomwork:model-assignment — pin SDD subagent models in the plan

## Problem

`superpowers:subagent-driven-development` (SDD) tells its controller to pick
the cheapest model tier that fits each dispatched role and to "always specify
the model explicitly when dispatching a subagent" — an omitted model
inherits the session model, usually the most capable and most expensive one.
The skill gives the controller nowhere to record that choice, so in practice
it is re-derived per dispatch or skipped.

Two things make that worse in loomwork's normal flow:

- **Planning and execution are separate sessions.** The plan file is the
  only artifact that crosses that boundary. A model choice made while
  planning is lost unless it is written into the plan.
- **SDD forbids mid-run check-ins.** Its "Continuous execution" rule means
  the controller will not stop to ask which model to use, and auto mode
  biases the same way. Per-dispatch confirmation fights the skill; a table
  settled up front does not.

Recording the choice during planning also puts it where the judgment is
best: the task list and its complexity signals are still in context.

## Governing rule

> The model-assignment table records exactly what an SDD dispatch can
> actually set: a model alias, per task and role. It is written in the
> session that will execute the plan, so the aliases are current by
> construction, and every row is enforceable at dispatch time.

### Why aliases, and why no effort column

The `Agent` dispatch tool accepts `model` as an alias — `sonnet`, `opus`,
`haiku`, `fable` — and exposes no per-call effort or thinking parameter.
Exact model IDs and an `effort` level (`low|medium|high|xhigh|max`) are
settable only in agent-definition frontmatter (`.claude/agents/*.md`), which
a per-task dispatch does not override.

So the table records the alias and nothing else. A column the dispatch
cannot honor would be advisory text dressed as configuration — the failure
this spec exists to remove, reintroduced one column over. Recording effort
is worth doing once there is a mechanism that binds it; that research is
tracked separately (see Non-goals).

The alias set is not stable across time or across subscriptions — `fable`
is absent from some plans entirely. This is why the skill runs in the
executing session rather than at planning time: the human approving the
table is the one who knows which aliases are live for them today, and they
review every row before it is written.

## Goals

- A manual-only skill, `loomwork:model-assignment`, appends a
  `## Model Assignment` table to an existing plan, so SDD dispatches read
  model choices out of the plan instead of inheriting the session default.
- The table records a model alias per task and role — the one value a
  per-task dispatch can actually set — and every row is reviewed and
  approved by the user before it is written.
- The table binds: `templates/claude-md-block.md` gains one line so every
  initialized consumer repo's `AGENTS.md`/`CLAUDE.md` instructs SDD
  controllers to read and honor it, with a stated fallback for gaps.
- The skill refuses to run on a plan that already carries a DONE banner, and
  offers to replace (not double-append) an existing `## Model Assignment`
  section.
- `references/PLAYBOOK.md`'s large-capability flow names the skill at its
  slot: after `writing-plans`, before `subagent-driven-development`.

## Non-goals

- No enforcement or validation that a running SDD session actually honored
  the table — that is SDD's own discipline once the doctrine line exists.
- No change to `subagent-driven-development`'s own Model Selection section.
  This skill produces an input SDD already knows how to consume once the
  doctrine line points it there.
- No support for `executing-plans`. That skill dispatches no subagents, so a
  table has nothing to bind to there — see below.
- No automatic invocation. No hook fires this skill; it never runs unless
  the user explicitly invokes `/loomwork:model-assignment`.
- **No effort column.** A per-task dispatch cannot set reasoning effort, so
  the table does not pretend to. Incorporating effort — via agent
  definitions or whatever mechanism emerges — is tracked as a separate
  issue and is out of scope here.
- No exact model IDs. The dispatch tool takes aliases; an ID column would
  not be honored per-task.
- No policy on which aliases are acceptable for execution. The skill
  proposes, the user reviews and edits every row, and the user's judgment
  is final.

## Scope: SDD only

The table is read by `subagent-driven-development` and nothing else.
`superpowers:executing-plans` dispatches no subagents — that session executes
every task in its own context, so there is no `Agent` call and no `model`
parameter for a table to control. A table on a plan destined for
`executing-plans` is inert: harmless, but it buys nothing.

That is not an accident of the two skills. `executing-plans` exists as the
fallback for hosts without subagent support, and its own text says to prefer
`subagent-driven-development` where subagents are available. On those hosts
the model choice was never the session's to make.

The skill must say this out loud: a user who runs
`/loomwork:model-assignment` and then executes through `executing-plans`
otherwise gets a table that silently does nothing.

## Dispatch discipline

SDD escalates on its own: a BLOCKED implementer "requires more reasoning" is
re-dispatched on a more capable model, and fix-loop rounds 4-5 dispatch "a
model at least one tier above the implementer that got stuck". Either path
silently overrides the alias the user approved, which is the choice the
table exists to pin.

So the table carries its own dispatch rules, after the fallback line:

- **Same alias on every re-dispatch.** Fix rounds, NEEDS_CONTEXT, BLOCKED,
  and fix-loop rounds 4-5 all use the row's alias. A controller never
  re-dispatches on a more capable alias than the row selects.
- **Ask after 3 failures.** After 3 failed attempts on the same task, the
  controller stops and asks the user. Only the user may approve a different
  alias, and the approval is ledgered.

## Design

### 1. `skills/model-assignment/SKILL.md`

New skill, manual-only, matching `skills/split-agents-md/SKILL.md`'s
frontmatter shape:

```yaml
---
name: model-assignment
disable-model-invocation: true
description: Manual-only; use only when explicitly requested. Append a Model Assignment table to a plan in docs/superpowers/plans/, pinning the model alias per subagent-driven-development role so execution doesn't inherit the session default. Run this in the session that will execute the plan, so the aliases you approve are the ones actually available to you. Invoke explicitly with a plan path, e.g. /loomwork:model-assignment docs/superpowers/plans/2026-09-20-feature.md.
---
```

Body, in substance (steps, not prose the skill merely describes — the actual
skill file spells out each bash command and table row format so an agent has
no placeholders to fill in):

1. **Announce:** "Using loomwork:model-assignment to pin subagent model
   aliases on the plan."

2. **Resolve the plan path.**
   - If the skill argument names a file, use it.
   - Otherwise, read `.loomwork.json` if present for `plansDir` (default
     `docs/superpowers/plans`) and pick the most recently modified `*.md`
     file in that directory (`ls -t <plansDir>/*.md | head -1`).
   - If no plan file exists anywhere, stop and tell the user there is
     nothing to assign models to.

3. **Refuse a frozen plan.** Read the plan. If line 2 (or any line) matches
   `^> \*\*Status: DONE`, stop: "This plan is frozen (DONE banner present).
   loomwork doctrine: plans freeze after merge and never change again. Model
   assignment only runs pre-merge, on a live plan."

4. **Refuse or replace an existing table.** If the plan already contains a
   `## Model Assignment` heading, ask the user: replace the existing table,
   or stop. Never append a second `## Model Assignment` section.

5. **Read the paired spec, if any.** Loomwork's plan/spec pairing is
   filename-slug-based (`pair.mjs`: strip date prefix and `-design` suffix,
   compare). If a spec with the matching slug exists in `specsDir`, read it
   for scope/risk context — architecture-heavy areas push a role toward a
   more capable alias even when the plan text alone looks mechanical.

6. **Extract the task list.** Parse the plan's `### Task N: <name>` headings
   and each task's **Files** block (created/modified/test file counts) —
   these are the complexity signals SDD's own Model Selection section names:
   file count, whether the plan text already contains complete code
   (transcription) versus a prose description, and whether the task requires
   architectural judgment.

7. **List the model aliases actually available in this session.** Do not
   assume a fixed set — ask the user, or state the aliases this session's
   own `Agent` tool accepts, and confirm which ones are live for them right
   now (a subscription may exclude one). This list is the only vocabulary
   the proposal in the next step may draw from.

8. **Propose one row per task per role**, using SDD's own complexity signals
   to pick from the confirmed alias list — never a tier word, never an alias
   not confirmed available:
   - **implementer row:** the cheapest available alias when the task touches
     1-2 files and the plan text already contains the complete code to write
     (transcription plus testing); a mid-tier alias as the floor for tasks
     described in prose or touching multiple files with integration
     concerns; the most capable available alias only when the task requires
     architectural or broad-codebase judgment.
   - **reviewer row:** mid-tier as the floor; the most capable available
     alias only for a genuinely large or risky diff. A small mechanical diff
     never needs more than mid-tier.
   - **final review row:** the most capable available alias — non-negotiable
     per SDD's own text ("dispatch it on the most capable available model,
     not the session default").
   - Append one fixed trailer line to every table (verbatim, not
     per-plan-generated): `Rows absent here fall back to the SDD Model
     Selection rubric.`

9. **Present the full proposed table for approval before writing anything.**
   The user reviews and may edit every row — this step is not a formality;
   the skill's proposal is a starting point, and the user's judgment on
   which alias fits which task is final. Only write after the user approves.

10. **Append the approved table to the plan file**, as a new `##` section
    after the last existing section (before any trailing frontmatter-less
    content), in this exact shape:

    ```markdown
    ## Model Assignment

    | Task | Role | Model | Why |
    |------|------|-------|-----|
    | 1 | implementer | haiku | complete code in plan text, transcription |
    | 1 | reviewer | sonnet | small mechanical diff |
    | 2 | implementer | sonnet | 3 files, integration concerns |
    | 2 | reviewer | sonnet | |
    | final review | reviewer | opus | whole-branch, always most capable |

    Rows absent here fall back to the SDD Model Selection rubric.

    Dispatch discipline:
    <fixed block per "Dispatch discipline" above; the skill holds the
    verbatim text>
    ```

    The example row values above are illustrative; the actual table holds
    whatever aliases the user approved in Step 9.

11. **State the executing-plans caveat** once, after writing: "This table is
    read by `subagent-driven-development` only. If this plan is executed
    through `executing-plans` instead, the table has no effect — that skill
    dispatches no subagents."

The column header is `Model`, and its value is the literal alias to pass to
the `Agent` tool's `model` parameter at dispatch time — not a description or
a tier word. There is no effort column: a per-task dispatch has no effort
parameter to set (see the spec's Governing rule and Non-goals).

### 2. Doctrine line in `templates/claude-md-block.md`

One line added to the existing bullet list (after the plan/spec bullets,
before the drift/close-out bullet), so `init.mjs` carries it into every
consumer repo's marker block verbatim:

```markdown
- When a plan carries a `## Model Assignment` table, `subagent-driven-development`
  dispatches use it; a task or role missing from the table falls back to the
  skill's own Model Selection rubric. Re-dispatches keep the row's alias,
  never a more capable one; after 3 failed attempts on a task, ask the user.
```

No other line in the template changes. `init.mjs` itself needs no code
change — it already copies this file's full contents into the marker block.

### 3. `references/PLAYBOOK.md` — large-capability flow

The **Large capability** bullet under `## Flow by feature size` gains the
new skill at its slot, after `writing-plans` and before
`subagent-driven-development`:

Before:

> **Large capability** — `brainstorming` → design doc in
> `docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status
> frontmatter (below) → optional `ce-doc-review` for an adversarial
> multi-persona pass → `writing-plans` → `subagent-driven-development` for
> parallel independent tasks, else `executing-plans`.

After:

> **Large capability** — `brainstorming` → design doc in
> `docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status
> frontmatter (below) → optional `ce-doc-review` for an adversarial
> multi-persona pass → `writing-plans` → optional `loomwork:model-assignment`,
> run in the executing session, to pin subagent model aliases on the plan
> (SDD only; no effect under `executing-plans`) →
> `subagent-driven-development` for parallel independent tasks, else
> `executing-plans`.

### 4. `README.md` skill table

New row alongside the existing `loomwork:audit` / `loomwork:close-out` /
`loomwork:split-agents-md` rows:

```markdown
| `loomwork:model-assignment` skill | Manual-only: appends a `## Model Assignment` table to a plan, pinning a model alias per `subagent-driven-development` role. Run in the executing session so approved aliases are ones actually available. No effect under `executing-plans`, which dispatches no subagents. |
```

## Files touched

| File | Change |
| --- | --- |
| `skills/model-assignment/SKILL.md` | New: manual-only skill per Design §1 |
| `templates/claude-md-block.md` | Add doctrine line per Design §2 |
| `references/PLAYBOOK.md` | Insert skill at its slot in the Large capability flow |
| `README.md` | Add skill row to the table |

## Testing

This skill is instructions-only Markdown, matching `skills/audit` and
`skills/close-out` — no `node:test` coverage exists for skill *behavior*
today (SKILL.md files are not executed by the test suite). Verification is
manual, per Acceptance below.

`scripts/lib/__tests__/init.test.mjs` already asserts only that
`<!-- loomwork:begin -->` appears in the written `AGENTS.md`/`CLAUDE.md` —
no assertion pins the marker block's exact line count or content, so adding
one line to `templates/claude-md-block.md` requires no test change and the
existing suite must still pass unmodified.

## Migration and blast radius

- No hook fires this skill; no existing repo's behavior changes until a user
  explicitly runs `/loomwork:model-assignment`.
- Re-running `/loomwork:init` on an already-initialized repo picks up the
  new doctrine line via the existing marker-block content-diff migration
  (no new migration code needed).
- No change to any existing plan or spec file format; the table is purely
  additive to plans a user chooses to run the skill on.

## Acceptance

- [x] `skills/model-assignment/SKILL.md` exists with
      `disable-model-invocation: true` and a description naming manual-only
      invocation with a plan-path argument.
- [x] The skill resolves an explicit plan-path argument, and falls back to
      the most recently modified plan in the configured `plansDir` when no
      argument is given.
- [x] The skill refuses a plan whose banner matches `^> \*\*Status: DONE`.
- [x] The skill detects an existing `## Model Assignment` section and offers
      replace-or-stop rather than appending a second section.
- [x] The skill reads a paired spec (filename-slug match) when one exists,
      for architectural-risk context.
- [x] The skill confirms which model aliases are actually available in the
      executing session before proposing any row, and every proposed alias
      comes from that confirmed list.
- [x] The proposed table's `Model` column holds only bare aliases (e.g.
      `haiku`, `sonnet`, `opus`) — no tier word, no full model ID, no effort
      value anywhere in the skill's output.
- [x] The table is presented for approval, with edits accepted, before any
      write to the plan file.
- [x] The appended table matches the shape in Design §1 Step 10, including
      the fixed trailer line verbatim.
- [x] The skill states the `executing-plans` no-op caveat after writing.
- [x] `templates/claude-md-block.md` contains the doctrine line from
      Design §2, verbatim.
- [x] `references/PLAYBOOK.md`'s Large capability flow names
      `loomwork:model-assignment` at the stated slot.
- [x] `README.md`'s skill table includes the new row.
- [x] The full existing test suite (`node --test scripts/lib/__tests__/*.test.mjs`)
      passes unmodified.
- [x] Verified against a real multi-task plan: the table lands well-formed,
      and a fresh `subagent-driven-development` session at setup reads and
      states it will honor the table's rows.
- [x] A follow-up GitHub issue exists tracking research into incorporating
      reasoning effort (`low|medium|high|xhigh|max`) into a per-task
      dispatch, since no such mechanism exists today.
- [ ] The appended table carries the fixed dispatch-discipline block
      verbatim: every re-dispatch uses the row's alias, never a more capable
      one, and 3 failed attempts on a task stop the run to ask the user.
- [ ] Verified against a real SDD run: a failing task is re-dispatched on
      its row's alias, and the controller asks the user after 3 failures.
