#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoRoot } from './lib/config.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PLUGIN_ROOT = path.join(path.dirname(SCRIPT_PATH), '..');
const MARKER_BEGIN = '<!-- loomwork:begin -->';
const MARKER_END = '<!-- loomwork:end -->';
const CURSOR_SCRIPTS = ['loomwork-strategy-gate.sh', 'loomwork-close-out-gate.sh'];

export function initRepo(repoRoot, pluginRoot = DEFAULT_PLUGIN_ROOT) {
  const config = loadConfig(repoRoot);
  const actions = [];

  for (const dir of [config.specsDir, config.plansDir, 'docs/solutions']) {
    const abs = path.join(repoRoot, dir);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(path.join(abs, '.gitkeep'), '');
      actions.push(`created ${dir}/`);
    }
  }

  const strategyAbs = path.join(repoRoot, config.strategyFile);
  if (!fs.existsSync(strategyAbs)) {
    fs.copyFileSync(path.join(pluginRoot, 'templates/STRATEGY.md'), strategyAbs);
    actions.push(`seeded ${config.strategyFile} (fill it in — ce-strategy can help)`);
  }

  const cursorHooksDir = path.join(repoRoot, '.cursor/hooks');
  fs.mkdirSync(cursorHooksDir, { recursive: true });
  for (const script of CURSOR_SCRIPTS) {
    const templatePath = path.join(pluginRoot, 'templates/cursor', script);
    const content = fs.readFileSync(templatePath, 'utf8');
    const dest = path.join(cursorHooksDir, script);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content, { mode: 0o755 });
      actions.push(`wrote .cursor/hooks/${script}`);
    }
  }

  const hooksJsonPath = path.join(repoRoot, '.cursor/hooks.json');
  const templateHooksPath = path.join(pluginRoot, 'templates/cursor/hooks.json');
  const template = JSON.parse(
    fs.readFileSync(templateHooksPath, 'utf8'),
  );
  const hadHooksJson = fs.existsSync(hooksJsonPath);
  const hooksJson = hadHooksJson
    ? JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
    : { version: 1, hooks: {} };
  hooksJson.hooks ??= {};
  let hooksChanged = !hadHooksJson;
  for (const [event, entries] of Object.entries(template.hooks)) {
    hooksJson.hooks[event] ??= [];
    for (const entry of entries) {
      const present = hooksJson.hooks[event].some(
        (e) => e.command === entry.command && (e.matcher ?? '') === (entry.matcher ?? ''),
      );
      if (!present) {
        hooksJson.hooks[event].push(entry);
        hooksChanged = true;
      }
    }
  }
  if (hooksChanged) {
    fs.writeFileSync(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`);
    actions.push(hadHooksJson ? 'merged .cursor/hooks.json' : 'wrote .cursor/hooks.json');
  }

  const memoryFile =
    ['CLAUDE.md', 'AGENTS.md']
      .map((f) => path.join(repoRoot, f))
      .find((p) => fs.existsSync(p)) ?? path.join(repoRoot, 'CLAUDE.md');
  const existing = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8') : '';
  if (!existing.includes(MARKER_BEGIN)) {
    const block = fs
      .readFileSync(path.join(pluginRoot, 'templates/claude-md-block.md'), 'utf8')
      .trimEnd();
    const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(memoryFile, `${existing}${sep}\n${MARKER_BEGIN}\n${block}\n${MARKER_END}\n`);
    actions.push(`appended loomwork block to ${path.basename(memoryFile)}`);
  }

  return actions;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const repoRoot = resolveRepoRoot();
    const actions = initRepo(repoRoot);
    if (actions.length === 0) {
      console.log('loomwork: already initialized — no changes.');
    } else {
      console.log(`loomwork: initialized ${repoRoot}`);
      for (const a of actions) console.log(`  - ${a}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
