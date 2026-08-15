import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadDefaultSchema,
  loadSchemaFromRef,
  loadSchemaFromFile,
  resolveSchemaFile,
  isUrlReference,
  readSchemaDocument,
  buildValidators,
  schemaDir,
  schemaJsonPath,
  SCHEMA_BASE_URL,
  SUPPORTED_OKF_VERSIONS,
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_DIR = path.join(ROOT, 'test', 'fixtures', 'schemas');

test('schemas/okf/v0.2 contains exactly one schema file: schema.json', () => {
  const dir = schemaDir('0.2');
  const names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, ['schema.json']);
  assert.equal(schemaJsonPath('0.2'), path.join(dir, 'schema.json'));
});

test('the default schema is the only bundled one and is addressable', () => {
  const id = JSON.parse(fs.readFileSync(schemaJsonPath('0.2'), 'utf8')).$id;
  assert.equal(id, `${SCHEMA_BASE_URL}/schema.json`);
});

test('default schema requires type, permits unknown keys, and covers only common fields', () => {
  const validate = loadDefaultSchema();
  assert.equal(validate({ type: 'Note', anything: true, nested: { a: 1 } }), true);
  assert.equal(validate({}), false);
  assert.equal(validate({ type: '' }), false);
  assert.equal(validate({ type: 'Note', status: 'draft' }), true);
  assert.equal(validate({ type: 'Note', status: 'unknown-status' }), false);
  assert.equal(validate({ type: 'Attested Computation' }), true);
});

test('supported versions are advertised and derivable as URLs', () => {
  assert.deepEqual(SUPPORTED_OKF_VERSIONS, ['0.2']);
  assert.equal(SCHEMA_BASE_URL.endsWith('/schemas/okf/v0.2'), true);
});

test('unsupported versions are rejected', () => {
  assert.throws(() => loadDefaultSchema({ version: '9.9' }), /Unsupported OKF version/);
  assert.throws(() => buildValidators({ version: '9.9' }), /Unsupported OKF version/);
});

test('a custom schema referenced by file URL compiles and validates', async () => {
  const ref = pathToFileURL(path.join(ROOT, 'test', 'fixtures', 'schemas', 'custom.schema.json')).href;
  const validate = await loadSchemaFromRef(ref);
  assert.equal(validate({ type: 'Attested Computation', runtime: 'bigquery' }), true);
  assert.equal(validate({ type: 'Attested Computation' }), false);
  assert.equal(validate({ type: 'Attested Computation', runtime: 'not-a-runtime' }), false);
});

test('a custom schema loaded by filesystem path validates the same way', async () => {
  const validate = await loadSchemaFromFile(path.join(SCHEMAS_DIR, 'custom.schema.json'));
  assert.equal(validate({ type: 'Attested Computation', runtime: 'bigquery' }), true);
  assert.equal(validate({ type: 'Attested Computation' }), false);
});

test('resolveSchemaFile resolves exact paths, .schema.json falls back, and subdirectories', () => {
  assert.equal(resolveSchemaFile(SCHEMAS_DIR, 'custom.schema.json'), path.join(SCHEMAS_DIR, 'custom.schema.json'));
  assert.equal(resolveSchemaFile(SCHEMAS_DIR, 'custom'), path.join(SCHEMAS_DIR, 'custom.schema.json'));
});

test('resolveSchemaFile rejects traversal and missing references', () => {
  assert.throws(() => resolveSchemaFile(SCHEMAS_DIR, '../outside.schema.json'), /resolves outside the --schemas directory/);
  assert.throws(() => resolveSchemaFile(SCHEMAS_DIR, 'nope.schema.json'), /no schema file found/);
  assert.throws(() => resolveSchemaFile(SCHEMAS_DIR, ''), /schema reference is empty/);
});

test('buildValidators.forFile compiles a schema file and caches it', async () => {
  const model = buildValidators();
  const filePath = path.join(SCHEMAS_DIR, 'custom.schema.json');
  const validator = await model.forFile(filePath);
  assert.equal(validator({ type: 'Attested Computation', runtime: 'bigquery' }), true);
  assert.equal(model.forFile(filePath), validator);
});

test('readSchemaDocument rejects non-URL references', async () => {
  await assert.rejects(() => readSchemaDocument('okf_bundle'), /unsupported schema reference/);
});

test('isUrlReference distinguishes URLs from other values', () => {
  assert.equal(isUrlReference('https://example.com/s.json'), true);
  assert.equal(isUrlReference('http://example.com/s.json'), true);
  assert.equal(isUrlReference('file:///C:/x.json'), true);
  assert.equal(isUrlReference('okf_bundle'), false);
  assert.equal(isUrlReference('0.2'), false);
  assert.equal(isUrlReference(null), false);
  assert.equal(isUrlReference(42), false);
});