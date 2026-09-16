import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TPL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/cursor');

function runHook(script, stdinObj) {
  return spawnSync('bash', [path.join(TPL_DIR, script)], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
  });
}

function strategyRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-cursor-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'cursor-marker-9\n');
  return root;
}

test('cursor strategy gate fires on beforeSubmitPrompt slash command', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt: '/writing-plans docs/specs/foo.md',
    workspace_roots: [root],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).additional_context, /cursor-marker-9/);
});

test('cursor strategy gate fires on postToolUse Skill', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    workspace_roots: [root],
  });
  assert.match(JSON.parse(result.stdout).additional_context, /cursor-marker-9/);
});

test('cursor strategy gate silent on unrelated prompt', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt: 'fix the login bug',
    workspace_roots: [root],
  });
  assert.equal(result.stdout.trim(), '');
});

test('cursor strategy gate tells agents not to open the strategy file', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'postToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    workspace_roots: [root],
  });
  const context = JSON.parse(result.stdout).additional_context;
  assert.match(context, /do NOT Read or open the strategy file/);
  assert.doesNotMatch(context, /read it before/i);
});

test('cursor hooks.json invokes every script through an explicit bash', () => {
  const template = JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'hooks.json'), 'utf8'));
  for (const entry of Object.values(template.hooks).flat()) {
    assert.match(entry.command, /^bash \.cursor\/hooks\/loomwork-/);
  }
});

test('cursor close-out gate fires on beforeSubmitPrompt finishing prompt', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-close-out-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt: '/finishing-a-development-branch',
    workspace_roots: [root],
  });
  assert.match(JSON.parse(result.stdout).additional_context, /loomwork:close-out/);
});

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

// Long-prompt regressions for the Cursor mirrors. These gates matched with
// `echo "$prompt" | grep -qiE`, where grep's early exit closes the pipe while
// echo is still writing; under `set -o pipefail` the gate then exited 0 with no
// output — a silent no-op. `beforeSubmitPrompt` carries the RAW user prompt, so
// a pasted log was enough to disable the gate.
//
// Both conditions are required, measured against the pre-fix Cursor gates:
// a NEWLINE after the trigger (single-line never reproduced at any size) and a
// tail past the 64KB pipe buffer (64KB -> 0/10 dropped, 128KB -> 10/10).
const CURSOR_LONG_TAIL = `\n${'padding-text-to-force-a-large-pipe-buffer '.repeat(
  Math.ceil((192 * 1024) / 42),
)}`;

test('cursor strategy gate survives a pasted multi-kilobyte prompt', () => {
  const root = strategyRepo();
  const prompt = `brainstorming${CURSOR_LONG_TAIL}`;
  assert.ok(prompt.includes('\n'), 'the trigger must be followed by a newline');
  assert.ok(prompt.length > 128 * 1024);
  const result = runHook('loomwork-strategy-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt,
    workspace_roots: [root],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).additional_context, /cursor-marker-9/);
});

test('cursor close-out gate survives a pasted multi-kilobyte prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-cursor-'));
  const prompt = `finishing-a-development-branch${CURSOR_LONG_TAIL}`;
  assert.ok(prompt.includes('\n'), 'the trigger must be followed by a newline');
  assert.ok(prompt.length > 128 * 1024);
  const result = runHook('loomwork-close-out-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt,
    workspace_roots: [root],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).additional_context, /loomwork:close-out/);
});

test('cursor strategy gate keeps case-insensitive prompt matching', () => {
  const root = strategyRepo();
  for (const prompt of ['Brainstorming the design', 'BRAINSTORMING', '/Writing-Plans foo.md']) {
    const result = runHook('loomwork-strategy-gate.sh', {
      hook_event_name: 'beforeSubmitPrompt',
      prompt,
      workspace_roots: [root],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).additional_context, /cursor-marker-9/, prompt);
  }
});

test('cursor strategy gate still requires a word boundary', () => {
  const root = strategyRepo();
  for (const prompt of ['mybrainstorming', 'brainstormingx']) {
    const result = runHook('loomwork-strategy-gate.sh', {
      hook_event_name: 'beforeSubmitPrompt',
      prompt,
      workspace_roots: [root],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '', prompt);
  }
});
