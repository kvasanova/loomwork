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

test('cursor close-out gate fires on beforeSubmitPrompt finishing prompt', () => {
  const root = strategyRepo();
  const result = runHook('loomwork-close-out-gate.sh', {
    hook_event_name: 'beforeSubmitPrompt',
    prompt: '/finishing-a-development-branch',
    workspace_roots: [root],
  });
  assert.match(JSON.parse(result.stdout).additional_context, /loomwork:close-out/);
});
