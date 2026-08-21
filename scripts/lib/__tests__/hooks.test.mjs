import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HOOKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../hooks');

function runHook(script, stdinObj, projectDir) {
  return spawnSync('bash', [path.join(HOOKS_DIR, script)], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

function skillEvent(skill) {
  return { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill } };
}

test('strategy-gate fires on plugin-qualified brainstorming with default STRATEGY.md', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), '# My Strategy\ncontent-marker-42\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /content-marker-42/);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('strategy-gate tells agents not to open the strategy file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'content-marker-42\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /do NOT Read or open the strategy file/);
  assert.doesNotMatch(context, /read it before/i);
});

test('strategy-gate honors custom strategyFile from .loomwork.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/VISION.md'), 'vision-marker-7\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:writing-plans'), root);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /vision-marker-7/);
});

test('strategy-gate stays silent on non-matching skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'x\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:test-driven-development'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

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

test('strategy-gate missing-file nudge honors custom strategyFile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'decoy-should-not-be-injected\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.doesNotMatch(context, /decoy-should-not-be-injected/);
});

test('strategy-gate stays silent when CLAUDE_PROJECT_DIR is unset', () => {
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('close-out-gate fires on finishing-a-development-branch with configured plansDir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/plans' }));
  const result = runHook(
    'close-out-gate.sh',
    skillEvent('superpowers:finishing-a-development-branch'),
    root,
  );
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/plans/);
  assert.match(out.hookSpecificOutput.additionalContext, /loomwork:close-out/);
});

test('close-out-gate stays silent on non-matching skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('close-out-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
