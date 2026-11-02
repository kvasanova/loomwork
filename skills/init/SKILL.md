---
name: init
description: Initialize the current consumer repository for loomwork, or upgrade one set up by an older loomwork version. Scaffolds the SDD spec and plan directories, removes the legacy marker-guarded doctrine block from AGENTS.md or CLAUDE.md and the old Cursor hook setup, and migrates an old STRATEGY.md into a short product context section. Use when setting up loomwork in a repository or re-running it after a loomwork upgrade.
---

# Initialize Loomwork

Announce: "Using loomwork:init to initialize this repository."

## 1. Dependency preflight

Before writing anything, verify the available-skills list contains all of:

- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:finishing-a-development-branch`

If any are missing, stop without writing. Tell the user to install the
superpowers plugin from its configured marketplace, then rerun
`loomwork:init`.

## 2. Run the scaffolder

Resolve `../../scripts/init.mjs` relative to the directory containing this
installed `SKILL.md`. Execute the resolved absolute path with the consumer
repository as the command working directory:

```bash
node ../../scripts/init.mjs
```

The command above names a skill-relative resource, not a path relative to the
shell's working directory. Resolve it to an absolute path from this `SKILL.md`
before executing it, while leaving the shell working directory at the consumer
repository. Do not look up the plugin from the consumer repository and do not
require a plugin-root environment variable.

The script creates missing spec and plan directories, removes the loomwork
doctrine section and markers from a legacy marker-guarded block in
`AGENTS.md` or `CLAUDE.md` (the doctrine itself is delivered live by the
plugin's `SessionStart` hook, not copied into the repo), removes the old
loomwork Cursor hooks, and reports on `STRATEGY.md`. Paths come from
`.loomwork.json` when present. A default run never deletes `STRATEGY.md`,
never commits or stages anything, and never writes `.loomwork.json`.

## 3. Migrate `STRATEGY.md`

Run this section only when the action list contains exactly
`STRATEGY.md is ready to migrate`. If it instead says
`STRATEGY.md left in place: <reason>`, relay the reason in the report and do
not migrate. If it says nothing about `STRATEGY.md`, skip this section.

1. **Pick the target file.** Use `AGENTS.md` if it exists, else `CLAUDE.md`
   if it exists, else create `AGENTS.md`. A repo with only `CLAUDE.md` keeps
   using it, because Claude Code would not read a new `AGENTS.md`.
2. **If the target already has a `## Product context` section, default to
   skipping the move.** An earlier run probably moved it, and repeating that
   would duplicate content. It could also be the repo's own section, so step
   4 shows it to the owner.
3. **Otherwise, draft the useful parts as a `## Product context` section of
   about 15 lines at most**, using this table, without writing it yet. The
   section loads on every session, so it stays short. Section names are a
   guide, since older files vary; apply the same judgment to anything
   unlisted.

   | Source section | Action |
   |---|---|
   | Target problem, Our approach, Who it's for | Move, keeping their meaning, as short prose |
   | Not working on | Move |
   | Tracks | Move as one line each, without the "why it serves" text |
   | Key metrics | Move only those tied to something in the repo (a table, a command, a code path) |
   | Milestones, Marketing, frontmatter | Drop |

4. **Ask the owner to confirm.** Show the draft, what will be dropped, and
   that `STRATEGY.md` will be deleted. This also protects a repo adopting
   loomwork for the first time whose own `STRATEGY.md` has nothing to do with
   the old setup. When step 2 skipped the move, show the existing
   `## Product context` section next to `STRATEGY.md` instead, so the owner
   can see whether it holds the moved content. On a no, write nothing, delete
   nothing, and report that `STRATEGY.md` was kept; a later init asks again.
5. **On a yes, write the section to the target file, then remove the file.**
   Resolve `../../scripts/init.mjs` from this `SKILL.md` exactly as in
   section 2 and run it from the consumer repository with the flag:

   ```bash
   node ../../scripts/init.mjs --remove-strategy
   ```

   Check the exit code. Exit 0 means the file was removed (not staged) or was
   already absent. Exit 1 means the script refused and printed
   `STRATEGY.md left in place: <reason>`; report that reason and stop the
   migration, leaving the written section for the owner to review. Exit 2 is
   an error; report it.

## 4. Report

Relay the script's action list, including any
`references to the old setup remain in: <files>` line; those references are
the owner's to change, so list them without editing them. Report the outcome
of section 3, if it ran. State that nothing was committed, and suggest
reviewing the diff. Mention that Codex users must review and trust plugin
hooks through `/hooks`.
