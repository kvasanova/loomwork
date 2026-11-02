---
issue:
status: implemented
implemented_in: "PR #25"
verified: 2026-11-02
---

# Remove compound-engineering and strategy from loomwork

## Why

Loomwork was built as glue between superpowers and compound-engineering. The owner is dropping compound-engineering, and with it the whole strategy concept: `STRATEGY.md`, the gate that injects it, and the close-out step that routes to `ce-strategy`. Loomwork should work with superpowers alone and carry no mention of compound-engineering in its live surface.

Three repositories were initialized by older loomwork versions (weavereads, timestranding, linkedin-profile) and still carry the old setup. `/loomwork:init` must upgrade them, because a clean plugin does not help a repo that still has stale hooks and doctrine in its own files.

## Goals

- Loomwork requires only superpowers. Preflights never stop for compound-engineering.
- No live file mentions `ce-*`, compound-engineering, or a strategy concept, except the upgrade code and instructions that remove the old setup, and the tests for them.
- Re-running `/loomwork:init` in a repo from any earlier loomwork version brings it to the current setup. A repo that set a custom `strategyFile` moves that file by hand; init reports it and leaves it alone.
- Useful product context in an old `STRATEGY.md` survives by moving into the repo's agent guidance file before the file is deleted.

## Non-goals

- A replacement for `ce-strategy`, `ce-compound`, or `ce-doc-review`. These capabilities are dropped, not rebuilt.
- Uninstalling the compound-engineering plugin from a user's machine.
- Rewriting history: `CHANGELOG.md` entries and existing specs and plans stay as written (frozen plans must not change).
- Reworking issue #24 (OpenSpec). Its body still names compound-engineering; that is updated separately.

## Anti-goals

- Init deleting anything a user could lose: a `STRATEGY.md` that is untracked or has uncommitted changes must survive untouched.
- Init removing a repo's own content from inside a legacy doctrine block.
- Init touching `docs/solutions/` in any way. Existing folders and files stay as they are, and what to do with them is the repo owner's call.
- Init committing, staging, or pushing anything. The upgrade appears as an uncommitted diff for the owner to review.

## Constraints

- No new dependencies and no build step. `rules.mjs` stays pure.
- Gate contract unchanged: single JSON object on stdout, or silent exit 0.

## Approaches

**A. Script with a separate delete step (chosen by the owner).** Plain `init.mjs` does the safe cleanup and reports the `STRATEGY.md` state but never deletes it. The skill moves the useful content, then runs `init.mjs --remove-strategy`, which rechecks the file and deletes it. Testable like the existing `init.test.mjs`, and a crash midway leaves the file in place. It costs one flag, and the skill must avoid duplicating moved content on a rerun.

**B. Marker-driven delete.** The skill leaves a marker and the next plain run deletes the file. No flag, but it adds a file to clean up in consumer repos, and a stray marker could trigger an unintended delete. Rejected.

**C. Skill instructions only.** The agent checks git, deletes files, and edits `.cursor/hooks.json` from Markdown instructions. Least code, but untested, and it leaves deletions to agent judgment on exactly the files with a strict rule. Rejected.

## Design

### What gets removed from the plugin

- `hooks/strategy-gate.sh`, its registrations in `hooks/hooks.json` and `hooks/codex-hooks.json`, the strategy wording in the `codex-hooks.json` description, and comments naming it in `hooks/close-out-gate.sh` and `hooks/lib/resolve-repo-root.sh`.
- `strategyFile` from `DEFAULT_CONFIG` in `scripts/lib/config.mjs`.
- `docs/solutions` scaffolding from `init.mjs`.
- Close-out Step 3b, the `STRATEGY.md` staging in Step 5, and the `STRATEGY.md` and `strategyFile` mentions in the Paths note of `skills/close-out/SKILL.md`.
- `compound-engineering` from the preflights in `skills/audit`, `skills/close-out`, and `skills/init`.
- Routing step 3 of `skills/init/SKILL.md`, replaced by the upgrade steps below.

### Documentation

Rewrite to describe loomwork as an SDD lifecycle layer on top of superpowers:

- **`templates/claude-md-block.md`** (the injected doctrine): remove the compound-engineering, `STRATEGY.md`, and `docs/solutions/` lines.
- **`references/PLAYBOOK.md`**: remove the "three layers" strategy and knowledge rows and the `STRATEGY.md` ownership note, "Where learnings go", the `ce-doc-review` step in the large-capability flow, the strategy items under close-out, the strategy gate row and its truncation paragraph, the strategy and solutions lines in "Where artifacts live", and "What we take from compound-engineering".
- **`README.md`**: rewrite the intro and "Why", install requirements, the init description, the "What ships" table, and Compatibility. Also remove its stale Cursor text, since Cursor support is already gone from init.
- **`AGENTS.md`, `CLAUDE.md`**: remove the strategy ownership rule, the strategy gate behavior paragraph, the `ce-*` pinned names, and the strategy close-out rule. Keep the `=~` matching guidance, using the close-out gate as the example.
- **Both `plugin.json` manifests**: update the descriptions and bump the version to 0.5.0, since this removes a config key, a gate, and a declared dependency.
- **`CHANGELOG.md`**: add a 0.5.0 entry explaining the removal and telling users to re-run init.
- **`.gitignore`**: remove the stale comment about generated Cursor files, keeping the `.cursor/` ignore rule.
- **`skills/split-agents-md/SKILL.md`**: its instruction to preserve the marker block "so `scripts/init.mjs` keeps finding exactly one block to update" is stale, because init now only removes that block. Keep moving the block whole, so init can still find it, and fix the reason.

### `init.mjs` upgrade: default run

A default run does the following, and every step is idempotent:

1. Create the specs and plans directories, as today (no longer `docs/solutions`).
2. Remove the legacy doctrine from `AGENTS.md` and `CLAUDE.md` (below).
3. Remove the old Cursor setup (below).
4. Check `STRATEGY.md` at the repo root. The path is hardcoded in `init.mjs`, and custom paths are not supported.
5. Classify that file and report the result (below). Never delete it in this run. If `.loomwork.json` still has a `strategyFile` key, report that the key is no longer used and that the file it names was left alone. Init never writes `.loomwork.json`.
6. Report leftovers without editing them, whatever the strategy file's state. In a git repo, run `git grep -l` for `STRATEGY.md`, `ce-strategy`, `ce-compound`, `ce-doc-review`, and `compound-engineering`, excluding the specs and plans directories, `docs/solutions/`, and `STRATEGY.md` itself, and list the matching files. Weavereads' `docs/SDD_PLAYBOOK.md` is one example. Frozen plans and specs are excluded because they must not change, which also cuts weavereads from 193 line hits to 6. These references are the owner's to change.

### Legacy doctrine block

Today's init deletes everything between `<!-- loomwork:begin -->` and `<!-- loomwork:end -->`. That is unsafe: timestranding's markers span lines 697–785 of its `AGENTS.md` and also enclose its own `## Deployment` and `## Auth` sections, about 70 lines of real guidance. Weavereads and linkedin-profile hold only doctrine between theirs.

The new rule, for each file: when both markers exist on their own lines with the `## Spec-Driven Development (loomwork)` heading between them, remove that section, up to the next heading of any level or the end marker, and the two marker lines. Everything else between the markers stays, in order. If only one marker exists or the heading is missing, change nothing and report that the file has a loomwork block init could not safely remove. That heading appears in every version of the doctrine template.

A marker mentioned inline in prose is not a block. Keep the line-anchored and CRLF-tolerant matching of today's `legacyBlockRe`.

### Old Cursor setup

- In `.cursor/hooks.json`, remove every entry whose `command` contains `.cursor/hooks/loomwork-`. This catches both the bare and `bash `-prefixed forms that older versions wrote. Drop event arrays left empty.
- Delete `.cursor/hooks/loomwork-strategy-gate.sh` and `.cursor/hooks/loomwork-close-out-gate.sh`. They are generated files, so this does not depend on their git state.
- Delete `.cursor/hooks.json` if no hook entries remain and it has no top-level keys other than `version` and `hooks`. Remove `.cursor/hooks/` if it is empty.
- Leave everything else in `.cursor/` alone, such as weavereads' `settings.json` and `commands/`.
- If `.cursor/hooks.json` is malformed, change nothing in the Cursor setup and report it, so the scripts are not removed while a config may still point at them.

### Strategy file classification

| State | Default run reports | Who acts |
|---|---|---|
| Absent | Nothing about the file | Script |
| Tracked and clean | Ready to migrate, with its path | Skill moves content, then runs `--remove-strategy` |
| Anything else | Left in place, with the reason | Owner |

Classify with `git status --porcelain --ignored -- <path>` after checking the file exists. Exit 0 with empty output means tracked and clean. `??`, `!!`, and modified or staged codes give the untracked, ignored, and uncommitted-changes reasons, and a non-zero exit means no git or git failed. The reason for uncommitted or untracked files tells the owner that committing and re-running init finishes the job.

### `init.mjs --remove-strategy`

Reclassify the file. If it is still tracked and clean, delete it from the working tree without staging. An absent file is success. In any other state, change nothing, report the reason, and exit 1.

### `skills/init/SKILL.md` upgrade steps

After the default run, when the script reports the file as ready to migrate:

1. **Pick the target file.** Use `AGENTS.md` if it exists, else `CLAUDE.md` if it exists, else create `AGENTS.md`. A repo with only `CLAUDE.md` keeps using it, because Claude Code would not read a new `AGENTS.md`.
2. **If the target already has a `## Product context` section, default to skipping the move.** An earlier run probably moved it, and repeating that would duplicate content. It could also be the repo's own section, so step 4 shows it.
3. **Otherwise, draft the useful parts as a `## Product context` section of about 15 lines at most,** using this table, without writing it yet. The section loads on every session, so it stays short. Section names are a guide, since older files vary; the agent applies the same judgment to anything unlisted.

   | Source section | Action |
   |---|---|
   | Target problem, Our approach, Who it's for | Move, keeping their meaning, as short prose |
   | Not working on | Move |
   | Tracks | Move as one line each, without the "why it serves" text |
   | Key metrics | Move only those tied to something in the repo (a table, a command, a code path) |
   | Milestones, Marketing, frontmatter | Drop |

4. **Ask the owner to confirm.** Show the draft, what will be dropped, and the file to be deleted. This also protects a repo adopting loomwork for the first time whose own `STRATEGY.md` has nothing to do with the old setup. When step 2 skipped the move, show the existing section next to the strategy file instead, so the owner can see whether it holds the moved content. On a no, write nothing, delete nothing, and report that the file was kept; a later init asks again.
5. **On a yes, write the section to the target file and run `init.mjs --remove-strategy`.**

The final report relays the script's actions, including any leftovers, states that nothing was committed, and suggests reviewing the diff.

## Calls made by the author, not the owner

- Version 0.5.0.
- The whole "Where learnings go" playbook section goes rather than a trimmed version, consistent with loomwork having no opinion on learnings. Its `CLAUDE.md` and `docs/reference/` guidance goes with it.
- `ce-doc-review` gets no replacement step in the large-capability flow.
- Loomwork's own empty `docs/solutions/.gitkeep` is deleted, since it holds nothing and the folder is no longer part of the layout.
- `.loomwork.json` handling stays as it is today, including the warning and fallback to default paths when it is malformed.
- `## Product context` is capped at about 15 lines, because it loads on every session.
- The leftovers report is a script step, so it runs in every state and can be tested.
- `--remove-strategy` exits 1 when it refuses, so the skill cannot miss the refusal. It does not run the rest of the default upgrade.
- The script cannot verify the content move happened before `--remove-strategy`. It relies on the skill's ordering, and git keeps the file recoverable.

## Left to the builder

- Exact wording of reported actions and the rewritten docs.
- How the classification is shared between the default run and `--remove-strategy`.
- How to port the two strategy-gate tests with no equivalent on a remaining gate: the literal `$` requirement, and the walk-up to a plain `.git` directory. The other strategy-gate tests are deleted with the gate, since the close-out and doctrine gates already cover the same behavior.

## Acceptance

- [x] `git grep -nIiE '\bce-[a-z]|compound-engineering|strategy|solutions'` matches only upgrade code and instructions and their tests, `CHANGELOG.md`, and existing specs and plans.
- [x] `hooks/strategy-gate.sh` is gone, neither hook registration references it, and `brainstorming` or `writing-plans` produces no loomwork injection on Claude Code or Codex payloads.
- [x] The close-out and doctrine gates still pass their tests on both payload shapes, including the newline-led 192KB prompt guard, and remaining gates now cover the literal `$` requirement and the walk-up to a plain `.git` directory.
- [x] `audit`, `close-out`, and `init` preflights require only superpowers.
- [x] A fresh repo gets the specs and plans directories, no `docs/solutions/`, and no output about a missing strategy file.
- [x] A repo with `docs/solutions/` content has it byte-identical after init.
- [x] Init removes the doctrine section and markers and keeps all other content between the markers; a test covers timestranding's shape, with `## Deployment` and `## Auth` before the doctrine.
- [x] A marker block without the doctrine heading, or with only one marker, is left unchanged and reported. A marker mentioned inline in prose is ignored.
- [x] Init lists leftover references in every strategy file state, and skips the specs and plans directories, `docs/solutions/`, and `STRATEGY.md` itself.
- [x] The init skill shows the draft, the dropped content, and the file to be deleted, or an existing `## Product context` section next to the file, and on a no it writes and deletes nothing.
- [x] Init removes loomwork entries from `.cursor/hooks.json` and the two scripts, keeps non-loomwork entries and other `.cursor/` files, and deletes `hooks.json` only when nothing else remains.
- [x] A malformed `.cursor/hooks.json` is reported and the Cursor setup is left unchanged.
- [x] A default run never deletes the strategy file in any state.
- [x] `--remove-strategy` deletes a tracked, clean `STRATEGY.md` without staging.
- [x] `--remove-strategy` changes nothing and exits 1 for untracked, ignored, modified, staged, and non-git cases.
- [x] A `strategyFile` key is reported, and neither `.loomwork.json` nor the file it names is changed.
- [x] Running init twice produces no further changes the second time, including after a partial upgrade.
- [x] Init never creates a commit or stages a file.
- [x] The full test suite passes: `node --test scripts/lib/__tests__/*.test.mjs`.
- [x] Upgrading a copy of each of weavereads, timestranding, and linkedin-profile leaves a `## Product context` section in `AGENTS.md`, no `STRATEGY.md`, no loomwork Cursor files, and no doctrine block, with an uncommitted diff. Timestranding's `## Deployment` and `## Auth` sections are intact.
