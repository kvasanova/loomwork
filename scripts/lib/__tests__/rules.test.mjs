import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDrift } from '../rules.mjs';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);

test('flags closed issue with draft/approved spec status', () => {
  const findings = auditDrift({
    repoRoot: REPO_ROOT,
    today: '2026-07-09',
    staleDays: 30,
    specs: [
      {
        path: 'docs/superpowers/specs/spec-draft-closed-issue.md',
        frontmatter: { issue: '9999', status: 'approved' },
      },
    ],
    plans: [],
    planToSpec: new Map(),
    githubState: { issues: new Map([[9999, 'CLOSED']]), prs: new Map() },
  });
  assert.ok(
    findings.some((f) => f.code === 'SPEC_ISSUE_CLOSED_BUT_NOT_SHIPPED'),
  );
});

test('flags missing verified on implemented spec', () => {
  const findings = auditDrift({
    repoRoot: REPO_ROOT,
    today: '2026-07-09',
    staleDays: 30,
    specs: [
      {
        path: 'docs/superpowers/specs/x.md',
        frontmatter: { status: 'implemented', implemented_in: 'PR #1' },
      },
    ],
    plans: [],
    planToSpec: new Map(),
    githubState: { issues: new Map(), prs: new Map() },
  });
  assert.ok(findings.some((f) => f.code === 'SPEC_VERIFIED_MISSING'));
});

test('flags stale verified date', () => {
  const findings = auditDrift({
    repoRoot: REPO_ROOT,
    today: '2026-07-09',
    staleDays: 30,
    specs: [
      {
        path: 'docs/superpowers/specs/spec-stale-verified.md',
        frontmatter: {
          status: 'implemented',
          implemented_in: 'PR #1',
          verified: '2020-01-01',
        },
      },
    ],
    plans: [],
    planToSpec: new Map(),
    githubState: { issues: new Map(), prs: new Map() },
  });
  assert.ok(findings.some((f) => f.code === 'SPEC_VERIFIED_STALE'));
});

test('flags plan without DONE banner when paired PR merged', () => {
  const planPath = 'docs/superpowers/plans/plan-no-banner.md';
  const specPath = 'docs/superpowers/specs/paired.md';
  const findings = auditDrift({
    repoRoot: REPO_ROOT,
    today: '2026-07-09',
    staleDays: 30,
    specs: [
      {
        path: specPath,
        frontmatter: { status: 'implemented', implemented_in: 'PR #55' },
      },
    ],
    plans: [{ path: planPath, hasDoneBanner: false, prFromBanner: null }],
    planToSpec: new Map([[planPath, specPath]]),
    githubState: {
      issues: new Map(),
      prs: new Map([[55, 'MERGED']]),
    },
  });
  assert.ok(findings.some((f) => f.code === 'PLAN_MERGED_NO_DONE_BANNER'));
});
