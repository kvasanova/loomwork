---
name: model-assignment
disable-model-invocation: true
description: Manual-only; use only when explicitly requested. Right before executing a plan in docs/superpowers/plans/, pick the model alias per task for subagent-driven-development's implementer and reviewer dispatches, so execution doesn't inherit the session default. The approved assignment lives in the session; writing it into the plan is optional and asked at the end. Invoke explicitly with a plan path, e.g. /loomwork:model-assignment docs/superpowers/plans/2026-09-20-feature.md.
---

# Pick subagent model aliases for a plan

Announce: "Using loomwork:model-assignment to pick subagent model aliases for the plan."

Invoke this skill only when the user asks for it. It is not automatic and no
hook fires it. Run it in the session that will execute the plan, right
before `superpowers:subagent-driven-development` (SDD) starts — the aliases
you confirm as available in Step 6 are only true for this session, and this
session is the one that dispatches with them.

**Goal:** settle, per task, which model alias SDD passes to the `Agent`
tool's `model` parameter for the implementer and the reviewer, so dispatches
stop inheriting the session default. By default the approved assignment
lives only in this session's context. Writing it into the plan is optional
(Step 9).

**Scope: SDD only.** The assignment is read by `subagent-driven-development`
and nothing else. `superpowers:executing-plans` dispatches no subagents —
that session executes every task in its own context, so there is no `Agent`
call and no `model` parameter for an assignment to control. State this to the
user at the end (Step 10).

**No effort setting.** The `Agent` dispatch tool takes `model` as a bare
alias and exposes no per-call effort or thinking parameter — an exact model
ID or a reasoning-effort level is only settable in agent-definition
frontmatter, which a per-task dispatch does not override. This skill assigns
only what a dispatch can actually honor: the alias.

## Step 1: Resolve the plan path

- If the skill argument names a file, use it.
- Otherwise, check for `.loomwork.json` at the repo root and read its
  `plansDir` key (default `docs/superpowers/plans`), then pick the most
  recently modified plan:

  ```bash
  ls -t <plansDir>/*.md 2>/dev/null | head -1
  ```

- If no plan file resolves either way, stop: "No plan file found — pass a
  path or create a plan with superpowers:writing-plans first."

## Step 2: Refuse a frozen plan

Read the resolved plan file. If any line matches `^> \*\*Status: DONE`,
stop:

> This plan is frozen (DONE banner present). loomwork doctrine: plans
> freeze after merge and never change again. Model assignment only runs
> pre-merge, on a live plan.

## Step 3: Note an existing assignment

If the plan already carries `**Model:**` lines under its task headings, or a
`**Models:**` line in its header, treat those aliases as the starting point
for Step 7's proposal and tell the user they are there. If Step 9 writes to
the plan, it replaces those lines in place — never add a second `**Model:**`
line to a task or a second `**Models:**` line to the header.

## Step 4: Read the paired spec, if any

loomwork pairs a plan to a spec by filename slug: strip the plan's date
prefix, strip the spec's date prefix and `-design` suffix, compare. If a
spec with the matching slug exists under the configured `specsDir` (default
`docs/superpowers/specs`), read it. Use it for scope and risk context —
architecture-heavy areas push a role toward a more capable alias even when
the plan text alone looks mechanical.

## Step 5: Extract the task list

Parse the plan's `### Task N: <name>` headings and each task's **Files**
block (created/modified/test file counts). These are the complexity signals
that decide which alias fits, matching `subagent-driven-development`'s own
Model Selection section:

- File count the task touches.
- Whether the plan text already contains the complete code to write
  (transcription plus testing) versus a prose description of what to build.
- Whether the task requires architectural judgment or broad-codebase
  understanding.

## Step 6: Confirm which model aliases are actually available

Do not assume a fixed alias set. State the aliases this session's own
`Agent` tool accepts, and confirm with the user which of them are actually
live for their subscription right now — a subscription may exclude one.
This confirmed list is the only vocabulary Step 7's proposal may draw from.

## Step 7: Propose an implementer and a reviewer alias per task

Pick from the confirmed alias list only — never a tier word
(cheap/standard/most-capable), never an alias not confirmed available in
Step 6:

- **implementer:** the cheapest available alias when the task touches 1-2
  files and the plan text already contains the complete code to write
  (transcription plus testing); a mid-tier alias as the floor for tasks
  described in prose or touching multiple files with integration concerns;
  the most capable available alias only when the task requires
  architectural or broad-codebase judgment.
- **reviewer:** mid-tier as the floor; the most capable available alias only
  for a genuinely large or risky diff. A small mechanical diff never needs
  more than mid-tier.

The final whole-branch review is not part of the proposal: SDD already
dispatches it on the most capable available model. Name that alias in the
proposal so the user sees it, but do not assign or record it.

Present the proposal in chat as one line per task — task number, name,
implementer alias, reviewer alias, and a few words of reasoning. The
reasoning is for the user's review only; it is never written to the plan.
The user may edit any task's aliases — the proposal is a starting point and
the user's judgment on which alias fits which task is final.

## Step 8: Hold the approved assignment in the session

Once the user approves, restate the final assignment as a compact list and
state that it governs every SDD dispatch in this session:

- Each task's implementer and reviewer dispatches pass that task's approved
  alias as the `Agent` tool's `model`.
- Every re-dispatch for a task and role — fix rounds, NEEDS_CONTEXT,
  BLOCKED, and SDD's fix-loop rounds 4-5 — keeps that alias. Never
  re-dispatch on a more capable alias than the one approved.
- After 3 failed attempts on the same task, stop and ask the user how to
  proceed. Only the user may approve a different alias; ledger the approval.
- A task with no approved alias falls back to SDD's Model Selection rubric.

## Step 9: Offer to write it into the plan

Ask the user whether to also write the assignment into the plan file. The
default is no. Tell them the trade-off in one sentence: without it, the
assignment exists only in this session's context, so it is lost if the
session compacts or execution resumes in a new session.

Only if the user says yes:

1. Under each `### Task N: <name>` heading, insert one line after a blank
   line, before the task's existing content:

   ```markdown
   **Model:** implementer <alias> · reviewer <alias>
   ```

2. In the plan header — after its last `**Label:**` line (`**Goal:**`,
   `**Spec:**`, `**Tech Stack:**`, …), before the first `---` or `## `
   heading — insert this line verbatim, once:

   ```markdown
   **Models:** re-dispatches keep the task's model, never a more capable one; after 3 failed attempts on a task, ask the user.
   ```

Write nothing else: no table, no reasoning, no final-review line. Each
`<alias>` is the literal value for the `Agent` tool's `model` parameter —
not a tier word or a description.

## Step 10: State the executing-plans caveat

> This assignment is read by `subagent-driven-development` only. If this
> plan is executed through `executing-plans` instead, it has no effect —
> that skill dispatches no subagents.
