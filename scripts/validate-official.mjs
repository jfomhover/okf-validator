#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ensureRepo,
  resolveRepoPath,
  isPinned,
  readPin,
  headCommit,
  discoverBundles,
  validateAll,
  OFFICIAL_REPO_URL,
  PIN_FILE,
} from './official-corpus.mjs';
import { SUPPORTED_OKF_VERSIONS } from '../src/index.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printUsage() {
  process.stderr.write(`validate-official — validate the validator against the official OKF bundles

Usage:
  node scripts/validate-official.mjs [repoPath] [--okf-version <version>] [--force]

  repoPath  path to a clone of the official OKF repo (${OFFICIAL_REPO_URL});
            defaults to $OKF_OFFICIAL_REPO or ../knowledge-catalog; if missing, a
            fresh shallow clone is made.
  --force   validate even when the clone HEAD differs from the pinned commit.
`);
}

function printRow({ root, result }, basePath) {
  const name = path.relative(basePath, root) || root;
  const issues = [...result.errors, ...result.warnings]
    .map((issue) => `    ${issue.severity}: ${issue.file}: ${issue.message}`)
    .join('\n');
  const summary = `  ${name}: errors=${result.errors.length} warnings=${result.warnings.length}`;
  if (issues) {
    process.stdout.write(`${summary}\n${issues}\n`);
  } else {
    process.stdout.write(`${summary}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let repoPath = null;
  let okfVersion = null;
  let force = false;
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') {
      force = true;
    } else if (arg === '--okf-version') {
      okfVersion = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--okf-version=')) {
      okfVersion = arg.split('=', 2)[1];
    } else if (arg.startsWith('-') && arg !== '-') {
      printUsage();
      process.exitCode = 2;
      return;
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (okfVersion !== null && !SUPPORTED_OKF_VERSIONS.includes(okfVersion)) {
    process.stderr.write(`unsupported OKF version "${okfVersion}"\n`);
    process.exitCode = 2;
    return;
  }

  const resolved = resolveRepoPath(positional[0] ?? null);
  const repoPathAbs = ensureRepo(resolved);
  process.stdout.write(`Official repo: ${repoPathAbs}\n`);

  if (!force && !isPinned(repoPathAbs)) {
    const pin = readPin();
    const head = pin ? headCommit(repoPathAbs) : null;
    process.stderr.write(
      `official-corpus skip: clone HEAD (${head}) does not match the pinned commit (${pin}).\n` +
        `Run \`npm run update-official-pin -- ${repoPathAbs}\` after reviewing upstream changes,\n` +
        `or pass --force to validate against the current HEAD anyway.\n`
    );
    process.exitCode = head !== null ? 0 : 2;
    return;
  }

  const bundleRoots = discoverBundles(repoPathAbs);
  const basePath = path.dirname(bundleRoots[0]) ?? repoPathAbs;
  process.stdout.write(`Bundles: ${bundleRoots.length}\n\n`);
  const { rows, totals } = await validateAll(bundleRoots, { version: okfVersion ?? '0.2' });

  for (const row of rows) {
    printRow(row, basePath);
  }

  process.stdout.write(`\nTotals: errors=${totals.errors} warnings=${totals.warnings}\n`);
  if (totals.errors > 0) {
    process.stderr.write(`Official corpus validation FAILED (${totals.errors} error(s)).\n`);
    process.exitCode = 1;
  }
}

await main();