import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validateBundle } from '../src/index.js';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIN_FILE = path.join(PACKAGE_ROOT, 'spec', 'official-corpus-pin.txt');
export const OFFICIAL_REPO_URL = 'https://github.com/GoogleCloudPlatform/knowledge-catalog.git';

function runGit(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' }).trim();
}

export function defaultRepoPath() {
  return path.join(PACKAGE_ROOT, '..', 'knowledge-catalog');
}

export function resolveRepoPath(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  if (process.env.OKF_OFFICIAL_REPO) {
    return path.resolve(process.env.OKF_OFFICIAL_REPO);
  }
  return defaultRepoPath();
}

export function ensureRepo(repoPath) {
  if (fs.existsSync(path.join(repoPath, '.git'))) {
    return repoPath;
  }
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  execFileSync('git', ['clone', '--depth', '1', OFFICIAL_REPO_URL, repoPath], { stdio: 'inherit' });
  return repoPath;
}

export function readPin() {
  const text = fs.readFileSync(PIN_FILE, 'utf8');
  const match = text.match(/^[0-9a-f]{40}$/m);
  return match ? match[0] : null;
}

export function headCommit(repoPath) {
  return runGit(repoPath, ['rev-parse', 'HEAD']);
}

export function isPinned(repoPath) {
  const pin = readPin();
  return pin !== null && headCommit(repoPath) === pin;
}

export function discoverBundles(repoPath) {
  const okfDir = path.join(repoPath, 'okf');
  const okfBundles = path.join(okfDir, 'bundles');
  const rootBundles = path.join(repoPath, 'bundles');

  const bundleDir = fs.existsSync(okfBundles) ? okfBundles : rootBundles;
  if (!fs.existsSync(bundleDir)) {
    throw new Error(`No bundle directory found in ${repoPath} (looked for okf/bundles and bundles)`);
  }

  return fs
    .readdirSync(bundleDir)
    .map((name) => path.join(bundleDir, name))
    .filter((dir) => fs.statSync(dir).isDirectory())
    .sort();
}

export async function validateAll(bundleRoots, options = {}) {
  const rows = [];
  let totals = { errors: 0, warnings: 0 };
  for (const root of bundleRoots) {
    const result = await validateBundle(root, options);
    rows.push({ root, result });
    totals = {
      errors: totals.errors + result.errors.length,
      warnings: totals.warnings + result.warnings.length,
    };
  }
  return { rows, totals };
}