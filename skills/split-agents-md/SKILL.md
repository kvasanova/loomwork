---
name: split-agents-md
disable-model-invocation: true
description: Manual-only; use only when explicitly requested. Split a single-file agent guidance document into a tool-agnostic AGENTS.md plus thin host-specific files (CLAUDE.md, .github/copilot-instructions.md, and similar) that import it. Invoke explicitly when a repository has one oversized CLAUDE.md or AGENTS.md that mixes shared contributor knowledge with host-specific mechanics.
---

# Split agent guidance into AGENTS.md + host files

Announce: "Using loomwork:split-agents-md to split agent guidance."

Invoke this skill only when the user asks for it. It is not automatic and no
hook fires it.

**Goal:** one `AGENTS.md` that any coding agent or human contributor can read
end to end, plus one thin file per host that imports it and adds only what is
true of that host. No duplicated prose across the files.

## 1. Survey before writing

Work in the consumer repository. Do not write anything in this step.

1. List the agent guidance files that already exist: `AGENTS.md`,
   `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
   `.cursor/rules/*`, `.cursorrules`, `CONTRIBUTING.md`.
2. Read each one in full. Note overlaps — the same instruction living in two
   files is the main thing this split removes.
3. Establish which hosts the repository actually targets. Ask the user if it
   is ambiguous; do not create a host file for a host nobody uses.
4. Read enough of the code to judge which claims in the existing guidance are
   still true. A split that carries a stale instruction forward makes the
   stale instruction look freshly reviewed.

## 2. Classify every line

Sort each existing instruction into exactly one bucket.

**Tool-agnostic → `AGENTS.md`.** True regardless of which agent reads it:

- What the repository *is*, and what it is not — for a plugin or a library,
  state that the runtime target is some other repository, and name the
  variable or function that draws that line.
- The domain model: the invariants a change must not break, stated as rules
  rather than as description. Name the file that owns each invariant.
- Build, test, and run commands, with the exact invocation.
- Directory layout and where each kind of file lives.
- Coding style and naming conventions.
- Testing shape: whether the suite is unit-level or behavior-level, what the
  fixtures are, and what a new test is expected to look like.
- Commit and pull request conventions.
- Pinned external names the repository depends on by exact string, with the
  symptom of an upstream rename.
- Anything a human contributor would need on day one.

**Host-specific → that host's file.** Only true because of the host:

- Path and environment variables the host defines
  (`${CLAUDE_PLUGIN_ROOT}`, `CLAUDE_PROJECT_DIR`, `${PLUGIN_ROOT}`).
- Hook, tool, or plugin contracts: which events fire, what the host reads
  from stdout, what registration file the host loads.
- Frontmatter or manifest fields that only that host interprets.
- Reload and lifecycle quirks — for example that a session editing a plugin
  may also be running an older loaded copy of it.
- Host-specific invocation syntax for the same underlying command.

**Ambiguous → `AGENTS.md`.** When a line is arguably both, put the rule in
`AGENTS.md` and leave only the host's mechanism in the host file. Shared by
default keeps the host files thin, which is the point.

**Stale → drop it.** Verify before carrying a claim forward. Report anything
dropped in the final summary so the user can object.

## 3. Write AGENTS.md

Write the complete document, ordered so a first-time reader can follow it:
what the repository is → domain model and invariants → build/test/run →
layout → style → testing → commit and PR conventions.

Preserve any existing marker-guarded block (`<!-- loomwork:begin -->` …
`<!-- loomwork:end -->`) verbatim, including the markers. When such a block
lives in a file that is becoming a thin host file, move the whole block —
markers included — into `AGENTS.md` rather than copying it, so that
`scripts/init.mjs` keeps finding exactly one block to update.

Write prose that states rules and gives the reason behind a rule when the
reason is what stops someone from reverting it. Avoid bullet lists of bare
facts where a sentence carries more.

## 4. Write the host files

Each host file is thin. Give it a one-line purpose statement, the import, one
sentence marking the boundary, then only host-specific sections.

For Claude Code, `CLAUDE.md`:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The imported guidelines above are the shared, tool-agnostic ones. What follows applies only to Claude Code.
```

`@AGENTS.md` is a Claude Code import directive: it inlines the file at load
time. Other hosts do not interpret it. For a host without an import
directive, reference the shared file in a sentence instead — for example
"Read `AGENTS.md` first; everything below is specific to this host" — and
never paste the shared content in.

Codex reads `AGENTS.md` natively and needs no host file at all. Do not create
one unless the repository has genuinely Codex-only mechanics to record, and
then name it for the host rather than reusing `AGENTS.md`.

A host file that carries only the import is still worth writing when the host
cannot read `AGENTS.md` on its own — the import is the bridge, and without it
that host sees none of the shared guidance. Claude Code is such a host: write
`CLAUDE.md` even when the repository has no Claude-specific mechanics. Skip
the file only for a host that reads `AGENTS.md` natively, where an import-only
file would add nothing.

## 5. Verify

1. Re-read each written file end to end.
2. Confirm no instruction appears in two files.
3. Confirm every host file's non-import content is genuinely host-specific —
   move anything that is not back into `AGENTS.md`.
4. Confirm exactly one marker-guarded block survives, in `AGENTS.md`.
5. If the repository has tests that assert on these documents, run them.

## 6. Commit and report

Commit only when the user asked for a commit. Otherwise leave the split in the
working tree and let them review it first — the classification calls are the
kind a human wants to see before they are recorded in history.

When committing, use a `docs:` commit. Write a body that says what moved into
`AGENTS.md`, what each host file kept, and why — the body is the record of the
classification decision, so it goes to other humans in normal prose.

Report to the user: the files written, anything dropped as stale, and any
classification call that could reasonably have gone the other way.
