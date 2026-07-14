export function formatReport(findings, { json = false } = {}) {
  if (json) {
    return JSON.stringify({ findings, count: findings.length }, null, 2);
  }
  if (findings.length === 0) {
    return 'SDD drift audit: no issues found.';
  }
  const lines = [`SDD drift audit: ${findings.length} issue(s) found:`, ''];
  for (const f of findings) {
    lines.push(`[${f.code}] ${f.path}`);
    lines.push(`  ${f.message}`);
    lines.push('');
  }
  lines.push('Fix: invoke the loomwork:close-out skill or update frontmatter manually. See the loomwork playbook § Drift audit.');
  return lines.join('\n');
}

export function exitCodeFromFindings(findings) {
  return findings.length > 0 ? 1 : 0;
}
