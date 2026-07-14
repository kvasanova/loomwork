import { extractPrNumber } from './parse.mjs';

const ISSUE_DRIFT_STATUSES = new Set(['draft', 'approved']);
const VERIFIED_STATUSES = new Set(['implemented', 'partial']);

function daysBetween(isoDate, todayIso) {
  const a = new Date(`${isoDate}T00:00:00Z`);
  const b = new Date(`${todayIso}T00:00:00Z`);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function finding(code, filePath, message) {
  return { severity: 'error', code, path: filePath, message };
}

export function auditDrift({
  today,
  staleDays = 30,
  specs,
  plans,
  planToSpec,
  githubState = { issues: new Map(), prs: new Map() },
}) {
  const findings = [];

  for (const spec of specs) {
    const fm = spec.frontmatter;
    const status = fm.status ?? '';

    if (fm.issue && ISSUE_DRIFT_STATUSES.has(status)) {
      const issueNum = Number(fm.issue);
      const state = githubState.issues.get(issueNum);
      if (state === 'CLOSED') {
        findings.push(
          finding(
            'SPEC_ISSUE_CLOSED_BUT_NOT_SHIPPED',
            spec.path,
            `issue #${issueNum} is CLOSED but spec status is still "${status}" — invoke loomwork:close-out or set status: implemented/partial/superseded`,
          ),
        );
      }
    }

    if (VERIFIED_STATUSES.has(status)) {
      const verified = fm.verified?.trim() ?? '';
      if (!verified) {
        findings.push(
          finding(
            'SPEC_VERIFIED_MISSING',
            spec.path,
            `status is "${status}" but verified is missing or empty — stamp verified: YYYY-MM-DD after a real grep/test pass`,
          ),
        );
      } else {
        const age = daysBetween(verified, today);
        if (age > staleDays) {
          findings.push(
            finding(
              'SPEC_VERIFIED_STALE',
              spec.path,
              `verified: ${verified} is ${age} days old (threshold ${staleDays}) — re-verify acceptance criteria against code`,
            ),
          );
        }
      }
    }
  }

  const specByPath = new Map(specs.map((s) => [s.path, s]));

  for (const plan of plans) {
    if (plan.hasDoneBanner) continue;

    const specPath = planToSpec.get(plan.path);
    const spec = specPath ? specByPath.get(specPath) : null;
    const prFromSpec = spec
      ? extractPrNumber(spec.frontmatter.implemented_in ?? '')
      : null;
    const pr = plan.prFromBanner ?? prFromSpec;
    if (!pr) continue;

    const prState = githubState.prs.get(pr);
    if (prState === 'MERGED') {
      findings.push(
        finding(
          'PLAN_MERGED_NO_DONE_BANNER',
          plan.path,
          `paired PR #${pr} is merged but plan has no DONE banner — invoke loomwork:close-out (banner + tick all checkboxes)`,
        ),
      );
    }
  }

  return findings;
}
