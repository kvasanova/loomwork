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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  // STRATEGY.md belongs to ce-strategy. loomwork never authors or seeds it —
  // it only reports that it is missing and names the skill that owns it.
  const strategyAbs = path.join(repoRoot, config.strategyFile);
  if (!fs.existsSync(strategyAbs)) {
    actions.push(
      `${config.strategyFile} is missing — run compound-engineering:ce-strategy to author it`,
    );
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

  // Migrate loomwork entries written by older versions: bare `.cursor/hooks/*.sh`
  // commands (Cursor/Windows can open these as editor tabs instead of running
  // them) and the noisy `Read|Skill` postToolUse matcher. Rewrite in place so a
  // re-run fixes installed repos rather than appending a duplicate gate.
  for (const [event, entries] of Object.entries(hooksJson.hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const target = template.hooks[event]?.find(
        (t) => t.command.endsWith(` ${entry.command}`) || t.command === entry.command,
      );
      if (!target) continue;
      if (entry.command !== target.command) {
        entry.command = target.command;
        hooksChanged = true;
      }
      if ((entry.matcher ?? '') !== (target.matcher ?? '')) {
        if (target.matcher === undefined) delete entry.matcher;
        else entry.matcher = target.matcher;
        hooksChanged = true;
      }
    }
  }

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

  // The doctrine is no longer copied into consumer repos — the plugin's
  // SessionStart hook (hooks/doctrine-gate.sh) injects it live from
  // templates/claude-md-block.md instead, so every repo stays current when
  // the plugin upgrades. A repo initialized before this change may still
  // carry the old marker-guarded block; strip it so the doctrine isn't
  // duplicated (once from the file, once from the hook).
  const legacyBlockRe = new RegExp(
    `\\n?${escapeRegExp(MARKER_BEGIN)}\\n[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n`,
  );
  for (const filename of ['AGENTS.md', 'CLAUDE.md']) {
    const filePath = path.join(repoRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(MARKER_BEGIN)) continue;
    const stripped = content.replace(legacyBlockRe, '');
    fs.writeFileSync(filePath, stripped);
    actions.push(`removed legacy loomwork block from ${filename}`);
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
