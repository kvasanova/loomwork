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
  assert.equal(manifest.extensions['com.openai'].hooks, './hooks/codex-hooks.json');
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
