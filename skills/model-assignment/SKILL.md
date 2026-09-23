---
name: model-assignment
disable-model-invocation: true
description: Manual-only; use only when explicitly requested. Append a Model Assignment table to a plan in docs/superpowers/plans/, pinning the model alias per subagent-driven-development role so execution doesn't inherit the session default. Run this in the session that will execute the plan, so the aliases you approve are the ones actually available to you. Invoke explicitly with a plan path, e.g. /loomwork:model-assignment docs/superpowers/plans/2026-09-20-feature.md.
---

# Pin subagent model aliases on a plan

Announce: "Using loomwork:model-assignment to pin subagent model aliases on the plan."

Invoke this skill only when the user asks for it. It is not automatic and no
hook fires it. Run it in the session that will execute the plan — the
aliases you confirm as available in Step 6 are only true for the session
running the skill, and this is also the session whose judgment approves the
table in Step 7.

**Goal:** append a `## Model Assignment` table to an existing plan in
`docs/superpowers/plans/`, so `superpowers:subagent-driven-development` (SDD)
reads model choices out of the plan instead of inheriting the session
default per dispatch.

**Scope: SDD only.** The table is read by `subagent-driven-development` and
nothing else. `superpowers:executing-plans` dispatches no subagents — that
session executes every task in its own context, so there is no `Agent` call
and no `model` parameter for a table to control. A table on a plan destined
for `executing-plans` is inert: harmless, but it buys nothing. State this to
the user after writing the table (Step 8).

**No effort column.** The `Agent` dispatch tool takes `model` as a bare
alias and exposes no per-call effort or thinking parameter — an exact model
ID or a reasoning-effort level is only settable in agent-definition
frontmatter, which a per-task dispatch does not override. This skill records
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

## Step 3: Refuse or replace an existing table

If the plan already contains a `## Model Assignment` heading, ask the user:
replace the existing table, or stop. Never append a second `## Model
Assignment` section to the same file.

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

## Step 7: Propose one row per task per role

Pick from the confirmed alias list only — never a tier word
(cheap/standard/most-capable), never an alias not confirmed available in
Step 6:

- **implementer row:** the cheapest available alias when the task touches
  1-2 files and the plan text already contains the complete code to write
  (transcription plus testing); a mid-tier alias as the floor for tasks
  described in prose or touching multiple files with integration concerns;
  the most capable available alias only when the task requires
  architectural or broad-codebase judgment.
- **reviewer row:** mid-tier as the floor; the most capable available alias
  only for a genuinely large or risky diff. A small mechanical diff never
  needs more than mid-tier.
- **final review row:** the most capable available alias — non-negotiable,
  per SDD's own text ("dispatch it on the most capable available model, not
  the session default").

Present the full proposed table for approval before writing anything to the
plan file. The user reviews and may edit every row — this is not a
formality; the proposal is a starting point and the user's judgment on
which alias fits which task is final.

## Step 8: Write the approved table

Only after approval, append this exact shape as a new `##` section at the
end of the plan file (after its last existing section):

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

- Every dispatch for a task and role uses that row's alias, including every
  re-dispatch: fix rounds, NEEDS_CONTEXT, BLOCKED, and SDD's fix-loop rounds
  4-5. Never re-dispatch on a more capable alias than the row selects.
- After 3 failed attempts on the same task, stop and ask the user how to
  proceed. Only the user may approve a different alias; ledger the approval.
```

Replace the example rows with the table proposed and approved in Step 7.
Everything after the table — the fallback line and the dispatch-discipline block — is
fixed text: copy it verbatim, do not paraphrase or omit it. The column header
is `Model`, and its value is the literal alias to pass to the `Agent` tool's
`model` parameter at dispatch time — not a tier word or a description.

Then state to the user:

> This table is read by `subagent-driven-development` only. If this plan is
> executed through `executing-plans` instead, the table has no effect —
> that skill dispatches no subagents.
