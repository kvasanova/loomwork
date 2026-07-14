import fs from 'node:fs';
import path from 'node:path';

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/;
const DONE_BANNER_RE = /^>\s*\*\*Status:\s*DONE/i;
const PR_RE = /PR\s*#(\d+)/i;

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[m[1]] = value;
  }
  return fm;
}

export function slugFromBasename(basename) {
  return basename
    .replace(DATE_PREFIX_RE, '')
    .replace(/-design\.md$/, '')
    .replace(/\.md$/, '');
}

export function extractPrNumber(text) {
  const m = text.match(PR_RE);
  return m ? Number(m[1]) : null;
}

export function readSpec(relPath, repoRoot) {
  const abs = path.join(repoRoot, relPath);
  const content = fs.readFileSync(abs, 'utf8');
  return {
    path: relPath,
    frontmatter: parseFrontmatter(content),
    body: content,
  };
}

export function readPlan(relPath, repoRoot) {
  const abs = path.join(repoRoot, relPath);
  const content = fs.readFileSync(abs, 'utf8');
  const lines = content.split('\n').slice(0, 12);
  const bannerLine = lines.find((line) => DONE_BANNER_RE.test(line)) ?? '';
  return {
    path: relPath,
    hasDoneBanner: DONE_BANNER_RE.test(bannerLine),
    prFromBanner: extractPrNumber(bannerLine),
    firstLines: lines,
  };
}

export function listSpecs(repoRoot) {
  const dir = path.join(repoRoot, 'docs/superpowers/specs');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/superpowers/specs/${f}`);
}

export function listPlans(repoRoot) {
  const dir = path.join(repoRoot, 'docs/superpowers/plans');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/superpowers/plans/${f}`);
}
