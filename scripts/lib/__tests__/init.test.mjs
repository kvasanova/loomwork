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
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.ok(first.some((a) => a.includes('STRATEGY.md') && a.includes('ce-strategy')));
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));

  // Second run performs no writes. The missing-strategy-file action persists
  // by design — the condition is still true until someone runs ce-strategy.
  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, [`STRATEGY.md is missing — run compound-engineering:ce-strategy to author it`]);
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
  assert.ok(!fs.existsSync(path.join(root, 'VISION.md')));

  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.some((a) => a.includes('VISION.md') && a.includes('ce-strategy')));
});

test('initRepo never overwrites an existing strategy file', () => {
  const root = freshRepo();
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'MY EXISTING STRATEGY\n');
  initRepo(root, PLUGIN_ROOT);
  assert.equal(fs.readFileSync(path.join(root, 'STRATEGY.md'), 'utf8'), 'MY EXISTING STRATEGY\n');
});

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
