#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoRoot } from './lib/config.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PLUGIN_ROOT = path.join(path.dirname(SCRIPT_PATH), '..');
const MARKER_BEGIN = '<!-- loomwork:begin -->';
const MARKER_END = '<!-- loomwork:end -->';

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
