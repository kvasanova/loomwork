# Spec-Driven Development Playbook

How loomwork does spec-driven development (SDD) on top of superpowers.

- **Execution engine:** the **superpowers** plugin (brainstorm → plan → execute).
- **Per-spec status:** a frontmatter + checkbox convention (a convention, not a tool).

> **One status-tracking surface.** Every spec tool tracks status via
> manually-ticked checkboxes — none auto-syncs specs to code. So a second tool
> buys no sync engine, only a second source of truth that drifts. superpowers is
> the engine, and spec frontmatter is the only status surface. Evaluate any new
> SDD tool against this rule.

## Flow by feature size

**Bug / small fix** — GitHub issue `#` → `systematic-debugging` (root cause
first) → `test-driven-development` (failing test first) → PR.

**Medium feature** — `brainstorming` → `writing-plans` (plan lands in
`docs/superpowers/plans/YYYY-MM-DD-feature.md`) → `executing-plans` →
`verification-before-completion`. Tick the plan's task checkboxes as work lands
— that is the status signal.

**Large capability** — `brainstorming` → design doc in
`docs/superpowers/specs/YYYY-MM-DD-feature-design.md` with status frontmatter
(below) → `writing-plans` → optional `loomwork:model-assignment`, run in the
executing session right before execution, to pick subagent model aliases per task
(held in the session; written to the plan only if asked; SDD only, no effect
under `executing-plans`) → `subagent-driven-development` for parallel
independent tasks, else `executing-plans`.

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

**How:** invoke the `loomwork:close-out` skill — it owns the procedure (banner
string, checkbox ticking, frontmatter updates, commit + push). Do **not** add a
project override of the superpowers `finishing-a-development-branch` skill. Required end state:

- **Plan** — frozen: DONE banner as line 2, every box ticked, task text
  untouched (skill Step 2).
- **Spec** (when paired; config/doc rollouts may be plan-only) — acceptance
  criteria verified against real code, frontmatter
  `status`/`implemented_in`/`verified` updated, body boxes ticked; genuinely
  unmet criteria mean `status: partial` plus `## Remaining` (skill Step 3).

**Enforcement:** hooks inject the close-out reminder when
`finishing-a-development-branch` is invoked — see
[Hook enforcement](#hook-enforcement). Skill descriptions alone don't
re-trigger mid-workflow, so the hook is the deterministic nudge.

**Pairing rule:** one feature → one plan (execution record) + optional one spec
(durable capability). Close out both when both exist.

## Hook enforcement

SDD gates inject reminders so agents don't rely on memory mid-workflow. Both
harnesses ship in-repo — edit the matching config when changing behavior.

| Gate | Skill trigger | Claude Code | Codex |
| --- | --- | --- | --- |
| **Close-out** | `finishing-a-development-branch` | loomwork plugin `hooks/hooks.json` → `PostToolUse` + `Skill` matcher (ships with the plugin) | `hooks/codex-hooks.json` → `UserPromptSubmit`; explicit `$superpowers:finishing-a-development-branch` prompts only |
| **Doctrine** | every session (and after compaction) | loomwork plugin `hooks/hooks.json` → `SessionStart` (`startup\|clear\|compact`), opted-in repos only | `hooks/codex-hooks.json` → `SessionStart`; opted-in repos only; current doctrine from installed plugin |

**Claude Code:** the gates ship with the plugin — no repo-local hook config needed.

**Codex:** the gates ship with the plugin. The `UserPromptSubmit` close-out
gate observes explicit `$superpowers:...` prompts only; implicit skill
selection does not produce a signal that gate can identify. The `SessionStart`
doctrine gate injects the current template once the installed hook is trusted.

## Where artifacts live

```
docs/
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
