import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  specsDir: 'docs/superpowers/specs',
  plansDir: 'docs/superpowers/plans',
  strategyFile: 'STRATEGY.md',
};

export function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, '.loomwork.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    console.warn('loomwork: malformed .loomwork.json — using default paths.');
    return { ...DEFAULT_CONFIG };
  }
  return { ...DEFAULT_CONFIG, ...parsed };
}

export function resolveRepoRoot(env = process.env, cwd = process.cwd()) {
  if (env.CLAUDE_PROJECT_DIR) return env.CLAUDE_PROJECT_DIR;
  let dir = cwd;
  for (;;) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, '.loomwork.json'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'loomwork: could not find the repo root — run from inside a git repo, set CLAUDE_PROJECT_DIR, or add .loomwork.json at the root.',
  );
}
