---
issue: 6
status: draft
---

# STRATEGY.md ownership: loomwork defers to ce-strategy

## Problem

`loomwork:close-out` Step 3b instructs the agent to append one bullet per merge
under `## Milestones` in `STRATEGY.md`, creating the section if absent. Every
shipped spec adds a line. Over a project's life the roadmap anchor turns into a
changelog, and the sections that ground scope decisions — target problem,
approach, tracks — get pushed below a growing ledger of ship events.

The growth is the symptom. The cause is an ownership conflict: `STRATEGY.md` is
authored and maintained by `compound-engineering:ce-strategy`, and loomwork's
close-out procedure contradicts that skill's own rules for the file.

`ce-strategy` defines Milestones as an optional section
(`references/interview.md`, section 6):

- "Default is to skip. Do not push the user to invent milestones."
- "Only capture externally visible, real milestones. Avoid turning this into an
  internal schedule."
- Template comment: "Only externally visible milestones: launches, fundraises,
  conferences, renewals."

Its core principles add "Anchor, not plan", "Short is a feature", and "Does not
update the issue tracker or reconcile in-flight work."

A per-merge ship bullet is an internal schedule entry. loomwork was writing the
exact content `ce-strategy` tells authors to keep out, and doing it
mechanically, without bound.

Two related overreaches follow from the same root:

1. `templates/STRATEGY.md` is a loomwork-authored variant of ce's
   `strategy-template.md`. It omits `## Marketing`, carries loomwork-worded
   section guidance, and drifts independently of the upstream template.
2. `scripts/init.mjs` seeds that template on `/loomwork:init`, so a
   loomwork-scaffolded repo starts with a placeholder strategy file whose shape
   loomwork — not ce — decided.

## Governing rule

> `STRATEGY.md` belongs to `ce-strategy`. loomwork reads it, points at it, and
> reminds people to run `ce-strategy`. loomwork does not define its shape and
> does not write to it.

Every change below follows from this rule, and future changes to loomwork's
handling of the strategy file should be tested against it.

## Goals

- Close-out stops appending per-merge Milestones bullets, so `STRATEGY.md` stops
  growing with each shipped spec.
- loomwork stops shipping and seeding its own strategy template.
- A repo with no strategy file gets pointed at `ce-strategy` — at init time and
  again at scope time — rather than silently having none.
- loomwork writes nothing to `STRATEGY.md`. A ship that changes the strategy is
  routed to a `ce-strategy` update run, not edited in place.

## Non-goals

- Retroactively pruning Milestones sections in repos that already accumulated
  them. Existing content is left alone; trimming it is a `ce-strategy` update run
  the user chooses to make.
- An audit rule that lints `STRATEGY.md` structure. ce owns the file; loomwork
  linting its shape would recreate the overreach this spec removes.
- Changing `.loomwork.json`'s `strategyFile` key or the gate's skill matchers.
- Any change to spec or plan lifecycle handling.

## Design

### 1. Close-out Step 3b — a decision, not a write

`skills/close-out/SKILL.md` Step 3b is rewritten. The step still runs only when
the branch had a paired spec and the work is not plan-only. It no longer writes
to `STRATEGY.md` at all; it asks whether the ship changed the strategy and, if
so, hands off to `ce-strategy`.

The new step, in substance:

> **Did this ship change the strategy?** Does the shipped capability introduce
> an externally visible milestone (a launch), change what an investment area
> covers, retire a direction the team keeps revisiting, or shift the target
> problem or approach? If **yes**, run `compound-engineering:ce-strategy`
> targeted at that section, on the feature branch, so the update rides the same
> PR. If **no**, touch nothing. Ship history lives in spec frontmatter
> (`implemented_in`, `verified`), plan DONE banners, and git — not here.

Removed:

- The **`last_updated` bump**. The field means "strategy content last revised";
  `ce-strategy` sets it only on an interview or update run. A bump with no
  content change tells readers — and `ce-ideate`/`ce-brainstorm`, which load the
  file as grounding — that the strategy was revised when it was not. Worse, it
  masks staleness: `ce-strategy`'s update run "only challenges sections that
  look stale or weak", and a per-ship bump keeps the date perpetually fresh so
  that check never fires. A date also cannot distinguish "reviewed, unchanged"
  from "revised", so it carries no information worth the write.
- The `## Milestones` append. Entirely.
- The instruction to create a `## Milestones` section when missing. ce's default
  is to skip the section, so loomwork must never conjure it.
- "Do not add a fifth track — fold into an existing track or replace the weakest
  track". With track edits gone entirely there is no bound for loomwork to
  restate; track count is `ce-strategy`'s to enforce.
- The **Tracks sentence** on in-flight work. `ce-strategy`'s `SKILL.md` states it
  "does not update the issue tracker or reconcile in-flight work"; a sentence
  written per spec-status change is a schedule entry, not the track's standing
  purpose (`references/interview.md` section 5 captures a track as "a name, a
  one-line purpose, and a short note on why this serves the approach"). One write
  per lifecycle event is the same unbounded growth as the Milestones bullet.
- The **`## Not working on`** edit. `references/interview.md` section 7 makes the
  section optional, "skip by default", and interview-gated. A close-out step
  deciding on its own that a retired direction belongs there defines the file's
  shape by proxy — the overreach this spec removes.

Cost accepted: a ship that genuinely changed the strategy now requires an
interactive `ce-strategy` run inside close-out rather than a one-line edit. That
is the same bar ce applies to every other strategy change, and it is rare by
construction — most ships do not move the strategy.

Step 4's verification block drops `grep '^last_updated:' STRATEGY.md`; there is
no loomwork-authored write left to verify. Step 5's `git add` keeps
`STRATEGY.md` in its path list only because a `ce-strategy` run in Step 3b may
have modified it.

### 2. Playbook doctrine

`references/PLAYBOOK.md` currently describes the close-out end state for the
strategy file as "`last_updated` bump plus Milestones/Tracks/Not-working-on edits
(skill Step 3b)". It is restated as: unchanged by close-out; a strategy-changing
ship gets a `ce-strategy` update run on the same branch. The governing rule above
is added so the ownership boundary is doctrine rather than an implementation
detail of one skill.

### 3. init defers to ce-strategy

`scripts/init.mjs` stops copying `templates/STRATEGY.md`. When the configured
strategy file is absent, the script records an action noting it is missing and
naming `ce-strategy` as the way to author it. The script itself stays
non-interactive.

`templates/STRATEGY.md` is deleted.

`commands/init.md` changes:

- Step 2's description of what the scaffolder creates drops "a STRATEGY.md seed".
- Step 3 gains an instruction: when the scaffolder reports the strategy file is
  missing, invoke `compound-engineering:ce-strategy` to author it before
  reporting completion.
- The command's frontmatter `description` drops "STRATEGY.md seed".

`/loomwork:init` Step 1 already preflights that `compound-engineering:ce-strategy`
is available and stops without writing when it is not, so the new Step 3
invocation cannot be reached with the skill missing.

Idempotency is preserved in the sense that matters: init performs no writes and
no prompts for a strategy file that already exists, and re-running it never
changes the repo twice.

One reporting consequence is intended. `scripts/init.mjs` prints "already
initialized — no changes" only when the action list is empty, so an initialized
repo that still has no strategy file reports the missing-file action on every
run rather than that line. That is correct — the condition genuinely persists
until someone runs `ce-strategy` — but it means "no-op" here means "no writes",
not "no actions reported".

### 4. Strategy gate nudges on a missing file

This implements the second half of the Goals bullet "A repo with no strategy file
gets pointed at `ce-strategy` — at init time and again at scope time". It shares
the root cause of the Milestones problem: both are places where loomwork handled
`STRATEGY.md` on its own terms instead of deferring to its owner — there by
writing content ce does not want, here by staying silent when ce should be run.

`hooks/strategy-gate.sh` currently exits 0 when the strategy file does not exist,
so a repo with no strategy file gets no reminder at exactly the moment grounding
matters. The missing-file branch instead injects this reminder, for the same two
skill matchers the gate already fires on (`brainstorming`, `writing-plans`):

```
loomwork strategy gate: no strategy file yet. Run
compound-engineering:ce-strategy to author one before scoping medium or large
work.
```

The nudge is one sentence, carries no file content, and reuses each harness's
existing output envelope — `hookSpecificOutput.additionalContext` for the plugin
gate, `additional_context` for the Cursor gate. It checks only whether the file
exists; it never inspects the file's shape, which the Non-goals rule out.

Behavior when the file exists is unchanged, including the existing instruction
telling agents not to open the strategy file directly.

`templates/cursor/loomwork-strategy-gate.sh` receives the equivalent change. The
two scripts are **not** copies — they are independent implementations of one
behavior. The plugin gate handles `PostToolUse`, resolves the root from
`CLAUDE_PROJECT_DIR`, and emits `hookSpecificOutput`; the Cursor gate also
handles `beforeSubmitPrompt`, resolves the root from `workspace_roots[0]`, and
emits `additional_context`. The missing-file behavior is ported to each in its
own idiom, not copied. Init's existing content-diff migration
(`scripts/init.mjs`, the `CURSOR_SCRIPTS` loop) rewrites the installed Cursor
copy on the next run.

The Cursor gate currently collapses two cases into one guard —
`[[ -z "$root" || ! -f "$strategy_file" ]]`. The nudge must fire only when a
workspace root resolved and the strategy file is genuinely absent; an unresolved
root still exits silently, since the gate cannot tell whether a file is missing
when it does not know where to look.

## Files touched

| File | Change |
| --- | --- |
| `skills/close-out/SKILL.md` | Rewrite Step 3b as a decision + `ce-strategy` handoff; drop the `last_updated` grep from Step 4 |
| `references/PLAYBOOK.md` | Restate close-out strategy end state; add governing rule |
| `scripts/init.mjs` | Stop copying the template; emit a missing-file action |
| `templates/STRATEGY.md` | Delete |
| `commands/init.md` | Frontmatter description; Step 2 wording; Step 3 invokes `ce-strategy` |
| `hooks/strategy-gate.sh` | Missing-file branch nudges instead of exiting silently |
| `templates/cursor/loomwork-strategy-gate.sh` | Same missing-file change |
| `README.md` | Remove descriptions of the seed and the Milestones append; describe both gate paths (inject when present, nudge when absent) |

## Testing

Tests are written before the implementation, following the repo's existing
`node:test` suite under `scripts/lib/__tests__/`.

Inverted assertions:

- `init.test.mjs` — the case asserting `STRATEGY.md` exists after `initRepo`
  inverts to assert it is not created and that the returned action list flags the
  missing file.
- `hooks.test.mjs` — "strategy-gate stays silent when strategy file missing"
  inverts to assert the nudge text is injected.

Retained as regression guards:

- `init.test.mjs` "initRepo never overwrites an existing strategy file" stays
  valid and must still pass.
- `hooks.test.mjs` cases covering gate behavior with a strategy file present:
  content injection, the do-not-open instruction, custom `strategyFile` from
  `.loomwork.json`, and silence on non-matching skills.

New:

- `cursor-hooks.test.mjs` gains a missing-file case matching the Claude Code gate.
- A behavioral parity case asserting both gates name `ce-strategy` on the
  missing-file path, each through its own output envelope. This asserts behavior,
  not script text: the two scripts are independent implementations, so a
  content-equality assertion would be false by construction.
- A case asserting the Cursor gate stays silent when no workspace root resolves,
  even with a matching skill — the no-root path must not be mistaken for a
  missing file.
- Cases asserting each gate's nudge fires for both matchers (`brainstorming`,
  `writing-plans`) and stays silent on non-matching skills when the file is
  absent.

## Migration and blast radius

No change is destructive to already-initialized repos.

- Repos that already ran init keep their seeded `STRATEGY.md`. Nothing rewrites
  or deletes it.
- Repos with an accumulated `## Milestones` list keep every existing bullet. This
  spec stops the growth; it does not prune history.
- Re-running `/loomwork:init` rewrites the installed Cursor gate script to the
  nudging version through the existing content-diff migration path.
- Repos with no strategy file gain a nudge they did not previously get. That is
  the intended behavior change.

## Acceptance

- [ ] `skills/close-out/SKILL.md` Step 3b contains no instruction to append to or
      create a `## Milestones` section.
- [ ] `skills/close-out/SKILL.md` Step 3b contains no write to `STRATEGY.md` —
      no `last_updated` bump, no Tracks or `## Not working on` edit — and points
      at a `ce-strategy` update run when the ship changed the strategy.
- [ ] `references/PLAYBOOK.md` states the governing rule.
- [ ] `references/PLAYBOOK.md` lists the close-out strategy end state as
      unchanged by close-out, with strategy-changing ships routed to
      `ce-strategy`.
- [ ] `templates/STRATEGY.md` does not exist.
- [ ] `initRepo` does not create a strategy file, and returns an action naming the
      missing file and `ce-strategy`.
- [ ] `initRepo` still leaves an existing strategy file byte-identical.
- [ ] `commands/init.md` instructs invoking `compound-engineering:ce-strategy`
      when the strategy file is missing, and its description no longer mentions a
      seed.
- [ ] `hooks/strategy-gate.sh` injects a `ce-strategy` reminder when the strategy
      file is missing and a matching skill fires.
- [ ] `templates/cursor/loomwork-strategy-gate.sh` nudges toward `ce-strategy` on
      the missing-file path, through its own `additional_context` envelope, and
      stays silent when no workspace root resolves.
- [ ] Gate behavior with a strategy file present is unchanged.
- [ ] `README.md` describes neither a seeded strategy template nor a per-merge
      Milestones bullet, and describes both gate paths.
- [ ] No loomwork code, skill, or hook writes to `STRATEGY.md`.
- [ ] The full test suite passes.
