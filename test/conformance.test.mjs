import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBundle } from '../src/index.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const VALID_BUNDLE = path.join(FIXTURES, 'valid-bundle');
const INVALID_BUNDLE = path.join(FIXTURES, 'invalid-bundle');
const CUSTOM_SCHEMA_REF = pathToFileURL(path.join(FIXTURES, 'schemas', 'custom.schema.json')).href;

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'okf-validator-'));
}

function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function bundle(content) {
  const root = tempRoot();
  write(root, 'index.md', '# Bundle\n');
  for (const [rel, body] of Object.entries(content)) {
    write(root, rel, body);
  }
  return root;
}

function errorText(result) {
  return result.errors.map((issue) => `${issue.file}: ${issue.message}`).join('\n');
}

function issueText(result) {
  return result.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n');
}

test('the valid fixture bundle is conformant with no warnings', async () => {
  const result = await validateBundle(VALID_BUNDLE);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0, errorText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('the invalid fixture bundle exercises every hard-error rule', async () => {
  const result = await validateBundle(INVALID_BUNDLE);
  const text = errorText(result);
  assert.match(text, /nofrontmatter\.md.*missing YAML frontmatter/);
  assert.match(text, /unterminated\.md.*unterminated YAML frontmatter/);
  assert.match(text, /notmapping\.md.*must be a YAML mapping/);
  assert.match(text, /missingtype\.md.*missing required `type`/);
  assert.match(text, /emptytype\.md/);
  assert.match(text, /bad-schema-ref\.md.*could not load frontmatter schema/);
  assert.match(text, /nested\/index\.md.*must not contain YAML frontmatter/);
  assert.match(text, /logs\/log\.md.*is not an ISO 8601 date/);
});

test('a bundle root that does not exist reports an error', async () => {
  const result = await validateBundle(path.join(os.tmpdir(), 'does-not-exist-okf'));
  assert.equal(result.ok, false);
});

test('concept without frontmatter is an error', async () => {
  const root = bundle({ 'notes/thing.md': '# no frontmatter\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /missing YAML frontmatter/);
});

test('missing or empty type is an error', async () => {
  const root = bundle({ 'a.md': '---\ntitle: Hi\n---\nbody\n' });
  let result = await validateBundle(root);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /missing required `type`/);

  const root2 = bundle({ 'a.md': '---\ntype: ""\n---\nbody\n' });
  result = await validateBundle(root2);
  assert.equal(result.ok, false);
});

test('non-root index.md must not carry frontmatter', async () => {
  const root = bundle({ 'sub/index.md': '---\ntype: Index\n---\n# Sub\n' });
  const result = await validateBundle(root);
  assert.match(errorText(result), /must not contain YAML frontmatter/);
});

test('bundle-root index.md may carry only okf_version', async () => {
  const root = tempRoot();
  write(root, 'index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  let result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));

  write(root, 'index.md', '---\nokf_version: "0.2"\ntitle: Extra\n---\n# Bundle\n');
  result = await validateBundle(root);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /may only carry `okf_version`/);
});

test('an empty frontmatter block on the root index.md is tolerated', async () => {
  const root = tempRoot();
  write(root, 'index.md', '---\n---\n# Bundle\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));
});

test('unsupported okf_version is a warning, not an error', async () => {
  const root = tempRoot();
  write(root, 'index.md', '---\nokf_version: "0.3"\n---\n# Bundle\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(result.warnings.map((w) => w.message).join('\n'), /not supported/);
});

test('okf_version on a concept is a warning', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\nokf_version: "0.2"\n---\nbody\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(issueText(result), /okf_version.*bundle-root index\.md/);
});

test('log.md with a non-ISO date heading is an error', async () => {
  const root = tempRoot();
  write(root, 'index.md', '# B\n');
  write(root, 'log.md', '## 16/07/2026\n\n* item\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /is not an ISO 8601 date/);
});

test('log.md with frontmatter is tolerated as a warning', async () => {
  const root = tempRoot();
  write(root, 'index.md', '# B\n');
  write(root, 'log.md', '---\ntype: Log\n---\n\n## 2026-07-10\n\n* item\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));
  assert.match(result.warnings.map((w) => w.message).join('\n'), /frontmatter/);
});

test('log.md entries that are not newest-first warn', async () => {
  const root = tempRoot();
  write(root, 'index.md', '# B\n');
  write(root, 'log.md', '## 2026-07-01\n\n* item\n\n## 2026-07-10\n\n* item\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(result.warnings.map((w) => w.message).join('\n'), /newest-first/);
});

test('unknown concept types are accepted with no issues', async () => {
  const root = bundle({ 'a.md': '---\ntype: MyCustomType\n---\nbody\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('unknown additional frontmatter keys are accepted', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\ncustom: whatever\nnested:\n  - x\n---\nbody\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));
});

test('a bare verified mapping is accepted and an invalid one errors', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\nverified: { by: human:jdoe, at: "2026-07-12T09:00:00Z" }\n---\nbody\n' });
  let result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));

  const root2 = bundle({ 'a.md': '---\ntype: Note\nverified: { by: "not an actor!" }\n---\nbody\n' });
  result = await validateBundle(root2);
  assert.equal(result.ok, false);
});

test('generated.by is required and must be an actor; generated.at is optional', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\ngenerated: { by: reference_agent/gemini-2.5-pro }\n---\nbody\n' });
  let result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));

  const root2 = bundle({ 'a.md': '---\ntype: Note\ngenerated: { at: "2026-07-10T21:15:20Z" }\n---\nbody\n' });
  result = await validateBundle(root2);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /missing required field `by`/);
});

test('both Z and +00:00 datetimes are accepted', async () => {
  const ok = async (value) => {
    const root = bundle({ 'a.md': `---\ntype: Note\ngenerated: { by: reference_agent/x, at: ${value} }\n---\nbody\n` });
    return (await validateBundle(root)).ok;
  };
  assert.equal(await ok("'2026-07-10T21:15:20+00:00'"), true);
  assert.equal(await ok("'2026-07-10T21:15:20Z'"), true);
});

test('Attested Computation without runtime is accepted by the default schema', async () => {
  const root = bundle({ 'a.md': '---\ntype: Attested Computation\ntitle: X\n---\nbody\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
});

test('a custom schema referenced via the schema: frontmatter key overrides the default', async () => {
  const root = bundle({
    'computations/revenue.md': `---\ntype: Attested Computation\nschema: ${CUSTOM_SCHEMA_REF}\n---\nbody\n`,
  });
  const result = await validateBundle(root);
  assert.equal(result.ok, false);
  assert.match(errorText(result), /missing required field `runtime`/);
  assert.match(errorText(result), new RegExp(CUSTOM_SCHEMA_REF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a document conforming to its custom schema passes', async () => {
  const root = bundle({
    'computations/revenue.md':
      `---\ntype: Attested Computation\nschema: ${CUSTOM_SCHEMA_REF}\nruntime: bigquery\n---\nbody\n`,
  });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
});

test('a non-URL schema: value is treated as unspecified (default schema applies)', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\nschema: okf_bundle\n---\nbody\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('schemasDir resolves a non-URL schema: path per document', async () => {
  const root = bundle({
    'computations/revenue.md': '---\ntype: Attested Computation\nschema: custom.schema.json\n---\nbody\n',
  });
  const result = await validateBundle(root, { schemasDir: path.join(FIXTURES, 'schemas') });
  assert.equal(result.ok, false);
  assert.match(errorText(result), /missing required field `runtime`/);
  assert.doesNotMatch(errorText(result), /could not load frontmatter schema/);
});

test('schemasDir falls back to the .schema.json convention for bare references', async () => {
  const root = bundle({
    'computations/revenue.md': '---\ntype: Attested Computation\nschema: custom\nruntime: dbt\n---\nbody\n',
  });
  const result = await validateBundle(root, { schemasDir: path.join(FIXTURES, 'schemas') });
  assert.equal(result.ok, true, issueText(result));
});

test('schemasDir applies the schema only to documents that reference it', async () => {
  const root = bundle({
    'strict.md': '---\ntype: Attested Computation\nschema: custom.schema.json\n---\nbody\n',
    'lax.md': '---\ntype: Attested Computation\n---\nbody\n',
  });
  const result = await validateBundle(root, { schemasDir: path.join(FIXTURES, 'schemas') });
  const text = errorText(result);
  assert.match(text, /strict\.md.*missing required field `runtime`/);
  assert.doesNotMatch(text, /lax\.md/);
});

test('schemasDir reports a missing schema file as an error on that document', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\nschema: nope.schema.json\n---\nbody\n' });
  const result = await validateBundle(root, { schemasDir: path.join(FIXTURES, 'schemas') });
  assert.equal(result.ok, false);
  assert.match(errorText(result), /could not load frontmatter schema.*no schema file found/);
});

test('schemasDir rejects references that escape the directory', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\nschema: ../outside.schema.json\n---\nbody\n' });
  const result = await validateBundle(root, { schemasDir: path.join(FIXTURES, 'schemas') });
  assert.equal(result.ok, false);
  assert.match(errorText(result), /resolves outside the --schemas directory/);
});

test('a custom schema is applied per document, not per bundle', async () => {
  const root = bundle({
    'strict.md':
      `---\ntype: Attested Computation\nschema: ${CUSTOM_SCHEMA_REF}\n---\nbody\n`,
    'lax.md': '---\ntype: Attested Computation\n---\nbody\n',
  });
  const result = await validateBundle(root);
  const text = errorText(result);
  assert.match(text, /strict\.md.*missing required field `runtime`/);
  assert.doesNotMatch(text, /lax\.md/);
});

test('broken internal markdown links are warnings', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\n---\n\nSee [missing](nope.md).\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(issueText(result), /markdown link `nope\.md` does not resolve/);
});

test('same-document anchor links are accepted', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\n---\n\nJump to the [layers](#the-state-layer-three-sovereigns-three-postures).\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('links to a file carrying an anchor resolve via the file part', async () => {
  const root = bundle({
    'model/index.md': '# Model\n',
    'model/frontier.md': '---\ntype: Note\n---\n\nSee [orders](tables/orders.md#order-rows).\n',
    'tables/index.md': '# Tables\n',
    'tables/orders.md': '---\ntype: Note\n---\nbody\n',
  });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('a bare fragment-only external target does not warn', async () => {
  const root = bundle({ 'a.md': '---\ntype: Note\n---\n\nSee [#top](#).\n' });
  const result = await validateBundle(root);
  assert.equal(result.ok, true, issueText(result));
});

test('unresolvable path-valued frontmatter fields are warnings', async () => {
  const root = bundle({
    'computations/revenue.md':
      '---\ntype: Attested Computation\nruntime: bigquery\ncomputation: references/missing.sql\n---\nbody\n',
  });
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(result.warnings.map((w) => w.message).join('\n'), /references\/missing\.sql/);
});

test('unslashed root-relative path fields resolve leniently', async () => {
  const root = tempRoot();
  write(root, 'index.md', '# B\n');
  write(root, 'computations/index.md', '# Computations\n');
  write(root, 'computations/revenue.md',
    '---\ntype: Attested Computation\nruntime: bigquery\ncomputation: computeds/revenue.sql\n---\nbody\n');
  write(root, 'computeds/revenue.sql', 'SELECT 1\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true, errorText(result));
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings, null, 2));
});

test('a directory with concepts but no index.md warns', async () => {
  const root = tempRoot();
  write(root, 'index.md', '# B\n');
  write(root, 'notes/thing.md', '---\ntype: Note\n---\nbody\n');
  const result = await validateBundle(root);
  assert.equal(result.ok, true);
  assert.match(issueText(result), /notes\/index\.md.*missing index\.md/);
});