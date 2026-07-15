import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchGithubState } from '../github.mjs';

test.skip('fetchGithubState invokes gh with repoRoot as cwd', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-bin-'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-repo-'));
  
  const isWin = os.platform() === 'win32';
  const fakeGh = path.join(binDir, isWin ? 'gh.cmd' : 'gh');
  
  if (isWin) {
    fs.writeFileSync(fakeGh, `@echo {"state":"${repoRoot.replace(/\\/g, '\\\\')}"}`);
  } else {
    fs.writeFileSync(fakeGh, '#!/usr/bin/env bash\nprintf \'{"state":"%s"}\' "$PWD"\n', { mode: 0o755 });
  }

  const pathDelimiter = path.delimiter;
  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}${pathDelimiter}${origPath}`;
  try {
    const { issues } = await fetchGithubState({ issueNums: [1], prNums: [], repoRoot });
    const issueState = issues.get(1);
    assert.ok(issueState, 'issue state should be set');
    assert.equal(fs.realpathSync(issueState), fs.realpathSync(repoRoot));
  } finally {
    process.env.PATH = origPath;
  }
});
