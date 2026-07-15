---
name: audit
description: Run the SDD drift linter — flags stale spec status, missing plan DONE banners, and missing/stale verified dates. Use monthly, before large SDD meta-work, or when spec/plan status looks wrong.
---

# SDD Drift Audit

**Announce:** "Using loomwork:audit to scan spec/plan drift."

**Preflight:** verify the superpowers and compound-engineering plugins are
installed (their skills appear in your available-skills list). If either is
missing, stop and point the user at the install commands in `/loomwork:init`
Step 1.

**When:** Manually or periodically (e.g. monthly). When a shipped feature
still shows `draft` or unticked plan boxes. **Not** a CI gate.

## Run

From anywhere inside the consumer repo:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd-audit.mjs"
```

Flags:
- `--offline` — skip `gh` issue/PR checks (file-only: verified missing/stale)
- `--json` — machine-readable output
- `--stale-days 30` — override verified age threshold (default 30)

Requires `gh auth login` for full checks (closed-issue + merged-PR rules).
Spec/plan paths come from `.loomwork.json` at the repo root (defaults:
`docs/superpowers/specs`, `docs/superpowers/plans`).

## Interpret findings

| Code | Meaning | Fix |
|------|---------|-----|
| `SPEC_ISSUE_CLOSED_BUT_NOT_SHIPPED` | GitHub issue closed, spec still `draft`/`approved` | Invoke `loomwork:close-out` or update `status` |
| `PLAN_MERGED_NO_DONE_BANNER` | PR merged, plan missing DONE banner | Invoke `loomwork:close-out` Step 2 |
| `SPEC_VERIFIED_MISSING` | `implemented`/`partial` without `verified:` | Grep/test acceptance criteria; set `verified: YYYY-MM-DD` |
| `SPEC_VERIFIED_STALE` | `verified` older than threshold | Re-run acceptance verification; bump date |

Exit `0` = clean, `1` = drift found, `2` = script error (`not initialized`
means run `/loomwork:init`).

## After fixing

Re-run until exit `0`. Drift fixes are doc-only commits on the branch doing
the close-out — do not auto-fix via this tool.
