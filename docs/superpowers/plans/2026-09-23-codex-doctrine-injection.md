# Codex Doctrine Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the installed loomwork doctrine into opted-in Codex sessions at `SessionStart`.

**Architecture:** Register the existing `doctrine-gate.sh` in the Codex hooks manifest. The gate already reads `SessionStart` JSON, resolves `.cwd` through the shared repository-root helper, checks opt-in, and emits the live template. Add Codex-shaped behavior and manifest tests, then update the live documentation.

**Tech Stack:** JSON hooks manifest, Bash and `jq`, Node.js built-in `node:test` runner.

**Spec:** `docs/superpowers/specs/2026-09-23-codex-doctrine-injection-design.md`

## Global Constraints

- Reuse `hooks/doctrine-gate.sh` and `templates/claude-md-block.md` without changing either.
- Register `SessionStart` without a matcher in `hooks/codex-hooks.json`; use `bash "${PLUGIN_ROOT}/hooks/doctrine-gate.sh"` and `additionalContextLimit: 2500`.
- Codex payloads have `.cwd` and no `CLAUDE_PROJECT_DIR`; root resolution walks to the nearest `.git` or `.loomwork.json` marker and otherwise uses the raw `.cwd`.
- The gate emits the current template only for a valid `.loomwork.json` or a configured `specsDir` directory; other repositories get no stdout.
- Keep `UserPromptSubmit` strategy and close-out registrations intact. Preserve the existing Codex hook-trust behavior.
- Do not add a compact-source integration test, truncation handling, or a GitHub issue post; the spec explicitly excludes them.
- The repository has no build or dependencies. Verify with `node --test scripts/lib/__tests__/*.test.mjs`.

## Review Focus

- **Valid `.loomwork.json` without a specs directory:** Codex startup receives the template; the opt-in config alone suffices. Covered by Task 1's config test.
- **Default specs directory without `.loomwork.json`:** Codex startup receives the template. Covered by Task 1's default-directory test.
- **Nested `.cwd` below a `.git` file (worktree):** root resolution finds the repository and injects the template. Covered by Task 1's nested worktree test.
- **Nested `.cwd` below `.loomwork.json` with a custom `specsDir`:** root resolution and opt-in use the same ancestor. Covered by Task 1's nested config test.
- **Directory without a loomwork opt-in marker:** Codex startup emits no doctrine. Covered by Task 1's outside-repo test.

---

## File Structure

- `hooks/codex-hooks.json` — add the `SessionStart` command group and update its description to name both Codex behaviors.
- `scripts/lib/__tests__/plugin.test.mjs` — assert the manifest has exactly the intended `SessionStart` command, no matcher, and the 2500-character limit.
- `scripts/lib/__tests__/hooks.test.mjs` — run the existing Bash gate with Codex-shaped `SessionStart` events and no `CLAUDE_PROJECT_DIR`.
- `references/PLAYBOOK.md` — document the Codex doctrine path and hook-trust dependency alongside the existing hook table.
- `AGENTS.md` — describe both Codex hook events accurately.

### Task 1: Register and verify Codex `SessionStart` doctrine delivery

**Files:**
- Modify: `hooks/codex-hooks.json`
- Modify: `scripts/lib/__tests__/plugin.test.mjs`
- Modify: `scripts/lib/__tests__/hooks.test.mjs`
- Modify: `references/PLAYBOOK.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `sessionStartEvent(cwd)` and `runHook(script, stdinObj, projectDir)` in `hooks.test.mjs`; the latter removes ambient `CLAUDE_PROJECT_DIR` when `projectDir` is omitted.
- Produces: `hooks.SessionStart[0].hooks[0]` in `hooks/codex-hooks.json`, a Codex command registration for `doctrine-gate.sh`. No new function or script interface.

- [ ] **Step 1: Add a failing manifest registration test**

Append this test beside `Codex hooks run both gates before explicit skill prompts` in `scripts/lib/__tests__/plugin.test.mjs`:

```js
test('Codex hooks inject doctrine at session start', () => {
  const config = readJson('hooks/codex-hooks.json');
  const groups = config.hooks.SessionStart;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matcher, undefined);
  assert.deepEqual(groups[0].hooks, [{
    type: 'command',
    command: 'bash "${PLUGIN_ROOT}/hooks/doctrine-gate.sh"',
    additionalContextLimit: 2500,
  }]);
});
```

- [ ] **Step 2: Confirm the new registration test fails for the missing group**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`
Expected: FAIL in `Codex hooks inject doctrine at session start` because `config.hooks.SessionStart` is undefined.

- [ ] **Step 3: Add Codex payload behavior tests**

Add these tests beside the existing `doctrine-gate` tests in `scripts/lib/__tests__/hooks.test.mjs`. They deliberately omit `runHook`'s `projectDir` argument so the gate must use payload `.cwd`. Keep the existing Claude-shaped tests.

```js
test('doctrine-gate injects the live template for Codex with config opt-in', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-codex-doctrine-')));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'SessionStart');
  assert.equal(output.additionalContext, fs.readFileSync(path.join(HOOKS_DIR, '../templates/claude-md-block.md'), 'utf8'));
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});

test('doctrine-gate injects for Codex with the default specs directory', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-codex-doctrine-')));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate walks up from Codex cwd through a worktree .git file', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-codex-doctrine-')));
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: /tmp/unused\n');
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const nested = path.join(root, 'a/b');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(nested));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate walks up from Codex cwd to custom specs config', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-codex-doctrine-')));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  const nested = path.join(root, 'a/b');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(nested));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate stays silent for Codex outside loomwork', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-codex-outside-')));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});
```

- [ ] **Step 4: Run the payload tests**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS. These tests pin the gate's existing Codex-compatible behavior; investigate a failure before changing the script because the spec requires it to remain unmodified.

- [ ] **Step 5: Register the gate in `hooks/codex-hooks.json`**

Update `description` to `Loomwork doctrine at Codex session start and strategy and close-out gates for explicit skill invocations.` Keep the current `UserPromptSubmit` group exactly as it is. Add this sibling inside `hooks`:

```json
"SessionStart": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash \"${PLUGIN_ROOT}/hooks/doctrine-gate.sh\"",
        "additionalContextLimit": 2500
      }
    ]
  }
]
```

- [ ] **Step 6: Run the manifest and payload tests**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS, including the newly failing registration test and all Codex payload cases.

- [ ] **Step 7: Update live documentation**

In `references/PLAYBOOK.md`, change the Doctrine row's Codex cell to `` `hooks/codex-hooks.json` → `SessionStart`; opted-in repos only; current doctrine from installed plugin ``. Change the nearby Codex paragraph to distinguish `UserPromptSubmit` gates, which observe explicit `$superpowers:...` prompts, from the `SessionStart` doctrine gate, which runs once the installed hook is trusted. In `AGENTS.md`'s “Hooks: three runtimes, one behavior” paragraph, state that Codex registers both `UserPromptSubmit` and `SessionStart`, and limit the explicit-prompt restriction to the former.

- [ ] **Step 8: Verify all tests and the diff**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS. Run: `git diff --check` and `git diff -- hooks/codex-hooks.json scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/hooks.test.mjs references/PLAYBOOK.md AGENTS.md`. Expected: no whitespace errors; only the five listed files change, and neither `doctrine-gate.sh` nor the template changes.

- [ ] **Step 9: Commit the implementation**

```bash
git add hooks/codex-hooks.json scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/hooks.test.mjs references/PLAYBOOK.md AGENTS.md
git commit -m "feat(hooks): inject doctrine into Codex sessions"
```

The tracked spec and this plan require close-out on the feature branch before merge: mark this plan DONE and update the spec's `status`, `implemented_in`, `verified`, and acceptance checkboxes after implementation evidence is available. Follow `loomwork:close-out` for that step, and include it in the same PR.
