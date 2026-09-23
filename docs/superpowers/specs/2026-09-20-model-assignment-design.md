---
issue: 11
status: in-progress
implemented_in: "PR #13"
verified: 2026-09-20
---

# loomwork:model-assignment — pick SDD subagent models before execution

## Problem

`superpowers:subagent-driven-development` (SDD) tells its controller to pick
the cheapest model tier that fits each dispatched role and to "always specify
the model explicitly when dispatching a subagent" — an omitted model
inherits the session model, usually the most capable and most expensive one.
The skill gives the controller nowhere to record that choice, so in practice
it is re-derived per dispatch or skipped.

SDD also forbids mid-run check-ins: its "Continuous execution" rule means
the controller will not stop to ask which model to use, and auto mode biases
the same way. Per-dispatch confirmation fights the skill; an assignment
settled up front, right before execution starts, does not.

## Governing rule

> The model assignment records exactly what an SDD dispatch can actually
> set: a model alias, per task and role. It is settled in the session that
> will execute the plan, right before execution, so the aliases are current
> by construction and every assignment is enforceable at dispatch time. It
> lives in that session; the plan carries it only when the user asks.

### Why the session, not the plan

The skill runs immediately before SDD in the same session, so the approved
assignment is already in the controller's context when dispatching starts.
Writing it into the plan by default would edit a document for a choice that
only matters to one run, and the earlier appended table — every task, role,
alias, and reasoning — was noise in a document meant for the task text.

The cost is durability: a session-only assignment is lost if the session
compacts or execution resumes in a new session. The skill states that
trade-off and offers the write at the end. When accepted, the write is
minimal: one `**Model:**` line under each task heading and one `**Models:**`
line in the plan header carrying the re-dispatch rules.

### Why aliases, and why no effort column

The `Agent` dispatch tool accepts `model` as an alias — `sonnet`, `opus`,
`haiku`, `fable` — and exposes no per-call effort or thinking parameter.
Exact model IDs and an `effort` level (`low|medium|high|xhigh|max`) are
settable only in agent-definition frontmatter (`.claude/agents/*.md`), which
a per-task dispatch does not override.

So the assignment records the alias and nothing else. A column the dispatch
cannot honor would be advisory text dressed as configuration — the failure
this spec exists to remove, reintroduced one column over. Recording effort
is worth doing once there is a mechanism that binds it; that research is
tracked separately (see Non-goals).

The alias set is not stable across time or across subscriptions — `fable`
is absent from some plans entirely. This is why the skill runs in the
executing session rather than at planning time: the human approving the
assignment is the one who knows which aliases are live for them today, and
they review every task's aliases before execution.

## Goals

- A manual-only skill, `loomwork:model-assignment`, run right before
  execution, settles an implementer and a reviewer alias per task, so SDD
  dispatches use them instead of inheriting the session default.
- The assignment is a model alias per task and role — the one value a
  per-task dispatch can actually set — and the user reviews and approves
  every task's aliases.
- By default the approved assignment lives only in the session. The skill
  then asks whether to write it into the plan; if yes, it writes one
  `**Model:**` line per task and one `**Models:**` re-dispatch line in the
  header, nothing else.
- The assignment binds: `templates/claude-md-block.md` carries one line so
  every initialized consumer repo's `AGENTS.md`/`CLAUDE.md` instructs SDD
  controllers to honor a session-approved assignment or the plan's
  `**Model:**` lines, with a stated fallback for gaps.
- The skill refuses to run on a plan that already carries a DONE banner, and
  when writing replaces existing `**Model:**`/`**Models:**` lines in place
  rather than adding duplicates.
- `references/PLAYBOOK.md`'s large-capability flow names the skill at its
  slot: after `writing-plans`, before `subagent-driven-development`.

## Non-goals

- No enforcement or validation that a running SDD session actually honored
  the assignment — that is SDD's own discipline once the doctrine line exists.
- No change to `subagent-driven-development`'s own Model Selection section.
  This skill produces an input SDD already knows how to consume once the
  doctrine line points it there.
- No support for `executing-plans`. That skill dispatches no subagents, so a
  an assignment has nothing to bind to there — see below.
- No automatic invocation. No hook fires this skill; it never runs unless
  the user explicitly invokes `/loomwork:model-assignment`.
- **No effort column.** A per-task dispatch cannot set reasoning effort, so
  the assignment does not pretend to. Incorporating effort — via agent
  definitions or whatever mechanism emerges — is tracked as a separate
  issue and is out of scope here.
- No exact model IDs. The dispatch tool takes aliases; an ID column would
  not be honored per-task.
- No policy on which aliases are acceptable for execution. The skill
  proposes, the user reviews and edits every row, and the user's judgment
  is final.

## Scope: SDD only

The assignment is read by `subagent-driven-development` and nothing else.
`superpowers:executing-plans` dispatches no subagents — that session executes
every task in its own context, so there is no `Agent` call and no `model`
parameter for an assignment to control. An assignment for a plan executed
through `executing-plans` is inert: harmless, but it buys nothing.

That is not an accident of the two skills. `executing-plans` exists as the
fallback for hosts without subagent support, and its own text says to prefer
`subagent-driven-development` where subagents are available. On those hosts
the model choice was never the session's to make.

The skill must say this out loud: a user who runs
`/loomwork:model-assignment` and then executes through `executing-plans`
otherwise gets an assignment that silently does nothing.

## Dispatch discipline

SDD escalates on its own: a BLOCKED implementer "requires more reasoning" is
re-dispatched on a more capable model, and fix-loop rounds 4-5 dispatch "a
model at least one tier above the implementer that got stuck". Either path
silently overrides the alias the user approved, which is the choice the
assignment exists to pin.

So the assignment carries its own dispatch rules — stated in the session on
approval, and written as the plan header's `**Models:**` line when the user
opts into the write:

- **Same alias on every re-dispatch.** Fix rounds, NEEDS_CONTEXT, BLOCKED,
  and fix-loop rounds 4-5 all use the task's alias. A controller never
  re-dispatches on a more capable alias than the one approved.
- **Ask after 3 failures.** After 3 failed attempts on the same task, the
  controller stops and asks the user. Only the user may approve a different
  alias, and the approval is ledgered.

## Design

### 1. `skills/model-assignment/SKILL.md`

Manual-only skill (`disable-model-invocation: true`) whose description names
manual invocation with a plan-path argument, running right before execution,
and the session-default / optional-write behavior. The skill file spells out
each step; in substance:

1. **Announce** "Using loomwork:model-assignment to pick subagent model
   aliases for the plan."
2. **Resolve the plan path** — the argument, else the most recently modified
   `*.md` in `plansDir` (from `.loomwork.json`, default
   `docs/superpowers/plans`); stop if none resolves.
3. **Refuse a frozen plan** — any line matching `^> \*\*Status: DONE`.
4. **Note an existing assignment** — `**Model:**` lines under task headings
   or a `**Models:**` header line seed the proposal; a later write replaces
   them in place, never duplicates them.
5. **Read the paired spec**, if one matches by filename slug, for
   architectural-risk context.
6. **Extract the task list** — `### Task N:` headings and each task's
   **Files** block, the complexity signals SDD's Model Selection names.
7. **Confirm available aliases** — state the aliases this session's `Agent`
   tool accepts and confirm with the user which are live for them now. Only
   confirmed aliases may be proposed.
8. **Propose an implementer and a reviewer alias per task**, one chat line
   per task with a few words of reasoning:
   - implementer: cheapest alias for 1-2 files with complete code in the
     plan text; mid-tier floor for prose-described or multi-file
     integration work; most capable only for architectural or
     broad-codebase judgment.
   - reviewer: mid-tier floor; most capable only for a genuinely large or
     risky diff.
   - The final whole-branch review is named (SDD already runs it on the most
     capable model) but not assigned or recorded.
   The user may edit any task; their judgment is final.
9. **Hold the approved assignment in the session** — restate it compactly
   with the dispatch rules (same alias on every re-dispatch, ask after 3
   failures, unassigned tasks fall back to SDD's rubric).
10. **Offer the write** — ask whether to write the assignment into the plan,
    default no, stating that a session-only assignment does not survive
    compaction or a new session. Only on yes:
    - under each `### Task N:` heading, one line:
      `**Model:** implementer <alias> · reviewer <alias>`
    - in the plan header, after its last `**Label:**` line and before the
      first `---` or `## ` heading, once, verbatim:
      `**Models:** re-dispatches keep the task's model, never a more capable one; after 3 failed attempts on a task, ask the user.`
    Nothing else is written: no table, no reasoning, no final-review line.
11. **State the executing-plans caveat** — the assignment has no effect
    there, since that skill dispatches no subagents.

Each alias is the literal value for the `Agent` tool's `model` parameter —
not a tier word or a description. There is no effort setting: a per-task
dispatch has no effort parameter to set.

### 2. Doctrine line in `templates/claude-md-block.md`

One bullet in the marker block, so `init.mjs` carries it into every
consumer repo verbatim:

```markdown
- When `loomwork:model-assignment` approved per-task aliases in this session,
  or plan tasks carry a `**Model:**` line, `subagent-driven-development`
  dispatches use them; a task without one falls back to the skill's own Model
  Selection rubric. Re-dispatches keep the task's alias, never a more capable
  one; after 3 failed attempts on a task, ask the user.
```

`init.mjs` needs no code change — it already copies this file's full
contents into the marker block.

### 3. `references/PLAYBOOK.md` — large-capability flow

The **Large capability** bullet names the skill after `writing-plans` and
before `subagent-driven-development`: run in the executing session right
before execution, held in the session, written to the plan only if asked,
SDD only.

### 4. `README.md` skill table

```markdown
| `loomwork:model-assignment` skill | Manual-only: right before execution, picks a model alias per task for `subagent-driven-development` implementer and reviewer dispatches. Held in the session by default; optionally written as a `**Model:**` line per task. No effect under `executing-plans`, which dispatches no subagents. |
```

## Files touched

| File | Change |
| --- | --- |
| `skills/model-assignment/SKILL.md` | Manual-only skill per Design §1 |
| `templates/claude-md-block.md` | Doctrine line per Design §2 |
| `references/PLAYBOOK.md` | Skill at its slot in the Large capability flow |
| `README.md` | Skill row in the table |

## Testing

This skill is instructions-only Markdown, matching `skills/audit` and
`skills/close-out` — no `node:test` coverage exists for skill *behavior*
(SKILL.md files are not executed by the test suite). Verification is manual,
per Acceptance below.

`scripts/lib/__tests__/init.test.mjs` asserts only that
`<!-- loomwork:begin -->` appears in the written `AGENTS.md`/`CLAUDE.md` —
no assertion pins the marker block's content, so changing the doctrine line
requires no test change and the existing suite must still pass unmodified.

## Migration and blast radius

- No hook fires this skill; no repo's behavior changes until a user
  explicitly runs `/loomwork:model-assignment`.
- Re-running `/loomwork:init` on an initialized repo picks up the revised
  doctrine line via the existing marker-block content-diff migration.
- Plans that already carry an appended `## Model Assignment` table from the
  first version of this skill are not migrated. Frozen plans stay as they
  are; a live plan with such a table should have it removed by hand before
  re-running the skill, since the doctrine line no longer names it.

## Acceptance

- [x] `skills/model-assignment/SKILL.md` exists with
      `disable-model-invocation: true` and a description naming manual-only
      invocation with a plan-path argument.
- [x] The skill resolves an explicit plan-path argument, and falls back to
      the most recently modified plan in the configured `plansDir` when no
      argument is given.
- [x] The skill refuses a plan whose banner matches `^> \*\*Status: DONE`.
- [x] The skill reads a paired spec (filename-slug match) when one exists,
      for architectural-risk context.
- [x] The skill confirms which model aliases are actually available in the
      executing session before proposing any, and every proposed alias
      comes from that confirmed list.
- [x] Proposed aliases are bare aliases (e.g. `haiku`, `sonnet`, `opus`) —
      no tier word, no full model ID, no effort value.
- [x] The proposal is presented for approval, with edits accepted, before
      execution.
- [x] The skill states the `executing-plans` no-op caveat.
- [x] A follow-up GitHub issue exists tracking research into incorporating
      reasoning effort (`low|medium|high|xhigh|max`) into a per-task
      dispatch, since no such mechanism exists today.
- [x] `references/PLAYBOOK.md`'s Large capability flow names
      `loomwork:model-assignment` at the stated slot.
- [x] The full existing test suite (`node --test scripts/lib/__tests__/*.test.mjs`)
      passes unmodified.
- [ ] By default the skill writes nothing to the plan: the approved
      assignment is restated in the session with the dispatch rules.
- [ ] The skill asks whether to write the assignment into the plan, default
      no, stating the compaction / new-session trade-off.
- [ ] On yes, each task gets exactly one
      `**Model:** implementer <alias> · reviewer <alias>` line under its
      heading, the header gets the `**Models:**` line verbatim once, and
      nothing else is written; existing lines are replaced in place.
- [ ] `templates/claude-md-block.md` contains the doctrine line from
      Design §2, verbatim.
- [ ] `README.md`'s skill table carries the row from Design §4.
- [ ] Verified against a real SDD run: dispatches use the session-approved
      aliases, a failing task is re-dispatched on its task's alias, and the
      controller asks the user after 3 failures.
