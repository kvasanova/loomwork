import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter,
  readSpec,
  readPlan,
  slugFromBasename,
  extractPrNumber,
} from '../parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const REPO_ROOT = path.join(__dirname, '../../../');

test('parseFrontmatter reads allowed keys', () => {
  const raw = `---\nstatus: implemented\nverified: 2026-07-09\n---\n# Body`;
  assert.deepEqual(parseFrontmatter(raw), {
    status: 'implemented',
    verified: '2026-07-09',
  });
});

test('slugFromBasename strips date and -design', () => {
  assert.equal(
    slugFromBasename('2026-06-19-railway-r2-storage-tiered-quota.md'),
    'railway-r2-storage-tiered-quota',
  );
  assert.equal(
    slugFromBasename('2026-06-18-railway-r2-storage-tiered-quota-design.md'),
    'railway-r2-storage-tiered-quota',
  );
});

test('extractPrNumber finds PR refs', () => {
  assert.equal(extractPrNumber('PR #1042'), 1042);
  assert.equal(extractPrNumber('shipped in PR #993 (2026-06-19)'), 993);
  assert.equal(extractPrNumber('no pr here'), null);
});

test('readSpec loads fixture frontmatter', () => {
  const rel = path.relative(
    REPO_ROOT,
    path.join(FIXTURES, 'spec-implemented.md'),
  );
  const spec = readSpec(rel, REPO_ROOT);
  assert.equal(spec.frontmatter.status, 'implemented');
  assert.equal(spec.frontmatter.issue, '1040');
});

test('readPlan detects DONE banner and PR', () => {
  const relDone = path.relative(REPO_ROOT, path.join(FIXTURES, 'plan-done.md'));
  const done = readPlan(relDone, REPO_ROOT);
  assert.equal(done.hasDoneBanner, true);
  assert.equal(done.prFromBanner, 1042);

  const relOpen = path.relative(
    REPO_ROOT,
    path.join(FIXTURES, 'plan-no-banner.md'),
  );
  const open = readPlan(relOpen, REPO_ROOT);
  assert.equal(open.hasDoneBanner, false);
  assert.equal(open.prFromBanner, null);
});
