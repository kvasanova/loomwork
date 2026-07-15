## Spec-Driven Development (loomwork)

SDD lifecycle via the **loomwork** plugin — glue for **superpowers** (execution
engine) + **compound-engineering** (`ce-strategy` → `STRATEGY.md`, `ce-compound`
→ `docs/solutions/`, `ce-doc-review`). Doctrine: loomwork playbook
(`references/PLAYBOOK.md` in the plugin).

- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`
  (paths configurable via `.loomwork.json`); roadmap anchor `STRATEGY.md`;
  learnings in `docs/solutions/`.
- Spec frontmatter: only `issue`, `status`
  (`draft|approved|in-progress|partial|implemented|superseded`),
  `implemented_in`, `verified`. Acceptance checkboxes live in the body only.
- Plans freeze after merge (DONE banner + ticked boxes); specs stay current.
- Drift check: `loomwork:audit` skill (periodic, not CI). Close-out before
  merge: `loomwork:close-out` skill — hook-enforced on
  `finishing-a-development-branch`.
