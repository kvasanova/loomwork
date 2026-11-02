# Remove compound-engineering and strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make loomwork depend on superpowers alone, remove the strategy concept, and have `/loomwork:init` upgrade repos set up by older versions.

**Architecture:** The strategy gate and all compound-engineering references leave the plugin. `scripts/init.mjs` gains deterministic upgrade steps and a `--remove-strategy` mode; the `init` skill does the judgment work of moving `STRATEGY.md` content, with owner confirmation, between the two script runs.

**Tech Stack:** Node.js ES modules with the built-in `node:test` runner, Bash and `jq` hooks, Markdown skills. No dependencies and no build step.

**Spec:** `docs/superpowers/specs/2026-11-02-remove-compound-engineering-design.md`

## Global Constraints

- No new dependencies and no build step. `rules.mjs` stays pure.
- Gate contract unchanged: single JSON object on stdout, or silent exit 0.
- Init never commits, stages, or pushes.
- Init never touches `docs/solutions/` and never writes `.loomwork.json`.
- `STRATEGY.md` is hardcoded in `init.mjs`. Custom strategy paths are not supported.
- A default run never deletes `STRATEGY.md`.
- `CHANGELOG.md` entries and existing specs and plans stay as written.
- Style: `.mjs`, `node:` imports, two-space indent, single quotes, semicolons. Commit messages carry no attribution lines. Messages with an apostrophe go through `git commit -F <file>`.
- Tests that need git state use a real repo. The `freshRepo()` helper's empty `.git` directory makes git commands fail.

## Review Focus

- `AGENTS.md` with CRLF line endings: the doctrine section and markers go, and other lines keep their CRLF. Test in Task 2.
- A file with more than one begin or end marker: unchanged and reported, because the block is ambiguous. Test in Task 2.
- A repo's own `##` section after the doctrine and before the end marker: kept. Test in Task 2.
- `.cursor/hooks.json` that is valid JSON but not an object, or whose `hooks` is not an object: treated as malformed, not a crash. Test in Task 3.
- A repo path containing spaces, or a repo with no usable git: `STRATEGY.md` is left in place with a reason, leftovers are skipped, and nothing crashes. Test in Task 4.

---

### Task 1: Remove the strategy gate

**Files:**
- Delete: `hooks/strategy-gate.sh`
- Modify: `hooks/hooks.json`, `hooks/codex-hooks.json`, `hooks/close-out-gate.sh:29`, `hooks/lib/resolve-repo-root.sh:2`
- Test: `scripts/lib/__tests__/hooks.test.mjs`, `scripts/lib/__tests__/plugin.test.mjs`

**Interfaces:**
- Produces: remaining gates are `close-out-gate.sh` and `doctrine-gate.sh`.

- [ ] **Step 1: Update and add the tests**

In `plugin.test.mjs`, rename the Codex test to `Codex hooks run the close-out gate before explicit skill prompts` and expect only `'bash "${PLUGIN_ROOT}/hooks/close-out-gate.sh"'`. Add:

```js
test('Claude hooks register only the close-out gate on Skill', () => {
  const groups = readJson('hooks/hooks.json').hooks.PostToolUse;
  assert.deepEqual(
    groups[0].hooks.map((hook) => hook.command),
    ['${CLAUDE_PLUGIN_ROOT}/hooks/close-out-gate.sh'],
  );
});

test('no hook registration mentions strategy', () => {
  for (const file of ['hooks/hooks.json', 'hooks/codex-hooks.json']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /strategy/i);
  }
});
```

Use whatever root constant and imports `plugin.test.mjs` already has for reading files.

In `hooks.test.mjs`, delete every test whose name starts with `strategy-gate`, and reword the comment near line 311 so it names no strategy. Keep `LONG_TAIL` and the close-out guard. Add these two tests, which replace the only behaviors the deleted tests covered alone:

```js
test('close-out-gate requires the literal $ before superpowers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('superpowers:finishing-a-development-branch please', root),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate walks up from a nested .cwd to a plain .git directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-walk-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const nested = path.join(root, 'a/b/c');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(nested));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});
```

- [ ] **Step 2: Run the tests to verify the new plugin tests fail**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/hooks.test.mjs`
Expected: FAIL on the registration tests; the two new hook tests pass, since they guard existing behavior.

- [ ] **Step 3: Remove the gate**

Delete `hooks/strategy-gate.sh` and both registrations. Set the `codex-hooks.json` description to `Loomwork doctrine at Codex session start and the close-out gate for explicit skill invocations.` Remove the strategy mention from the comments in `hooks/close-out-gate.sh` and `hooks/lib/resolve-repo-root.sh`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks scripts/lib/__tests__/hooks.test.mjs scripts/lib/__tests__/plugin.test.mjs
git commit -m "feat(hooks): remove the strategy gate"
```

### Task 2: Stop scaffolding strategy and solutions, and remove doctrine safely

**Files:**
- Modify: `scripts/init.mjs`, `scripts/lib/config.mjs:7`
- Test: `scripts/lib/__tests__/init.test.mjs`, `scripts/lib/__tests__/config.test.mjs:23`

**Interfaces:**
- Produces: `removeLegacyDoctrine(content: string): { content: string, status: 'none' | 'removed' | 'unsafe' }`, exported from `scripts/init.mjs`. `initRepo(repoRoot)` still returns `string[]`.

- [ ] **Step 1: Rewrite the tests**

In `config.test.mjs`, remove the `strategyFile` assertion. In `init.test.mjs`:

- Delete the three strategy tests (`never overwrites`, `reports the missing`, `reports no strategy action`) and the `strategyFile` and `VISION.md` lines in the custom-paths test. Task 4 replaces them.
- In the fresh-repo test, assert `!fs.existsSync(path.join(root, 'docs/solutions'))`, no action mentioning `STRATEGY.md`, and `assert.deepEqual(second, [])`.
- Change the legacy-block fixtures to carry the heading, using a `DOCTRINE` constant set to `'## Spec-Driven Development (loomwork)\n\nold doctrine text\n'`.
- Keep the inline-mention and no-block tests as they are.

Add:

```js
const BEGIN = '<!-- loomwork:begin -->';
const END = '<!-- loomwork:end -->';

test('removes only the doctrine and markers when the block encloses repo content', () => {
  const input = `# A\n\n${BEGIN}\n## Deployment\n\nd\n\n## Auth\n\na\n\n${DOCTRINE}${END}\n`;
  assert.deepEqual(removeLegacyDoctrine(input), {
    content: '# A\n\n## Deployment\n\nd\n\n## Auth\n\na\n',
    status: 'removed',
  });
});

test('keeps a repo section that follows the doctrine inside the block', () => {
  const input = `# A\n\n${BEGIN}\n${DOCTRINE}\n## Mine\n\nm\n${END}\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\n\n## Mine\n\nm\n');
});

test('collapses blank lines where a mid-file block is removed', () => {
  const input = `# A\n\n${BEGIN}\n${DOCTRINE}${END}\n\n## Later\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\n\n## Later\n');
});

test('preserves CRLF on the lines it keeps', () => {
  const input = `# A\r\n\r\n${BEGIN}\r\n## Mine\r\n\r\n## Spec-Driven Development (loomwork)\r\nx\r\n${END}\r\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\r\n\r\n## Mine\r\n');
});

for (const [name, input] of [
  ['no doctrine heading', `# A\n${BEGIN}\nmine\n${END}\n`],
  ['no end marker', `# A\n${BEGIN}\n${DOCTRINE}`],
  ['no begin marker', `# A\n${DOCTRINE}${END}\n`],
  ['end before begin', `# A\n${END}\n${DOCTRINE}${BEGIN}\n`],
  ['two blocks', `${BEGIN}\n${DOCTRINE}${END}\n${BEGIN}\n${DOCTRINE}${END}\n`],
]) {
  test(`reports ${name} as unsafe and changes nothing`, () => {
    assert.deepEqual(removeLegacyDoctrine(input), { content: input, status: 'unsafe' });
  });
}

test('initRepo reports an unsafe block and leaves the file alone', () => {
  const root = freshRepo();
  const input = `# A\n${BEGIN}\nmine\n${END}\n`;
  fs.writeFileSync(path.join(root, 'AGENTS.md'), input);
  const actions = initRepo(root);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), input);
  assert.ok(actions.includes('AGENTS.md has a loomwork block init could not safely remove'));
});

test('initRepo leaves docs/solutions content byte-identical', () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, 'docs/solutions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/solutions/a.md'), 'keep\n');
  initRepo(root);
  assert.equal(fs.readFileSync(path.join(root, 'docs/solutions/a.md'), 'utf8'), 'keep\n');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/config.test.mjs`
Expected: FAIL, with `removeLegacyDoctrine` not exported.

- [ ] **Step 3: Implement**

Remove `strategyFile` from `DEFAULT_CONFIG`. In `init.mjs`, remove the `docs/solutions` scaffolding and the missing-strategy report.

Implement `removeLegacyDoctrine` line by line, keeping each line's own ending:

- Markers count only when a whole line, minus its ending, equals the marker text. No marker lines at all means `status: 'none'`.
- Require exactly one begin, exactly one end after it, and the heading line between them. Otherwise return the input with `status: 'unsafe'`.
- Drop the marker lines and the heading through the line before the next `/^#{1,2} /` line or the end marker.
- At each place lines were dropped, reduce the surrounding blank lines to one, or to none at the end of the file.

Report `removed legacy loomwork block from ${filename}` and `${filename} has a loomwork block init could not safely remove`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/config.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/init.mjs scripts/lib/config.mjs scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/config.test.mjs
git commit -m "feat(init): stop scaffolding strategy and remove doctrine without touching repo content"
```

### Task 3: Remove the old Cursor setup

**Files:**
- Modify: `scripts/init.mjs`
- Test: `scripts/lib/__tests__/init.test.mjs`

**Interfaces:**
- Produces: `removeCursorSetup(repoRoot: string): string[]`, returning actions, called from `initRepo`.

- [ ] **Step 1: Write the failing tests**

Use a `writeCursor(root, hooksJson)` test helper that writes the two scripts and `.cursor/hooks.json`. Each fixture's expectations:

| Test | Fixture | Expected |
|---|---|---|
| `removes the whole setup when only loomwork entries exist` | Bare and `bash `-prefixed commands, `version: 1` | `hooks.json`, both scripts, `.cursor/hooks/`, and an empty `.cursor/` are gone |
| `keeps other hook entries` | Adds `{ command: 'other.sh' }` to `postToolUse` | `other.sh` stays, loomwork entries and empty event arrays go, `hooks.json` stays |
| `keeps hooks.json with other top-level keys` | Adds `extra: true`, only loomwork entries | `hooks.json` stays with `hooks: {}` and `extra: true` |
| `keeps other .cursor files` | Adds `.cursor/settings.json` and `.cursor/hooks/mine.sh` | Both stay, `.cursor/hooks/` stays |
| `removes scripts when hooks.json is absent` | Scripts only | Scripts are gone |
| `changes nothing when hooks.json is malformed` | `{ not json`, `[]`, and `{"hooks": []}` as three cases | All files byte-identical, and an action `.cursor/hooks.json is malformed — loomwork Cursor setup left in place` |
| `reports nothing on a second run` | Any removable setup | The second `initRepo` returns no `.cursor` action |

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement `removeCursorSetup`**

An entry is loomwork's when its `command` contains `.cursor/hooks/loomwork-`. Delete only `loomwork-strategy-gate.sh` and `loomwork-close-out-gate.sh`. Delete `hooks.json` only when a loomwork entry was removed, no hook entries remain, and its only keys are `version` and `hooks`. Remove `.cursor/hooks/`, then `.cursor/`, only when empty. Report one action per file removed or rewritten.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/init.mjs scripts/lib/__tests__/init.test.mjs
git commit -m "feat(init): remove the old Cursor setup on upgrade"
```

### Task 4: Classify and remove `STRATEGY.md`, and report leftovers

**Files:**
- Modify: `scripts/init.mjs`
- Test: `scripts/lib/__tests__/init.test.mjs`

**Interfaces:**
- Produces:
  - `classifyStrategyFile(repoRoot: string): { state: 'absent' | 'ready' | 'blocked', reason?: string }`
  - `removeStrategy(repoRoot: string): { ok: boolean, message: string }`
  - `findLeftovers(repoRoot: string, config: object): string[]`
  - The exact action `STRATEGY.md is ready to migrate`, which Task 5's skill keys on.

- [ ] **Step 1: Write the failing tests**

Add a `gitRepo()` helper that runs `git init`, sets a local `user.name` and `user.email`, and commits any files given. Use a temp path containing a space. Tests:

| Test | Setup | Expected |
|---|---|---|
| `absent` | No file | `{ state: 'absent' }`, no `STRATEGY.md` action |
| `ready` | Committed file | `state: 'ready'`, action `STRATEGY.md is ready to migrate`, file still there |
| `untracked` | Uncommitted file | `blocked`, reason contains `not tracked`, action starts `STRATEGY.md left in place:` |
| `ignored` | Listed in a committed `.gitignore` | `blocked`, reason contains `ignored` |
| `modified` | Committed, then edited | `blocked`, reason contains `uncommitted` |
| `staged` | Committed, then edited and `git add`ed | `blocked`, reason contains `uncommitted` |
| `no git` | `freshRepo()` with the file | `blocked`, reason contains `git`, no throw |

Then:

```js
test('removeStrategy deletes a tracked clean file without staging', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n' });
  assert.equal(removeStrategy(root).ok, true);
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.equal(git(root, 'diff', '--cached', '--name-only').trim(), '');
  assert.equal(git(root, 'log', '--oneline').trim().split('\n').length, 1);
});

test('removeStrategy succeeds when the file is absent', () => {
  assert.equal(removeStrategy(gitRepo({ 'a.md': 'x\n' })).ok, true);
});
```

Also add:

- `removeStrategy` returns `ok: false` and leaves the file for each blocked case above.
- CLI: spawn `node scripts/init.mjs --remove-strategy` with `CLAUDE_PROJECT_DIR` set. Exit 1 on a modified file with the reason on output, exit 0 on success. A plain run on a ready file exits 0 and keeps the file.
- A `strategyFile: 'VISION.md'` key in `.loomwork.json` with a `VISION.md` present produces the action `strategyFile in .loomwork.json is no longer used; VISION.md was left alone`, with both files byte-identical.
- A `{}` `.loomwork.json` is left in place after `removeStrategy`.
- `findLeftovers`: in a git repo with committed `docs/SDD_PLAYBOOK.md` naming `ce-strategy`, `README.md` naming `compound-engineering`, plus the same text in `docs/superpowers/specs/a.md`, `docs/superpowers/plans/a.md`, `docs/solutions/a.md`, and `STRATEGY.md`, it returns exactly the first two. Custom `specsDir` and `plansDir` are honored.
- The leftovers action is `references to the old setup remain in: docs/SDD_PLAYBOOK.md, README.md`, listed in `git grep` order. It appears in the absent, ready, and blocked states.
- `findLeftovers` returns `[]` for `freshRepo()` and for a repo with no matches.
- Second default run: identical action list, no file changes, no commits, nothing staged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: FAIL, with the new functions not exported.

- [ ] **Step 3: Implement**

Run git with `spawnSync` and an argument array, with `cwd: repoRoot`.

`classifyStrategyFile` checks the file exists, then runs `git status --porcelain --ignored -- STRATEGY.md`:

| Result | Outcome |
|---|---|
| Non-zero exit or spawn error | Blocked: `git could not inspect it` |
| Empty output | Ready |
| `??` | Blocked: `it is not tracked by git — commit it and re-run init to finish` |
| `!!` | Blocked: `it is ignored by git` |
| Anything else | Blocked: `it has uncommitted changes — commit them and re-run init to finish` |

`findLeftovers` runs `git -c core.quotepath=off grep -l -I -F -e STRATEGY.md -e ce-strategy -e ce-compound -e ce-doc-review -e compound-engineering -- . ':!<specsDir>' ':!<plansDir>' ':!docs/solutions' ':!STRATEGY.md'`. Exit 1 means no matches, and any other non-zero exit returns `[]`.

`initRepo` order: directories, doctrine, Cursor, strategy classification, `strategyFile` report, leftovers. The report reads the key from `loadConfig(repoRoot).strategyFile`, which still passes unknown keys through.

The CLI checks `process.argv.includes('--remove-strategy')`, prints the result's `message`, and exits 1 when `ok` is false. Existing errors keep exit 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/init.mjs scripts/lib/__tests__/init.test.mjs
git commit -m "feat(init): classify and remove STRATEGY.md and report leftover references"
```

### Task 5: Update the skills

**Files:**
- Modify: `skills/init/SKILL.md`, `skills/close-out/SKILL.md`, `skills/audit/SKILL.md`, `skills/split-agents-md/SKILL.md`
- Test: `scripts/lib/__tests__/plugin.test.mjs`

**Interfaces:**
- Consumes: the `STRATEGY.md is ready to migrate` action and `init.mjs --remove-strategy` from Task 4.

- [ ] **Step 1: Write the failing test**

```js
test('skills require only superpowers', () => {
  for (const name of ['audit', 'close-out']) {
    const text = fs.readFileSync(path.join(ROOT, `skills/${name}/SKILL.md`), 'utf8');
    assert.doesNotMatch(text, /compound-engineering|ce-strategy|STRATEGY\.md|strategyFile/);
  }
  const init = fs.readFileSync(path.join(ROOT, 'skills/init/SKILL.md'), 'utf8');
  assert.doesNotMatch(init, /`compound-engineering:/);
  assert.match(init, /--remove-strategy/);
  assert.match(init, /ready to migrate/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`
Expected: FAIL

- [ ] **Step 3: Edit the skills**

- **`init`:** update the frontmatter description to cover upgrading repos from older loomwork setups. The preflight lists the three superpowers skills only. Replace section 3 with the spec's "`skills/init/SKILL.md` upgrade steps", including the section table, the 15-line cap, the confirmation wording, and the no path. State that it runs only on `STRATEGY.md is ready to migrate`. Resolve `--remove-strategy` through the same `SKILL.md`-relative path as the default run. Section 4 relays leftovers and states that nothing was committed.
- **`close-out`:** preflight requires superpowers only. Delete Step 3b, the `STRATEGY.md` staging lines in Step 5, and the paragraph explaining them. The Paths note names only `plansDir` and `specsDir`. Renumber nothing else.
- **`audit`:** preflight requires superpowers only.
- **`split-agents-md`:** keep moving the block whole, and change the reason to "so `scripts/init.mjs` can still find and remove it".

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills scripts/lib/__tests__/plugin.test.mjs
git commit -m "feat(skills): drop compound-engineering and add the init upgrade steps"
```

### Task 6: Update docs, doctrine, and manifests

**Files:**
- Modify: `templates/claude-md-block.md`, `references/PLAYBOOK.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `plugin.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`, `.gitignore`
- Delete: `docs/solutions/.gitkeep`
- Test: `scripts/lib/__tests__/hooks.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('doctrine names neither compound-engineering nor strategy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-doctrine-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), '{}');
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root));
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Spec-Driven Development \(loomwork\)/);
  assert.doesNotMatch(context, /compound-engineering|\bce-|STRATEGY|solutions/i);
});
```

The `{}` config with no specs directory also covers the opt-in rule from the spec.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: FAIL

- [ ] **Step 3: Edit the files**

- **`templates/claude-md-block.md`:** open with this text, keeping the frontmatter, plan-freeze, model-assignment, and audit bullets:

  ```markdown
  SDD lifecycle via the **loomwork** plugin, on top of **superpowers** (execution
  engine). Doctrine: loomwork playbook (`references/PLAYBOOK.md` in the plugin).

  - Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`
    (paths configurable via `.loomwork.json`).
  ```

- **`references/PLAYBOOK.md`:** remove what the spec lists under Documentation, including the compound-engineering clause of the "One status-tracking surface" note and the `ce-strategy` reference in the bug flow. Reduce "The three layers" to the spec and plan layer, or remove it if one row says nothing new.
- **`README.md`:** rewrite the intro and "Why" around superpowers alone. Requires superpowers only. Init scaffolds the docs layout and upgrades older setups, and users re-run it once after upgrading to 0.5.0. Config keys are `specsDir` and `plansDir`. Remove every Cursor paragraph and row, and the `ce-*` pinned names.
- **`AGENTS.md`, `CLAUDE.md`:** apply the spec's Documentation list. Update the Project Structure opening, the domain model strategy rule, the strategy-gate paragraph, the pinned names (superpowers only, and only `finishing-a-development-branch` is gated), the commit guideline, and the `strategy-gate.sh` guard note in `CLAUDE.md`, which now applies to the remaining gates. Add one line documenting `init.mjs --remove-strategy`.
- **Manifests:** version `0.5.0`, and description `SDD lifecycle for superpowers: status-frontmatter convention, drift audit, pre-merge close-out, and a close-out hook gate. One loom, one status surface.`
- **`CHANGELOG.md`:** add `## [0.5.0] - 2026-11-02`. Under Removed: compound-engineering dependency, strategy gate, `strategyFile`, `docs/solutions` scaffolding, close-out Step 3b. Under Changed: init upgrades older setups, and doctrine removal keeps repo content between the markers. Tell users to re-run `/loomwork:init` once.
- **`.gitignore`:** remove the two comment lines above `.cursor/`, keeping the rule.
- Delete `docs/solutions/.gitkeep`.

- [ ] **Step 4: Run the tests and the acceptance grep**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS

Run: `git grep -nIiE '\bce-[a-z]|compound-engineering|strategy|solutions' -- . ':!CHANGELOG.md' ':!docs/superpowers' ':!scripts/lib/__tests__' ':!scripts/init.mjs' ':!skills/init/SKILL.md'`
Expected: no output, apart from the `--remove-strategy` line in `AGENTS.md`. Each hit in the excluded `init.mjs` and `skills/init/SKILL.md` must be upgrade code.

- [ ] **Step 5: Commit**

```bash
git add -A templates references README.md AGENTS.md CLAUDE.md plugin.json .claude-plugin/plugin.json CHANGELOG.md .gitignore docs/solutions scripts/lib/__tests__/hooks.test.mjs
git commit -m "docs: describe loomwork on superpowers alone and release 0.5.0"
```

### Task 7: Verify the upgrade on copies of the real repos

No repo files change here, and the real repos are not touched. Work in clones under the session scratchpad.

- [ ] **Step 1: Clone the three repos**

Run `git clone -q` from `~/projects/weavereads`, `~/projects/timestranding`, and `~/projects/linkedin-profile` into a new scratchpad directory.

- [ ] **Step 2: Run the default upgrade in each clone**

Run: `CLAUDE_PROJECT_DIR=<clone> node scripts/init.mjs`
Expected: each reports `STRATEGY.md is ready to migrate`, Cursor removals, the doctrine removal, and leftovers. `git -C <clone> status --short` shows only unstaged changes.

- [ ] **Step 3: Follow the skill's upgrade steps in each clone**

Draft `## Product context` from each `STRATEGY.md` under the skill's table, write it to `AGENTS.md`, and run `init.mjs --remove-strategy`. Stand in for the owner's yes, since these are throwaway clones.

Expected in each clone:

- `AGENTS.md` has `## Product context` and no doctrine section or markers.
- `STRATEGY.md` and the loomwork Cursor files are gone.
- `git log` shows no new commit, and `git diff --cached` is empty.
- `git -C <clone> diff --stat -- docs/solutions` is empty.
- In timestranding, `## Deployment` and `## Auth` are intact: `git diff -- AGENTS.md` shows those lines unchanged.
- In weavereads, `.cursor/settings.json` and `.cursor/commands/` remain.

- [ ] **Step 4: Rerun and confirm nothing changes**

Run the default upgrade again in each clone and compare `git status --short` before and after.
Expected: identical. Report the results and leftovers to the owner.
