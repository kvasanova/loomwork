import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, loadConfig, resolveRepoRoot } from '../config.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-'));
}

test('loadConfig returns defaults when .loomwork.json is absent', () => {
  const root = tmpDir();
  assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
});

test('loadConfig merges custom paths over defaults', () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  const config = loadConfig(root);
  assert.equal(config.specsDir, 'docs/specs');
  assert.equal(config.plansDir, DEFAULT_CONFIG.plansDir);
  assert.equal(config.strategyFile, DEFAULT_CONFIG.strategyFile);
});

test('loadConfig falls back to defaults on malformed JSON', () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, '.loomwork.json'), '{ not json');
  assert.deepEqual(loadConfig(root), DEFAULT_CONFIG);
});

test('resolveRepoRoot prefers CLAUDE_PROJECT_DIR', () => {
  assert.equal(resolveRepoRoot({ CLAUDE_PROJECT_DIR: '/some/root' }, '/elsewhere'), '/some/root');
});

test('resolveRepoRoot walks up to nearest .git ancestor', () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, '.git'));
  const nested = path.join(root, 'apps/web');
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(resolveRepoRoot({}, nested), root);
});

test('resolveRepoRoot accepts .loomwork.json as a root marker', () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, '.loomwork.json'), '{}');
  const nested = path.join(root, 'src');
  fs.mkdirSync(nested);
  assert.equal(resolveRepoRoot({}, nested), root);
});

test('resolveRepoRoot throws actionably when no marker found', () => {
  const bare = tmpDir();
  assert.throws(() => resolveRepoRoot({}, bare), /CLAUDE_PROJECT_DIR|git repo|\.loomwork\.json/);
});
