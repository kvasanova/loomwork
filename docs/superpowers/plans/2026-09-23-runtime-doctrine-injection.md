# Runtime Doctrine Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop copying the loomwork doctrine block into consumer repos; inject it live from the installed plugin at Claude Code `SessionStart`, and remove Cursor-specific support entirely.

**Architecture:** Extract the duplicated `resolve_repo_root` bash function into one sourced file so three gates can share it. Add a new `SessionStart` hook (`doctrine-gate.sh`) that resolves the repo root, checks an opt-in marker, and emits `templates/claude-md-block.md`'s content as `additionalContext`. Strip the doctrine-block-append logic and all Cursor logic from `scripts/init.mjs`, replacing the append with a strip-legacy-block step. Delete `templates/cursor/` and its test file, and update every doc/test that references Cursor support.

**Tech Stack:** Node.js (`node:test`, `node:fs`, `node:path`), Bash (`jq`, `[[ =~ ]]`), existing loomwork hook/test conventions.

**Spec:** `docs/superpowers/specs/2026-09-23-runtime-doctrine-injection-design.md`

## Global Constraints

- Hook gates emit exactly `{ "hookSpecificOutput": { "hookEventName": "...", "additionalContext": "..." } }` on stdout; nothing else may print to stdout (per `CLAUDE.md`'s Hook contract section).
- Gate matching uses `[[ "$var" =~ $pattern_re ]]` with the pattern in an unquoted variable — never `echo | grep -q` (per `AGENTS.md`'s pipefail/silent-drop history; `hooks.test.mjs` already guards this for the two existing gates with a 192KB-tail test).
- Root resolution order: `CLAUDE_PROJECT_DIR` if non-empty (used exactly as given), else walk up from payload `.cwd` testing `.git`/`.loomwork.json` with `-e` (not `-d`, so a worktree's `.git` file counts), else stay silent (exit 0, no output).
- Bash scripts must stay LF (`.gitattributes` enforces it; CRLF breaks them).
- `${CLAUDE_PLUGIN_ROOT}` is used only in `hooks/hooks.json`'s command string (substituted by Claude before exec) — a hook script locates its own sibling files via `$(dirname "$0")/..`, never by reading `${CLAUDE_PLUGIN_ROOT}` as an env var inside the script (existing gates never do this).
- `SessionStart` matcher value is `"startup|clear|compact"` — confirmed against the installed superpowers plugin's own `hooks/hooks.json` registration.
- Spec frontmatter and doctrine content changes are out of scope here; only delivery mechanism changes.
- Do not touch `docs/superpowers/specs/2026-08-21-*`, `docs/superpowers/specs/2026-09-16-*`, `docs/superpowers/plans/2026-08-21-*`, `docs/superpowers/plans/2026-09-16-*`, `CHANGELOG.md`, or `README.md` — frozen/historical records naming Cursor, not live documentation.

## Review Focus

- **Repo with `.loomwork.json` but no `docs/superpowers/specs/` dir (custom `specsDir` in config, dir not yet created):** the opt-in check must read `specsDir` from `.loomwork.json` when present, not hardcode the default path, or a repo with a custom `specsDir` that already ran init could be falsely treated as not opted in.
- **`SessionStart` firing with `.cwd` pointing outside any git repo entirely (e.g., a scratch/tmp directory the agent cd'd into):** the walk-up must terminate at `/` and fall through to silence, never throw or hang.
- **A repo whose `AGENTS.md` has the legacy block but whose `CLAUDE.md` also independently has one (pre-existing double-init edge case):** the strip step must handle both files independently and never assume only one exists.
- **Malformed `.loomwork.json` (invalid JSON) in a repo the doctrine gate checks:** must not crash the hook with a stack trace on stdout — the existing gates already swallow this in the strategy/close-out scripts' `jq ... 2>/dev/null || echo default` pattern; the doctrine gate's opt-in check must fail safe (treat as not opted in, or fall back to default `specsDir`) rather than erroring.
- **Legacy block with no trailing newline before EOF, or a block that isn't preceded by a blank line (hand-edited file):** the strip regex must not leave a dangling blank line or fail to match a plausible real-world variation of the exact format `init.mjs` itself always writes (`\n<!-- loomwork:begin -->\n...\n<!-- loomwork:end -->\n`) — scope the strip to that exact writer format only, and add a test for a file where the block sits mid-file with content after it.

---

## File Structure

- `hooks/lib/resolve-repo-root.sh` — new. Defines `resolve_repo_root()`, sourced by all three gate scripts. Pure extraction of the existing identical function body from `strategy-gate.sh` and `close-out-gate.sh`.
- `hooks/strategy-gate.sh` — modify. Replace inline `resolve_repo_root` definition with `source "$(dirname "$0")/lib/resolve-repo-root.sh"`.
- `hooks/close-out-gate.sh` — modify. Same replacement.
- `hooks/doctrine-gate.sh` — new. `SessionStart` hook: resolve root, check opt-in, emit doctrine.
- `hooks/hooks.json` — modify. Add `SessionStart` block.
- `scripts/init.mjs` — modify. Remove doctrine-append + all Cursor logic; add legacy-block-strip logic.
- `templates/cursor/` — delete (`hooks.json`, `loomwork-strategy-gate.sh`, `loomwork-close-out-gate.sh`).
- `scripts/lib/__tests__/cursor-hooks.test.mjs` — delete.
- `scripts/lib/__tests__/init.test.mjs` — modify. Remove Cursor + doctrine-append assertions; add legacy-block-strip tests.
- `scripts/lib/__tests__/hooks.test.mjs` — modify. Add `doctrine-gate.sh` test cases.
- `scripts/lib/__tests__/plugin.test.mjs` — modify. Remove `templates/cursor/*` references from the two tests that list gate files.
- `AGENTS.md` — modify. Remove Cursor mentions; describe doctrine injection.
- `skills/init/SKILL.md` — modify. Remove Cursor mentions.
- `references/PLAYBOOK.md` — modify. Remove Cursor column/mentions from the hook-enforcement table and surrounding prose.

---

### Task 1: Extract shared `resolve_repo_root` into `hooks/lib/resolve-repo-root.sh`

**Files:**
- Create: `hooks/lib/resolve-repo-root.sh`
- Modify: `hooks/strategy-gate.sh`
- Modify: `hooks/close-out-gate.sh`
- Test: `scripts/lib/__tests__/hooks.test.mjs`

**Interfaces:**
- Consumes: nothing (pure extraction of existing logic).
- Produces: `hooks/lib/resolve-repo-root.sh`, sourceable by any gate script in `hooks/`, defining shell function `resolve_repo_root(start_dir) -> prints resolved root path to stdout`. Later tasks (`doctrine-gate.sh`) source this file the same way.

This is a refactor with no behavior change — the existing `hooks.test.mjs` suite for `strategy-gate.sh` and `close-out-gate.sh` is the regression test. No new test content in this task beyond confirming the existing suite still passes.

- [ ] **Step 1: Run the existing hook test suite to record the current passing baseline**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS (all existing tests green) — this is the baseline the refactor must not break.

- [ ] **Step 2: Create `hooks/lib/resolve-repo-root.sh` with the extracted function**

```bash
#!/usr/bin/env bash
# Shared by strategy-gate.sh, close-out-gate.sh, and doctrine-gate.sh.
# Walk up from $1 to the nearest ancestor holding a repository marker. Falls
# back to the starting directory so an uninitialized repo still gets nudged.
resolve_repo_root() {
  local start="$1" dir
  dir=$(cd "$start" 2>/dev/null && pwd -P) || { printf '%s' "$start"; return; }
  while true; do
    if [[ -e "$dir/.git" || -e "$dir/.loomwork.json" ]]; then
      printf '%s' "$dir"
      return
    fi
    [[ "$dir" == "/" ]] && break
    dir=$(dirname "$dir")
  done
  printf '%s' "$start"
}
```

- [ ] **Step 3: Replace the inline definition in `hooks/strategy-gate.sh`**

Find this block in `hooks/strategy-gate.sh`:

```bash
# Walk up from $1 to the nearest ancestor holding a repository marker. Falls
# back to the starting directory so an uninitialized repo still gets nudged.
resolve_repo_root() {
  local start="$1" dir
  dir=$(cd "$start" 2>/dev/null && pwd -P) || { printf '%s' "$start"; return; }
  while true; do
    if [[ -e "$dir/.git" || -e "$dir/.loomwork.json" ]]; then
      printf '%s' "$dir"
      return
    fi
    [[ "$dir" == "/" ]] && break
    dir=$(dirname "$dir")
  done
  printf '%s' "$start"
}
```

Replace it with:

```bash
source "$(dirname "$0")/lib/resolve-repo-root.sh"
```

- [ ] **Step 4: Replace the inline definition in `hooks/close-out-gate.sh`**

Same replacement as Step 3, applied to `hooks/close-out-gate.sh`'s identical block.

- [ ] **Step 5: Run the existing hook test suite again to confirm no regression**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS — identical results to Step 1's baseline. If any test that spawns `strategy-gate.sh` or `close-out-gate.sh` fails, the `source` path is wrong (both scripts live directly in `hooks/`, so `$(dirname "$0")` is `.../hooks` and `lib/resolve-repo-root.sh` resolves correctly relative to it).

- [ ] **Step 6: Commit**

```bash
git add hooks/lib/resolve-repo-root.sh hooks/strategy-gate.sh hooks/close-out-gate.sh
git commit -m "refactor(hooks): extract shared resolve_repo_root into hooks/lib"
```

---

### Task 2: Add `doctrine-gate.sh` SessionStart hook

**Files:**
- Create: `hooks/doctrine-gate.sh`
- Modify: `hooks/hooks.json`
- Test: `scripts/lib/__tests__/hooks.test.mjs`

**Interfaces:**
- Consumes: `hooks/lib/resolve-repo-root.sh`'s `resolve_repo_root()` (Task 1).
- Produces: `hooks/doctrine-gate.sh`, invoked with a JSON payload on stdin containing `.cwd` (and other `SessionStart` fields Claude provides but this script ignores). Emits `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<doctrine text>" } }` on stdout when the resolved repo is opted in; emits nothing and exits 0 otherwise. Later tasks do not depend on this script's internals beyond this contract.

- [ ] **Step 1: Write the failing tests in `scripts/lib/__tests__/hooks.test.mjs`**

Add near the top of the file, after the existing `codexPromptEvent` helper:

```javascript
function sessionStartEvent(cwd) {
  return { hook_event_name: 'SessionStart', source: 'startup', cwd };
}
```

Add these test cases (place them in a new section after the existing close-out-gate tests, before the long-prompt regression tests):

```javascript
test('doctrine-gate injects the doctrine block for a repo with docs/superpowers/specs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate injects the doctrine block for a repo with .loomwork.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate respects a custom specsDir from .loomwork.json for opt-in detection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  fs.mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate stays silent for a repo with no loomwork markers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate stays silent when CLAUDE_PROJECT_DIR is unset and no cwd resolves', () => {
  const result = runHook('doctrine-gate.sh', { hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate stays silent on malformed .loomwork.json rather than crashing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), '{ not valid json');
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  // Falls back to default specsDir for the opt-in check; no default dir exists here, so silent.
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate ignores non-SessionStart events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: FAIL — `hooks/doctrine-gate.sh` does not exist yet, so `spawnSync` returns a non-zero status or the JSON parse throws.

- [ ] **Step 3: Write `hooks/doctrine-gate.sh`**

```bash
#!/usr/bin/env bash
# loomwork doctrine gate: inject the current loomwork SDD doctrine at Claude
# Code session start (and after compaction) for repos that have opted into
# loomwork, sourced live from this plugin's own templates/claude-md-block.md.
# Replaces the old /loomwork:init-time copy into AGENTS.md/CLAUDE.md, so an
# upgraded plugin's doctrine reaches every opted-in repo without a re-run.
set -euo pipefail

source "$(dirname "$0")/lib/resolve-repo-root.sh"

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
[[ "$event" == "SessionStart" ]] || exit 0

payload_root=$(echo "$input" | jq -r '.cwd // empty')
if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
  root="$CLAUDE_PROJECT_DIR"
elif [[ -n "$payload_root" ]]; then
  root=$(resolve_repo_root "$payload_root")
else
  root=''
fi
if [[ -z "$root" ]]; then
  exit 0
fi

specs_dir=$(jq -r '.specsDir // "docs/superpowers/specs"' "$root/.loomwork.json" 2>/dev/null || echo 'docs/superpowers/specs')

opted_in=false
if [[ -f "$root/.loomwork.json" || -d "$root/$specs_dir" ]]; then
  opted_in=true
fi
[[ "$opted_in" == true ]] || exit 0

doctrine_file="$(dirname "$0")/../templates/claude-md-block.md"
if [[ ! -f "$doctrine_file" ]]; then
  exit 0
fi

jq -n --rawfile doctrine "$doctrine_file" --arg event "$event" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $doctrine } }'
```

Make it executable:

```bash
chmod +x hooks/doctrine-gate.sh
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`
Expected: PASS — all doctrine-gate tests green, plus the Task 1 baseline still green.

- [ ] **Step 5: Register the hook in `hooks/hooks.json`**

Read the current file first — its content is:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/strategy-gate.sh" },
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/close-out-gate.sh" }
        ]
      }
    ]
  }
}
```

Replace its full contents with:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/strategy-gate.sh" },
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/close-out-gate.sh" }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/doctrine-gate.sh" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS. (`plugin.test.mjs` is untouched by this task and should still be green; it gets updated in Task 5.)

- [ ] **Step 7: Commit**

```bash
git add hooks/doctrine-gate.sh hooks/hooks.json scripts/lib/__tests__/hooks.test.mjs
git commit -m "feat(hooks): add SessionStart doctrine-gate for runtime doctrine injection"
```

---

### Task 3: Strip doctrine-append and add legacy-block-removal to `scripts/init.mjs`

**Files:**
- Modify: `scripts/init.mjs`
- Test: `scripts/lib/__tests__/init.test.mjs`

**Interfaces:**
- Consumes: nothing new — same `initRepo(repoRoot, pluginRoot)` signature.
- Produces: `initRepo` no longer appends `templates/claude-md-block.md` into `AGENTS.md`/`CLAUDE.md`. Instead, for each of `AGENTS.md` and `CLAUDE.md` that exists and contains a `<!-- loomwork:begin -->...<!-- loomwork:end -->` span (in the exact format the old writer produced: preceded by a blank line, followed by a trailing newline), removes that span and pushes `removed legacy loomwork block from <basename>` onto the returned actions array. No action pushed when no legacy block is found in that file. This task does not yet touch the Cursor logic (Task 4) — do them independently so each has its own test-passing checkpoint, per Task Right-Sizing.

- [ ] **Step 1: Write the failing tests in `scripts/lib/__tests__/init.test.mjs`**

Add these test cases after the existing `'initRepo appends to CLAUDE.md when it is the only memory file'` test, replacing nothing yet:

```javascript
test('initRepo no longer appends the doctrine block to a fresh repo', () => {
  const root = freshRepo();
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
  assert.ok(!actions.some((a) => a.includes('appended loomwork block')));
});

test('initRepo strips a legacy loomwork block from AGENTS.md', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Agents\n\nSome content.\n\n<!-- loomwork:begin -->\nold doctrine text\n<!-- loomwork:end -->\n',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(after, /<!-- loomwork:begin -->/);
  assert.doesNotMatch(after, /old doctrine text/);
  assert.match(after, /# Agents\n\nSome content\.\n/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from AGENTS.md'));
});

test('initRepo strips a legacy loomwork block from CLAUDE.md when present', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# Claude\n\n<!-- loomwork:begin -->\nold doctrine text\n<!-- loomwork:end -->\n',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  const after = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(after, /<!-- loomwork:begin -->/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from CLAUDE.md'));
});

test('initRepo strips legacy blocks from both AGENTS.md and CLAUDE.md independently when both carry one', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Agents\n\n<!-- loomwork:begin -->\nagents doctrine\n<!-- loomwork:end -->\n',
  );
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# Claude\n\n<!-- loomwork:begin -->\nclaude doctrine\n<!-- loomwork:end -->\n',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /loomwork:begin/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), /loomwork:begin/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from AGENTS.md'));
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from CLAUDE.md'));
});

test('initRepo strips a legacy block that sits mid-file with content after it', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Agents\n\n<!-- loomwork:begin -->\nold doctrine\n<!-- loomwork:end -->\n\n## Later section\n\nMore content here.\n',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(after, /loomwork:begin/);
  assert.match(after, /## Later section\n\nMore content here\.\n/);
  assert.match(after, /# Agents\n/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from AGENTS.md'));
});

test('initRepo reports nothing doctrine-related when no legacy block exists', () => {
  const root = freshRepo();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents\n\nNo loomwork block here.\n');
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(!actions.some((a) => a.includes('loomwork block')));
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), '# Agents\n\nNo loomwork block here.\n');
});
```

Now update the two tests that currently assert the block gets written, since that behavior is being removed. Replace:

```javascript
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /<!-- loomwork:begin -->/);
  assert.match(agents, /<!-- loomwork:end -->/);
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));
```

in `'initRepo scaffolds a fresh repo and is idempotent'` with:

```javascript
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));
```

and delete the assertions on `.cursor/` from that same test (they move to Task 4's removal, but deleting them here keeps this task's test file internally consistent — leaving them would fail against this task's `init.mjs` changes before Task 4 runs). Remove these three lines from the same test:

```javascript
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks.json')));
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks/loomwork-strategy-gate.sh')));
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks/loomwork-close-out-gate.sh')));
```

Also delete the three whole tests that only exercise Cursor behavior, since Task 4 removes that code path entirely and these tests have no replacement target in this codebase going forward: `'initRepo merges into an existing .cursor/hooks.json, preserving foreign entries'`, `'initRepo migrates legacy loomwork hook entries instead of duplicating them'`, `'initRepo re-copies Cursor hook scripts when they drift from the templates'`.

Finally, replace the four tests that assert the doctrine block gets appended (`'initRepo appends to AGENTS.md when CLAUDE.md is absent and AGENTS.md exists'`, `'initRepo prefers AGENTS.md over CLAUDE.md when both exist'`, `'initRepo leaves an existing block in CLAUDE.md alone instead of copying it to AGENTS.md'`, `'initRepo appends to CLAUDE.md when it is the only memory file'`) — these test AGENTS.md-vs-CLAUDE.md file preference logic that no longer exists once nothing gets appended. Delete all four; the preference logic they tested is removed in this task's implementation step (init no longer picks a memory file at all).

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: FAIL — `initRepo` still appends the doctrine block and still does Cursor work, so the new strip/no-append assertions fail (Cursor-path tests still pass at this point since `init.mjs` hasn't changed yet; that's fine, Task 4 removes that code and those tests were already deleted above).

- [ ] **Step 3: Rewrite `scripts/init.mjs`'s memory-file section**

Find this block (from `// Existing AGENTS.md wins...` through the closing of that `if (!alreadyPresent)`):

```javascript
  // Existing AGENTS.md wins because it is tool-agnostic; existing CLAUDE.md
  // remains supported, and a repository with neither creates AGENTS.md.
  const memoryCandidates = ['AGENTS.md', 'CLAUDE.md'].map((f) => path.join(repoRoot, f));
  const memoryFile =
    memoryCandidates.find((p) => fs.existsSync(p)) ?? path.join(repoRoot, 'AGENTS.md');
  const existing = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8') : '';
  // Check every candidate, not just the selected one. A repo initialized before
  // AGENTS.md took precedence has the block in CLAUDE.md; appending a second
  // copy to AGENTS.md would give it two. Leave the existing one where it is.
  const alreadyPresent = memoryCandidates.some(
    (p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(MARKER_BEGIN),
  );
  if (!alreadyPresent) {
    const block = fs
      .readFileSync(path.join(pluginRoot, 'templates/claude-md-block.md'), 'utf8')
      .trimEnd();
    const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(memoryFile, `${existing}${sep}\n${MARKER_BEGIN}\n${block}\n${MARKER_END}\n`);
    actions.push(`appended loomwork block to ${path.basename(memoryFile)}`);
  }
```

Replace it with:

```javascript
  // The doctrine is no longer copied into consumer repos — the plugin's
  // SessionStart hook (hooks/doctrine-gate.sh) injects it live from
  // templates/claude-md-block.md instead, so every repo stays current when
  // the plugin upgrades. A repo initialized before this change may still
  // carry the old marker-guarded block; strip it so the doctrine isn't
  // duplicated (once from the file, once from the hook).
  const legacyBlockRe = new RegExp(
    `\\n?${escapeRegExp(MARKER_BEGIN)}\\n[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n`,
  );
  for (const filename of ['AGENTS.md', 'CLAUDE.md']) {
    const filePath = path.join(repoRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(MARKER_BEGIN)) continue;
    const stripped = content.replace(legacyBlockRe, '');
    fs.writeFileSync(filePath, stripped);
    actions.push(`removed legacy loomwork block from ${filename}`);
  }
```

Add the `escapeRegExp` helper near the top of the file, after the existing constant declarations:

```javascript
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: Cursor-path tests still pass (unchanged code); the new strip/no-append tests pass. The three Cursor-only tests deleted in Step 1 are gone so there's nothing to fail there. If a strip test fails on spacing, check the fixture's exact blank-line placement against the regex — the regex consumes one leading `\n` optionally (`\\n?`) so it works whether or not a blank line precedes the marker, and always consumes through the end-marker's trailing `\n`.

- [ ] **Step 5: Commit**

```bash
git add scripts/init.mjs scripts/lib/__tests__/init.test.mjs
git commit -m "fix(init): stop copying doctrine block; strip legacy block instead"
```

---

### Task 4: Remove Cursor support from `scripts/init.mjs` and delete `templates/cursor/`

**Files:**
- Modify: `scripts/init.mjs`
- Delete: `templates/cursor/hooks.json`
- Delete: `templates/cursor/loomwork-strategy-gate.sh`
- Delete: `templates/cursor/loomwork-close-out-gate.sh`
- Delete: `scripts/lib/__tests__/cursor-hooks.test.mjs`
- Test: `scripts/lib/__tests__/init.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `initRepo` no longer creates or touches `.cursor/hooks/` or `.cursor/hooks.json`. `templates/cursor/` no longer exists in the repo.

- [ ] **Step 1: Confirm the current test baseline (post-Task 3) is green**

Run: `node --test scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/cursor-hooks.test.mjs`
Expected: PASS — `init.test.mjs` passes per Task 3; `cursor-hooks.test.mjs` still passes since `init.mjs`'s Cursor code hasn't changed yet.

- [ ] **Step 2: Delete `scripts/lib/__tests__/cursor-hooks.test.mjs`**

```bash
rm scripts/lib/__tests__/cursor-hooks.test.mjs
```

- [ ] **Step 3: Remove the Cursor logic from `scripts/init.mjs`**

Delete the `CURSOR_SCRIPTS` constant near the top:

```javascript
const CURSOR_SCRIPTS = ['loomwork-strategy-gate.sh', 'loomwork-close-out-gate.sh'];
```

Delete the entire Cursor scripts + `hooks.json` merge block — everything from `const cursorHooksDir = ...` through the `if (hooksChanged) { ... }` block that follows it (this spans from right after the STRATEGY.md missing-file check down to just before the memory-file section rewritten in Task 3):

```javascript
  const cursorHooksDir = path.join(repoRoot, '.cursor/hooks');
  fs.mkdirSync(cursorHooksDir, { recursive: true });
  for (const script of CURSOR_SCRIPTS) {
    const templatePath = path.join(pluginRoot, 'templates/cursor', script);
    const content = fs.readFileSync(templatePath, 'utf8');
    const dest = path.join(cursorHooksDir, script);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content, { mode: 0o755 });
      actions.push(`wrote .cursor/hooks/${script}`);
    }
  }

  const hooksJsonPath = path.join(repoRoot, '.cursor/hooks.json');
  const templateHooksPath = path.join(pluginRoot, 'templates/cursor/hooks.json');
  const template = JSON.parse(
    fs.readFileSync(templateHooksPath, 'utf8'),
  );
  const hadHooksJson = fs.existsSync(hooksJsonPath);
  const hooksJson = hadHooksJson
    ? JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
    : { version: 1, hooks: {} };
  hooksJson.hooks ??= {};
  let hooksChanged = !hadHooksJson;

  // Migrate loomwork entries written by older versions: bare `.cursor/hooks/*.sh`
  // commands (Cursor/Windows can open these as editor tabs instead of running
  // them) and the noisy `Read|Skill` postToolUse matcher. Rewrite in place so a
  // re-run fixes installed repos rather than appending a duplicate gate.
  for (const [event, entries] of Object.entries(hooksJson.hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const target = template.hooks[event]?.find(
        (t) => t.command.endsWith(` ${entry.command}`) || t.command === entry.command,
      );
      if (!target) continue;
      if (entry.command !== target.command) {
        entry.command = target.command;
        hooksChanged = true;
      }
      if ((entry.matcher ?? '') !== (target.matcher ?? '')) {
        if (target.matcher === undefined) delete entry.matcher;
        else entry.matcher = target.matcher;
        hooksChanged = true;
      }
    }
  }

  for (const [event, entries] of Object.entries(template.hooks)) {
    hooksJson.hooks[event] ??= [];
    for (const entry of entries) {
      const present = hooksJson.hooks[event].some(
        (e) => e.command === entry.command && (e.matcher ?? '') === (entry.matcher ?? ''),
      );
      if (!present) {
        hooksJson.hooks[event].push(entry);
        hooksChanged = true;
      }
    }
  }
  if (hooksChanged) {
    fs.writeFileSync(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`);
    actions.push(hadHooksJson ? 'merged .cursor/hooks.json' : 'wrote .cursor/hooks.json');
  }

```

- [ ] **Step 4: Delete the `templates/cursor/` directory**

```bash
rm -rf templates/cursor
```

- [ ] **Step 5: Run the init test suite to confirm nothing references the deleted code**

Run: `node --test scripts/lib/__tests__/init.test.mjs`
Expected: PASS — no test in this file references `.cursor/` or `templates/cursor/` anymore (all such tests were deleted in Task 3, Step 1).

- [ ] **Step 6: Commit**

```bash
git add -A scripts/init.mjs templates/cursor scripts/lib/__tests__/cursor-hooks.test.mjs
git commit -m "feat(init): remove Cursor support"
```

---

### Task 5: Update `plugin.test.mjs` to drop Cursor gate-file references

**Files:**
- Modify: `scripts/lib/__tests__/plugin.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: no code change — test-only update so the suite doesn't reference deleted files.

- [ ] **Step 1: Run the full suite to confirm this is the only remaining break**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: FAIL — `plugin.test.mjs`'s two tests that reference `templates/cursor/hooks.json`, `templates/cursor/loomwork-strategy-gate.sh`, and `templates/cursor/loomwork-close-out-gate.sh` throw `ENOENT` since Task 4 deleted those files. All other test files pass.

- [ ] **Step 2: Update `'split-agents-md is absent from every hook registration'`**

Find:

```javascript
test('split-agents-md is absent from every hook registration', () => {
  const registrations = [
    'hooks/hooks.json',
    'hooks/codex-hooks.json',
    'templates/cursor/hooks.json',
  ];
  for (const relativePath of registrations) {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(contents, /split-agents-md/, `${relativePath} references split-agents-md`);
  }
  const gates = fs
    .readdirSync(path.join(ROOT, 'hooks'))
    .filter((entry) => entry.endsWith('.sh'))
    .map((entry) => `hooks/${entry}`);
  assert.ok(gates.length > 0, 'expected at least one gate script');
  for (const relativePath of [...gates, 'templates/cursor/loomwork-strategy-gate.sh', 'templates/cursor/loomwork-close-out-gate.sh']) {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(contents, /split-agents-md/, `${relativePath} references split-agents-md`);
  }
});
```

Replace with:

```javascript
test('split-agents-md is absent from every hook registration', () => {
  const registrations = ['hooks/hooks.json', 'hooks/codex-hooks.json'];
  for (const relativePath of registrations) {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(contents, /split-agents-md/, `${relativePath} references split-agents-md`);
  }
  const gates = fs
    .readdirSync(path.join(ROOT, 'hooks'))
    .filter((entry) => entry.endsWith('.sh'))
    .map((entry) => `hooks/${entry}`);
  assert.ok(gates.length > 0, 'expected at least one gate script');
  for (const relativePath of gates) {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(contents, /split-agents-md/, `${relativePath} references split-agents-md`);
  }
});
```

Note: `fs.readdirSync(path.join(ROOT, 'hooks'))` now also lists the `lib/` subdirectory created in Task 1 — `.filter((entry) => entry.endsWith('.sh'))` already excludes it since `lib` has no `.sh` suffix, so no further change is needed there.

- [ ] **Step 3: Run the full suite to confirm everything passes**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS — every test file green.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/__tests__/plugin.test.mjs
git commit -m "test(plugin): drop deleted Cursor file references"
```

---

### Task 6: Update documentation (`AGENTS.md`, `skills/init/SKILL.md`, `references/PLAYBOOK.md`)

**Files:**
- Modify: `AGENTS.md`
- Modify: `skills/init/SKILL.md`
- Modify: `references/PLAYBOOK.md`
- Test: `scripts/lib/__tests__/plugin.test.mjs` (existing `'init skill exposes a host-neutral skill-relative entry point'` test must keep passing — verify only, no new test needed)

**Interfaces:**
- Consumes: nothing new.
- Produces: no code change — documentation only. No task depends on this one.

- [ ] **Step 1: Update `AGENTS.md`**

In the Project Structure section, find:

```
`hooks/` contains shared Claude Code and Codex gates plus their runtime registrations; `templates/cursor/` contains the Cursor counterparts. Other scaffolding assets live in `templates/`. The portable manifest is `plugin.json`; `.claude-plugin/plugin.json` is the Claude compatibility manifest. Command instructions live in `commands/`, and skills in `skills/`. See `references/PLAYBOOK.md` for lifecycle conventions and `docs/superpowers/{specs,plans}/` for design records.
```

Replace with:

```
`hooks/` contains shared Claude Code and Codex gates plus their runtime registrations, and `hooks/lib/` holds logic shared between them. Other scaffolding assets live in `templates/`. The portable manifest is `plugin.json`; `.claude-plugin/plugin.json` is the Claude compatibility manifest. Command instructions live in `commands/`, and skills in `skills/`. See `references/PLAYBOOK.md` for lifecycle conventions and `docs/superpowers/{specs,plans}/` for design records.
```

In the "This is a plugin, not an application" section, find:

```
There is no `package.json`, no dependencies, and no build step. The repository ships CLIs, Bash hook gates, Cursor mirrors of those gates, and instructions-only Markdown (skills and commands).
```

Replace with:

```
There is no `package.json`, no dependencies, and no build step. The repository ships CLIs, Bash hook gates, and instructions-only Markdown (skills and commands).
```

In Build/Test/Development Commands, find:

```
- `node scripts/init.mjs` — scaffold the resolved repository, updating documentation and Cursor hooks. Use a disposable consumer repository when testing initialization.
```

Replace with:

```
- `node scripts/init.mjs` — scaffold the resolved repository's spec/plan/solutions directories and report a missing `STRATEGY.md`. Use a disposable consumer repository when testing initialization.
```

In "Hooks: three runtimes, one behavior", find:

```
Claude Code reads `hooks/hooks.json` as its `PostToolUse` registration. Codex reads `hooks/codex-hooks.json` as its `UserPromptSubmit` registration and can therefore observe only explicit `$superpowers:...` prompts. **Cursor does not read either plugin registration** — it reads `.cursor/hooks.json` from the workspace, so `scripts/init.mjs` is the installer for the Cursor copies. A change to `templates/cursor/*` therefore reaches an already-initialized repository only when the user re-runs init. `init.mjs` migrates entries in place, rewriting stale `command` and `matcher` values rather than appending duplicates.

The Claude and Cursor `hooks.json` files match broadly on the `Skill` tool and discriminate on skill name **inside the script**, via `jq` on `.tool_input.skill`. Keep matching there, not in the matcher. The shared gate scripts accept both Claude `PostToolUse` and Codex `UserPromptSubmit` payloads and emit the incoming event name in `hookSpecificOutput`. Root resolution is ordered: a non-empty `CLAUDE_PROJECT_DIR` is used exactly as given; otherwise the payload's `.cwd` walks **up** to the nearest ancestor holding `.git` or `.loomwork.json` (Codex may start in a subdirectory), falling back to the raw `.cwd` when no marker is found so uninitialized repositories still get nudged. Both gates exit silently when neither resolves. The walk tests `.git` with `-e`, not `-d`, so a worktree's `.git` **file** counts.
```

Replace with:

```
Claude Code reads `hooks/hooks.json` as its `PostToolUse` and `SessionStart` registrations. Codex reads `hooks/codex-hooks.json` as its `UserPromptSubmit` registration and can therefore observe only explicit `$superpowers:...` prompts. The loomwork doctrine itself is delivered by `hooks/doctrine-gate.sh` on `SessionStart`, sourced live from `templates/claude-md-block.md` — it is no longer copied into consumer repos by init, so an upgraded plugin's doctrine reaches every opted-in repo without a re-run. Cursor is not supported directly; run this plugin's Claude Code surface instead.

The Claude `hooks.json` matches broadly on the `Skill` tool and discriminates on skill name **inside the script**, via `jq` on `.tool_input.skill`. Keep matching there, not in the matcher. The shared gate scripts accept both Claude `PostToolUse`/`SessionStart` and Codex `UserPromptSubmit` payloads and emit the incoming event name in `hookSpecificOutput`. Root resolution (shared via `hooks/lib/resolve-repo-root.sh`) is ordered: a non-empty `CLAUDE_PROJECT_DIR` is used exactly as given; otherwise the payload's `.cwd` walks **up** to the nearest ancestor holding `.git` or `.loomwork.json` (Codex may start in a subdirectory), falling back to the raw `.cwd` when no marker is found so uninitialized repositories still get nudged. All gates exit silently when neither resolves. The walk tests `.git` with `-e`, not `-d`, so a worktree's `.git` **file** counts.
```

Find:

```
Cursor commands must be spelled `bash .cursor/hooks/loomwork-*.sh`. A bare `.sh` path makes Cursor open the file in an editor tab on Windows instead of executing it.

```

Delete this line entirely (it has no replacement — the constraint no longer applies to anything loomwork ships).

In Testing Guidelines, find:

```
Tests use `node:test` and `node:assert/strict`. They are behavior-level rather than unit-level: `init.test.mjs` and `cursor-hooks.test.mjs` scaffold a real temporary directory and assert files on disk, `hooks.test.mjs` spawns the actual Bash gates with JSON on stdin and asserts the emitted `hookSpecificOutput`, and `rules.test.mjs` and `parse.test.mjs` use Markdown fixtures in `__tests__/fixtures/`.
```

Replace with:

```
Tests use `node:test` and `node:assert/strict`. They are behavior-level rather than unit-level: `init.test.mjs` scaffolds a real temporary directory and asserts files on disk, `hooks.test.mjs` spawns the actual Bash gates with JSON on stdin and asserts the emitted `hookSpecificOutput`, and `rules.test.mjs` and `parse.test.mjs` use Markdown fixtures in `__tests__/fixtures/`.
```

Find:

```
Use descriptive behavior-focused test names, temporary consumer repositories, and fixtures for parsing cases. Cover changed behavior and failure paths; hook changes should exercise both Claude Code and Cursor variants. No numeric coverage threshold is configured.
```

Replace with:

```
Use descriptive behavior-focused test names, temporary consumer repositories, and fixtures for parsing cases. Cover changed behavior and failure paths; hook changes should exercise both the Claude Code and Codex payload shapes. No numeric coverage threshold is configured.
```

- [ ] **Step 2: Update `skills/init/SKILL.md`**

Find the frontmatter `description` line:

```
description: Initialize the current consumer repository for loomwork by scaffolding SDD directories, Cursor hook mirrors, and the marker-guarded AGENTS.md or CLAUDE.md guidance block. Use when setting up loomwork in a repository or refreshing copied Cursor hooks after a plugin update.
```

Replace with:

```
description: Initialize the current consumer repository for loomwork by scaffolding SDD directories and removing any legacy marker-guarded doctrine block from AGENTS.md or CLAUDE.md. Use when setting up loomwork in a repository.
```

Find:

```
The script creates missing spec, plan, and solution directories; installs or
refreshes the Cursor hook mirrors; and adds one marker-guarded loomwork block.
It prefers an existing `AGENTS.md`, otherwise an existing `CLAUDE.md`, and
creates `AGENTS.md` when neither exists. Paths come from `.loomwork.json` when
present. The script never creates or edits the strategy file.
```

Replace with:

```
The script creates missing spec, plan, and solution directories, and removes
a pre-existing marker-guarded loomwork block from `AGENTS.md` or `CLAUDE.md`
if found — the doctrine itself is delivered live by the plugin's
`SessionStart` hook, not copied into the repo. Paths come from
`.loomwork.json` when present. The script never creates or edits the
strategy file.
```

- [ ] **Step 3: Update `references/PLAYBOOK.md`**

Find the hook enforcement table:

```
| Gate | Skill trigger | Claude Code | Codex | Cursor |
| --- | --- | --- | --- | --- |
| **STRATEGY.md** | `brainstorming`, `writing-plans` | loomwork plugin `hooks/hooks.json` → `PostToolUse` + `Skill` matcher (ships with the plugin) | `hooks/codex-hooks.json` → `UserPromptSubmit`; explicit `$superpowers:brainstorming` and `$superpowers:writing-plans` prompts only | `.cursor/hooks.json` → `loomwork-strategy-gate.sh` (written by `/loomwork:init`) — `beforeSubmitPrompt` (slash commands) + `postToolUse` on `Read`/`Skill` |
| **Close-out** | `finishing-a-development-branch` | loomwork plugin `hooks/hooks.json` → `PostToolUse` + `Skill` matcher (ships with the plugin) | `hooks/codex-hooks.json` → `UserPromptSubmit`; explicit `$superpowers:finishing-a-development-branch` prompts only | `.cursor/hooks.json` → `loomwork-close-out-gate.sh` (written by `/loomwork:init`) — same events |
```

Replace with:

```
| Gate | Skill trigger | Claude Code | Codex |
| --- | --- | --- | --- |
| **STRATEGY.md** | `brainstorming`, `writing-plans` | loomwork plugin `hooks/hooks.json` → `PostToolUse` + `Skill` matcher (ships with the plugin) | `hooks/codex-hooks.json` → `UserPromptSubmit`; explicit `$superpowers:brainstorming` and `$superpowers:writing-plans` prompts only |
| **Close-out** | `finishing-a-development-branch` | loomwork plugin `hooks/hooks.json` → `PostToolUse` + `Skill` matcher (ships with the plugin) | `hooks/codex-hooks.json` → `UserPromptSubmit`; explicit `$superpowers:finishing-a-development-branch` prompts only |
| **Doctrine** | every session (and after compaction) | loomwork plugin `hooks/hooks.json` → `SessionStart` (`startup\|clear\|compact`), opted-in repos only | not yet implemented — tracked in issue #20 |
```

Find:

```
**Codex truncation:** Codex caps injected context at `additionalContextLimit`
(2500) and spills the remainder to a file. The plugin gate's message therefore
tells the agent to read that saved hook-output file when its host truncated the
output, instead of claiming the whole strategy is inline. The Cursor mirror
keeps the plain "full content is already injected" wording on purpose: Cursor
sets no limit and never spills, so the spill instruction would point at a file
that does not exist. The two prefixes are deliberately not byte-identical — if
Cursor ever gains an output limit, its gate needs the same edit.
```

Replace with:

```
**Codex truncation:** Codex caps injected context at `additionalContextLimit`
(2500) and spills the remainder to a file. The plugin gate's message therefore
tells the agent to read that saved hook-output file when its host truncated the
output, instead of claiming the whole strategy is inline.
```

Find (a few lines below, in the surrounding prose about per-harness enforcement — locate the line naming Cursor as a shipped harness):

```
**Claude Code:** the gates ship with the plugin — no repo-local hook config needed.

**Codex:** the gates ship with the plugin and observe explicit
`$superpowers:...` prompts only; implicit skill selection does not produce a
```

Read the rest of this paragraph in the file (it continues past what's quoted above) to find where Cursor is introduced as a third harness, and remove that paragraph/bullet entirely, since Cursor is no longer a supported harness. Search the file for the string `Cursor` after this point and remove each remaining mention, keeping the surrounding Claude Code / Codex prose intact.

- [ ] **Step 4: Search the three edited files for any remaining `Cursor` mentions**

Run: `grep -in cursor AGENTS.md skills/init/SKILL.md references/PLAYBOOK.md`
Expected: no output (empty). If any line prints, read its context and remove or rewrite it consistent with the edits above — do not leave a partial mention.

- [ ] **Step 5: Run the full test suite one more time**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS. Documentation changes don't affect test assertions, but this confirms nothing in the doc edits accidentally touched code.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md skills/init/SKILL.md references/PLAYBOOK.md
git commit -m "docs: remove Cursor support docs; document runtime doctrine injection"
```

---

## Final Verification

- [ ] **Step 1: Run the entire suite once more from a clean state**

Run: `node --test scripts/lib/__tests__/*.test.mjs`
Expected: PASS, 0 failures.

- [ ] **Step 2: Manually exercise `doctrine-gate.sh` against this repo itself**

Run:
```bash
echo '{"hook_event_name":"SessionStart","source":"startup","cwd":"'"$(pwd)"'"}' | CLAUDE_PROJECT_DIR="$(pwd)" bash hooks/doctrine-gate.sh | jq .
```
Expected: JSON with `.hookSpecificOutput.hookEventName == "SessionStart"` and `.hookSpecificOutput.additionalContext` containing the text `Spec-Driven Development (loomwork)` (loomwork's own repo has `docs/superpowers/specs/`, so it is opted in).

- [ ] **Step 3: Manually exercise `init.mjs` against a disposable repo to confirm no Cursor artifacts and correct legacy-block stripping**

```bash
tmp=$(mktemp -d)
git -C "$tmp" init -q
printf '# Agents\n\n<!-- loomwork:begin -->\nstale\n<!-- loomwork:end -->\n' > "$tmp/AGENTS.md"
node scripts/init.mjs 2>&1 || true
```
Note: `scripts/init.mjs` resolves its root via `resolveRepoRoot()`, which uses `CLAUDE_PROJECT_DIR` or walks up from `process.cwd()` — run it with `cd`:
```bash
(cd "$tmp" && node "$OLDPWD/scripts/init.mjs")
cat "$tmp/AGENTS.md"
ls "$tmp/.cursor" 2>&1
rm -rf "$tmp"
```
Expected: `AGENTS.md` no longer contains the `loomwork:begin`/`loomwork:end` markers or `stale`; `ls "$tmp/.cursor"` reports `No such file or directory`.

This step is exploratory verification, not a new automated test — the equivalent behavior is already covered by Task 3's and Task 4's test suites.
