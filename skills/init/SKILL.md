---
name: init
description: Initialize the current consumer repository for loomwork by scaffolding SDD directories and removing any legacy marker-guarded doctrine block from AGENTS.md or CLAUDE.md. Use when setting up loomwork in a repository.
---

# Initialize Loomwork

Announce: "Using loomwork:init to initialize this repository."

## 1. Dependency preflight

Before writing anything, verify the available-skills list contains all of:

- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:finishing-a-development-branch`
- `compound-engineering:ce-strategy`
- `compound-engineering:ce-compound`

If any are missing, stop without writing. Name the missing plugin and tell the
user to install it from its configured marketplace, then rerun `loomwork:init`.

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

The script creates missing spec, plan, and solution directories, and removes
a pre-existing marker-guarded loomwork block from `AGENTS.md` or `CLAUDE.md`
if found — the doctrine itself is delivered live by the plugin's
`SessionStart` hook, not copied into the repo. Paths come from
`.loomwork.json` when present. The script never creates or edits the
strategy file.

## 3. Route missing strategy ownership

If the action list says the configured strategy file is missing, invoke
`compound-engineering:ce-strategy` to author it before reporting completion.
If the file already exists, skip this step. Never author or edit it directly.

## 4. Report

Relay the script's action list, mention that Codex users must review and trust
plugin hooks through `/hooks`, and suggest committing newly created files.
