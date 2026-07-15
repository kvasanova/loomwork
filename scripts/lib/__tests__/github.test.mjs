import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchGithubState } from '../github.mjs';

test('fetchGithubState invokes gh with repoRoot as cwd', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-bin-'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loomwork-repo-'));
  const fakeGh = path.join(binDir, 'gh');
  fs.writeFileSync(fakeGh, '#!/usr/bin/env bash\nprintf \'{"state":"%s"}\' "$PWD"\n', { mode: 0o755 });

  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    const { issues } = await fetchGithubState({ issueNums: [1], prNums: [], repoRoot });
    assert.equal(fs.realpathSync(issues.get(1)), fs.realpathSync(repoRoot));
  } finally {
    process.env.PATH = origPath;
  }
});
