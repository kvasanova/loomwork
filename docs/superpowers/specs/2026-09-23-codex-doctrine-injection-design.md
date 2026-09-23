---
issue: 20
status: approved
implemented_in:
verified:
---

# Deliver loomwork doctrine to Codex sessions via `SessionStart`

## Problem

#17 (shipped, commit 4ce86f1) stopped copying the loomwork doctrine into consumer repos and instead injects it live into Claude Code sessions via a `SessionStart` hook (`hooks/doctrine-gate.sh`), sourced from the plugin's own `templates/claude-md-block.md`. That spec explicitly scoped Codex delivery out and deferred it to this issue, because Codex's `SessionStart` support for `additionalContext` was unconfirmed — [openai/codex#45999](https://github.com/openai/codex/issues/45999) reported it failing outright on codex-cli 0.154.0 ("SessionStart Failed", closed "not planned"), while Codex's own hooks docs said it should work.

Until this ships, Codex sessions in loomwork repos receive no doctrine at all: #17 already removed the in-repo `AGENTS.md`/`CLAUDE.md` block that used to carry it, and Codex has no other delivery path.

## Probe result

Verified directly against installed codex-cli 0.155.1 using `codex debug prompt-input` (renders the full model-visible prompt input with no API call) and `codex exec --dangerously-bypass-hook-trust`, in a throwaway `CODEX_HOME` (never the user's real `~/.codex`):

- **Without `--dangerously-bypass-hook-trust`:** an untrusted `SessionStart` hook does not run at all — no trace-file side effect, no injected content anywhere in `codex debug prompt-input`'s output. This is Codex's hook-trust gate silently skipping an unapproved hook, not a `SessionStart`/`additionalContext` failure — it matches the documented, expected behavior for a hook a user hasn't approved yet.
- **With `--dangerously-bypass-hook-trust`:** a `SessionStart` hook returning `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }` on stdout **is** injected — a probe model reported back the exact marker string it was only given via the hook's `additionalContext`, and the CLI printed `hook: SessionStart` / `hook: SessionStart Completed` diagnostic lines confirming execution.

**Conclusion: `SessionStart` `additionalContext` works on codex-cli 0.155.1.** openai/codex#45999 does not reproduce on this version — whatever caused it on 0.154.0 has since been fixed, or the report conflated hook-trust skipping with the feature itself. The earlier disagreement in the issue is resolved in favor of the docs.

**Not tested:** re-injection after context compaction (the `compact` source). Codex's own hooks docs claim `compact` re-injects, matching Claude Code's `startup|clear|compact` matcher, but this was not independently verified — see Non-goals.

**Trust caveat:** because injection only happens once a hook is trusted, a Codex user's first session in an opted-in repo after this ships will hit Codex's normal hook-approval prompt (the same one that already gates `strategy-gate.sh`/`close-out-gate.sh` today, since this reuses the identical `hooks/codex-hooks.json` registration point) — not a new prompt, not a regression, just a one-time approval this feature now also depends on.

## Governing decision

Register the *existing* `hooks/doctrine-gate.sh` — unmodified — as a `SessionStart` hook in `hooks/codex-hooks.json`, the Codex-native hooks manifest already used for `strategy-gate.sh` and `close-out-gate.sh`. No script changes: `doctrine-gate.sh` already branches on `event == "SessionStart"` from the JSON payload rather than on which harness invoked it, already resolves the repo root via `CLAUDE_PROJECT_DIR` or payload `.cwd` (Codex's `SessionStart` payload carries `.cwd`, same as Claude's), and already reports back whatever `hookEventName` it received. The same binary that already serves Claude Code sessions serves Codex sessions with zero new logic — only a new registration entry and new tests confirming the existing script behaves correctly under Codex's payload shape and environment (no `CLAUDE_PROJECT_DIR`).

This keeps the single-source-of-truth property #17 established: one script, one template file, one behavior, now reachable from two harnesses' native hook systems.

## Scope

**In scope:**
- A `SessionStart` group in `hooks/codex-hooks.json` invoking `hooks/doctrine-gate.sh`.
- Tests exercising `doctrine-gate.sh` under Codex's `SessionStart` payload shape (no `CLAUDE_PROJECT_DIR`, `.cwd`-only root resolution, including the nested-subdirectory walk-up).
- A test asserting `codex-hooks.json` registers the `SessionStart` group correctly.
- Documentation updates (`references/PLAYBOOK.md`, `AGENTS.md`) replacing "not yet implemented — tracked in issue #20" with the shipped Codex path.
- Recording the probe result (this document) as the acceptance-criterion evidence for issue #20's first checkbox.

**Out of scope:**
- Any change to `hooks/doctrine-gate.sh` itself — the probe confirms the existing script's payload handling already works unmodified.
- Any change to `templates/claude-md-block.md`'s content.
- Truncation/spill handling for the doctrine's `additionalContextLimit` — see Design below; not needed because the doctrine fits comfortably under the existing 2500-char limit already used for the other two Codex gates.
- Verifying `compact`-source re-injection — see Non-goals.
- Posting the probe result to GitHub issue #20 — a separate, explicit step after this spec is approved, not part of implementation.

## Design

### `hooks/codex-hooks.json` change

Add a `SessionStart` group alongside the existing `UserPromptSubmit` group, following the exact shape already used for the other two gates:

```json
{
  "description": "Loomwork strategy and close-out gates for explicit Codex skill invocations.",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "bash \"${PLUGIN_ROOT}/hooks/strategy-gate.sh\"", "additionalContextLimit": 2500 },
          { "type": "command", "command": "bash \"${PLUGIN_ROOT}/hooks/close-out-gate.sh\"", "additionalContextLimit": 2500 }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "bash \"${PLUGIN_ROOT}/hooks/doctrine-gate.sh\"", "additionalContextLimit": 2500 }
        ]
      }
    ]
  }
}
```

No `matcher` field, matching every existing group in this file — Codex's `SessionStart` fires for every start source (equivalent to Claude's `startup|clear|compact`), and `doctrine-gate.sh` itself does the event/opt-in filtering, not the registration.

`additionalContextLimit: 2500` matches the other two gates for consistency, even though the doctrine template is 1,291 bytes as of this writing — well under the limit, so truncation and the "read the saved hook-output file" spill message (which `strategy-gate.sh` needs because strategy files can be arbitrarily long) do not apply here in practice. If `templates/claude-md-block.md` ever grows past ~2500 bytes, Codex's own truncate+spill behavior (already implemented Codex-side, not something loomwork's gate emits) takes over automatically — no gate code change needed for that case either.

### No `doctrine-gate.sh` changes

Reading the current script confirms it already:
- Reads `.hook_event_name` from stdin JSON and exits 0 unless it equals `"SessionStart"` — harness-agnostic.
- Resolves root via `CLAUDE_PROJECT_DIR` if set, else `resolve_repo_root(payload.cwd)` — Codex's `SessionStart` payload includes `.cwd`, and Codex sessions never set `CLAUDE_PROJECT_DIR`, so the `.cwd`-walk-up branch is what actually runs for Codex, exercising a code path Claude's own test suite covers only incidentally (Claude sessions almost always have `CLAUDE_PROJECT_DIR` set).
- Emits `hookSpecificOutput.hookEventName` using the *input* event name (`$event`), not a hardcoded `"SessionStart"` string — so the output is already correct for both harnesses without modification.

This is a pure registration change plus tests. No behavior in the script is Claude-specific.

### File Structure

- `hooks/codex-hooks.json` — modify. Add the `SessionStart` group above.
- `scripts/lib/__tests__/hooks.test.mjs` — modify. Add `doctrine-gate.sh` test cases using Codex's `SessionStart` payload shape (the existing `sessionStartEvent(cwd)` helper, already present in this file for Claude-side tests, is reused as-is — it is payload-shape-agnostic and needs no change).
- `scripts/lib/__tests__/plugin.test.mjs` — modify. Add an assertion that `hooks/codex-hooks.json`'s `SessionStart` group registers `doctrine-gate.sh` with `additionalContextLimit: 2500`, mirroring the existing `'Codex hooks run both gates before explicit skill prompts'` test's shape.
- `references/PLAYBOOK.md` — modify. Update the Doctrine row of the hook-enforcement table; note the Codex hook-trust dependency where Codex's per-gate behavior is already documented.
- `AGENTS.md` — modify. Update the "Hooks: three runtimes, one behavior" paragraph to state Codex also registers `SessionStart`, not just `UserPromptSubmit`.

### Non-goals

- No verification of `compact`-source re-injection for Codex. Claude Code's matcher already covers `startup|clear|compact` explicitly; Codex's registration here has no matcher restriction, so if Codex's `compact` source fires a `SessionStart` event at all, this gate already handles it — but whether Codex actually re-fires `SessionStart` after compaction was not probed. This is a known gap, not a hidden one: if a future session shows the doctrine going stale mid-Codex-session after compaction, that's the next investigation, not a bug in this change.
- No change to hook-trust UX. Codex's per-hook trust approval is existing, unmodified Codex behavior that this change simply now also depends on (previously only `strategy-gate.sh`/`close-out-gate.sh` did).
- No retry/fallback path if a Codex user declines hook trust. A user who never trusts the loomwork Codex hooks gets no doctrine and no gates at all — same as today for strategy/close-out, extended to doctrine. Silent, not broken: matches `doctrine-gate.sh`'s existing "stay silent when root can't be resolved" philosophy applied one layer up (trust, not resolution).

## Acceptance

- [x] Probe result (works/fails, codex-cli version) recorded in this document: **works**, codex-cli 0.155.1, confirmed via `codex debug prompt-input` and `codex exec --dangerously-bypass-hook-trust` against a throwaway `CODEX_HOME`.
- [ ] A Codex session in a loomwork repo (`.loomwork.json` or the configured `specsDir` present) receives the current doctrine from the installed plugin via `SessionStart` `additionalContext`, with no in-repo block.
- [ ] A Codex session outside a loomwork repo receives no doctrine injection from `doctrine-gate.sh`.
- [ ] `doctrine-gate.sh` correctly resolves the repo root from a Codex `SessionStart` payload's `.cwd` alone (no `CLAUDE_PROJECT_DIR`), including from a nested subdirectory.
- [ ] `hooks.test.mjs` covers the Codex `SessionStart` payload shape for `doctrine-gate.sh`.
- [ ] `plugin.test.mjs` asserts `hooks/codex-hooks.json` registers the `SessionStart` group correctly.
- [ ] `references/PLAYBOOK.md` and `AGENTS.md` no longer describe Codex doctrine delivery as unimplemented.
- [ ] `node --test scripts/lib/__tests__/*.test.mjs` passes.
