#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

import {
  ensureRepo,
  resolveRepoPath,
  headCommit,
  discoverBundles,
  validateAll,
  PIN_FILE,
  OFFICIAL_REPO_URL,
} from './official-corpus.mjs';

async function main() {
  const positional = process.argv.slice(2);
  let repoPathInput = null;
  for (const arg of positional) {
    if (!arg.startsWith('-')) {
      repoPathInput = arg;
    } else {
      process.stderr.write(`unknown option: ${arg}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const repoPathAbs = ensureRepo(resolveRepoPath(repoPathInput ?? null));
  const commit = headCommit(repoPathAbs);

  const bundleRoots = discoverBundles(repoPathAbs);
  const { totals } = await validateAll(bundleRoots);
  process.stdout.write(`HEAD: ${commit}\n`);
  if (totals.errors > 0) {
    process.stderr.write(
      `Refusing to pin ${commit}: the current official bundles have ${totals.errors} validation error(s).\n` +
        'Fix the validator first; the pin must represent a green corpus.\n'
    );
    process.exitCode = 1;
    return;
  }

  const content =
    `This file pins the GoogleCloudPlatform/knowledge-catalog commit used by:\n` +
    `  - scripts/validate-official.mjs\n` +
    `  - test/official-bundles.test.mjs\n\n` +
    `Current pin:\n${commit}\n`;
  fs.writeFileSync(PIN_FILE, content);
  process.stdout.write(`Pinned ${OFFICIAL_REPO_URL} at ${commit} (${bundleRoots.length} bundles, ${totals.warnings} warnings).\n`);
  process.stdout.write('Review the diff to the pin file, then commit it.\n');
}

await main();