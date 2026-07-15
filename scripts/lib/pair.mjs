import path from 'node:path';
import { listPlans, listSpecs, slugFromBasename } from './parse.mjs';
import { DEFAULT_CONFIG } from './config.mjs';

export function buildPairingIndex(repoRoot, config = DEFAULT_CONFIG) {
  const specBySlug = new Map();
  for (const specPath of listSpecs(repoRoot, config.specsDir)) {
    const slug = slugFromBasename(path.basename(specPath));
    specBySlug.set(slug, specPath);
  }

  const planToSpec = new Map();
  const specToPlan = new Map();

  for (const planPath of listPlans(repoRoot, config.plansDir)) {
    const slug = slugFromBasename(path.basename(planPath));
    const specPath = specBySlug.get(slug);
    if (specPath) {
      planToSpec.set(planPath, specPath);
      specToPlan.set(specPath, planPath);
    }
  }

  return { planToSpec, specToPlan };
}
