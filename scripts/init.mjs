#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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
  while (stop < end && !/^#{1,2} /.test(lines[stop])) stop++;

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
