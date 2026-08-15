import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBundle } from '../src/index.js';
import { resolveRepoPath, isPinned, headCommit, readPin, discoverBundles } from '../scripts/official-corpus.mjs';

test('all official OKF bundles are conformant (pinned corpus)', async (t) => {
  const repoPath = resolveRepoPath(null);
  if (!fs.existsSync(repoPath)) {
    t.skip(
      'official knowledge-catalog clone not present. Set OKF_OFFICIAL_REPO or run ' +
        '`git clone https://github.com/GoogleCloudPlatform/knowledge-catalog.git ../knowledge-catalog`.'
    );
    return;
  }
  if (!isPinned(repoPath)) {
    t.skip(
      `official clone HEAD (${headCommit(repoPath)}) differs from the pinned commit ` +
        `(${readPin()}). Run \`npm run update-official-pin\` to pin the current HEAD after review.`
    );
    return;
  }

  const bundleRoots = discoverBundles(repoPath);
  assert.ok(bundleRoots.length >= 4, `expected at least 4 official bundles, got ${bundleRoots.length}`);

  for (const bundleRoot of bundleRoots) {
    const result = await validateBundle(bundleRoot);
    const detail = JSON.stringify(result.errors, null, 2);
    assert.equal(result.errors.length, 0, `errors in ${bundleRoot}:\n${detail}`);
  }
});
