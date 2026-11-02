#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoRoot } from './lib/config.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PLUGIN_ROOT = path.join(path.dirname(SCRIPT_PATH), '..');
const MARKER_BEGIN = '<!-- loomwork:begin -->';
const MARKER_END = '<!-- loomwork:end -->';

const DOCTRINE_HEADING = '## Spec-Driven Development (loomwork)';

const lineText = (line) => line.replace(/\r?\n$/, '');
const isBlank = (line) => line.trim() === '';

// Removes the marker-guarded doctrine from AGENTS.md/CLAUDE.md content while
// keeping any repo content that sits inside the markers. Anything ambiguous is
// returned untouched with status 'unsafe'.
export function removeLegacyDoctrine(content) {
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [];
  const begins = [];
  const ends = [];
  lines.forEach((line, i) => {
    if (lineText(line) === MARKER_BEGIN) begins.push(i);
    else if (lineText(line) === MARKER_END) ends.push(i);
  });
  if (begins.length === 0 && ends.length === 0) return { content, status: 'none' };
  const unsafe = { content, status: 'unsafe' };
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) return unsafe;

  const [begin] = begins;
  const [end] = ends;
  let heading = -1;
  for (let i = begin + 1; i < end; i++) {
    if (lineText(lines[i]) === DOCTRINE_HEADING) {
      heading = i;
      break;
    }
  }
  if (heading === -1) return unsafe;
  let stop = heading + 1;
  while (stop < end && !/^#{1,6} /.test(lines[stop])) stop++;

  const out = [];
  let gap = false;
  for (let i = 0; i < lines.length; i++) {
    if (i === begin || i === end || (i >= heading && i < stop)) {
      gap = true;
      continue;
    }
    if (gap && isBlank(lines[i])) {
      // Blank lines on both sides of a gap collapse to the one already kept.
      if (out.length === 0 || isBlank(out[out.length - 1])) continue;
    } else {
      gap = false;
    }
    out.push(lines[i]);
  }
  // A gap that reaches end of file leaves no trailing blank lines.
  if (gap) while (out.length > 0 && isBlank(out[out.length - 1])) out.pop();
  return { content: out.join(''), status: 'removed' };
}

const CURSOR_LOOMWORK_MARKER = '.cursor/hooks/loomwork-';
const CURSOR_LOOMWORK_SCRIPTS = ['loomwork-strategy-gate.sh', 'loomwork-close-out-gate.sh'];
const CURSOR_MALFORMED = '.cursor/hooks.json is malformed — loomwork Cursor setup left in place';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isLoomworkEntry = (entry) =>
  isPlainObject(entry) &&
  typeof entry.command === 'string' &&
  entry.command.includes(CURSOR_LOOMWORK_MARKER);

const removeDirIfEmpty = (dir) => {
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
};

// Older versions wrote loomwork entries into .cursor/hooks.json plus two
// scripts under .cursor/hooks/. Removes only those, leaving other Cursor
// config alone. A malformed hooks.json changes nothing, so the scripts are not
// removed while a config may still point at them.
export function removeCursorSetup(repoRoot) {
  const actions = [];
  const cursorDir = path.join(repoRoot, '.cursor');
  const hooksDir = path.join(cursorDir, 'hooks');
  const hooksJsonPath = path.join(cursorDir, 'hooks.json');

  if (fs.existsSync(hooksJsonPath)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    } catch {
      return [CURSOR_MALFORMED];
    }
    if (
      !isPlainObject(parsed) ||
      ('hooks' in parsed && !isPlainObject(parsed.hooks)) ||
      Object.values(parsed.hooks || {}).some((entries) => !Array.isArray(entries))
    ) {
      return [CURSOR_MALFORMED];
    }

    let changed = false;
    const hooks = parsed.hooks || {};
    for (const [event, entries] of Object.entries(hooks)) {
      const kept = entries.filter((entry) => !isLoomworkEntry(entry));
      if (kept.length === entries.length) continue;
      changed = true;
      if (kept.length === 0) delete hooks[event];
      else hooks[event] = kept;
    }
    if (changed) {
      const onlyOwnKeys = Object.keys(parsed).every((key) => key === 'version' || key === 'hooks');
      if (Object.keys(hooks).length === 0 && onlyOwnKeys) {
        fs.rmSync(hooksJsonPath);
        actions.push('removed .cursor/hooks.json');
      } else {
        fs.writeFileSync(hooksJsonPath, JSON.stringify(parsed, null, 2) + '\n');
        actions.push('removed loomwork entries from .cursor/hooks.json');
      }
    }
  }

  for (const script of CURSOR_LOOMWORK_SCRIPTS) {
    const scriptPath = path.join(hooksDir, script);
    if (fs.existsSync(scriptPath)) {
      fs.rmSync(scriptPath);
      actions.push(`removed .cursor/hooks/${script}`);
    }
  }
  if (actions.length > 0) {
    removeDirIfEmpty(hooksDir);
    removeDirIfEmpty(cursorDir);
  }
  return actions;
}

const STRATEGY_FILE = 'STRATEGY.md';
const STRATEGY_READY = `${STRATEGY_FILE} is ready to migrate`;
const LEFTOVER_TERMS = [STRATEGY_FILE, 'ce-strategy', 'ce-compound', 'ce-doc-review', 'compound-engineering'];

// Runs git without ever throwing; a spawn error or non-zero exit is a failure
// the caller handles.
const runGit = (repoRoot, args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return { ok: !result.error && result.status === 0, status: result.status, stdout: result.stdout || '' };
};

// Decides whether STRATEGY.md can be migrated and deleted: only a file that git
// tracks with no pending changes qualifies, so git always holds a copy.
export function classifyStrategyFile(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, STRATEGY_FILE))) return { state: 'absent' };
  const result = runGit(repoRoot, ['status', '--porcelain', '--ignored', '--', STRATEGY_FILE]);
  if (!result.ok) return { state: 'blocked', reason: 'git could not inspect it' };
  const output = result.stdout.trimEnd();
  if (output === '') return { state: 'ready' };
  if (output.startsWith('??')) {
    return { state: 'blocked', reason: 'it is not tracked by git — commit it and re-run init to finish' };
  }
  if (output.startsWith('!!')) return { state: 'blocked', reason: 'it is ignored by git' };
  return {
    state: 'blocked',
    reason: 'it has uncommitted changes — commit them and re-run init to finish',
  };
}

const strategyLeftInPlace = (reason) => `${STRATEGY_FILE} left in place: ${reason}`;

// Deletes a tracked, clean STRATEGY.md from the working tree without staging.
export function removeStrategy(repoRoot) {
  const result = classifyStrategyFile(repoRoot);
  if (result.state === 'absent') return { ok: true, message: `${STRATEGY_FILE} is already absent` };
  if (result.state === 'blocked') return { ok: false, message: strategyLeftInPlace(result.reason) };
  fs.rmSync(path.join(repoRoot, STRATEGY_FILE));
  return { ok: true, message: `removed ${STRATEGY_FILE} (not staged)` };
}

// Tracked files outside the specs, plans, and solutions docs that still name
// the old setup. Returns [] when git cannot answer or nothing matches.
export function findLeftovers(repoRoot, config) {
  const args = ['-c', 'core.quotepath=off', 'grep', '-l', '-I', '-F'];
  for (const term of LEFTOVER_TERMS) args.push('-e', term);
  args.push(
    '--',
    '.',
    `:!${config.specsDir}`,
    `:!${config.plansDir}`,
    ':!docs/solutions',
    `:!${STRATEGY_FILE}`,
  );
  const result = runGit(repoRoot, args);
  if (!result.ok) return [];
  return result.stdout.split('\n').filter((line) => line !== '');
}

export function initRepo(repoRoot, pluginRoot = DEFAULT_PLUGIN_ROOT) {
  const config = loadConfig(repoRoot);
  const actions = [];

  for (const dir of [config.specsDir, config.plansDir]) {
    const abs = path.join(repoRoot, dir);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(path.join(abs, '.gitkeep'), '');
      actions.push(`created ${dir}/`);
    }
  }

  // The doctrine is delivered live by the SessionStart hook
  // (hooks/doctrine-gate.sh), so a marker-guarded block copied into the repo
  // by an older init would duplicate it. Remove it only when that is safe.
  for (const filename of ['AGENTS.md', 'CLAUDE.md']) {
    const filePath = path.join(repoRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const result = removeLegacyDoctrine(fs.readFileSync(filePath, 'utf8'));
    if (result.status === 'removed') {
      fs.writeFileSync(filePath, result.content);
      actions.push(`removed legacy loomwork block from ${filename}`);
    } else if (result.status === 'unsafe') {
      actions.push(`${filename} has a loomwork block init could not safely remove`);
    }
  }

  actions.push(...removeCursorSetup(repoRoot));

  const strategy = classifyStrategyFile(repoRoot);
  if (strategy.state === 'ready') actions.push(STRATEGY_READY);
  else if (strategy.state === 'blocked') actions.push(strategyLeftInPlace(strategy.reason));

  if ('strategyFile' in config) {
    actions.push(
      `strategyFile in .loomwork.json is no longer used; ${config.strategyFile} was left alone`,
    );
  }

  const leftovers = findLeftovers(repoRoot, config);
  if (leftovers.length > 0) {
    actions.push(`references to the old setup remain in: ${leftovers.join(', ')}`);
  }

  return actions;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const repoRoot = resolveRepoRoot();
    if (process.argv.includes('--remove-strategy')) {
      const { ok, message } = removeStrategy(repoRoot);
      console.log(message);
      process.exit(ok ? 0 : 1);
    }
    const actions = initRepo(repoRoot);
    const changed = actions.some((a) => a.startsWith('created ') || a.startsWith('removed '));
    if (changed) console.log(`loomwork: initialized ${repoRoot}`);
    else console.log('loomwork: already initialized — no changes.');
    for (const a of actions) console.log(`  - ${a}`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
