import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'okf-validate.mjs');
const FIXTURES = path.join(ROOT, 'test', 'fixtures');

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

test('valid fixture exits 0', () => {
  const { status, stdout } = run([path.join(FIXTURES, 'valid-bundle')]);
  assert.equal(status, 0);
  assert.match(stdout, /Validation passed/);
});

test('invalid fixture exits 1', () => {
  const { status, stderr } = run([path.join(FIXTURES, 'invalid-bundle')]);
  assert.equal(status, 1);
  assert.match(stderr, /Validation failed/);
});

test('--json emits a machine-readable report', () => {
  const { status, stdout } = run(['--json', path.join(FIXTURES, 'valid-bundle')]);
  assert.equal(status, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.okfVersion, '0.2');
  assert.equal(report.totals.errors, 0);
  assert.equal(report.bundles.length, 1);
});

test('a directory of bundles is discovered', () => {
  const { status } = run([FIXTURES]);
  assert.equal(status, 1);
});

test('--version prints the package version', () => {
  const { status, stdout } = run(['--version']);
  assert.equal(status, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('missing path is a usage error (exit 2)', () => {
  const { status } = run(['does-not-exist']);
  assert.equal(status, 2);
});

test('unsupported --okf-version is a usage error (exit 2)', () => {
  const { status } = run(['--okf-version', '9.9', path.join(FIXTURES, 'valid-bundle')]);
  assert.equal(status, 2);
});

test('missing --schemas directory is a usage error (exit 2)', () => {
  const { status } = run(['--schemas', 'no-such-schemas', path.join(FIXTURES, 'valid-bundle')]);
  assert.equal(status, 2);
});

test('--schemas pointing at a file is a usage error (exit 2)', () => {
  const { status } = run(['--schemas', path.join(FIXTURES, 'valid-bundle', 'index.md'), path.join(FIXTURES, 'valid-bundle')]);
  assert.equal(status, 2);
});

test('without --schemas, a non-URL schema: value uses the default schema (exit 0)', () => {
  const { status } = run([path.join(FIXTURES, 'custom-schema-bundle')]);
  assert.equal(status, 0);
});

test('--schemas resolves non-URL schema: references and enforces them (exit 1)', () => {
  const { status, stderr } = run(['--schemas', path.join(FIXTURES, 'schemas'), path.join(FIXTURES, 'custom-schema-bundle')]);
  assert.equal(status, 1);
  assert.match(stderr, /missing required field `runtime`/);
});
