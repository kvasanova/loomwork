import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPairingIndex } from '../pair.mjs';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);

test('buildPairingIndex pairs railway plan/spec despite date mismatch', () => {
  const { planToSpec } = buildPairingIndex(REPO_ROOT);
  assert.equal(
    planToSpec.get('docs/superpowers/plans/2026-06-19-railway-r2-storage-tiered-quota.md'),
    'docs/superpowers/specs/2026-06-18-railway-r2-storage-tiered-quota-design.md',
  );
});

test('buildPairingIndex pairs screen-read-aloud by slug', () => {
  const { planToSpec } = buildPairingIndex(REPO_ROOT);
  assert.equal(
    planToSpec.get('docs/superpowers/plans/2026-07-02-companion-screen-read-aloud.md'),
    'docs/superpowers/specs/2026-07-02-companion-screen-read-aloud-design.md',
  );
});
