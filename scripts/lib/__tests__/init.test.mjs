import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  initRepo,
  removeLegacyDoctrine,
  classifyStrategyFile,
  removeStrategy,
  findLeftovers,
} from '../../init.mjs';

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BEGIN = '<!-- loomwork:begin -->';
const END = '<!-- loomwork:end -->';
const DOCTRINE = '## Spec-Driven Development (loomwork)\n\nold doctrine text\n';

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
  assert.ok(!fs.existsSync(path.join(root, 'docs/solutions')));
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.ok(!first.some((a) => a.includes('STRATEGY.md')));
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md')));

  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, []);
});

test('initRepo respects custom paths from .loomwork.json', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, '.loomwork.json'),
    JSON.stringify({ specsDir: 'docs/specs', plansDir: 'docs/plans' }),
  );
  initRepo(root, PLUGIN_ROOT);
  assert.ok(fs.existsSync(path.join(root, 'docs/specs')));
  assert.ok(fs.existsSync(path.join(root, 'docs/plans')));
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
    '# Agents\n\nSome content.\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\n\nold doctrine text\n<!-- loomwork:end -->\n',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(after, /<!-- loomwork:begin -->/);
  assert.doesNotMatch(after, /old doctrine text/);
  assert.match(after, /# Agents\n\nSome content\.\n/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from AGENTS.md'));
});

test('initRepo strips a legacy block with no trailing newline before EOF', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Agents\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\nold doctrine\n<!-- loomwork:end -->',
  );
  const actions = initRepo(root, PLUGIN_ROOT);
  const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(after, /loomwork:begin/);
  assert.ok(actions.some((a) => a === 'removed legacy loomwork block from AGENTS.md'));
});

test('initRepo does not report a removal on a second run once the block is gone', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Agents\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\nold doctrine\n<!-- loomwork:end -->\n',
  );
  initRepo(root, PLUGIN_ROOT);
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(!actions.some((a) => a.includes('loomwork block')));
});

test('initRepo does not report a removal for a file that only mentions the marker inline', () => {
  const root = freshRepo();
  const content = 'Use `<!-- loomwork:begin -->` markers to guard the block.\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), content);
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(!actions.some((a) => a.includes('loomwork block')));
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), content);
});

test('initRepo strips a legacy loomwork block from CLAUDE.md when present', () => {
  const root = freshRepo();
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# Claude\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\n\nold doctrine text\n<!-- loomwork:end -->\n',
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
    '# Agents\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\nagents doctrine\n<!-- loomwork:end -->\n',
  );
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# Claude\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\nclaude doctrine\n<!-- loomwork:end -->\n',
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
    '# Agents\n\n<!-- loomwork:begin -->\n## Spec-Driven Development (loomwork)\nold doctrine\n<!-- loomwork:end -->\n\n## Later section\n\nMore content here.\n',
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

test('removes only the doctrine and markers when the block encloses repo content', () => {
  const input = `# A\n\n${BEGIN}\n## Deployment\n\nd\n\n## Auth\n\na\n\n${DOCTRINE}${END}\n`;
  assert.deepEqual(removeLegacyDoctrine(input), {
    content: '# A\n\n## Deployment\n\nd\n\n## Auth\n\na\n',
    status: 'removed',
  });
});

test('keeps a repo section that follows the doctrine inside the block', () => {
  const input = `# A\n\n${BEGIN}\n${DOCTRINE}\n## Mine\n\nm\n${END}\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\n\n## Mine\n\nm\n');
});

test('collapses blank lines where a mid-file block is removed', () => {
  const input = `# A\n\n${BEGIN}\n${DOCTRINE}${END}\n\n## Later\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\n\n## Later\n');
});

test('preserves CRLF on the lines it keeps', () => {
  const input = `# A\r\n\r\n${BEGIN}\r\n## Mine\r\n\r\n## Spec-Driven Development (loomwork)\r\nx\r\n${END}\r\n`;
  assert.equal(removeLegacyDoctrine(input).content, '# A\r\n\r\n## Mine\r\n');
});

for (const [name, input] of [
  ['no doctrine heading', `# A\n${BEGIN}\nmine\n${END}\n`],
  ['no end marker', `# A\n${BEGIN}\n${DOCTRINE}`],
  ['no begin marker', `# A\n${DOCTRINE}${END}\n`],
  ['end before begin', `# A\n${END}\n${DOCTRINE}${BEGIN}\n`],
  ['two blocks', `${BEGIN}\n${DOCTRINE}${END}\n${BEGIN}\n${DOCTRINE}${END}\n`],
]) {
  test(`reports ${name} as unsafe and changes nothing`, () => {
    assert.deepEqual(removeLegacyDoctrine(input), { content: input, status: 'unsafe' });
  });
}

test('initRepo reports an unsafe block and leaves the file alone', () => {
  const root = freshRepo();
  const input = `# A\n${BEGIN}\nmine\n${END}\n`;
  fs.writeFileSync(path.join(root, 'AGENTS.md'), input);
  const actions = initRepo(root);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), input);
  assert.ok(actions.includes('AGENTS.md has a loomwork block init could not safely remove'));
});

test('initRepo leaves docs/solutions content byte-identical', () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, 'docs/solutions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/solutions/a.md'), 'keep\n');
  initRepo(root);
  assert.equal(fs.readFileSync(path.join(root, 'docs/solutions/a.md'), 'utf8'), 'keep\n');
});

const STRATEGY_SCRIPT = 'loomwork-strategy-gate.sh';
const CLOSE_OUT_SCRIPT = 'loomwork-close-out-gate.sh';
const MALFORMED = '.cursor/hooks.json is malformed — loomwork Cursor setup left in place';

function loomworkHooks() {
  return {
    sessionStart: [{ command: `.cursor/hooks/${STRATEGY_SCRIPT}` }],
    postToolUse: [{ command: `bash .cursor/hooks/${CLOSE_OUT_SCRIPT}` }],
  };
}

// Writes both loomwork scripts and, unless hooksJson is null, .cursor/hooks.json.
function writeCursor(root, hooksJson) {
  const hooksDir = path.join(root, '.cursor/hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, STRATEGY_SCRIPT), '#!/bin/bash\n');
  fs.writeFileSync(path.join(hooksDir, CLOSE_OUT_SCRIPT), '#!/bin/bash\n');
  if (hooksJson !== null) {
    const text = typeof hooksJson === 'string' ? hooksJson : JSON.stringify(hooksJson, null, 2) + '\n';
    fs.writeFileSync(path.join(root, '.cursor/hooks.json'), text);
  }
}

const cursorPath = (root, rel) => path.join(root, '.cursor', rel);

test('removes the whole setup when only loomwork entries exist', () => {
  const root = freshRepo();
  writeCursor(root, { version: 1, hooks: loomworkHooks() });
  const actions = initRepo(root);
  assert.ok(!fs.existsSync(path.join(root, '.cursor')));
  assert.ok(actions.includes('removed .cursor/hooks.json'));
  assert.ok(actions.includes(`removed .cursor/hooks/${STRATEGY_SCRIPT}`));
  assert.ok(actions.includes(`removed .cursor/hooks/${CLOSE_OUT_SCRIPT}`));
});

test('keeps other hook entries', () => {
  const root = freshRepo();
  const hooks = loomworkHooks();
  hooks.postToolUse.push({ command: 'other.sh' });
  writeCursor(root, { version: 1, hooks });
  const actions = initRepo(root);
  const after = JSON.parse(fs.readFileSync(cursorPath(root, 'hooks.json'), 'utf8'));
  assert.deepEqual(after, { version: 1, hooks: { postToolUse: [{ command: 'other.sh' }] } });
  assert.ok(actions.includes('removed loomwork entries from .cursor/hooks.json'));
  assert.ok(!fs.existsSync(cursorPath(root, `hooks/${STRATEGY_SCRIPT}`)));
  assert.ok(!fs.existsSync(cursorPath(root, `hooks/${CLOSE_OUT_SCRIPT}`)));
});

test('keeps hooks.json with other top-level keys', () => {
  const root = freshRepo();
  writeCursor(root, { version: 1, extra: true, hooks: loomworkHooks() });
  initRepo(root);
  const after = JSON.parse(fs.readFileSync(cursorPath(root, 'hooks.json'), 'utf8'));
  assert.deepEqual(after, { version: 1, extra: true, hooks: {} });
});

test('keeps other .cursor files', () => {
  const root = freshRepo();
  writeCursor(root, { version: 1, hooks: loomworkHooks() });
  fs.writeFileSync(cursorPath(root, 'settings.json'), '{}\n');
  fs.writeFileSync(cursorPath(root, 'hooks/mine.sh'), 'mine\n');
  initRepo(root);
  assert.ok(fs.existsSync(cursorPath(root, 'settings.json')));
  assert.ok(fs.existsSync(cursorPath(root, 'hooks/mine.sh')));
  assert.ok(!fs.existsSync(cursorPath(root, 'hooks.json')));
});

test('removes scripts when hooks.json is absent', () => {
  const root = freshRepo();
  writeCursor(root, null);
  initRepo(root);
  assert.ok(!fs.existsSync(path.join(root, '.cursor')));
});

for (const [name, text] of [
  ['invalid JSON', '{ not json'],
  ['a top-level array', '[]'],
  ['a non-object hooks value', '{"hooks": []}'],
]) {
  test(`changes nothing when hooks.json is malformed (${name})`, () => {
    const root = freshRepo();
    writeCursor(root, text);
    const actions = initRepo(root);
    assert.equal(fs.readFileSync(cursorPath(root, 'hooks.json'), 'utf8'), text);
    assert.ok(fs.existsSync(cursorPath(root, `hooks/${STRATEGY_SCRIPT}`)));
    assert.ok(fs.existsSync(cursorPath(root, `hooks/${CLOSE_OUT_SCRIPT}`)));
    assert.ok(actions.includes(MALFORMED));
  });
}

test('leaves hooks.json untouched when it has no loomwork entries', () => {
  const root = freshRepo();
  const text = '{"version":1,"hooks":{"stop":[{"command":"other.sh"}]}}';
  writeCursor(root, text);
  initRepo(root);
  assert.equal(fs.readFileSync(cursorPath(root, 'hooks.json'), 'utf8'), text);
});

test('reports nothing on a second run', () => {
  const root = freshRepo();
  writeCursor(root, { version: 1, hooks: loomworkHooks() });
  initRepo(root);
  const second = initRepo(root);
  assert.ok(!second.some((a) => a.includes('.cursor')));
});

// ---- STRATEGY.md classification, removal, and leftovers ----

const INIT_SCRIPT = path.join(PLUGIN_ROOT, 'scripts/init.mjs');
const STRATEGY_READY = 'STRATEGY.md is ready to migrate';

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function gitRepo(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork init '));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  for (const [name, content] of Object.entries(files)) {
    const abs = path.join(root, name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  if (Object.keys(files).length > 0) {
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  return root;
}

const blockedRepos = {
  untracked: [() => { const r = gitRepo({ 'a.md': 'x\n' }); fs.writeFileSync(path.join(r, 'STRATEGY.md'), 'x\n'); return r; }, 'not tracked'],
  ignored: [() => gitRepo({ '.gitignore': 'STRATEGY.md\n', 'STRATEGY.md': 'x\n' }), 'ignored'],
  modified: [() => { const r = gitRepo({ 'STRATEGY.md': 'x\n' }); fs.writeFileSync(path.join(r, 'STRATEGY.md'), 'y\n'); return r; }, 'uncommitted'],
  staged: [() => { const r = gitRepo({ 'STRATEGY.md': 'x\n' }); fs.writeFileSync(path.join(r, 'STRATEGY.md'), 'y\n'); git(r, 'add', 'STRATEGY.md'); return r; }, 'uncommitted'],
  'no git': [() => { const r = freshRepo(); fs.writeFileSync(path.join(r, 'STRATEGY.md'), 'x\n'); return r; }, 'git'],
};

test('strategy: absent file reports nothing about it', () => {
  const root = gitRepo({ 'a.md': 'x\n' });
  assert.deepEqual(classifyStrategyFile(root), { state: 'absent' });
  assert.ok(!initRepo(root, PLUGIN_ROOT).some((a) => a.includes('STRATEGY.md')));
});

test('strategy: a committed clean file is ready and stays', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n' });
  assert.equal(classifyStrategyFile(root).state, 'ready');
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.includes(STRATEGY_READY));
  assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
});

for (const [name, [setup, word]] of Object.entries(blockedRepos)) {
  test(`strategy: ${name} is blocked and left in place`, () => {
    const root = setup();
    const result = classifyStrategyFile(root);
    assert.equal(result.state, 'blocked');
    assert.ok(result.reason.includes(word), result.reason);
    const actions = initRepo(root, PLUGIN_ROOT);
    assert.ok(actions.some((a) => a.startsWith('STRATEGY.md left in place:')), actions.join('|'));
    assert.ok(!actions.includes(STRATEGY_READY));
    const removed = removeStrategy(root);
    assert.equal(removed.ok, false);
    assert.ok(removed.message.startsWith('STRATEGY.md left in place:'));
    assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
  });
}

test('removeStrategy deletes a tracked clean file without staging', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n' });
  assert.equal(removeStrategy(root).ok, true);
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
  assert.equal(git(root, 'diff', '--cached', '--name-only').trim(), '');
  assert.equal(git(root, 'log', '--oneline').trim().split('\n').length, 1);
});

test('removeStrategy succeeds when the file is absent', () => {
  assert.equal(removeStrategy(gitRepo({ 'a.md': 'x\n' })).ok, true);
});

test('removeStrategy leaves an empty .loomwork.json in place', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n', '.loomwork.json': '{}' });
  assert.equal(removeStrategy(root).ok, true);
  assert.equal(fs.readFileSync(path.join(root, '.loomwork.json'), 'utf8'), '{}');
});

function runCli(root, ...args) {
  return spawnSync('node', [INIT_SCRIPT, ...args], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
}

test('CLI --remove-strategy exits 1 with the reason on a modified file', () => {
  const root = blockedRepos.modified[0]();
  const result = runCli(root, '--remove-strategy');
  assert.equal(result.status, 1);
  assert.ok((result.stdout + result.stderr).includes('uncommitted'));
  assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
});

test('CLI --remove-strategy exits 0 and removes a clean file', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n' });
  const result = runCli(root, '--remove-strategy');
  assert.equal(result.status, 0);
  assert.ok(!fs.existsSync(path.join(root, 'STRATEGY.md')));
});

test('CLI plain run on a ready file exits 0 and keeps it', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n' });
  const result = runCli(root);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes(STRATEGY_READY));
  assert.ok(fs.existsSync(path.join(root, 'STRATEGY.md')));
});

test('a strategyFile key is reported and nothing it names is touched', () => {
  const config = JSON.stringify({ strategyFile: 'VISION.md' });
  const root = gitRepo({ 'VISION.md': 'v\n', '.loomwork.json': config });
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.includes('strategyFile in .loomwork.json is no longer used; VISION.md was left alone'));
  assert.equal(fs.readFileSync(path.join(root, 'VISION.md'), 'utf8'), 'v\n');
  assert.equal(fs.readFileSync(path.join(root, '.loomwork.json'), 'utf8'), config);
});

test('findLeftovers lists only live docs outside specs, plans, solutions, and STRATEGY.md', () => {
  const files = {
    'docs/SDD_PLAYBOOK.md': 'see ce-strategy\n',
    'README.md': 'uses compound-engineering\n',
    'docs/superpowers/specs/a.md': 'ce-strategy\n',
    'docs/superpowers/plans/a.md': 'ce-strategy\n',
    'docs/solutions/a.md': 'ce-strategy\n',
    'STRATEGY.md': 'ce-strategy\n',
  };
  const root = gitRepo(files);
  assert.deepEqual(findLeftovers(root, { specsDir: 'docs/superpowers/specs', plansDir: 'docs/superpowers/plans' }), [
    'README.md',
    'docs/SDD_PLAYBOOK.md',
  ]);
  const actions = initRepo(root, PLUGIN_ROOT);
  assert.ok(actions.includes('references to the old setup remain in: README.md, docs/SDD_PLAYBOOK.md'));
});

test('findLeftovers honors custom specsDir and plansDir', () => {
  const root = gitRepo({ 'specs/a.md': 'ce-strategy\n', 'plans/a.md': 'ce-strategy\n', 'notes.md': 'ce-compound\n' });
  assert.deepEqual(findLeftovers(root, { specsDir: 'specs', plansDir: 'plans' }), ['notes.md']);
});

test('findLeftovers returns [] without git or without matches', () => {
  const cfg = { specsDir: 'docs/superpowers/specs', plansDir: 'docs/superpowers/plans' };
  assert.deepEqual(findLeftovers(freshRepo(), cfg), []);
  assert.deepEqual(findLeftovers(gitRepo({ 'a.md': 'clean\n' }), cfg), []);
});

test('leftovers are reported when STRATEGY.md is absent, ready, or blocked', () => {
  const expected = 'references to the old setup remain in: README.md';
  const absent = gitRepo({ 'README.md': 'compound-engineering\n' });
  const ready = gitRepo({ 'README.md': 'compound-engineering\n', 'STRATEGY.md': 'x\n' });
  const blocked = gitRepo({ 'README.md': 'compound-engineering\n', 'STRATEGY.md': 'x\n' });
  fs.writeFileSync(path.join(blocked, 'STRATEGY.md'), 'y\n');
  for (const root of [absent, ready, blocked]) {
    assert.ok(initRepo(root, PLUGIN_ROOT).includes(expected));
  }
});

test('a second default run repeats the actions and changes nothing', () => {
  const root = gitRepo({ 'STRATEGY.md': 'x\n', 'README.md': 'compound-engineering\n' });
  initRepo(root, PLUGIN_ROOT);
  const before = git(root, 'status', '--porcelain');
  const first = initRepo(root, PLUGIN_ROOT);
  const second = initRepo(root, PLUGIN_ROOT);
  assert.deepEqual(second, first);
  assert.equal(git(root, 'status', '--porcelain'), before);
  assert.equal(git(root, 'diff', '--cached', '--name-only').trim(), '');
  assert.equal(git(root, 'log', '--oneline').trim().split('\n').length, 1);
});
