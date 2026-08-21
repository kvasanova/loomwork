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
> does not append to it mechanically.

Every change below follows from this rule, and future changes to loomwork's
handling of the strategy file should be tested against it.

## Goals

- Close-out stops appending per-merge Milestones bullets, so `STRATEGY.md` stops
  growing with each shipped spec.
- loomwork stops shipping and seeding its own strategy template.
- A repo with no strategy file gets pointed at `ce-strategy` — at init time and
  again at scope time — rather than silently having none.
- loomwork's remaining strategy touches stay inside what `ce-strategy` sanctions.

## Non-goals

- Retroactively pruning Milestones sections in repos that already accumulated
  them. Existing content is left alone; trimming it is a `ce-strategy` update run
  the user chooses to make.
- An audit rule that lints `STRATEGY.md` structure. ce owns the file; loomwork
  linting its shape would recreate the overreach this spec removes.
- Changing `.loomwork.json`'s `strategyFile` key or the gate's skill matchers.
- Any change to spec or plan lifecycle handling.

## Design

### 1. Close-out Step 3b — narrow the strategy touch

`skills/close-out/SKILL.md` Step 3b is rewritten. The step still runs only when
the branch had a paired spec and the work is not plan-only.

Kept:

- **`last_updated` bump** when a large-capability spec ships. `ce-strategy` sets
  this field on every update run, so a loomwork edit that bumps it is consistent
  with the file's contract.
- **Tracks sentence** when a shipped capability changes what an investment area
  covers. Legal under ce's definition of a track as "the investment area, not a
  feature list" — the edit describes the area, not the ship.
- **`## Not working on`** on a retired direction, reworded to ce's framing:
  things the team keeps being tempted by.

Removed:

- The `## Milestones` append. Entirely.
- The instruction to create a `## Milestones` section when missing. ce's default
  is to skip the section, so loomwork must never conjure it.
- "Do not add a fifth track — fold into an existing track or replace the weakest
  track", restated as ce's actual bound of 2-4 tracks.

Added:

- When a ship is genuinely externally visible (a launch), close-out points the
  user at a `ce-strategy` update run rather than writing the milestone itself.
- A note on where ship history actually lives: spec frontmatter
  (`implemented_in`, `verified`), plan DONE banners, and git. Recording it in
  `STRATEGY.md` was never necessary — it duplicated `implemented_in`.

Step 4's verification block keeps `grep '^last_updated:' STRATEGY.md` and drops
any wording implying a Milestones bullet was written.

### 2. Playbook doctrine

`references/PLAYBOOK.md` currently describes the close-out end state for the
strategy file as "`last_updated` bump plus Milestones/Tracks/Not-working-on edits
(skill Step 3b)". It is restated as Tracks/Not-working-on only, and the governing
rule above is added so the ownership boundary is doctrine rather than an
implementation detail of one skill.

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

Idempotency is preserved: a repo whose strategy file exists gets no prompt and no
write, and re-running init on an initialized repo remains a no-op.

### 4. Strategy gate nudges on a missing file

`hooks/strategy-gate.sh` currently exits 0 when the strategy file does not exist,
so a repo with no strategy file gets no reminder at exactly the moment grounding
matters. The missing-file branch instead injects a short reminder — no strategy
file yet, run `ce-strategy` before scoping medium or large work — for the same
skill matchers the gate already fires on (`brainstorming`, `writing-plans`).

Behavior when the file exists is unchanged, including the existing instruction
telling agents not to open the strategy file directly.

`templates/cursor/loomwork-strategy-gate.sh` receives the same change. The two
scripts are copies, so they move together; init's existing content-diff migration
rewrites the installed Cursor copy on the next run.

## Files touched

| File | Change |
| --- | --- |
| `skills/close-out/SKILL.md` | Rewrite Step 3b; adjust Step 4 verification wording |
| `references/PLAYBOOK.md` | Restate close-out strategy end state; add governing rule |
| `scripts/init.mjs` | Stop copying the template; emit a missing-file action |
| `templates/STRATEGY.md` | Delete |
| `commands/init.md` | Frontmatter description; Step 2 wording; Step 3 invokes `ce-strategy` |
| `hooks/strategy-gate.sh` | Missing-file branch nudges instead of exiting silently |
| `templates/cursor/loomwork-strategy-gate.sh` | Same missing-file change |
| `README.md` | Remove descriptions of the seed and the Milestones append |

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
- A case asserting the Cursor gate script content stays in sync with the plugin
  gate's missing-file behavior.

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
- [ ] `skills/close-out/SKILL.md` Step 3b still bumps `last_updated` and still
      covers Tracks and `## Not working on` edits.
- [ ] `references/PLAYBOOK.md` states the governing rule and no longer lists
      Milestones as a close-out edit target.
- [ ] `templates/STRATEGY.md` does not exist.
- [ ] `initRepo` does not create a strategy file, and returns an action naming the
      missing file and `ce-strategy`.
- [ ] `initRepo` still leaves an existing strategy file byte-identical.
- [ ] `commands/init.md` instructs invoking `compound-engineering:ce-strategy`
      when the strategy file is missing, and its description no longer mentions a
      seed.
- [ ] `hooks/strategy-gate.sh` injects a `ce-strategy` reminder when the strategy
      file is missing and a matching skill fires.
- [ ] `templates/cursor/loomwork-strategy-gate.sh` behaves identically to
      `hooks/strategy-gate.sh` on the missing-file path.
- [ ] Gate behavior with a strategy file present is unchanged.
- [ ] `README.md` describes neither a seeded strategy template nor a per-merge
      Milestones bullet.
- [ ] The full test suite passes.
