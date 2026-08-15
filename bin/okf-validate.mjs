#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateBundle, SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS } from '../src/index.js';

class CliError extends Error {}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function packageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function hasMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasMarkdown(full)) {
        return true;
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      return true;
    }
  }
  return false;
}

function toBundleRoots(input) {
  if (!fs.existsSync(input)) {
    throw new CliError(`path does not exist: ${input}`);
  }
  if (!fs.statSync(input).isDirectory()) {
    throw new CliError(`expected a bundle directory, got a file: ${input}`);
  }

  const bundled = path.join(input, 'bundles');
  if (fs.existsSync(bundled) && fs.statSync(bundled).isDirectory()) {
    const children = fs
      .readdirSync(bundled)
      .map((name) => path.join(bundled, name))
      .filter((dir) => fs.statSync(dir).isDirectory() && hasMarkdown(dir))
      .sort();
    if (children.length > 0) {
      return children;
    }
  }

  if (hasMarkdown(input)) {
    return [input];
  }

  const candidates = fs
    .readdirSync(input)
    .map((name) => path.join(input, name))
    .filter((dir) => fs.statSync(dir).isDirectory() && hasMarkdown(dir))
    .sort();
  if (candidates.length > 0) {
    return candidates;
  }

  throw new CliError(`no OKF bundles found under: ${input}`);
}

function printUsage() {
  process.stdout.write(`okf-validate — validate Open Knowledge Format (OKF) bundles

Usage:
  okf-validate [options] <path>...

Each <path> is a bundle root, a directory containing bundle subdirectories,
or a directory containing a bundles/ folder. Multiple paths are allowed.

Options:
  --okf-version <version>  OKF version to validate against (default: ${SUPPORTED_OKF_VERSIONS[0]})
  --schemas <dir>          Directory of custom schemas; non-URL \`schema:\` frontmatter
                           references resolve to files under this directory
                           (e.g. \`schema: my-type\` -> <dir>/my-type.schema.json)
  --json                   Print a machine-readable JSON report
  --version                Print the package version and exit
  --help                   Show this help and exit

Exit codes:
  0  all bundles conformant (no errors)
  1  at least one bundle has validation errors
  2  usage error

Schemas: ${SCHEMA_BASE_URL}
`);
}

function main() {
  const args = process.argv.slice(2);
  let okfVersion = null;
  let json = false;
  let schemasDir = null;
  const paths = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      return;
    }
    if (arg === '--version') {
      process.stdout.write(packageVersion() + '\n');
      return;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--okf-version') {
      okfVersion = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--okf-version=')) {
      okfVersion = arg.split('=', 2)[1];
      continue;
    }
    if (arg === '--schemas') {
      schemasDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--schemas=')) {
      schemasDir = arg.split('=', 2)[1];
      continue;
    }
    if (arg.startsWith('-') && arg !== '-') {
      throw new CliError(`unknown option: ${arg}`);
    }
    paths.push(arg);
  }

  if (schemasDir !== null) {
    const resolved = path.resolve(schemasDir);
    if (!fs.existsSync(resolved)) {
      throw new CliError(`--schemas directory does not exist: ${schemasDir}`);
    }
    if (!fs.statSync(resolved).isDirectory()) {
      throw new CliError(`--schemas must be a directory: ${schemasDir}`);
    }
    schemasDir = resolved;
  }
  if (okfVersion !== null && !SUPPORTED_OKF_VERSIONS.includes(okfVersion)) {
    throw new CliError(`unsupported OKF version "${okfVersion}"; supported: ${SUPPORTED_OKF_VERSIONS.join(', ')}`);
  }
  if (paths.length === 0) {
    throw new CliError('no path given');
  }

  const roots = paths.flatMap(toBundleRoots);
  return runBundles(roots, { version: okfVersion ?? '0.2', json, schemasDir });
}

async function runBundles(roots, { version, json, schemasDir }) {
  const bundles = [];
  let totals = { errors: 0, warnings: 0 };

  for (const root of roots) {
    const result = await validateBundle(root, { version, schemasDir });
    bundles.push({ root, result });
    totals = {
      errors: totals.errors + result.errors.length,
      warnings: totals.warnings + result.warnings.length,
    };
  }

  if (json) {
    const report = {
      okfVersion: version,
      bundles: bundles.map(({ root, result }) => ({
        root,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary(),
      })),
      totals,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    for (const { root, result } of bundles) {
      process.stdout.write(`\nValidating ${root}\n`);
      for (const issue of result.issues) {
        const label = issue.severity === 'error' ? 'ERROR' : 'WARN ';
        process.stderr.write(`${label} ${issue.file}: ${issue.message}\n`);
      }
      process.stdout.write(`  errors: ${result.errors.length}, warnings: ${result.warnings.length}\n`);
    }
    if (totals.errors > 0) {
      process.stderr.write(`\nValidation failed: ${totals.errors} error(s), ${totals.warnings} warning(s) across ${bundles.length} bundle(s).\n`);
    } else {
      process.stdout.write(`\nValidation passed: ${totals.errors} errors, ${totals.warnings} warnings across ${bundles.length} bundle(s).\n`);
    }
  }

  process.exitCode = totals.errors > 0 ? 1 : 0;
}

try {
  await main();
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`okf-validate: ${error.message}\n\n`);
    printUsage();
    process.exitCode = 2;
  } else {
    throw error;
  }
}