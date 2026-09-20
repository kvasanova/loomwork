# Model Assignment Skill Implementation Plan

> **Status: DONE — shipped in PR #13 (2026-09-20).** Historical record; not maintained.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `loomwork:model-assignment`, a manual-only skill that appends a
`## Model Assignment` table — pinning a concrete model alias per
`subagent-driven-development` (SDD) role — to a plan, and make that table
binding doctrine for SDD across every initialized consumer repo.

**Architecture:** One new instructions-only skill file
(`skills/model-assignment/SKILL.md`), matching the shape of
`skills/split-agents-md/SKILL.md` (manual-only, `disable-model-invocation:
true`, no hook, no JS code). Three existing doc files gain small, additive
edits: the doctrine line lands in the template `init.mjs` already copies
verbatim, the playbook gains one flow-slot mention, and the README gains one
table row.

**Tech Stack:** Markdown only. No new dependencies, no build step, no new JS
module — this repository ships CLIs and instructions-only skills side by
side, and this feature is entirely the latter.

**Spec:** `docs/superpowers/specs/2026-09-20-model-assignment-design.md`

## Global Constraints

- The table's `Model` column holds a bare dispatch alias only (e.g. `haiku`,
  `sonnet`, `opus`) — never a tier word (`cheap`/`standard`/`most capable`),
  never a full model ID, never an effort value. The dispatch tool's `model`
  parameter takes an alias; nothing else on the table is enforceable at
  dispatch time (spec Governing rule, "Why aliases, and why no effort
  column").
- No effort column exists on the table. A per-task dispatch has no effort
  parameter to set. Incorporating effort is out of scope for this plan — see
  Task 3's follow-up issue (spec Non-goals).
- The skill must confirm which aliases are actually available in the
  executing session before proposing any row — never assume a fixed alias
  set (spec Design §1 Step 7).
- The skill frontmatter must include `disable-model-invocation: true` (spec
  Design §1; matches `skills/split-agents-md/SKILL.md`).
- The skill must refuse a plan whose banner matches `^> \*\*Status: DONE`
  (spec Acceptance).
- The skill must never append a second `## Model Assignment` section to a
  plan that already has one — offer replace-or-stop instead (spec
  Acceptance).
- The table's one trailer line is fixed, not generated per plan: `Rows
  absent here fall back to the SDD Model Selection rubric.` (spec Design §1
  Step 10).
- `templates/claude-md-block.md`'s new line is copied verbatim by
  `scripts/init.mjs` into every consumer repo's `<!-- loomwork:begin -->`
  block — do not paraphrase it from the spec (spec Design §2).
- The existing test suite
  (`node --test scripts/lib/__tests__/*.test.mjs`) must pass unmodified
  after every task — none of this plan's edits touch JS code or existing
  test fixtures (spec Testing).

---

### Task 1: Add the `loomwork:model-assignment` skill

**Files:**
- Create: `skills/model-assignment/SKILL.md`
- Reference (read-only, for pattern match): `skills/split-agents-md/SKILL.md`
- Reference (read-only, to confirm the dispatch-role vocabulary this skill's
  proposal draws on): the local plugin cache copy of
  `subagent-driven-development/SKILL.md` (path varies by install; locate
  with `find ~/.claude/plugins -iname SKILL.md -path '*subagent-driven*'`
  if needed — its "Model Selection" section names the complexity signals
  used in Step 8 below: file count, transcription vs. prose, architectural
  judgment)

**Interfaces:**
- Produces: `skills/model-assignment/SKILL.md`, invoked as
  `/loomwork:model-assignment [plan-path]` (argument optional). No other
  task in this plan depends on this file's internal structure — Task 2's
  doctrine line only needs the skill to exist and be named
  `loomwork:model-assignment`, which this task guarantees.

- [x] **Step 1: Write the skill file**

Create `skills/model-assignment/SKILL.md` with this exact content:

```markdown
---
name: model-assignment
disable-model-invocation: true
description: Manual-only; use only when explicitly requested. Append a Model Assignment table to a plan in docs/superpowers/plans/, pinning the model alias per subagent-driven-development role so execution doesn't inherit the session default. Run this in the session that will execute the plan, so the aliases you approve are the ones actually available to you. Invoke explicitly with a plan path, e.g. /loomwork:model-assignment docs/superpowers/plans/2026-09-20-feature.md.
---

# Pin subagent model aliases on a plan

Announce: "Using loomwork:model-assignment to pin subagent model aliases on the plan."

Invoke this skill only when the user asks for it. It is not automatic and no
hook fires it. Run it in the session that will execute the plan — the
aliases you confirm as available in Step 3 are only true for the session
running the skill, and this is also the session whose judgment approves the
table in Step 6.

**Goal:** append a `## Model Assignment` table to an existing plan in
`docs/superpowers/plans/`, so `superpowers:subagent-driven-development` (SDD)
reads model choices out of the plan instead of inheriting the session
default per dispatch.

**Scope: SDD only.** The table is read by `subagent-driven-development` and
nothing else. `superpowers:executing-plans` dispatches no subagents — that
session executes every task in its own context, so there is no `Agent` call
and no `model` parameter for a table to control. A table on a plan destined
for `executing-plans` is inert: harmless, but it buys nothing. State this to
the user after writing the table (Step 7).

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
```

Replace the example rows with the table proposed and approved in Step 7. The
trailer line after the table is fixed text — copy it verbatim, do not
paraphrase or omit it. The column header is `Model`, and its value is the
literal alias to pass to the `Agent` tool's `model` parameter at dispatch
time — not a tier word or a description.

Then state to the user:

> This table is read by `subagent-driven-development` only. If this plan is
> executed through `executing-plans` instead, the table has no effect —
> that skill dispatches no subagents.
```

- [x] **Step 2: Verify the file was created and is valid frontmatter**

Run:

```bash
head -5 skills/model-assignment/SKILL.md
```

Expected: the `---` frontmatter block with `name: model-assignment` and
`disable-model-invocation: true` visible.

- [x] **Step 3: Confirm no other skill file was touched**

Run:

```bash
git status --short skills/
```

Expected: only `skills/model-assignment/SKILL.md` shown as new (`??` or
`A`), nothing else under `skills/` modified.

- [x] **Step 4: Commit**

```bash
git add skills/model-assignment/SKILL.md
git commit -m "feat(skills): add loomwork:model-assignment"
```

---

### Task 2: Add the doctrine line to `templates/claude-md-block.md`

**Files:**
- Modify: `templates/claude-md-block.md`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the skill's existence (the doctrine
  line references `## Model Assignment` as a table shape, not the skill's
  internal file structure).
- Produces: the updated template text that `scripts/init.mjs` (unchanged —
  it already reads this file's full contents verbatim, see
  `scripts/init.mjs:113`) copies into every consumer repo's
  `<!-- loomwork:begin -->` marker block.

- [x] **Step 1: Read the current file**

```bash
cat templates/claude-md-block.md
```

Confirm it still matches this baseline (as of this plan's writing):

```markdown
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
```

If it does not match (someone else edited it since this plan was written),
stop and re-derive the insertion point from the live file instead of
overwriting unrelated changes.

- [x] **Step 2: Insert the doctrine line**

Insert as a new bullet after the "Plans freeze after merge" bullet and
before the "Drift check" bullet:

```markdown
- When a plan carries a `## Model Assignment` table, `subagent-driven-development`
  dispatches use it; a task or role missing from the table falls back to the
  skill's own Model Selection rubric.
```

Resulting bullet list (full, for verification):

```markdown
- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`
  (paths configurable via `.loomwork.json`); roadmap anchor `STRATEGY.md`;
  learnings in `docs/solutions/`.
- Spec frontmatter: only `issue`, `status`
  (`draft|approved|in-progress|partial|implemented|superseded`),
  `implemented_in`, `verified`. Acceptance checkboxes live in the body only.
- Plans freeze after merge (DONE banner + ticked boxes); specs stay current.
- When a plan carries a `## Model Assignment` table, `subagent-driven-development`
  dispatches use it; a task or role missing from the table falls back to the
  skill's own Model Selection rubric.
- Drift check: `loomwork:audit` skill (periodic, not CI). Close-out before
  merge: `loomwork:close-out` skill — hook-enforced on
  `finishing-a-development-branch`.
```

- [x] **Step 3: Run the existing test suite to confirm nothing broke**

```bash
node --test scripts/lib/__tests__/*.test.mjs
```

Expected: all tests pass, same pass count as before this task (this file is
copied verbatim by `initRepo`; `init.test.mjs` only asserts the
`<!-- loomwork:begin -->`/`<!-- loomwork:end -->` markers are present, not
the block's line count — see `scripts/lib/__tests__/init.test.mjs:30`).

- [x] **Step 4: Commit**

```bash
git add templates/claude-md-block.md
git commit -m "docs(templates): bind Model Assignment table as SDD doctrine"
```

---

### Task 3: Update `references/PLAYBOOK.md`, `README.md`, and file the effort-research issue

**Files:**
- Modify: `references/PLAYBOOK.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the skill name `loomwork:model-assignment` from Task 1 (string
  reference only, no code coupling).
- Produces: nothing consumed by other tasks — this is the last task.

- [x] **Step 1: Update the Large capability flow in `references/PLAYBOOK.md`**

Find this line (currently the "Large capability" bullet under
`## Flow by feature size`):

```markdown
**Large capability** — `brainstorming` → design doc in
`docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status frontmatter
(below) → optional `ce-doc-review` for an adversarial multi-persona pass →
`writing-plans` → `subagent-driven-development` for parallel independent tasks,
else `executing-plans`.
```

Replace it with:

```markdown
**Large capability** — `brainstorming` → design doc in
`docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status frontmatter
(below) → optional `ce-doc-review` for an adversarial multi-persona pass →
`writing-plans` → optional `loomwork:model-assignment`, run in the executing
session, to pin subagent model aliases on the plan (SDD only; no effect
under `executing-plans`) → `subagent-driven-development` for parallel
independent tasks, else `executing-plans`.
```

- [x] **Step 2: Add the skill row to `README.md`**

Find the existing skill table rows (they currently read, among others):

```markdown
| `loomwork:audit` skill | Drift linter: closed issues on `draft` specs, merged PRs on unbannered plans, missing/stale `verified` dates. Exit 0/1/2. Not a CI gate by design. |
| `loomwork:close-out` skill | Pre-merge procedure: freeze the plan, verify + update the spec, and decide whether the ship changed the strategy (a yes routes to `ce-strategy`; close-out itself never writes `STRATEGY.md`) — on the feature branch, same PR. |
| `loomwork:split-agents-md` skill | Manual-only: splits one oversized agent guidance file into a tool-agnostic `AGENTS.md` plus thin host files (`CLAUDE.md` and friends) that import or reference it, with no duplicated prose. Moves any marker-guarded block into `AGENTS.md` so init keeps finding exactly one. |
```

Add a new row immediately after the `loomwork:split-agents-md` row:

```markdown
| `loomwork:model-assignment` skill | Manual-only: appends a `## Model Assignment` table to a plan, pinning a model alias per `subagent-driven-development` role. Run in the executing session so approved aliases are ones actually available. No effect under `executing-plans`, which dispatches no subagents. |
```

- [x] **Step 3: Verify both edits landed correctly**

```bash
grep -n "loomwork:model-assignment" references/PLAYBOOK.md README.md
```

Expected: one match in each file.

- [x] **Step 4: Run the full test suite one final time**

```bash
node --test scripts/lib/__tests__/*.test.mjs
```

Expected: all tests pass (these are doc-only edits; no test references
`PLAYBOOK.md` or `README.md` content).

- [x] **Step 5: File the effort-research follow-up issue**

Per spec Non-goals: this plan deliberately omits an effort column because
no mechanism exists today for a per-task dispatch to set reasoning effort
(`low|medium|high|xhigh|max` lives only in agent-definition frontmatter,
which a per-task `Agent` call does not override). File a GitHub issue on
`kvasanova/loomwork` tracking that research gap, titled something like
"Research: incorporate reasoning effort into SDD subagent dispatch", body
summarizing: the dispatch tool has no per-call effort parameter; effort is
settable only via agent-definition frontmatter; research what mechanism (if
any) could let a per-task dispatch carry an effort level, and whether that
belongs in this skill's table as a follow-up column once it exists.

- [x] **Step 6: Commit**

```bash
git add references/PLAYBOOK.md README.md
git commit -m "docs: place loomwork:model-assignment in the large-capability flow"
```

---

## Manual verification (not a task — do after all three tasks land)

The spec's Acceptance list includes one item no automated test covers:
"Verified against a real multi-task plan: the table lands well-formed, and
a fresh `subagent-driven-development` session at setup reads and states it
will honor the table's rows." Before closing out this plan:

1. Run `/loomwork:model-assignment` against a real plan with 2+ tasks (this
   plan itself, once tasks are marked done and before it gets a DONE
   banner, is a valid target — or use any other in-progress plan in the
   repo).
2. Confirm the skill states the available-aliases list before proposing any
   row, the appended table's `Model` column holds only bare aliases (no
   tier words, no full IDs, no effort values), the fixed trailer line is
   present verbatim, and the skill states the `executing-plans` caveat
   afterward.
3. Start (or note the setup step of) a `subagent-driven-development` session
   against that plan and confirm it reads the plan's Global Constraints and
   states it will consult the Model Assignment table for dispatch aliases.

## Model Assignment

| Task | Role | Model | Why |
|------|------|-------|-----|
| 1 | implementer | haiku | complete skill content transcribed verbatim |
| 1 | reviewer | sonnet | small mechanical diff |
| 2 | implementer | haiku | exact bullet insertion given |
| 2 | reviewer | sonnet | small mechanical diff |
| 3 | implementer | sonnet | prose task, 2 files + issue filing |
| 3 | reviewer | sonnet | small mechanical diff |
| final review | reviewer | opus | whole-branch, always most capable |

Rows absent here fall back to the SDD Model Selection rubric.
