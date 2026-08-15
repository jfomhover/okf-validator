import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDocument,
  parseConcept,
  hasFrontmatter,
  ParseError,
} from '../src/parser.js';

test('parses frontmatter and body from a concept document', () => {
  const doc = parseConcept(
    '---\ntype: Note\ntitle: Hi\n---\n\n# Body\n\ntext\n',
    'a.md'
  );
  assert.deepEqual(doc.frontmatter, { type: 'Note', title: 'Hi' });
  assert.equal(doc.body, '# Body\n\ntext\n');
  assert.equal(doc.hasFrontmatter, true);
});

test('body has no leading blank line after the closing delimiter', () => {
  const doc = parseConcept('---\ntype: X\n---\nbody', 'a.md');
  assert.equal(doc.body, 'body');
});

test('missing frontmatter throws for concept parsing', () => {
  assert.throws(() => parseConcept('# no fm\n', 'a.md'), ParseError);
  assert.throws(() => parseConcept('# no fm\n', 'a.md'), /missing YAML frontmatter/);
});

test('unterminated frontmatter throws', () => {
  assert.throws(() => parseConcept('---\ntype: X\n', 'a.md'), ParseError);
  assert.throws(() => parseConcept('---\ntype: X\n', 'a.md'), /unterminated/);
});

test('non-mapping frontmatter throws', () => {
  assert.throws(() => parseConcept('---\n- a\n- b\n---\n', 'a.md'), /must be a YAML mapping/);
});

test('invalid YAML throws', () => {
  assert.throws(() => parseConcept('---\ntype: [unclosed\n---\n', 'a.md'), /invalid YAML/);
});

test('BOM is stripped before delimiter checks', () => {
  const text = '\uFEFF---\ntype: Note\n---\nbody';
  assert.equal(hasFrontmatter(text), true);
  const doc = parseConcept(text, 'a.md');
  assert.equal(doc.frontmatter.type, 'Note');
});

test('plain markdown without frontmatter reports hasFrontmatter false', () => {
  const doc = parseDocument('# hello\n', 'a.md');
  assert.equal(doc.hasFrontmatter, false);
  assert.equal(doc.frontmatter, null);
});

test('CRLF line endings are handled', () => {
  const text = '---\r\ntype: Note\r\n---\r\nbody';
  const doc = parseConcept(text, 'a.md');
  assert.equal(doc.frontmatter.type, 'Note');
  assert.equal(doc.body, 'body');
});

test('date-shaped scalars survive as strings (YAML 1.2 core)', () => {
  const doc = parseConcept(
    [
      '---',
      'type: Attested Computation',
      'stale_after: 2026-12-31',
      'usage_window: { from: 2026-06-01, to: 2026-06-30 }',
      "generated: { by: reference_agent/x, at: '2026-07-10T21:15:20+00:00' }",
      '---',
      'body',
    ].join('\n'),
    'a.md'
  );
  const fm = doc.frontmatter;
  assert.equal(typeof fm.stale_after, 'string');
  assert.equal(typeof fm.usage_window.from, 'string');
  assert.equal(typeof fm.usage_window.to, 'string');
  assert.equal(typeof fm.generated.at, 'string');
  assert.equal(fm.generated.at, '2026-07-10T21:15:20+00:00');
});
