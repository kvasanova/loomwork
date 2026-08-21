---
name: close-out
description: Use during finishing-a-development-branch (after tests pass, before integration) when the work was tracked by a plan or spec in the SDD docs dirs. Commit and push close-out to the feature branch — same PR, no post-merge follow-up.
---

# SDD Close-Out Before Merge

**Announce:** "Using loomwork:close-out to freeze the plan and update the spec."

**Preflight:** verify the superpowers and compound-engineering plugins are
installed (their skills appear in your available-skills list). If either is
missing, stop and point the user at the install commands in `/loomwork:init`
Step 1.

**Paths:** this skill uses the defaults `docs/superpowers/plans`,
`docs/superpowers/specs`, and `STRATEGY.md`. If the repo has a
`.loomwork.json`, substitute its `plansDir`/`specsDir`/`strategyFile` values
throughout.

**When:** Feature branch has plan and/or spec artifacts; tests pass;
integration not yet done. Skip if neither artifact exists. Skip for
`finishing-a-development-branch` Options 3 & 4.

**Where:** Feature branch only. Close-out commits ride on the **same PR** as
the feature — push before merge. Merge style (squash, rebase, merge commit,
local merge) does not matter.

**Inputs needed:** PR number (or local-merge context), plan path(s), optional
spec path.

## Step 0: Resolve PR number (Option 2)

On the feature branch, before editing docs:

```bash
# Open PR for current branch (after first push)
gh pr view --json number -q .number 2>/dev/null
```

- **PR already exists:** use that number in the DONE banner and frontmatter.
- **No PR yet:** run `finishing-a-development-branch` Option 2 through first
  `git push` + `gh pr create`, then run close-out, then `git push` again so the
  PR includes the close-out commit before merge.

For **Option 1 (local merge)** with no PR, use merge commit hash + today's date
in the banner, or omit PR number if unknown.

## Step 1: Resolve artifacts

```bash
# From repo root — find plan/spec mentions in branch commits
git log --oneline <base>..HEAD -- docs/superpowers/
ls docs/superpowers/plans/ docs/superpowers/specs/
```

If unclear, check the GitHub issue/PR body for plan/spec filenames.

## Step 2: Close out plan(s)

For each shipped plan:

1. Insert banner as line 2 (after `#` title):

   `> **Status: DONE — shipped in PR #N (YYYY-MM-DD).** Historical record; not maintained.`

2. Tick all checkboxes:

   ```bash
   perl -pi -e 's/^- \[ \]/- [x]/g' docs/superpowers/plans/YYYY-MM-DD-feature.md
   ```

3. Do not edit step text or add tasks.

## Step 3: Close out spec (if paired)

1. Run acceptance verification greps (examples — derive the real ones from
   the spec's acceptance criteria):

   ```bash
   # a new module the spec promised
   test -d src/feature-name
   # a file the spec promised
   test -f src/routes/feature.ts
   # behavior: the promised test suite passes
   npm test -- --testPathPattern="feature-name"
   ```

   If a criterion is genuinely not met, set `status: partial` instead of
   `implemented`, leave that box unchecked, and add a `## Remaining` section
   listing the gaps.

2. Update frontmatter:

   ```yaml
   status: implemented
   implemented_in: "PR #N"
   verified: YYYY-MM-DD
   ```

3. Tick acceptance boxes in the body only (`## Acceptance` or
   `## Acceptance Criteria` — never YAML frontmatter):

   ```bash
   # Frontmatter must never contain checkboxes, so whole-file is safe
   perl -pi -e 's/^- \[ \]/- [x]/g' docs/superpowers/specs/YYYY-MM-DD-feature-design.md
   ```

   If the spec has no acceptance section yet, append `## Acceptance` at EOF
   with `- [x]` items derived from Goals/Verification, then set `verified:`.

## Step 3b: Did this ship change the strategy?

Skip when the branch had **no** paired spec, or when the work is plan-only
(config/doc rollout).

**`STRATEGY.md` belongs to `compound-engineering:ce-strategy`.** This step
writes nothing to it. It asks one question and, on a yes, hands off.

Ask: does the shipped capability

- introduce an externally visible milestone (a launch), or
- change what an investment area covers, or
- retire a direction the team keeps revisiting, or
- shift the target problem or approach?

**Yes** → run `compound-engineering:ce-strategy` targeted at that section, on
the feature branch, so the update rides the same PR. That skill decides what
the file says and whether `last_updated` moves.

**No** → touch nothing. Most ships land here. Ship history lives in spec
frontmatter (`implemented_in`, `verified`), plan DONE banners, and git — not in
the strategy file.

Never append to `## Milestones`, never create that section, never bump
`last_updated` yourself, and never edit `## Tracks` or `## Not working on` from
this step. `ce-strategy` keeps those sections optional and interview-gated; a
per-ship write turns the roadmap anchor into a changelog and masks staleness.

## Step 4: Verify

```bash
head -5 docs/superpowers/plans/<plan>.md    # DONE banner present
grep -c '\- \[ \]' docs/superpowers/plans/<plan>.md   # expect 0
grep '^status:' docs/superpowers/specs/<spec>.md      # implemented
```

## Step 5: Commit and push (feature branch)

```bash
git add docs/superpowers/plans/ docs/superpowers/specs/
# Step 3b ran ce-strategy? stage its edit too:
[ -f STRATEGY.md ] && git add STRATEGY.md
git commit -m "docs(sdd): close out plan/spec for PR #N (#issue)"
git push   # Option 2: updates open PR before merge; Option 1: push if remote branch exists
```

`STRATEGY.md` is staged only when it exists and a `ce-strategy` run in Step 3b
modified it. Close-out itself writes nothing to it. `git add` on a bare path
that matches no tracked file is a fatal error, not a no-op — that's why the
guard checks existence first instead of listing `STRATEGY.md` directly.

Include the issue number when known.

Then continue `finishing-a-development-branch` (merge locally or merge PR on
GitHub).
