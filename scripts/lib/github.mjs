import { execFileSync } from 'node:child_process';

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

export function detectRepo() {
  try {
    const out = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      encoding: 'utf8',
    });
    return out.trim();
  } catch {
    return null;
  }
}

export async function fetchGithubState({ issueNums, prNums }) {
  const issues = new Map();
  const prs = new Map();

  for (const n of issueNums) {
    try {
      const data = ghJson(['issue', 'view', String(n), '--json', 'state']);
      issues.set(n, data.state);
    } catch {
      // offline / missing issue — skip
    }
  }

  for (const n of prNums) {
    try {
      const data = ghJson(['pr', 'view', String(n), '--json', 'state']);
      prs.set(n, data.state);
    } catch {
      // offline / missing PR — skip
    }
  }

  return { issues, prs };
}

export function isGhAvailable() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
