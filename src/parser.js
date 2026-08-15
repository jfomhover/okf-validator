import { parseDocument as parseYamlDocument } from 'yaml';

export class ParseError extends Error {}

const FRONTMATTER_DELIM = '---';

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasFrontmatter(text) {
  const cleaned = stripBom(text);
  const firstLine = cleaned.split(/\r?\n/, 1)[0];
  return firstLine !== undefined && firstLine.trim() === FRONTMATTER_DELIM;
}

export function parseDocument(text, filePath) {
  const cleaned = stripBom(text);
  const lines = cleaned.split(/\r?\n/);

  const startLine = lines[0]?.trim();
  if (startLine !== FRONTMATTER_DELIM) {
    return { frontmatter: null, body: cleaned, hasFrontmatter: false };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONTMATTER_DELIM) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new ParseError(`${filePath}: unterminated YAML frontmatter block`);
  }

  const doc = parseYamlDocument(lines.slice(1, endIndex).join('\n'));
  if (doc.errors.length > 0) {
    throw new ParseError(`${filePath}: invalid YAML frontmatter: ${doc.errors[0].message}`);
  }

  const frontmatter = doc.toJS() ?? {};
  if (!isPlainObject(frontmatter)) {
    throw new ParseError(`${filePath}: frontmatter must be a YAML mapping`);
  }

  let body = lines.slice(endIndex + 1).join('\n');
  if (body.startsWith('\n')) {
    body = body.slice(1);
  }

  return { frontmatter, body, hasFrontmatter: true };
}

export function parseConcept(text, filePath) {
  const doc = parseDocument(text, filePath);
  if (!doc.hasFrontmatter) {
    throw new ParseError(`${filePath}: missing YAML frontmatter block`);
  }
  return doc;
}