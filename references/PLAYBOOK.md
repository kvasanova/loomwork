# Spec-Driven Development Playbook

How loomwork does spec-driven development (SDD) on top of superpowers + compound-engineering.

- **Execution engine:** the **superpowers** plugin (brainstorm → plan → execute).
- **Roadmap anchor + knowledge base:** two cherry-picked compound-engineering
artifacts — `STRATEGY.md` and `docs/solutions/`.
- **Per-spec status:** a frontmatter + checkbox convention (a convention, not a tool).

> **One status-tracking surface.** Every spec tool tracks status via
> manually-ticked checkboxes — none auto-syncs specs to code. So a second tool
> buys no sync engine, only a second source of truth that drifts. superpowers is
> the engine; the few compound-engineering artifacts we take (last section) each
> fill a gap with no overlapping tracking surface. Evaluate any new SDD tool
> against this rule.

## The three layers

| Layer           | Question it answers                    | Tool                              |
| --------------- | -------------------------------------- | --------------------------------- |
| **Strategy**    | What is the product, what's in flight? | `STRATEGY.md` (`ce-strategy`)     |
| **Spec / plan** | How do we build feature X? Is it done? | superpowers + status frontmatter  |
| **Knowledge**   | How did we solve problem Y before?     | `docs/solutions/` (`ce-compound`) |

> **`STRATEGY.md` belongs to `ce-strategy`.** loomwork reads it, points at it,
> and reminds people to run `ce-strategy`. loomwork does not define its shape
> and does not write to it. Test any future change to loomwork's handling of
> the strategy file against this rule.

## Where learnings go

Three stores, three jobs — pick one per learning:

| Store | Use when | Tool |
| --- | --- | --- |
| **`CLAUDE.md`** | One-line operational rule or gotcha an agent needs on every task (command, port, filename, "don't do X") | Edit directly |
| **`docs/solutions/`** | A fix took real investigation (rule of thumb: **>15 minutes** root-causing) **or** the failure is likely to recur across features/modules | `ce-compound` (preferred) or manual file matching existing frontmatter |
| **`docs/reference/`** | Stable how-it-works for a subsystem (invariants, file map, bug-history) — not a single incident write-up | Edit directly |

**Decision flow (bug / small fix close-out):**

1. **Trivial** (typo, wrong import, missing env var name) → skip documentation.
2. **One-liner** (fits in a single `CLAUDE.md` bullet, no repro steps needed) → `CLAUDE.md` Gotchas or the relevant feature section.
3. **Investigation** (>15 min to diagnose, or "we'll hit this again") → full write-up in `docs/solutions/`; leave a **one-line pointer** in `CLAUDE.md` if agents need the guard-rail day-to-day (link to the solutions file).
4. **Subsystem invariant** (ongoing architecture, not one incident) → `docs/reference/` if it describes how a feature works; cross-link from `CLAUDE.md`.

**Anti-patterns:**
- Do not paste multi-paragraph root-cause essays into `CLAUDE.md` — graduate them to `docs/solutions/`.
- Do not duplicate `docs/reference/` content in `docs/solutions/` (link instead).
- Do not use `and/or` without picking a primary home; when both apply, solutions file is primary + CLAUDE.md pointer.

## Flow by feature size

Check `STRATEGY.md` before starting medium/large work — it grounds scope.
Enforced by hooks (see [Hook enforcement](#hook-enforcement)); invoking
`brainstorming` or `writing-plans` auto-injects `STRATEGY.md` content into
context, so the read does not depend on the agent remembering. When the repo
has no strategy file, the same gates inject a one-sentence nudge to run
`ce-strategy` instead.

Close-out never edits `STRATEGY.md`. When a ship genuinely changes the
strategy, run `ce-strategy` on the feature branch so the update rides the same
PR — see [Close-out before merge](#close-out-before-merge).

**Bug / small fix** — GitHub issue `#` → `systematic-debugging` (root cause
first) → `test-driven-development` (failing test first) → PR. If the fix taught
something non-obvious, follow [Where learnings go](#where-learnings-go) (one-liner
→ `CLAUDE.md`; investigation → `ce-compound` / `docs/solutions/` + optional
`CLAUDE.md` pointer).

**Medium feature** — `brainstorming` → `writing-plans` (plan lands in
`docs/superpowers/plans/YYYY-MM-DD-feature.md`) → `executing-plans` →
`verification-before-completion`. Tick the plan's task checkboxes as work lands
— that is the status signal.

**Large capability** — `brainstorming` → design doc in
`docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status frontmatter
(below) → optional `ce-doc-review` for an adversarial multi-persona pass →
`writing-plans` → `subagent-driven-development` for parallel independent tasks,
else `executing-plans`.

> `subagent-driven-development` reuses `.superpowers/sdd/` scratch files by
> filename across plans. `rm -rf .superpowers/sdd/*` before dispatching Task 1
> of a new plan — even if the dir looks empty-ish or you're unsure the prior
> plan finished (`git log` confirms) — or stale briefs get read as current state.

## Tracking what's built vs not

The frontmatter + checkbox convention *is* the tracker (see the
one-status-surface rule above).

### 1. Status frontmatter (every spec)

Specs use **exactly four** YAML keys — no others:

```yaml
---
issue: 828                    # GitHub issue number (integer, no #)
status: draft                 # draft | approved | in-progress | partial | implemented | superseded
implemented_in: "PR #834"     # omit until shipped; quote PR refs
verified: 2026-06-17          # omit until a real code check; YYYY-MM-DD only
---
```

**Rules:**
- **Allowed keys:** `issue`, `status`, `implemented_in`, `verified` — nothing else.
  Do not add `title`, `created`, `topic`, `date`, `name`, `last_updated`, or
  `acceptance`. The `#` heading is the title; the filename date-prefix is the
  created date.
- **`verified`:** omit the key until someone greps/tests the acceptance criteria
  against real code that day. Never `verified: ""` — an empty value is worse
  than absent.
- **`partial`:** add a `## Remaining` section listing what's left.
- **Plans** (`docs/superpowers/plans/`) do not use YAML frontmatter; they use
  the DONE banner + in-body task checkboxes only.

### 2. Acceptance checkboxes = the partial-tracker

Every spec ends with a body checklist under `## Acceptance` or
`## Acceptance Criteria` (`- [ ]` / `- [x]`). Tick boxes as work lands.
`[x]` count vs total = percent-done at a glance.

**Never put checkboxes in YAML frontmatter.** YAML strings do not render as
GitHub task list items and cannot be `[x]`-counted the way this tracker assumes.

### 3. Back-filling specs for already-built features

One-shot job, no tool needed: spawn a read-only exploration subagent to read a
feature and emit a spec in the `docs/superpowers/specs/` format, then set its
frontmatter `status: implemented` + `verified: <date>`.

## Plan vs spec lifecycle

Plans and specs are maintained differently — don't treat them the same.

|              | **Plan** (`superpowers/plans/`)                                                              | **Spec** (`superpowers/specs/`)                                                             |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Role         | Execution artifact — how to build it, task by task                                           | Durable description of a capability                                                         |
| Checkboxes   | Build progress; tick as steps land                                                           | Acceptance criteria; the long-term "is it built" signal                                     |
| After merge  | **Frozen.** Add a `Status: DONE — shipped in PR #N` banner, tick the boxes, stop touching it | **Kept current.** Update frontmatter (`status`, `verified`) + checklist as the code evolves |
| If it drifts | Don't update — git history + the PR are the record                                           | Update it; the spec is the source of truth                                                  |

A merged plan is a historical record (or delete it); long-term
implemented-state lives in the spec.

Config/doc rollouts (like the SDD setup itself) often have no spec — just a plan.
Those are pure execution records: ship, banner, freeze.

## Drift audit

Manual linter for spec/plan status drift — not CI, not auto-sync. Catches the
classic failure mode: shipped work still showing `draft` / unticked plans.

Run the `loomwork:audit` skill monthly or after SDD meta-work. Commands, flags, and
finding codes live in the `loomwork:audit` skill;
fixes go through `loomwork:close-out`.

## Close-out before merge

The lifecycle table above says *what* happens to plans and specs after merge;
close-out makes that state honest **on the feature branch, in the same PR** —
before integration.

**When and who:** during `finishing-a-development-branch`, after tests pass and
before integration (Step 5 worktree cleanup) — Options 1 & 2 only; Options 3 & 4
(branch kept or discarded) skip close-out. Done by whoever (agent or human) is
finishing the branch, on the feature branch. Applies to any feature tracked by
a plan and/or spec in `docs/superpowers/` — including SDD meta-work; pure bug
fixes with no plan/spec skip it. Close-out is doc-only and rides the same PR as
the feature — no follow-up PR after merge; merge style (squash, rebase, merge
commit, local merge) does not matter.

**How:** invoke the `loomwork:close-out` skill — it owns the procedure (banner string, checkbox ticking, frontmatter updates,
the `ce-strategy` handoff decision, commit + push). Do **not** add a project override of the
superpowers `finishing-a-development-branch` skill. Required end state:

- **Plan** — frozen: DONE banner as line 2, every box ticked, task text
  untouched (skill Step 2).
- **Spec** (when paired; config/doc rollouts may be plan-only) — acceptance
  criteria verified against real code, frontmatter
  `status`/`implemented_in`/`verified` updated, body boxes ticked; genuinely
  unmet criteria mean `status: partial` plus `## Remaining` (skill Step 3).
- **STRATEGY.md** — unchanged by close-out. Step 3b asks whether the ship
  changed the strategy (new externally visible milestone, changed investment
  area, retired direction, shifted target problem or approach). A yes routes to
  a `ce-strategy` update run on the same branch, so it rides the same PR; a no
  touches nothing. Ship history lives in spec frontmatter, plan DONE banners,
  and git — specs stay the detailed "is it built" signal; `STRATEGY.md` stays
  the roadmap anchor that `ce-strategy` owns.

**Enforcement:** hooks inject the close-out reminder when
`finishing-a-development-branch` is invoked — see
[Hook enforcement](#hook-enforcement). Skill descriptions alone don't
re-trigger mid-workflow, so the hook is the deterministic nudge.

**Pairing rule:** one feature → one plan (execution record) + optional one spec
(durable capability). Close out both when both exist.

## Hook enforcement

SDD gates inject reminders so agents don't rely on memory mid-workflow. Both
harnesses ship in-repo — edit the matching config when changing behavior.

| Gate | Skill trigger | Claude Code | Cursor |
| --- | --- | --- | --- |
| **STRATEGY.md** | `brainstorming`, `writing-plans` | loomwork plugin hooks/hooks.json — PostToolUse + Skill matcher (ships with the plugin) | .cursor/hooks.json → loomwork-strategy-gate.sh (written by /loomwork:init) — `beforeSubmitPrompt` (slash commands) + `postToolUse` on `Read`/`Skill` |
| **Close-out** | `finishing-a-development-branch` | loomwork plugin hooks/hooks.json — PostToolUse + Skill matcher (ships with the plugin) | .cursor/hooks.json → loomwork-close-out-gate.sh (written by /loomwork:init) — same events |

**Strategy gate, both harnesses:** with a strategy file present, inject its full
content and tell the agent not to open the file. With no strategy file, inject a
one-sentence nudge to run `ce-strategy`. The gate checks existence only — it
never inspects the file's shape.

**Claude Code:** the gates ship with the plugin — no repo-local hook config needed.

## Where artifacts live

```
STRATEGY.md                 # repo root — product anchor (ce-strategy)
docs/
  solutions/                # searchable learnings, YAML frontmatter (ce-compound)
  superpowers/
    plans/                  # writing-plans output
    specs/                  # large-capability designs
```

Naming and the rest of the `docs/` layout: [`docs/README.md`](README.md).

## Key superpowers skills

- **Process (use first):** `brainstorming`, `systematic-debugging`
- **Planning:** `writing-plans`, `writing-skills`
- **Execution:** `executing-plans`, `subagent-driven-development`,
`test-driven-development`
- **Isolation (opt-in):** `using-git-worktrees` — not a default; invoke it when
you want a feature isolated (parallel work, risky changes, keep main tree clean).
- **Quality gates:** `verification-before-completion`, `requesting-code-review`,
`receiving-code-review`, `finishing-a-development-branch`
- **SDD hygiene:** `loomwork:audit` (periodic drift scan), `loomwork:close-out`
  (see [Close-out before merge](#close-out-before-merge))

Process skills run before implementation skills. "Let's build X" → `brainstorming`
first. "Fix bug" → `systematic-debugging` first.

## What we take from compound-engineering (and what we don't)

| Take                              | Why                                                             |
| --------------------------------- | --------------------------------------------------------------- |
| `ce-strategy` → `STRATEGY.md`     | Roadmap/what's-in-flight anchor — superpowers has no equivalent |
| `ce-compound` → `docs/solutions/` | Structured, searchable knowledge base for solved problems       |
| `ce-doc-review`                   | Adversarial review of a large design/plan before building       |

**Don't** run `ce-brainstorm → ce-plan → ce-work` — superpowers is the execution
engine.
