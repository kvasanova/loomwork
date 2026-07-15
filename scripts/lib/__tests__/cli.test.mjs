import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sdd-audit.mjs');

function makeConsumerRepo({ specsDir, plansDir, writeConfig }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-consumer-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, specsDir), { recursive: true });
  fs.mkdirSync(path.join(root, plansDir), { recursive: true });
  fs.writeFileSync(
    path.join(root, specsDir, '2026-01-01-widget-design.md'),
    '---\nissue: 1\nstatus: implemented\nimplemented_in: "PR #2"\nverified: 2026-01-02\n---\n\n# Widget\n',
  );
  fs.writeFileSync(
    path.join(root, plansDir, '2026-01-01-widget.md'),
    '# Widget Plan\n> **Status: DONE — shipped in PR #2 (2026-01-02).**\n\n- [x] done\n',
  );
  if (writeConfig) {
    fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir, plansDir }));
  }
  return root;
}

function runCli(cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, '--offline', '--json', '--stale-days', '100000'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env },
  });
}

test('CLI passes clean on a default-layout consumer repo', () => {
  const root = makeConsumerRepo({
    specsDir: 'docs/superpowers/specs',
    plansDir: 'docs/superpowers/plans',
    writeConfig: false,
  });
  const result = runCli(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).count, 0);
});

test('CLI reads non-default paths from .loomwork.json', () => {
  const root = makeConsumerRepo({ specsDir: 'docs/specs', plansDir: 'docs/plans', writeConfig: true });
  const result = runCli(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).count, 0);
});

test('CLI reports drift with exit 1 (missing verified)', () => {
  const root = makeConsumerRepo({
    specsDir: 'docs/superpowers/specs',
    plansDir: 'docs/superpowers/plans',
    writeConfig: false,
  });
  fs.writeFileSync(
    path.join(root, 'docs/superpowers/specs/2026-01-03-gadget-design.md'),
    '---\nissue: 3\nstatus: implemented\n---\n\n# Gadget\n',
  );
  const result = runCli(root);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findings[0].code, 'SPEC_VERIFIED_MISSING');
});

test('CLI errors actionably on an uninitialized repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-uninit-'));
  fs.mkdirSync(path.join(root, '.git'));
  const result = runCli(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not initialized|loomwork:init/);
});

test('CLI respects CLAUDE_PROJECT_DIR over cwd', () => {
  const root = makeConsumerRepo({
    specsDir: 'docs/superpowers/specs',
    plansDir: 'docs/superpowers/plans',
    writeConfig: false,
  });
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-elsewhere-'));
  const result = runCli(elsewhere, { CLAUDE_PROJECT_DIR: root });
  assert.equal(result.status, 0, result.stderr);
});
