import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initRepo } from '../../init.mjs';

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function freshRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-init-'));
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

test('initRepo scaffolds a fresh repo and is idempotent', () => {
  const root = freshRepo();
  const first = initRepo(root, PLUGIN_ROOT);
  assert.ok(first.length > 0);
  assert.ok(fs.existsSync(path.join(root, 'docs/superpowers/specs')));
  assert.ok(fs.existsSync(path.join(root, 'docs/superpowers/plans')));
  assert.ok(fs.existsSync(path.join(root, 'docs/solutions')));
  assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks.json')));
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks/loomwork-strategy-gate.sh')));
  assert.ok(fs.existsSync(path.join(root, '.cursor/hooks/loomwork-close-out-gate.sh')));
  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /<!-- loomwork:begin -->/);
  assert.match(claude, /<!-- loomwork:end -->/);

  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, []);
});

test('initRepo respects custom paths from .loomwork.json', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, '.loomwork.json'),
    JSON.stringify({ specsDir: 'docs/specs', plansDir: 'docs/plans', strategyFile: 'VISION.md' }),
  );
  initRepo(root, PLUGIN_ROOT);
  assert.ok(fs.existsSync(path.join(root, 'docs/specs')));
  assert.ok(fs.existsSync(path.join(root, 'docs/plans')));
  assert.ok(fs.existsSync(path.join(root, 'VISION.md')));
});

test('initRepo never overwrites an existing strategy file', () => {
  const root = freshRepo();
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'MY EXISTING STRATEGY\n');
  initRepo(root, PLUGIN_ROOT);
  assert.equal(fs.readFileSync(path.join(root, 'STRATEGY.md'), 'utf8'), 'MY EXISTING STRATEGY\n');
});

test('initRepo merges into an existing .cursor/hooks.json, preserving foreign entries', () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cursor/hooks.json'),
    JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: [{ command: '.cursor/hooks/other.sh' }] } }),
  );
  initRepo(root, PLUGIN_ROOT);
  const merged = JSON.parse(fs.readFileSync(path.join(root, '.cursor/hooks.json'), 'utf8'));
  const cmds = merged.hooks.beforeSubmitPrompt.map((e) => e.command);
  assert.ok(cmds.includes('.cursor/hooks/other.sh'));
  assert.ok(cmds.includes('bash .cursor/hooks/loomwork-strategy-gate.sh'));
  assert.equal(merged.hooks.postToolUse.length, 2);
});

test('initRepo migrates legacy loomwork hook entries instead of duplicating them', () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cursor/hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        beforeSubmitPrompt: [
          { command: '.cursor/hooks/loomwork-strategy-gate.sh' },
          { command: '.cursor/hooks/loomwork-close-out-gate.sh' },
        ],
        postToolUse: [
          { command: '.cursor/hooks/loomwork-strategy-gate.sh', matcher: 'Read|Skill' },
          { command: '.cursor/hooks/loomwork-close-out-gate.sh', matcher: 'Read|Skill' },
        ],
      },
    }),
  );
  initRepo(root, PLUGIN_ROOT);
  const merged = JSON.parse(fs.readFileSync(path.join(root, '.cursor/hooks.json'), 'utf8'));

  assert.equal(merged.hooks.beforeSubmitPrompt.length, 2);
  assert.equal(merged.hooks.postToolUse.length, 2);
  for (const entry of Object.values(merged.hooks).flat()) {
    assert.match(entry.command, /^bash \.cursor\/hooks\/loomwork-/);
  }
  for (const entry of merged.hooks.postToolUse) {
    assert.equal(entry.matcher, 'Read|Skill');
  }
});

test('initRepo re-copies Cursor hook scripts when they drift from the templates', () => {
  const root = freshRepo();
  initRepo(root, PLUGIN_ROOT);
  const gate = path.join(root, '.cursor/hooks/loomwork-strategy-gate.sh');
  fs.writeFileSync(gate, '#!/usr/bin/env bash\n# stale copy\n');

  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.some((a) => a.includes('loomwork-strategy-gate.sh')));
  assert.match(fs.readFileSync(gate, 'utf8'), /do NOT Read or open the strategy file/);
});

test('initRepo appends to AGENTS.md when CLAUDE.md is absent and AGENTS.md exists', () => {
  const root = freshRepo();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents\n');
  initRepo(root, PLUGIN_ROOT);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /<!-- loomwork:begin -->/);
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));
});
