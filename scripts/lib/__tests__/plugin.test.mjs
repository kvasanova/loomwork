import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('portable manifest identifies loomwork and registers Codex hooks', () => {
  const manifest = readJson('plugin.json');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'loomwork');
  assert.equal(manifest.extensions['com.openai'].hooks, './hooks/codex-hooks.json');
});

test('portable and Claude manifests keep shared identity aligned', () => {
  const portable = readJson('plugin.json');
  const claude = readJson('.claude-plugin/plugin.json');
  for (const field of ['name', 'version', 'description']) {
    assert.equal(portable[field], claude[field], `${field} differs between manifests`);
  }
});

test('Codex hooks run the close-out gate before explicit skill prompts', () => {
  const config = readJson('hooks/codex-hooks.json');
  const groups = config.hooks.UserPromptSubmit;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matcher, undefined);
  assert.deepEqual(
    groups[0].hooks.map((hook) => hook.command),
    [
      'bash "${PLUGIN_ROOT}/hooks/close-out-gate.sh"',
    ],
  );
  for (const hook of groups[0].hooks) {
    assert.equal(hook.type, 'command');
    assert.equal(hook.additionalContextLimit, 2500);
  }
});

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

test('init skill exposes a host-neutral skill-relative entry point', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/init/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: init\n/m);
  assert.match(skill, /\.\.\/\.\.\/scripts\/init\.mjs/);
  assert.doesNotMatch(skill, /PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT/);
});

test('split-agents-md skill stays manual and host-neutral', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/split-agents-md/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: split-agents-md\n/m);
  assert.match(skill, /Invoke this skill only when the user asks for it/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /^description: Manual-only; use only when explicitly requested\./m);
  assert.match(skill, /@AGENTS\.md/);
});

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

test('split-agents-md skill preserves and consolidates the marker-guarded block', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/split-agents-md/SKILL.md'), 'utf8');
  assert.match(skill, /<!-- loomwork:begin -->/);
  assert.match(skill, /<!-- loomwork:end -->/);
  assert.match(skill, /verbatim, including the markers/);
  assert.match(skill, /move the whole block/);
  assert.match(skill, /`scripts\/init\.mjs` can still find and remove it/);
  assert.match(skill, /Confirm exactly one marker-guarded block survives, in `AGENTS\.md`/);
});

test('split-agents-md skill keeps an import-only host file when the host needs the bridge', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/split-agents-md/SKILL.md'), 'utf8');
  assert.match(skill, /write\n`CLAUDE\.md` even when the repository has no Claude-specific mechanics/);
  assert.match(skill, /Skip\nthe file only for a host that reads `AGENTS\.md` natively/);
  assert.doesNotMatch(skill, /If a host file would contain nothing but the import, do not create it/);
});

test('split-agents-md skill commits only on request', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/split-agents-md/SKILL.md'), 'utf8');
  assert.match(skill, /Commit only when the user asked for a commit/);
});

test('audit skill resolves its CLI relative to the installed skill', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/audit/SKILL.md'), 'utf8');
  assert.match(skill, /\.\.\/\.\.\/scripts\/sdd-audit\.mjs/);
  assert.doesNotMatch(skill, /PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT/);
});

test('Claude hooks register only the close-out gate on Skill', () => {
  const groups = readJson('hooks/hooks.json').hooks.PostToolUse;
  assert.deepEqual(
    groups[0].hooks.map((hook) => hook.command),
    ['bash "${CLAUDE_PLUGIN_ROOT}/hooks/close-out-gate.sh"'],
  );
});

// Claude Code runs each hooks.json command through /bin/sh. Invoking the gate
// through bash keeps it working when an install drops the exec bit (#26).
const CLAUDE_HOOKS = Object.entries(readJson('hooks/hooks.json').hooks)
  .flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map(({ command }) => ({ event, command }))));

test('every Claude hook command invokes its gate through bash, not by bare path', () => {
  assert.ok(CLAUDE_HOOKS.length > 0, 'expected at least one Claude hook');
  for (const { command } of CLAUDE_HOOKS) {
    assert.match(command, /^bash "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[a-z-]+\.sh"$/);
  }
});

test('every Claude hook command runs through /bin/sh even when the gate lacks the exec bit', (t) => {
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-plugin-root-'));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-plugin-'));
  t.after(() => {
    fs.rmSync(pluginRoot, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
  fs.cpSync(path.join(ROOT, 'hooks'), path.join(pluginRoot, 'hooks'), { recursive: true });
  for (const dir of ['hooks', 'hooks/lib']) {
    for (const entry of fs.readdirSync(path.join(pluginRoot, dir)).filter((name) => name.endsWith('.sh'))) {
      fs.chmodSync(path.join(pluginRoot, dir, entry), 0o644);
    }
  }
  for (const { event, command } of CLAUDE_HOOKS) {
    // An unrelated skill, in a repo with no loomwork markers: each gate must run and stay silent.
    const payload = { hook_event_name: event, source: 'startup', tool_name: 'Skill', tool_input: { skill: 'superpowers:brainstorming' } };
    const result = spawnSync('/bin/sh', ['-c', command], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: projectDir },
    });
    assert.equal(result.status, 0, `${command} exited ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout.trim(), '', `${command} printed output for an unrelated ${event} event`);
  }
});

test('no hook registration mentions strategy', () => {
  for (const file of ['hooks/hooks.json', 'hooks/codex-hooks.json']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /strategy/i);
  }
});

test('skills require only superpowers', () => {
  for (const name of ['audit', 'close-out']) {
    const text = fs.readFileSync(path.join(ROOT, `skills/${name}/SKILL.md`), 'utf8');
    assert.doesNotMatch(text, /compound-engineering|ce-strategy|STRATEGY\.md|strategyFile/);
  }
  const init = fs.readFileSync(path.join(ROOT, 'skills/init/SKILL.md'), 'utf8');
  assert.doesNotMatch(init, /`compound-engineering:/);
  assert.match(init, /--remove-strategy/);
  assert.match(init, /ready to migrate/);
});
