# STRATEGY.md Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make loomwork defer `STRATEGY.md` ownership to `compound-engineering:ce-strategy` — loomwork reads it, points at it, and never writes to it or defines its shape.

**Architecture:** Four independent surfaces change. The two hook gates (`hooks/strategy-gate.sh`, `templates/cursor/loomwork-strategy-gate.sh`) gain a missing-file nudge branch instead of exiting silently. `scripts/init.mjs` stops copying a strategy template and instead reports the missing file as an action. `skills/close-out/SKILL.md` Step 3b becomes a decision + handoff with no writes. Docs (`references/PLAYBOOK.md`, `README.md`, `commands/init.md`) are restated to match. Every behavioral change is test-first against the existing `node:test` suite.

**Tech Stack:** Node.js ESM (`node:test`, `node:assert/strict`), bash + `jq` hook scripts, markdown skills/commands/docs. No package manager, no dependencies. Tests run with `node --test scripts/lib/__tests__/`.

**Spec:** `docs/superpowers/specs/2026-08-21-strategy-file-ownership-design.md`

## Global Constraints

- **Governing rule (from the spec):** `STRATEGY.md` belongs to `ce-strategy`. loomwork reads it, points at it, and reminds people to run `ce-strategy`. loomwork does not define its shape and does not write to it.
- **Nudge text** injected by both gates on the missing-file path, verbatim:
  ```
  loomwork strategy gate: no strategy file yet. Run
  compound-engineering:ce-strategy to author one before scoping medium or large
  work.
  ```
  (The gate scripts emit it as a single-line string; tests assert on substrings, not the wrapping.)
- **Skill matchers are unchanged:** both gates continue to fire only on `brainstorming` and `writing-plans`.
- **`.loomwork.json` keys unchanged:** `specsDir`, `plansDir`, `strategyFile`.
- **The two gate scripts are independent implementations, not copies.** Plugin gate: `PostToolUse`, root from `CLAUDE_PROJECT_DIR`, output `{ hookSpecificOutput: { hookEventName, additionalContext } }`. Cursor gate: also `beforeSubmitPrompt`, root from `workspace_roots[0]`, output `{ additional_context }`. Never assert content equality between them.
- **Gates never inspect the strategy file's shape** — existence only.
- **Behavior when the strategy file exists is unchanged** in both gates, including the "do NOT Read or open the strategy file" instruction.
- **Non-destructive:** nothing prunes existing `## Milestones` content, and `initRepo` must still leave an existing strategy file byte-identical.
- **Test command:** `node --test scripts/lib/__tests__/` from the repo root. Baseline before this plan: 44 tests, 44 pass.
- **Commit style:** conventional commits, scoped, with `(#6)` referencing the issue. No `Claude-Session:` trailer.

---

### Task 1: Plugin strategy gate nudges when the file is missing

**Files:**
- Modify: `hooks/strategy-gate.sh:12-13` (the `[[ -f "$strategy_file" ]] || exit 0` guard)
- Test: `scripts/lib/__tests__/hooks.test.mjs:58-63` (invert), plus new cases

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the missing-file nudge behavior in the plugin gate. Task 2 ports the equivalent behavior to the Cursor gate; Task 3 asserts parity across both.

The current script (full body, for reference):

```bash
#!/usr/bin/env bash
# loomwork strategy gate: inject the strategy file when brainstorming or
# writing-plans is invoked via the Skill tool. Skill-name discrimination
# happens here (grep on .tool_input.skill), not in the hooks.json matcher.
set -euo pipefail

input=$(cat)
skill=$(echo "$input" | jq -r '.tool_input.skill // empty')
echo "$skill" | grep -qE 'brainstorming|writing-plans' || exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="$root/$strategy_rel"
[[ -f "$strategy_file" ]] || exit 0

prefix=$'loomwork strategy gate: the strategy file grounds scope for medium/large work. Its full content is already injected below — do NOT Read or open the strategy file (or any loomwork hook script); use this inline copy only. Current content:\n\n'
jq -n --rawfile strat "$strategy_file" --arg prefix "$prefix" \
  '{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ($prefix + $strat) } }'
```

- [ ] **Step 1: Invert the silent-when-missing test and add the matcher/silence cases**

In `scripts/lib/__tests__/hooks.test.mjs`, replace this existing test:

```js
test('strategy-gate stays silent when strategy file missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
```

with these three:

```js
test('strategy-gate nudges toward ce-strategy when the strategy file is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('strategy-gate missing-file nudge fires for writing-plans too', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:writing-plans'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('strategy-gate stays silent on non-matching skill when strategy file missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:test-driven-development'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
```

Also add a case pinning the missing-file nudge to a custom `strategyFile`, so the nudge respects `.loomwork.json` the same way the present-file path does:

```js
test('strategy-gate missing-file nudge honors custom strategyFile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'decoy-should-not-be-injected\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.doesNotMatch(context, /decoy-should-not-be-injected/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: FAIL — the three nudge cases fail. `JSON.parse('')` throws `SyntaxError: Unexpected end of JSON input` because the gate exits 0 with empty stdout. The two silence cases pass.

- [ ] **Step 3: Replace the silent exit with a nudge branch**

In `hooks/strategy-gate.sh`, replace this line:

```bash
[[ -f "$strategy_file" ]] || exit 0
```

with:

```bash
if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg nudge "$nudge" \
    '{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $nudge } }'
  exit 0
fi
```

Also update the file's header comment to describe both paths:

```bash
# loomwork strategy gate: inject the strategy file when brainstorming or
# writing-plans is invoked via the Skill tool; when no strategy file exists,
# nudge toward ce-strategy instead (ce owns the file — loomwork never writes
# it). Skill-name discrimination happens here (grep on .tool_input.skill),
# not in the hooks.json matcher.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS — all cases, including the four retained present-file regression guards (content injection, do-not-open instruction, custom `strategyFile`, silence on non-matching skill).

- [ ] **Step 5: Run the full suite**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS. Test count rises from 44 to 47 (one test replaced by four).

- [ ] **Step 6: Commit**

```bash
git add hooks/strategy-gate.sh scripts/lib/__tests__/hooks.test.mjs
git commit -m "feat(hooks): strategy gate nudges toward ce-strategy when file missing (#6)"
```

---

### Task 2: Cursor strategy gate nudges when the file is missing

**Files:**
- Modify: `templates/cursor/loomwork-strategy-gate.sh:40-44` (the combined `-z "$root" || ! -f` guard)
- Test: `scripts/lib/__tests__/cursor-hooks.test.mjs`

**Interfaces:**
- Consumes: the nudge wording established in Task 1 (same sentence, different output envelope). No code dependency — the scripts are independent implementations.
- Produces: `additional_context`-enveloped nudge on the missing-file path; silence on the unresolved-root path. Task 3 asserts parity between this and Task 1.

The current guard, which collapses two distinct cases:

```bash
strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="${root}/${strategy_rel}"
if [[ -z "$root" || ! -f "$strategy_file" ]]; then
  exit 0
fi
```

An unresolved `$root` must stay silent: the gate cannot tell whether a file is missing when it does not know where to look. Only a resolved root plus a genuinely absent file earns the nudge.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/__tests__/cursor-hooks.test.mjs`, add these cases (the file's existing `runHook` and `strategyRepo` helpers stay as they are; these cases build their own roots because they need a repo *without* a strategy file):

```js
function emptyRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-cursor-empty-'));
}

test('cursor strategy gate nudges toward ce-strategy when the strategy file is missing', () => {
  const root = emptyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    workspace_roots: [root],
  });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).additional_context;
  assert.match(context, /no strategy file yet/);
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('cursor strategy gate missing-file nudge fires for writing-plans too', () => {
  const root = emptyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt: '/writing-plans docs/specs/foo.md',
    workspace_roots: [root],
  });
  const context = JSON.parse(result.stdout).additional_context;
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('cursor strategy gate stays silent on non-matching skill when strategy file missing', () => {
  const root = emptyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:test-driven-development' },
    workspace_roots: [root],
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('cursor strategy gate stays silent when no workspace root resolves', () => {
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    workspace_roots: [],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/cursor-hooks.test.mjs`
Expected: FAIL — the two nudge cases throw `SyntaxError: Unexpected end of JSON input` (empty stdout). The two silence cases pass already.

- [ ] **Step 3: Split the guard and add the nudge**

In `templates/cursor/loomwork-strategy-gate.sh`, replace:

```bash
strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="${root}/${strategy_rel}"
if [[ -z "$root" || ! -f "$strategy_file" ]]; then
  exit 0
fi
```

with:

```bash
# No workspace root: the gate cannot tell whether a strategy file is missing
# when it does not know where to look. Stay silent — never nudge.
if [[ -z "$root" ]]; then
  exit 0
fi

strategy_rel=$(jq -r '.strategyFile // "STRATEGY.md"' "$root/.loomwork.json" 2>/dev/null || echo 'STRATEGY.md')
strategy_file="${root}/${strategy_rel}"

if [[ ! -f "$strategy_file" ]]; then
  nudge='loomwork strategy gate: no strategy file yet. Run compound-engineering:ce-strategy to author one before scoping medium or large work.'
  jq -n --arg nudge "$nudge" '{ additional_context: $nudge }'
  exit 0
fi
```

Also update the header comment:

```bash
# loomwork (Cursor) strategy gate: inject the strategy file when brainstorming
# or writing-plans starts; when no strategy file exists, nudge toward
# ce-strategy instead (ce owns the file — loomwork never writes it). Claude
# Code equivalent: the loomwork plugin's hooks/strategy-gate.sh (PostToolUse +
# Skill matcher).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/cursor-hooks.test.mjs`
Expected: PASS — including the existing present-file cases (`beforeSubmitPrompt` slash command, `postToolUse` Skill, silence on unrelated prompt, do-not-open instruction) and the close-out gate case.

- [ ] **Step 5: Run the full suite**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS. Count rises from 47 to 51.

- [ ] **Step 6: Commit**

```bash
git add templates/cursor/loomwork-strategy-gate.sh scripts/lib/__tests__/cursor-hooks.test.mjs
git commit -m "feat(hooks): Cursor strategy gate nudges toward ce-strategy when file missing (#6)"
```

---

### Task 3: Behavioral parity guard across both gates

**Files:**
- Test: `scripts/lib/__tests__/cursor-hooks.test.mjs` (add at the end)

**Interfaces:**
- Consumes: the plugin gate's `hookSpecificOutput.additionalContext` nudge (Task 1) and the Cursor gate's `additional_context` nudge (Task 2).
- Produces: nothing consumed by later tasks — this is a standing regression guard.

This test asserts **behavior**, not script text. The two scripts are independent implementations with different event models, root resolution, and output envelopes, so a content-equality assertion between them would be false by construction. What must stay in lockstep is: both name `ce-strategy` on the missing-file path, each through its own envelope.

- [ ] **Step 1: Write the parity test**

Append to `scripts/lib/__tests__/cursor-hooks.test.mjs`:

```js
const PLUGIN_HOOKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../hooks');

test('both strategy gates name ce-strategy on the missing-file path, each in its own envelope', () => {
  const cursorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-parity-cursor-'));
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-parity-plugin-'));

  const cursorResult = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    workspace_roots: [cursorRoot],
  });
  const pluginResult = spawnSync('bash', [path.join(PLUGIN_HOOKS_DIR, 'strategy-gate.sh')], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'superpowers:brainstorming' },
    }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: pluginRoot },
  });

  const cursorContext = JSON.parse(cursorResult.stdout).additional_context;
  const pluginContext = JSON.parse(pluginResult.stdout).hookSpecificOutput.additionalContext;

  for (const context of [cursorContext, pluginContext]) {
    assert.match(context, /compound-engineering:ce-strategy/);
    assert.match(context, /no strategy file yet/);
  }
});
```

`fileURLToPath` and `spawnSync` are already imported at the top of this test file; `PLUGIN_HOOKS_DIR` is new.

- [ ] **Step 2: Run the test to verify it passes**

Run: `node --test scripts/lib/__tests__/cursor-hooks.test.mjs`
Expected: PASS. This test is written after both implementations exist, so it passes immediately — it is a guard against future drift, not a driver of new behavior. To confirm it has teeth, temporarily change one gate's nudge to omit `ce-strategy`, re-run and see it FAIL, then revert.

- [ ] **Step 3: Run the full suite**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS. Count rises from 51 to 52.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/__tests__/cursor-hooks.test.mjs
git commit -m "test(hooks): assert both strategy gates name ce-strategy when file missing (#6)"
```

---

### Task 4: init stops seeding the strategy template

**Files:**
- Modify: `scripts/init.mjs:27-31` (the strategy-file block)
- Delete: `templates/STRATEGY.md`
- Modify: `commands/init.md` (frontmatter `description`, Step 2 wording, Step 3 instruction)
- Test: `scripts/lib/__tests__/init.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `initRepo(repoRoot, pluginRoot)` returns an action string containing both the strategy file path and the literal `ce-strategy` when the strategy file is absent, and creates no strategy file. Signature and return type (`string[]`) are unchanged.

The current block:

```js
  const strategyAbs = path.join(repoRoot, config.strategyFile);
  if (!fs.existsSync(strategyAbs)) {
    fs.copyFileSync(path.join(pluginRoot, 'templates/STRATEGY.md'), strategyAbs);
    actions.push(`seeded ${config.strategyFile} (fill it in — ce-strategy can help)`);
  }
```

Note the intended reporting consequence: `scripts/init.mjs` prints `already initialized — no changes` only when the action list is empty, so an initialized repo with no strategy file reports the missing-file action on every run instead of that line. That is correct — the condition genuinely persists until someone runs `ce-strategy`. "No-op" here means "no writes", not "no actions reported". The existing idempotency test must be updated to match.

- [ ] **Step 1: Invert the seeding assertions**

In `scripts/lib/__tests__/init.test.mjs`:

(a) In `initRepo scaffolds a fresh repo and is idempotent`, replace

```js
  assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
```

with

```js
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.ok(first.some((a) => a.includes('STRATEGY.md') && a.includes('ce-strategy')));
```

and replace the idempotency tail

```js
  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, []);
```

with

```js
  // Second run performs no writes. The missing-strategy-file action persists
  // by design — the condition is still true until someone runs ce-strategy.
  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, [`STRATEGY.md is missing — run compound-engineering:ce-strategy to author it`]);
```

(b) In `initRepo respects custom paths from .loomwork.json`, replace

```js
  assert.ok(fs.existsSync(path.join(root, 'VISION.md')));
```

with

```js
  assert.ok(!fs.existsSync(path.join(root, 'VISION.md')));
```

and add, at the end of that same test:

```js
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.some((a) => a.includes('VISION.md') && a.includes('ce-strategy')));
```

(c) Add two new tests:

```js
test('initRepo reports the missing strategy file naming ce-strategy', () => {
  const root = freshRepo();
  const actions = initRepo(root, PLUGIN_ROOT);
  const action = actions.find((a) => a.includes('STRATEGY.md'));
  assert.ok(action, `no strategy action in ${JSON.stringify(actions)}`);
  assert.match(action, /missing/);
  assert.match(action, /compound-engineering:ce-strategy/);
});

test('initRepo reports no strategy action when the strategy file exists', () => {
  const root = freshRepo();
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'MY EXISTING STRATEGY\n');
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(!actions.some((a) => a.includes('ce-strategy')));
});
```

(d) Leave `initRepo never overwrites an existing strategy file` exactly as it is — it is a retained regression guard and must still pass unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: FAIL — the fresh-repo test fails on `assert.ok(!fs.existsSync(...STRATEGY.md))` (the template is still copied), and the two new tests fail because the action string still reads `seeded STRATEGY.md (fill it in — ce-strategy can help)`, which contains neither `missing` nor `compound-engineering:ce-strategy`.

- [ ] **Step 3: Stop copying; report the missing file**

In `scripts/init.mjs`, replace the strategy block with:

```js
  // STRATEGY.md belongs to ce-strategy. loomwork never authors or seeds it —
  // it only reports that it is missing and names the skill that owns it.
  const strategyAbs = path.join(repoRoot, config.strategyFile);
  if (!fs.existsSync(strategyAbs)) {
    actions.push(
      `${config.strategyFile} is missing — run compound-engineering:ce-strategy to author it`,
    );
  }
```

- [ ] **Step 4: Delete the template**

```bash
git rm templates/STRATEGY.md
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: PASS — all cases, including `initRepo never overwrites an existing strategy file` and the Cursor hooks.json merge/migration tests.

- [ ] **Step 6: Update `commands/init.md`**

Change the frontmatter description from:

```
description: Scaffold the SDD layout (docs dirs, STRATEGY.md seed, Cursor hooks, CLAUDE.md block) in the current repo
```

to:

```
description: Scaffold the SDD layout (docs dirs, Cursor hooks, CLAUDE.md block) in the current repo
```

In Step 2, change:

```
It creates (only what is missing): the specs/plans/solutions directories,
a STRATEGY.md seed, `.cursor/hooks.json` + `.cursor/hooks/loomwork-*.sh`
(merging with existing Cursor hooks), and a marker-guarded loomwork block in
CLAUDE.md (or AGENTS.md).
```

to:

```
It creates (only what is missing): the specs/plans/solutions directories,
`.cursor/hooks.json` + `.cursor/hooks/loomwork-*.sh` (merging with existing
Cursor hooks), and a marker-guarded loomwork block in CLAUDE.md (or
AGENTS.md). It never creates the strategy file — that file belongs to
`ce-strategy`; the scaffolder only reports when it is missing.
```

Replace Step 3 entirely with:

```markdown
## Step 3 — author the strategy file if missing

If the script's action list reports the strategy file is missing, invoke
`compound-engineering:ce-strategy` to author it before reporting completion.
loomwork does not define the file's shape — `ce-strategy` owns it.

If the strategy file already exists, skip this step. Never edit it here.

## Step 4 — report

Relay the script's action list and suggest committing the new files. Point the
user at the loomwork README for the doctrine.
```

Step 1's dependency preflight already stops without writing when
`compound-engineering:ce-strategy` is unavailable, so the new Step 3 cannot be
reached with the skill missing — no extra guard is needed.

- [ ] **Step 7: Confirm no reference to the deleted template survives**

Run: `grep -rn 'templates/STRATEGY.md' --exclude-dir=.git --exclude-dir=docs .`
Expected: no output (the spec under `docs/` legitimately names the file as deleted; the exclusion keeps that out of the check).

- [ ] **Step 8: Run the full suite**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS. Count rises from 52 to 54.

- [ ] **Step 9: Commit**

```bash
git add scripts/init.mjs commands/init.md scripts/lib/__tests__/init.test.mjs
git rm --cached templates/STRATEGY.md 2>/dev/null || true
git commit -m "feat(init): defer strategy authoring to ce-strategy, drop the seed template (#6)"
```

(If Step 4's `git rm` already staged the deletion, the `git rm --cached` line is a no-op — the `|| true` keeps it from failing the sequence.)

---

### Task 5: Close-out Step 3b becomes a decision, not a write

**Files:**
- Modify: `skills/close-out/SKILL.md` — the `**Announce:**` line, Step 3b (whole section), Step 4's verification block

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a close-out procedure containing no write to `STRATEGY.md`. Task 6 restates the same end state in `references/PLAYBOOK.md`.

This task changes a markdown skill, so there is no unit test to write first. Verification is grep-based, run before and after, and the exact expected outputs are given below.

- [ ] **Step 1: Capture the pre-change grep evidence**

Run: `grep -n 'Milestones\|last_updated\|Not working on\|fifth track' skills/close-out/SKILL.md`
Expected (pre-change, non-empty):

```
skills/close-out/SKILL.md:  Bump frontmatter / last_updated / Milestones / Not working on / fifth track hits
```

Record the hit count — it must go to zero by Step 5.

- [ ] **Step 2: Replace Step 3b**

Replace this entire section:

```markdown
## Step 3b: Update the strategy file (large capabilities)

Skip when the branch had **no** paired spec, or when the work is plan-only
(config/doc rollout).

1. Bump frontmatter:
   ```bash
   perl -pi -e 's/^last_updated: .*/last_updated: YYYY-MM-DD/' STRATEGY.md
   ```
   Replace `YYYY-MM-DD` with today.

2. **Shipped** (`status: implemented` after Step 3): append under `## Milestones`
   (create section after `## Tracks` if missing):
   ```markdown
   - **YYYY-MM-DD** — {{capability}} shipped (PR #N).
   ```
   One bullet per merge. If the capability fits an existing track, no track edit
   required. If it opens a new investment area, add one sentence to the nearest
   track subsection. Do not add a fifth track — fold into an existing track or
   replace the weakest track.

3. **Approved / in-progress** (spec status changes without ship): add one sentence
   to the relevant `## Tracks` subsection describing what is in flight. No
   Milestones entry.

4. **Retired direction**: add/update `## Not working on` if applicable.

5. Do not paste acceptance checklists or issue lists into the strategy file.
```

with:

```markdown
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
```

- [ ] **Step 3: Update the announce line**

Change:

```markdown
**Announce:** "Using loomwork:close-out to freeze the plan, update the spec, and touch the strategy file."
```

to:

```markdown
**Announce:** "Using loomwork:close-out to freeze the plan and update the spec."
```

- [ ] **Step 4: Drop the `last_updated` grep from Step 4**

In `## Step 4: Verify`, remove this line:

```bash
grep '^last_updated:' STRATEGY.md    # today's date when Step 3b ran
```

so the block reads:

```bash
head -5 docs/superpowers/plans/<plan>.md    # DONE banner present
grep -c '\- \[ \]' docs/superpowers/plans/<plan>.md   # expect 0
grep '^status:' docs/superpowers/specs/<spec>.md      # implemented
```

Leave Step 5's `git add docs/superpowers/plans/ docs/superpowers/specs/ STRATEGY.md`
unchanged — `STRATEGY.md` stays in the path list only because a `ce-strategy`
run in Step 3b may have modified it. Add this clarifying line right under the
Step 5 code block:

```markdown
`STRATEGY.md` is in the `git add` list only to pick up a `ce-strategy` run from
Step 3b. Close-out itself writes nothing to it; when Step 3b answered "no", the
path simply matches nothing to stage.
```

- [ ] **Step 5: Verify no write instructions survive**

Run: `grep -n 'Milestones\|last_updated\|Not working on\|fifth track' skills/close-out/SKILL.md`
Expected: only the prohibition lines from the new Step 3b (`Never append to ## Milestones`, `never bump last_updated`, `never edit ## Tracks or ## Not working on`). No `perl -pi` line, no append template, no `create section` instruction.

Run: `grep -n 'perl -pi.*STRATEGY' skills/close-out/SKILL.md`
Expected: no output.

- [ ] **Step 6: Run the full suite (regression check)**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS, count unchanged at 54. No test reads this skill; this confirms nothing broke.

- [ ] **Step 7: Commit**

```bash
git add skills/close-out/SKILL.md
git commit -m "feat(close-out): Step 3b decides and hands off to ce-strategy, writes nothing (#6)"
```

---

### Task 6: Doctrine — PLAYBOOK and README

**Files:**
- Modify: `references/PLAYBOOK.md:49-56` (flow-by-feature-size strategy paragraph), `references/PLAYBOOK.md:167`, `references/PLAYBOOK.md:176-181` (close-out end state), plus a new governing-rule block
- Modify: `README.md:44` (init description), `README.md:62-63` (what-ships table rows)

**Interfaces:**
- Consumes: the Step 3b end state from Task 5 and the gate behavior from Tasks 1–2 — the docs must describe exactly what those now do.
- Produces: nothing consumed by later tasks. This is the last task.

- [ ] **Step 1: Add the governing rule to PLAYBOOK.md**

In `references/PLAYBOOK.md`, immediately after the "The three layers" table (the row block ending with the `docs/solutions/` line), insert:

```markdown
> **`STRATEGY.md` belongs to `ce-strategy`.** loomwork reads it, points at it,
> and reminds people to run `ce-strategy`. loomwork does not define its shape
> and does not write to it. Test any future change to loomwork's handling of
> the strategy file against this rule.
```

- [ ] **Step 2: Restate the flow-by-feature-size paragraph**

Replace:

```markdown
Update `STRATEGY.md` in the same close-out PR when the trigger in
[Close-out before merge](#close-out-before-merge) applies (large-capability
ship or tracked-initiative status change).
```

with:

```markdown
Close-out never edits `STRATEGY.md`. When a ship genuinely changes the
strategy, run `ce-strategy` on the feature branch so the update rides the same
PR — see [Close-out before merge](#close-out-before-merge).
```

In the same section, extend the hook sentence so both gate paths are described. Replace:

```markdown
Enforced by hooks (see [Hook enforcement](#hook-enforcement)); invoking
`brainstorming` or `writing-plans` auto-injects `STRATEGY.md` content into
context, so the read does not depend on the agent remembering.
```

with:

```markdown
Enforced by hooks (see [Hook enforcement](#hook-enforcement)); invoking
`brainstorming` or `writing-plans` auto-injects `STRATEGY.md` content into
context, so the read does not depend on the agent remembering. When the repo
has no strategy file, the same gates inject a one-sentence nudge to run
`ce-strategy` instead.
```

- [ ] **Step 3: Restate the close-out end state**

Replace the `**STRATEGY.md**` bullet:

```markdown
- **STRATEGY.md** — only when a large-capability spec ships or a tracked
  initiative's status changes (plan-only rollouts and bug fixes skip):
  `last_updated` bump plus Milestones/Tracks/Not-working-on edits (skill
  Step 3b). Keep spec checklists and issue lists out of `STRATEGY.md` — specs
  stay the detailed "is it built" signal; `STRATEGY.md` stays the roadmap
  anchor.
```

with:

```markdown
- **STRATEGY.md** — unchanged by close-out. Step 3b asks whether the ship
  changed the strategy (new externally visible milestone, changed investment
  area, retired direction, shifted target problem or approach). A yes routes to
  a `ce-strategy` update run on the same branch, so it rides the same PR; a no
  touches nothing. Ship history lives in spec frontmatter, plan DONE banners,
  and git — specs stay the detailed "is it built" signal; `STRATEGY.md` stays
  the roadmap anchor that `ce-strategy` owns.
```

And in the "**How:**" sentence above it, replace:

```markdown
STRATEGY.md edits, commit + push).
```

with:

```markdown
the `ce-strategy` handoff decision, commit + push).
```

- [ ] **Step 4: Describe both gate paths in the hook table**

The Hook enforcement table row for `**STRATEGY.md**` stays exactly as it is — it
maps trigger to config file, which did not change. Add this paragraph directly
under the table, before the "**Claude Code:**" line:

```markdown
**Strategy gate, both harnesses:** with a strategy file present, inject its full
content and tell the agent not to open the file. With no strategy file, inject a
one-sentence nudge to run `ce-strategy`. The gate checks existence only — it
never inspects the file's shape.
```

- [ ] **Step 5: Update README.md**

Replace:

```markdown
Scaffolds the docs layout, a STRATEGY.md seed, Cursor hook mirrors, and a
CLAUDE.md block. Idempotent. Non-default paths: create `.loomwork.json`
(keys `specsDir`, `plansDir`, `strategyFile`) before running init.
```

with:

```markdown
Scaffolds the docs layout, Cursor hook mirrors, and a CLAUDE.md block, then
points you at `ce-strategy` if the repo has no strategy file yet — that file
belongs to `ce-strategy`, so loomwork never seeds it. Idempotent. Non-default
paths: create `.loomwork.json` (keys `specsDir`, `plansDir`, `strategyFile`)
before running init.
```

Replace the close-out row of the "What ships" table:

```markdown
| `loomwork:close-out` skill | Pre-merge procedure: freeze the plan, verify + update the spec, touch the strategy file — on the feature branch, same PR. |
```

with:

```markdown
| `loomwork:close-out` skill | Pre-merge procedure: freeze the plan, verify + update the spec, and decide whether the ship changed the strategy (a yes routes to `ce-strategy`; close-out itself never writes `STRATEGY.md`) — on the feature branch, same PR. |
```

Replace the hook-gates row:

```markdown
| Hook gates (Claude Code) | Inject STRATEGY.md when `brainstorming`/`writing-plans` starts; inject the close-out reminder when `finishing-a-development-branch` starts. |
```

with:

```markdown
| Hook gates (Claude Code) | Inject STRATEGY.md when `brainstorming`/`writing-plans` starts — or, when the repo has no strategy file, a one-sentence nudge to run `ce-strategy`; inject the close-out reminder when `finishing-a-development-branch` starts. |
```

- [ ] **Step 6: Verify the doctrine no longer describes the removed behavior**

Run: `grep -rn 'Milestones\|STRATEGY.md seed\|seeded' README.md references/PLAYBOOK.md`
Expected: no output.

Run: `grep -n 'belongs to' references/PLAYBOOK.md`
Expected: the governing-rule line from Step 1.

- [ ] **Step 7: Run the full suite and the acceptance sweep**

Run: `node --test scripts/lib/__tests__/`
Expected: PASS, 54 tests.

Run the "no loomwork code, skill, or hook writes to STRATEGY.md" sweep:

```bash
grep -rn 'STRATEGY\.md\|strategyFile\|strategy_file' \
  --include='*.mjs' --include='*.sh' --include='*.md' \
  scripts hooks skills commands templates
```

Expected: every hit is a **read**, a **path resolution**, a **git add path**, or a **prohibition**. No `writeFileSync`/`copyFileSync` targeting the strategy path, no `perl -pi` against it, no append instruction.

- [ ] **Step 8: Commit**

```bash
git add references/PLAYBOOK.md README.md
git commit -m "docs: STRATEGY.md ownership defers to ce-strategy in doctrine (#6)"
```

---

## Acceptance sweep (run after Task 6)

Each line maps to a spec acceptance box. Run from the repo root.

```bash
# no Milestones append / creation, no writes in Step 3b
grep -n 'Milestones' skills/close-out/SKILL.md          # only the "Never append" prohibition
grep -n 'perl -pi.*STRATEGY' skills/close-out/SKILL.md  # empty
grep -n 'ce-strategy' skills/close-out/SKILL.md         # handoff present

# governing rule + end state in the playbook
grep -n 'belongs to `ce-strategy`' references/PLAYBOOK.md
grep -n 'unchanged by close-out' references/PLAYBOOK.md

# template gone
test ! -f templates/STRATEGY.md && echo ok

# init command
grep -n 'compound-engineering:ce-strategy' commands/init.md
grep -n 'seed' commands/init.md                          # empty

# gates
grep -n 'no strategy file yet' hooks/strategy-gate.sh templates/cursor/loomwork-strategy-gate.sh

# README
grep -n 'Milestones\|seed' README.md                     # empty

# suite
node --test scripts/lib/__tests__/
```
