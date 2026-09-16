# Native Codex Plugin Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Loomwork as a portable Codex plugin, expose its initializer as a skill, and run its lifecycle gates for explicit Codex skill invocations without regressing Claude Code or Cursor.

**Architecture:** A root Agent Plugins manifest is the portable entry point and selects a Codex-specific hook registration file. The existing Bash gates become dual-event adapters: Claude continues sending `PostToolUse`/`Skill`, while Codex sends `UserPromptSubmit` with an explicit `$superpowers:...` prompt. Initialization remains one Node implementation, reached from both the Claude command and the new portable skill.

**Tech Stack:** Agent Plugins JSON manifests, Codex/Claude hook JSON, Bash + `jq`, Node.js ES modules with `node:test` and `node:assert/strict`, Markdown skills and documentation. No dependencies or build step.

**Spec:** `docs/superpowers/specs/2026-09-16-codex-cli-compatibility-design.md`

## Global Constraints

- The root `plugin.json` uses `$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`; `.codex-plugin/plugin.json` is not added because it is only a compatibility fallback for packages without the canonical root manifest.
- Preserve `.claude-plugin/plugin.json`, `commands/init.md`, `hooks/hooks.json`, and every Cursor template as supported compatibility surfaces.
- Codex gates cover explicit `$superpowers:brainstorming`, `$superpowers:writing-plans`, and `$superpowers:finishing-a-development-branch` prompts only; do not claim detection of implicit skill selection.
- Hook scripts resolve the consumer root in this order: non-empty `CLAUDE_PROJECT_DIR`, then non-empty input `.cwd`; strategy-gate remains silent if neither resolves.
- Hook output remains `{ "hookSpecificOutput": { "hookEventName": <incoming event>, "additionalContext": <message> } }` for both Claude and Codex.
- `STRATEGY.md` remains owned by `compound-engineering:ce-strategy`; no task creates, seeds, or edits it.
- A fresh consumer repository creates `AGENTS.md`. Existing memory files and existing loomwork marker blocks are never relocated or duplicated.
- Bash files stay LF and retain `set -euo pipefail`.
- Tests use only Node's built-in test runner. Full validation is `node --test scripts/lib/__tests__/*.test.mjs`.
- Commit subjects use Conventional Commits and reference issue `#3`.

---

### Task 1: Add the portable plugin manifest and Codex hook registration

**Files:**
- Create: `plugin.json`
- Create: `hooks/codex-hooks.json`
- Create: `scripts/lib/__tests__/plugin.test.mjs`
- Read-only compatibility reference: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: existing package identity from `.claude-plugin/plugin.json`; existing gate entry points `hooks/strategy-gate.sh` and `hooks/close-out-gate.sh`.
- Produces: canonical portable manifest `plugin.json`; Codex lifecycle config at `hooks/codex-hooks.json`, referenced by `extensions.com.openai.hooks`.

- [ ] **Step 1: Write failing manifest and hook-registration tests**

Create `scripts/lib/__tests__/plugin.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('portable manifest identifies loomwork and registers Codex hooks', () => {
  const manifest = readJson('plugin.json');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'loomwork');
  assert.equal(manifest.extensions.com.openai.hooks, './hooks/codex-hooks.json');
});

test('portable and Claude manifests keep shared identity aligned', () => {
  const portable = readJson('plugin.json');
  const claude = readJson('.claude-plugin/plugin.json');
  for (const field of ['name', 'version', 'description']) {
    assert.equal(portable[field], claude[field], `${field} differs between manifests`);
  }
});

test('Codex hooks run both gates before explicit skill prompts', () => {
  const config = readJson('hooks/codex-hooks.json');
  const groups = config.hooks.UserPromptSubmit;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matcher, undefined);
  assert.deepEqual(
    groups[0].hooks.map((hook) => hook.command),
    [
      'bash "${PLUGIN_ROOT}/hooks/strategy-gate.sh"',
      'bash "${PLUGIN_ROOT}/hooks/close-out-gate.sh"',
    ],
  );
  for (const hook of groups[0].hooks) {
    assert.equal(hook.type, 'command');
    assert.equal(hook.additionalContextLimit, 2500);
  }
});
```

- [ ] **Step 2: Run the test and verify the missing files fail**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`

Expected: FAIL with `ENOENT` for `plugin.json`.

- [ ] **Step 3: Add the canonical portable manifest**

Create `plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "loomwork",
  "version": "0.3.0",
  "description": "SDD lifecycle glue for superpowers + compound-engineering: status-frontmatter convention, drift audit, pre-merge close-out, and strategy/close-out hook gates. One loom, one status surface.",
  "author": {
    "name": "Pavlo Kvas"
  },
  "repository": "https://github.com/kvasanova/loomwork",
  "extensions": {
    "com.openai": {
      "hooks": "./hooks/codex-hooks.json"
    }
  }
}
```

- [ ] **Step 4: Add Codex's prompt lifecycle registration**

Create `hooks/codex-hooks.json`:

```json
{
  "description": "Loomwork strategy and close-out gates for explicit Codex skill invocations.",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${PLUGIN_ROOT}/hooks/strategy-gate.sh\"",
            "additionalContextLimit": 2500
          },
          {
            "type": "command",
            "command": "bash \"${PLUGIN_ROOT}/hooks/close-out-gate.sh\"",
            "additionalContextLimit": 2500
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: Run the focused test**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`

Expected: PASS with 3 tests.

- [ ] **Step 6: Commit the package entry points**

```bash
git add plugin.json hooks/codex-hooks.json scripts/lib/__tests__/plugin.test.mjs
git commit -m "feat(plugin): add portable Codex package entry point (#3)"
```

---

### Task 2: Make the shared gates understand Codex prompt events

**Files:**
- Modify: `hooks/strategy-gate.sh`
- Modify: `hooks/close-out-gate.sh`
- Modify: `scripts/lib/__tests__/hooks.test.mjs`

**Interfaces:**
- Consumes: `UserPromptSubmit` input `{ hook_event_name, prompt, cwd }` from Task 1; existing Claude input `{ hook_event_name: "PostToolUse", tool_name: "Skill", tool_input: { skill } }`.
- Produces: `hookSpecificOutput.hookEventName` equal to the incoming event and `additionalContext` containing the existing strategy/close-out text.

- [ ] **Step 1: Extend the test helper without changing existing callers**

Replace `runHook` in `scripts/lib/__tests__/hooks.test.mjs` with:

```js
function runHook(script, stdinObj, projectDir) {
  const projectEnv = projectDir ? { CLAUDE_PROJECT_DIR: projectDir } : {};
  return spawnSync('bash', [path.join(HOOKS_DIR, script)], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    env: { ...process.env, ...projectEnv },
  });
}
```

Add this helper after `skillEvent`:

```js
function codexPromptEvent(prompt, cwd) {
  return { hook_event_name: 'UserPromptSubmit', prompt, cwd };
}
```

- [ ] **Step 2: Write failing Codex strategy-gate tests**

Add:

```js
test('strategy-gate injects strategy for an explicit Codex brainstorming prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'codex-strategy-marker\n');
  const result = runHook(
    'strategy-gate.sh',
    codexPromptEvent('$superpowers:brainstorming design issue 3', root),
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /codex-strategy-marker/);
});

test('strategy-gate nudges for an explicit Codex writing-plans prompt without strategy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook(
    'strategy-gate.sh',
    codexPromptEvent('$superpowers:writing-plans', root),
  );
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /compound-engineering:ce-strategy/);
});

test('strategy-gate ignores unrelated Codex prompts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook('strategy-gate.sh', codexPromptEvent('fix the parser', root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});
```

- [ ] **Step 3: Write failing Codex close-out-gate tests**

Add:

```js
test('close-out-gate reminds on an explicit Codex finishing prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/plans' }));
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('$superpowers:finishing-a-development-branch', root),
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/plans/);
  assert.match(out.hookSpecificOutput.additionalContext, /loomwork:close-out/);
});

test('close-out-gate ignores unrelated Codex prompts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook('close-out-gate.sh', codexPromptEvent('$superpowers:brainstorming', root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});
```

- [ ] **Step 4: Run the focused tests and verify the Codex cases fail**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs`

Expected: FAIL in the new Codex cases because both gates currently read only `.tool_input.skill`; existing Claude cases remain green.

- [ ] **Step 5: Add dual-event selection and portable root selection to strategy-gate**

In `hooks/strategy-gate.sh`, replace the `skill` extraction and matcher with:

```bash
event=$(echo "$input" | jq -r '.hook_event_name // empty')
case "$event" in
  PostToolUse)
    invocation=$(echo "$input" | jq -r '.tool_input.skill // empty')
    echo "$invocation" | grep -qE '(^|:)brainstorming$|(^|:)writing-plans$' || exit 0
    ;;
  UserPromptSubmit)
    invocation=$(echo "$input" | jq -r '.prompt // empty')
    echo "$invocation" | grep -qE '\$superpowers:(brainstorming|writing-plans)([^[:alnum:]_-]|$)' || exit 0
    ;;
  *)
    exit 0
    ;;
esac
```

Replace the root assignment with:

```bash
payload_root=$(echo "$input" | jq -r '.cwd // empty')
root="${CLAUDE_PROJECT_DIR:-$payload_root}"
```

In both output branches, pass `--arg event "$event"` to `jq` and replace the
hard-coded event value with `hookEventName: $event`. For example, the missing
file branch becomes:

```bash
jq -n --arg event "$event" --arg nudge "$nudge" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $nudge } }'
```

- [ ] **Step 6: Add the same event adapter to close-out-gate**

In `hooks/close-out-gate.sh`, replace the `skill` extraction and matcher with:

```bash
event=$(echo "$input" | jq -r '.hook_event_name // empty')
case "$event" in
  PostToolUse)
    invocation=$(echo "$input" | jq -r '.tool_input.skill // empty')
    echo "$invocation" | grep -qE '(^|:)finishing-a-development-branch$' || exit 0
    ;;
  UserPromptSubmit)
    invocation=$(echo "$input" | jq -r '.prompt // empty')
    echo "$invocation" | grep -qE '\$superpowers:finishing-a-development-branch([^[:alnum:]_-]|$)' || exit 0
    ;;
  *)
    exit 0
    ;;
esac
```

Replace its root assignment with:

```bash
payload_root=$(echo "$input" | jq -r '.cwd // empty')
root="${CLAUDE_PROJECT_DIR:-$payload_root}"
```

Pass the event through the final `jq` call:

```bash
jq -n --arg event "$event" --arg msg "$msg" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $msg } }'
```

- [ ] **Step 7: Run hook and full regression tests**

Run: `node --test scripts/lib/__tests__/hooks.test.mjs scripts/lib/__tests__/cursor-hooks.test.mjs`

Expected: PASS. The Claude cases prove `PostToolUse` compatibility; the Cursor suite proves its separate templates were not affected.

Run: `node --test scripts/lib/__tests__/*.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit the dual-runtime gates**

```bash
git add hooks/strategy-gate.sh hooks/close-out-gate.sh scripts/lib/__tests__/hooks.test.mjs
git commit -m "feat(hooks): support explicit Codex skill prompts (#3)"
```

---

### Task 3: Add the portable init skill and prefer AGENTS.md for fresh repositories

**Files:**
- Create: `skills/init/SKILL.md`
- Modify: `scripts/init.mjs`
- Modify: `scripts/lib/__tests__/init.test.mjs`
- Modify: `scripts/lib/__tests__/plugin.test.mjs`
- Modify: `commands/init.md`

**Interfaces:**
- Consumes: `initRepo(repoRoot, pluginRoot)` and CLI behavior from `scripts/init.mjs`; the installed location of `skills/init/SKILL.md`.
- Produces: `loomwork:init` as a discoverable skill; fresh-repository memory path `AGENTS.md`; unchanged handling of existing memory files.

- [ ] **Step 1: Write failing tests for the fresh memory file and init skill**

In the first test in `scripts/lib/__tests__/init.test.mjs`, replace the final memory-file assertions with:

```js
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
assert.match(agents, /<!-- loomwork:begin -->/);
assert.match(agents, /<!-- loomwork:end -->/);
assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));
```

Add this case to `scripts/lib/__tests__/plugin.test.mjs`:

```js
test('init skill exposes a host-neutral skill-relative entry point', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/init/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: init\n/m);
  assert.match(skill, /\.\.\/\.\.\/scripts\/init\.mjs/);
  assert.doesNotMatch(skill, /PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/plugin.test.mjs`

Expected: FAIL with `ENOENT` for the fresh repository's `AGENTS.md` and for
the missing `skills/init/SKILL.md`.

- [ ] **Step 3: Change only the no-existing-file default**

In `scripts/init.mjs`, replace:

```js
const memoryFile =
  memoryCandidates.find((p) => fs.existsSync(p)) ?? path.join(repoRoot, 'CLAUDE.md');
```

with:

```js
const memoryFile =
  memoryCandidates.find((p) => fs.existsSync(p)) ?? path.join(repoRoot, 'AGENTS.md');
```

Update the adjacent comment so it states that existing `AGENTS.md` wins,
existing `CLAUDE.md` remains supported, and a repository with neither creates
`AGENTS.md`.

- [ ] **Step 4: Run initialization tests**

Run: `node --test scripts/lib/__tests__/init.test.mjs`

Expected: PASS, including existing-file precedence, legacy block placement, and idempotency cases.

- [ ] **Step 5: Add the init skill**

Create `skills/init/SKILL.md` with this complete workflow:

````markdown
---
name: init
description: Initialize the current consumer repository for loomwork by scaffolding SDD directories, Cursor hook mirrors, and the marker-guarded AGENTS.md or CLAUDE.md guidance block. Use when setting up loomwork in a repository or refreshing copied Cursor hooks after a plugin update.
---

# Initialize Loomwork

Announce: "Using loomwork:init to initialize this repository."

## 1. Dependency preflight

Before writing anything, verify the available-skills list contains all of:

- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:finishing-a-development-branch`
- `compound-engineering:ce-strategy`
- `compound-engineering:ce-compound`

If any are missing, stop without writing. Name the missing plugin and tell the
user to install it from its configured marketplace, then rerun `loomwork:init`.

## 2. Run the scaffolder

Resolve `../../scripts/init.mjs` relative to the directory containing this
installed `SKILL.md`. Execute the resolved absolute path with the consumer
repository as the command working directory:

```bash
node ../../scripts/init.mjs
```

The command above names a skill-relative resource, not a path relative to the
shell's working directory. Resolve it to an absolute path from this `SKILL.md`
before executing it, while leaving the shell working directory at the consumer
repository. Do not look up the plugin from the consumer repository and do not
require a plugin-root environment variable.

The script creates missing spec, plan, and solution directories; installs or
refreshes the Cursor hook mirrors; and adds one marker-guarded loomwork block.
It prefers an existing `AGENTS.md`, otherwise an existing `CLAUDE.md`, and
creates `AGENTS.md` when neither exists. Paths come from `.loomwork.json` when
present. The script never creates or edits the strategy file.

## 3. Route missing strategy ownership

If the action list says the configured strategy file is missing, invoke
`compound-engineering:ce-strategy` to author it before reporting completion.
If the file already exists, skip this step. Never author or edit it directly.

## 4. Report

Relay the script's action list, mention that Codex users must review and trust
plugin hooks through `/hooks`, and suggest committing newly created files.
````

- [ ] **Step 6: Align the Claude command wording**

In `commands/init.md`:

- Change the frontmatter description to `Scaffold the SDD layout (docs dirs, Cursor hooks, AGENTS.md/CLAUDE.md block) in the current repo`.
- Change Step 2's output description from `a marker-guarded loomwork block in CLAUDE.md (or AGENTS.md)` to `a marker-guarded loomwork block in AGENTS.md (or an existing CLAUDE.md)`.
- Keep the command's `${CLAUDE_PLUGIN_ROOT}` invocation because this file remains the Claude-specific command surface.

- [ ] **Step 7: Scan the skill and rerun the full suite**

Run:

```bash
skillspector scan skills/init --no-llm
node --test scripts/lib/__tests__/*.test.mjs
```

Expected: SkillSpector reports no blocking static finding and the full Node
suite passes, including the new skill metadata/path test.

- [ ] **Step 8: Commit the portable initializer**

```bash
git add skills/init/SKILL.md scripts/init.mjs scripts/lib/__tests__/init.test.mjs scripts/lib/__tests__/plugin.test.mjs commands/init.md
git commit -m "feat(init): add portable loomwork init skill (#3)"
```

---

### Task 4: Remove the audit skill's Claude-only plugin-root assumption

**Files:**
- Modify: `skills/audit/SKILL.md`
- Modify: `scripts/lib/__tests__/plugin.test.mjs`

**Interfaces:**
- Consumes: the installed location of `skills/audit/SKILL.md`.
- Produces: portable instructions that invoke `scripts/sdd-audit.mjs` by resolving it from the skill file while keeping the consumer repository as `cwd`.

- [ ] **Step 1: Write the failing audit-skill portability test**

Add this case to `scripts/lib/__tests__/plugin.test.mjs`:

```js
test('audit skill resolves its CLI relative to the installed skill', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/audit/SKILL.md'), 'utf8');
  assert.match(skill, /\.\.\/\.\.\/scripts\/sdd-audit\.mjs/);
  assert.doesNotMatch(skill, /PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the test and verify the Claude-only command fails**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs`

Expected: FAIL because the current audit skill contains
`${CLAUDE_PLUGIN_ROOT}/scripts/sdd-audit.mjs` and no skill-relative path.

- [ ] **Step 3: Replace the audit command with skill-relative resolution**

In `skills/audit/SKILL.md`, replace the sentence and command under `## Run`
with:

````markdown
From anywhere inside the consumer repository, resolve
`../../scripts/sdd-audit.mjs` relative to the directory containing this
installed `SKILL.md`. Execute the resolved absolute path with the consumer
repository as the command working directory:

```bash
node ../../scripts/sdd-audit.mjs
```

The command above names a skill-relative resource, not a path relative to the
shell's working directory. Resolve it to an absolute path from this `SKILL.md`
before executing it, while leaving the shell working directory at the consumer
repository. Do not look up the plugin from the consumer repository and do not
require a plugin-root environment variable. Append any requested audit flags
to this command.
````

Change the final error-code explanation from `means run /loomwork:init` to
`means run loomwork:init` so it applies to both slash-command and skill syntax.

- [ ] **Step 4: Scan both changed skills**

Run:

```bash
skillspector scan skills/init --no-llm
skillspector scan skills/audit --no-llm
```

Expected: both scans complete with no blocking static finding.

- [ ] **Step 5: Run skill and audit CLI regression tests**

Run: `node --test scripts/lib/__tests__/plugin.test.mjs scripts/lib/__tests__/cli.test.mjs scripts/lib/__tests__/config.test.mjs`

Expected: PASS. The skill test proves host-neutral lookup; the CLI tests prove
the underlying command still resolves consumer repositories by explicit Claude
override or by walking upward from `cwd`.

- [ ] **Step 6: Commit the portable audit invocation**

```bash
git add skills/audit/SKILL.md scripts/lib/__tests__/plugin.test.mjs
git commit -m "fix(skills): resolve audit script in Codex and Claude (#3)"
```

---

### Task 5: Document the portable runtime and verify the complete feature

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `references/PLAYBOOK.md`
- Verify: `docs/superpowers/specs/2026-09-16-codex-cli-compatibility-design.md`

**Interfaces:**
- Consumes: manifest, hooks, skill invocation, and initialization behavior delivered by Tasks 1–4.
- Produces: user-facing installation guidance and contributor invariants that accurately describe all three runtimes.

- [ ] **Step 1: Update README installation and shipped-surface documentation**

Make these concrete edits in `README.md`:

- Split `## Install` into `### Claude Code` and `### Codex` subsections.
- Retain the existing Claude commands unchanged.
- Add the Codex commands:

```bash
codex plugin marketplace add kvasanova/toolshed
codex plugin add loomwork@toolshed
```

- Show Codex initialization as `$loomwork:init` and Claude initialization as `/loomwork:init`.
- State that fresh repositories receive `AGENTS.md`; an existing `CLAUDE.md` remains supported.
- Rename `Hook gates (Claude Code)` in the What ships table to `Hook gates (Claude Code + Codex)` and state that Codex observes explicit `$superpowers:...` prompts through `UserPromptSubmit`.
- Add the trust requirement: Codex skips plugin-bundled hooks until the user reviews and trusts them through `/hooks`.
- Keep the Cursor refresh and Windows `bash` guidance unchanged.

- [ ] **Step 2: Update contributor runtime invariants**

In `AGENTS.md`:

- Change the repository overview to name `plugin.json` as the portable manifest and `.claude-plugin/plugin.json` as the Claude compatibility manifest.
- Under hooks, document `hooks/codex-hooks.json` as the Codex `UserPromptSubmit` registration and `hooks/hooks.json` as Claude's `PostToolUse` registration.
- State that shared gate scripts accept both payloads, derive Codex's consumer root from `.cwd`, and emit the incoming event name.
- Preserve the existing rules about broad matching, in-script skill discrimination, Cursor command spelling, LF endings, and pinned upstream names.

In `CLAUDE.md`, replace the opening claim that the repository is a Claude Code
plugin with wording that it is a portable plugin retaining Claude-specific
runtime surfaces. Keep its Claude environment-variable details because they
remain relevant to Claude sessions.

- [ ] **Step 3: Update the playbook runtime table**

In `references/PLAYBOOK.md`, extend the strategy and close-out hook rows to
include Codex's `hooks/codex-hooks.json → UserPromptSubmit` path and its explicit
`$superpowers:...` limitation. Do not change the doctrine, lifecycle statuses,
or `STRATEGY.md` ownership rules.

- [ ] **Step 4: Run static skill security scanning**

Run: `skillspector scan skills/ --no-llm`

Expected: scan completes. Review every finding; no high-severity malicious or
credential-exfiltration finding may remain unexplained. If the scanner flags
the documented shell commands, confirm they are limited to the plugin's own
scripts and the current consumer repository.

- [ ] **Step 5: Run final verification**

Run:

```bash
node --test scripts/lib/__tests__/*.test.mjs
node scripts/sdd-audit.mjs --offline
git diff --check
git status --short
```

Expected:

- Node reports zero failing tests.
- The offline audit may report this newly approved spec as unimplemented until
  close-out; it must not exit `2` or report a parse/configuration error.
- `git diff --check` exits `0` with no whitespace errors.
- `git status --short` lists only the issue #3 implementation and its spec/plan artifacts.

- [ ] **Step 6: Check acceptance criteria line by line**

Run:

```bash
test -f plugin.json
test -f hooks/codex-hooks.json
test -f skills/init/SKILL.md
grep -q '"./hooks/codex-hooks.json"' plugin.json
grep -q 'UserPromptSubmit' hooks/codex-hooks.json
! grep -q 'PLUGIN_ROOT\|CLAUDE_PLUGIN_ROOT' skills/init/SKILL.md
! grep -q 'PLUGIN_ROOT\|CLAUDE_PLUGIN_ROOT' skills/audit/SKILL.md
grep -q 'AGENTS.md' scripts/init.mjs
```

Expected: every command exits `0`. Then compare the spec's nine acceptance
checkboxes against the test and scan output; leave any unmet item unchecked for
close-out rather than weakening the criterion.

- [ ] **Step 7: Commit documentation and implementation records**

```bash
git add README.md AGENTS.md CLAUDE.md references/PLAYBOOK.md docs/superpowers/specs/2026-09-16-codex-cli-compatibility-design.md docs/superpowers/plans/2026-09-16-codex-cli-compatibility.md
git commit -m "docs: document native Codex compatibility (#3)"
```

- [ ] **Step 8: Prepare close-out after a PR exists**

After pushing and opening the feature PR, invoke `loomwork:close-out` with issue
`#3`, this plan, and the paired spec. The close-out commit must add the plan's
DONE banner, set the spec to `implemented`, record `implemented_in: "PR #N"`
and `verified: 2026-09-16`, and tick only acceptance criteria supported by the
fresh verification evidence.
