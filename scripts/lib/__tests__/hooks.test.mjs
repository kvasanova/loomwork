import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HOOKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../hooks');

// CLAUDE_PROJECT_DIR is controlled explicitly: an ambient value in the
// developer's shell would otherwise leak in and mask the payload-.cwd paths.
function runHook(script, stdinObj, projectDir) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) {
    env.CLAUDE_PROJECT_DIR = projectDir;
  }
  return spawnSync('bash', [path.join(HOOKS_DIR, script)], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    env,
  });
}

function skillEvent(skill) {
  return { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill } };
}

function codexPromptEvent(prompt, cwd) {
  return { hook_event_name: 'UserPromptSubmit', prompt, cwd };
}

function sessionStartEvent(cwd) {
  return { hook_event_name: 'SessionStart', source: 'startup', cwd };
}

test('strategy-gate fires on plugin-qualified brainstorming with default STRATEGY.md', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), '# My Strategy\ncontent-marker-42\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /content-marker-42/);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('strategy-gate tells agents not to open the strategy file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'content-marker-42\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /do NOT Read or open the strategy file/);
  assert.match(context, /any loomwork hook script/);
  assert.doesNotMatch(context, /read it before/i);
});

test('strategy-gate points at the saved hook-output file instead of claiming full inline content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'content-marker-42\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  // Codex truncates output past additionalContextLimit and spills it to a file,
  // so the gate must not assert that everything is inline.
  assert.doesNotMatch(context, /full content is already injected/);
  assert.match(context, /truncated/);
  assert.match(context, /saved hook-output file/);
});

test('strategy-gate honors custom strategyFile from .loomwork.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/VISION.md'), 'vision-marker-7\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:writing-plans'), root);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /vision-marker-7/);
});

test('strategy-gate stays silent on non-matching skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'x\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:test-driven-development'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('strategy-gate nudges toward ce-strategy when the strategy file is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('strategy-gate missing-file nudge fires for writing-plans too', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:writing-plans'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /compound-engineering:ce-strategy/);
});

test('strategy-gate stays silent on non-matching skill when strategy file missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:test-driven-development'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('strategy-gate missing-file nudge honors custom strategyFile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'decoy-should-not-be-injected\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), root);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.doesNotMatch(context, /decoy-should-not-be-injected/);
});

test('strategy-gate injects strategy for an explicit Codex brainstorming prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'codex-strategy-marker\n');
  const result = runHook(
    'strategy-gate.sh',
    codexPromptEvent('$superpowers:brainstorming design issue 3', root),
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /codex-strategy-marker/);
});

test('strategy-gate nudges for an explicit Codex writing-plans prompt without strategy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook(
    'strategy-gate.sh',
    codexPromptEvent('$superpowers:writing-plans', root),
  );
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /compound-engineering:ce-strategy/);
});

test('strategy-gate ignores unrelated Codex prompts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook('strategy-gate.sh', codexPromptEvent('fix the parser', root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('strategy-gate stays silent when CLAUDE_PROJECT_DIR is unset', () => {
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('close-out-gate fires on finishing-a-development-branch with configured plansDir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/plans' }));
  const result = runHook(
    'close-out-gate.sh',
    skillEvent('superpowers:finishing-a-development-branch'),
    root,
  );
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/plans/);
  assert.match(out.hookSpecificOutput.additionalContext, /loomwork:close-out/);
});

test('close-out-gate stays silent on non-matching skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('close-out-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('close-out-gate reminds on an explicit Codex finishing prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/plans' }));
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('$superpowers:finishing-a-development-branch', root),
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/plans/);
  assert.match(out.hookSpecificOutput.additionalContext, /loomwork:close-out/);
});

test('close-out-gate ignores unrelated Codex prompts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook('close-out-gate.sh', codexPromptEvent('$superpowers:brainstorming', root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate injects the doctrine block for a repo with docs/superpowers/specs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate injects the doctrine block for a repo with .loomwork.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate respects a custom specsDir from .loomwork.json for opt-in detection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ specsDir: 'docs/specs' }));
  fs.mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /Spec-Driven Development \(loomwork\)/);
});

test('doctrine-gate stays silent for a repo with no loomwork markers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate stays silent when CLAUDE_PROJECT_DIR is unset and no cwd resolves', () => {
  const result = runHook('doctrine-gate.sh', { hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate stays silent on malformed .loomwork.json rather than crashing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), '{ not valid json');
  const result = runHook('doctrine-gate.sh', sessionStartEvent(root), root);
  assert.equal(result.status, 0, result.stderr);
  // Falls back to default specsDir for the opt-in check; no default dir exists here, so silent.
  assert.equal(result.stdout.trim(), '');
});

test('doctrine-gate ignores non-SessionStart events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true });
  const result = runHook('doctrine-gate.sh', skillEvent('superpowers:brainstorming'), root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

// Long-prompt regressions: the gates once matched with `echo | grep -q`. Once
// grep matches it exits immediately, closing the pipe while echo is still
// writing; echo then fails and `set -o pipefail` propagates that status, so
// `|| exit 0` turned the failure into a SILENT SUCCESS — exit 0, no output,
// strategy never injected.
//
// Reproducing it needs both conditions, verified against the pre-fix gate:
//   * a NEWLINE after the trigger, so grep can complete a line and exit early
//     while echo still has the tail to write. A single-line prompt never
//     reproduced at any size (0/10 at 64KB, 128KB and 200KB).
//   * a tail past the 64KB pipe buffer. Measured: 64KB -> 0/10 dropped,
//     128KB -> 10/10 dropped.
// A tail that is large but single-line passes against the OLD gate too
// (0/20 at 84KB), which would make this guard inert.
const LONG_TAIL_BYTES = 192 * 1024;
const LONG_TAIL = `\n${'padding-text-to-force-a-large-pipe-buffer '.repeat(
  Math.ceil(LONG_TAIL_BYTES / 42),
)}`;

test('strategy-gate survives a multi-kilobyte Codex prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'long-prompt-marker\n');
  const prompt = `$superpowers:brainstorming${LONG_TAIL}`;
  assert.ok(prompt.includes('\n'), 'the trigger must be followed by a newline');
  assert.ok(prompt.length > 128 * 1024);
  const result = runHook('strategy-gate.sh', codexPromptEvent(prompt, root));
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /long-prompt-marker/);
});

test('close-out-gate survives a multi-kilobyte Codex prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/plans' }));
  const prompt = `$superpowers:finishing-a-development-branch${LONG_TAIL}`;
  assert.ok(prompt.includes('\n'), 'the trigger must be followed by a newline');
  assert.ok(prompt.length > 128 * 1024);
  const result = runHook('close-out-gate.sh', codexPromptEvent(prompt, root));
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/plans/);
});

test('strategy-gate stays silent on a long prompt that does not name a gated skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'x\n');
  const result = runHook('strategy-gate.sh', codexPromptEvent(`refactor the parser${LONG_TAIL}`, root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('strategy-gate requires the literal $ before superpowers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'x\n');
  const result = runHook('strategy-gate.sh', codexPromptEvent('superpowers:brainstorming please', root));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('strategy-gate does not match a skill name with a trailing suffix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-'));
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'x\n');
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming-extra'), root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('close-out-gate does not match a prompt with a trailing word character', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-codex-'));
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('$superpowers:finishing-a-development-branches', root),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

// --- Root resolution (Codex .cwd walks up; CLAUDE_PROJECT_DIR does not) ---

function makeRepo(prefix, marker) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.mkdirSync(path.join(root, marker), { recursive: true });
  return root;
}

test('strategy-gate walks up from a nested .cwd to the .git marker', () => {
  const root = makeRepo('loomwork-hook-walk-', '.git');
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'walked-up-marker\n');
  const nested = path.join(root, 'a/b/c');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook('strategy-gate.sh', codexPromptEvent('$superpowers:brainstorming', nested));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /walked-up-marker/);
});

test('strategy-gate walks up from a nested .cwd to the .loomwork.json marker', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-walk-')));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ strategyFile: 'docs/VISION.md' }));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/VISION.md'), 'nested-vision-marker\n');
  const nested = path.join(root, 'x/y');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook('strategy-gate.sh', codexPromptEvent('$superpowers:writing-plans', nested));
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /nested-vision-marker/);
});

test('strategy-gate falls back to the raw .cwd when no marker is found', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-nomarker-')));
  const result = runHook('strategy-gate.sh', codexPromptEvent('$superpowers:brainstorming', dir));
  assert.equal(result.status, 0, result.stderr);
  // No marker anywhere up the tree, so the nudge still fires for the raw cwd.
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /no strategy file yet/);
});

test('strategy-gate uses CLAUDE_PROJECT_DIR exactly, without walking up', () => {
  const root = makeRepo('loomwork-hook-exact-', '.git');
  fs.writeFileSync(path.join(root, 'STRATEGY.md'), 'ancestor-strategy-should-not-be-used\n');
  const nested = path.join(root, 'sub');
  fs.mkdirSync(nested);
  const result = runHook('strategy-gate.sh', skillEvent('superpowers:brainstorming'), nested);
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /no strategy file yet/);
  assert.doesNotMatch(context, /ancestor-strategy-should-not-be-used/);
});

test('close-out-gate walks up from a nested .cwd to the .loomwork.json marker', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-walk-')));
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/nested-plans' }));
  const nested = path.join(root, 'deep/er');
  fs.mkdirSync(nested, { recursive: true });
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('$superpowers:finishing-a-development-branch', nested),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /docs\/nested-plans/);
});

test('close-out-gate uses CLAUDE_PROJECT_DIR exactly, without walking up', () => {
  const root = makeRepo('loomwork-hook-exact-', '.git');
  fs.writeFileSync(path.join(root, '.loomwork.json'), JSON.stringify({ plansDir: 'docs/ancestor-plans' }));
  const nested = path.join(root, 'sub');
  fs.mkdirSync(nested);
  const result = runHook(
    'close-out-gate.sh',
    skillEvent('superpowers:finishing-a-development-branch'),
    nested,
  );
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(context, /docs\/ancestor-plans/);
  assert.match(context, /docs\/superpowers\/plans/);
});

test('close-out-gate stays silent when neither CLAUDE_PROJECT_DIR nor cwd resolves', () => {
  const result = runHook('close-out-gate.sh', skillEvent('superpowers:finishing-a-development-branch'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('close-out-gate falls back to the raw .cwd when no marker is found', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-hook-nomarker-')));
  const result = runHook(
    'close-out-gate.sh',
    codexPromptEvent('$superpowers:finishing-a-development-branch', dir),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /docs\/superpowers\/plans/);
});
