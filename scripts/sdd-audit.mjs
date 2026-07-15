#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoRoot } from './lib/config.mjs';
import {
  listSpecs,
  listPlans,
  readSpec,
  readPlan,
  extractPrNumber,
} from './lib/parse.mjs';
import { buildPairingIndex } from './lib/pair.mjs';
import { auditDrift } from './lib/rules.mjs';
import { fetchGithubState, isGhAvailable } from './lib/github.mjs';
import { formatReport, exitCodeFromFindings } from './lib/report.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export function parseArgs(argv) {
  const opts = { offline: false, json: false, staleDays: 30 };

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--offline') {
      opts.offline = true;
    } else if (argv[i] === '--json') {
      opts.json = true;
    } else if (argv[i] === '--stale-days') {
      opts.staleDays = Number(argv[++i]);
    }
  }

  return opts;
}

export async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const today = new Date().toISOString().slice(0, 10);
  const repoRoot = resolveRepoRoot();
  const config = loadConfig(repoRoot);

  for (const dir of [config.specsDir, config.plansDir]) {
    if (!fs.existsSync(path.join(repoRoot, dir))) {
      console.error(`loomwork: ${dir}/ not found — repo not initialized. Run /loomwork:init.`);
      return 2;
    }
  }

  const specs = listSpecs(repoRoot, config.specsDir).map((filePath) => {
    const spec = readSpec(filePath, repoRoot);
    return { path: filePath, frontmatter: spec.frontmatter };
  });
  const plans = listPlans(repoRoot, config.plansDir).map((filePath) => readPlan(filePath, repoRoot));
  const { planToSpec } = buildPairingIndex(repoRoot, config);

  const issueNums = [
    ...new Set(
      specs
        .map((spec) => spec.frontmatter.issue)
        .filter(Boolean)
        .map(Number),
    ),
  ];
  const prNums = [
    ...new Set(
      [
        ...plans.map((plan) => plan.prFromBanner),
        ...specs.map((spec) => extractPrNumber(spec.frontmatter.implemented_in ?? '')),
      ].filter(Boolean),
    ),
  ];

  let githubState = { issues: new Map(), prs: new Map() };
  if (!opts.offline && isGhAvailable()) {
    githubState = await fetchGithubState({ issueNums, prNums, repoRoot });
  } else if (!opts.offline) {
    console.warn('loomwork audit: gh not available — skipping issue/PR state checks (file-only mode).');
  }

  const findings = auditDrift({
    repoRoot,
    today,
    staleDays: opts.staleDays,
    specs,
    plans,
    planToSpec,
    githubState,
  });

  console.log(formatReport(findings, { json: opts.json }));
  return exitCodeFromFindings(findings);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().then(
    (exitCode) => {
      process.exit(exitCode);
    },
    (error) => {
      console.error(error);
      process.exit(2);
    },
  );
}
