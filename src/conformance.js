import fs from 'node:fs';
import path from 'node:path';

import {
  parseDocument,
  parseConcept,
  isPlainObject,
} from './parser.js';
import {
  buildFileSet,
  extractLinks,
  isExternalTarget,
  isPathLike,
  resolveTarget,
} from './links.js';
import { buildValidators, isUrlReference, resolveSchemaFile, SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS } from './schemas.js';
import { ValidationResult } from './report.js';

const LOG_HEADING_RE = /^##\s+(.+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function walkBundle(bundleRoot) {
  const relFiles = [];
  const relDirs = [];
  const walk = (dir, prefix = '') => {
    relDirs.push(prefix);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else {
        relFiles.push(rel);
      }
    }
  };
  walk(bundleRoot, '');
  return { relFiles, relDirs };
}

function collectDirMdFiles(relFiles, prefix) {
  const base = prefix ? `${prefix}/` : '';
  return relFiles.filter((rel) => rel.startsWith(base) && rel.endsWith('.md'));
}

function formatAjvPath(instancePath) {
  if (!instancePath) {
    return 'frontmatter';
  }
  return `frontmatter${instancePath.replaceAll('/', '.')}`;
}

function formatAjvError(error) {
  const location = formatAjvPath(error.instancePath);
  if (error.keyword === 'required') {
    return `${location}: missing required field \`${error.params.missingProperty}\``;
  }
  if (error.keyword === 'enum') {
    return `${location}: must be one of ${error.params.allowedValues.map((value) => `\`${value}\``).join(', ')}`;
  }
  if (error.keyword === 'const') {
    return `${location}: must be \`${JSON.stringify(error.params.allowedValue)}\``;
  }
  if (error.keyword === 'pattern') {
    return `${location}: has invalid format (pattern mismatch)`;
  }
  if (error.keyword === 'oneOf') {
    return `${location}: does not match exactly one alternative`;
  }
  return `${location}: ${error.message}`;
}

function schemaErrors(schemaName, validate, value) {
  const valid = validate(value);
  if (valid) {
    return [];
  }
  return (validate.errors ?? []).map((error) => `[${schemaName}]: ${formatAjvError(error)}`);
}

function validateBodyLinks({ relPath, body, fileSet, result }) {
  for (const target of extractLinks(body)) {
    if (!target || isExternalTarget(target)) {
      continue;
    }
    const resolved = resolveTarget({ target, fileRel: relPath, fileSet });
    if (!resolved.ok) {
      result.addWarning(relPath, `markdown link \`${target}\` does not resolve to a file in the bundle`);
    }
  }
}

function validatePathField({ relPath, fieldName, value, fileSet, result }) {
  if (!isPathLike(value) || isExternalTarget(value)) {
    return;
  }
  if (value.startsWith('/') || value.includes('/') || value.includes('.')) {
    const resolved = resolveTarget({ target: value, fileRel: relPath, fileSet });
    if (!resolved.ok) {
      result.addWarning(relPath, `path-valued frontmatter field \`${fieldName}\` (${value}) does not resolve to a file in the bundle`);
    }
  }
}

function validatePathFields({ relPath, frontmatter, fileSet, result }) {
  for (const field of ['resource', 'computation']) {
    const value = frontmatter[field];
    if (typeof value === 'string') {
      validatePathField({ relPath, fieldName: field, value, fileSet, result });
    }
  }
  for (const [container, fieldName] of [
    ['sources', 'resource'],
    ['executor', 'resource'],
    ['attester', 'resource'],
  ]) {
    const containerValue = frontmatter[container];
    if (Array.isArray(containerValue)) {
      for (let i = 0; i < containerValue.length; i += 1) {
        const entry = containerValue[i];
        const value = isPlainObject(entry) ? entry[fieldName] : undefined;
        if (typeof value === 'string') {
          validatePathField({ relPath, fieldName: `${container}[${i}].${fieldName}`, value, fileSet, result });
        }
      }
    } else if (isPlainObject(containerValue)) {
      const value = containerValue[fieldName];
      if (typeof value === 'string') {
        validatePathField({ relPath, fieldName: `${container}.${fieldName}`, value, fileSet, result });
      }
    }
  }
}

function checkSupportedVersion(value, result, relPath, location) {
  const normalized = String(value);
  if (!SUPPORTED_OKF_VERSIONS.includes(normalized)) {
    result.addWarning(
      relPath,
      `okf_version "${normalized}" in ${location} is not supported; supported versions: ${SUPPORTED_OKF_VERSIONS.join(', ')}`
    );
  }
}

function validateIndex({ relPath, text, fileSet, result }) {
  let parsed;
  try {
    parsed = parseDocument(text, relPath);
  } catch (error) {
    result.addError(relPath, error.message);
    return;
  }

  const isRoot = relPath === 'index.md';
  if (parsed.hasFrontmatter) {
    if (!isRoot) {
      result.addError(relPath, 'index.md must not contain YAML frontmatter (OKF v0.2 §8); only a bundle-root index.md may declare `okf_version`');
    } else {
      const keys = Object.keys(parsed.frontmatter);
      if (keys.length > 0 && !(keys.length === 1 && keys[0] === 'okf_version')) {
        result.addError(relPath, 'bundle-root index.md frontmatter may only carry `okf_version` (OKF v0.2 §8, §12)');
      } else if (keys.length === 1) {
        checkSupportedVersion(parsed.frontmatter.okf_version, result, relPath, 'bundle-root index.md');
      }
    }
  }

  validateBodyLinks({ relPath, body: parsed.body, fileSet, result });
}

function validateLog({ relPath, text, fileSet, result }) {
  let parsed;
  try {
    parsed = parseDocument(text, relPath);
  } catch (error) {
    result.addError(relPath, error.message);
    return;
  }

  if (parsed.hasFrontmatter) {
    result.addWarning(relPath, 'log.md carries YAML frontmatter; OKF v0.2 §9 defines log.md by its date-grouped markdown body');
  }

  let lastDate = null;
  for (const line of parsed.body.split(/\r?\n/)) {
    const match = line.match(LOG_HEADING_RE);
    if (!match) {
      continue;
    }
    const label = match[1].trim();
    if (!ISO_DATE_RE.test(label)) {
      result.addError(relPath, `log.md date heading \`## ${label}\` is not an ISO 8601 date (YYYY-MM-DD) (OKF v0.2 §9)`);
      continue;
    }
    if (lastDate !== null && label > lastDate) {
      result.addWarning(relPath, `log.md entries are not newest-first: ${label} comes after ${lastDate} (OKF v0.2 §9)`);
    }
    lastDate = label;
  }

  validateBodyLinks({ relPath, body: parsed.body, fileSet, result });
}

function resolveSchemaRef(value, schemasDir) {
  if (isUrlReference(value)) {
    return { kind: 'url', ref: value };
  }
  if (schemasDir && typeof value === 'string' && value.trim()) {
    return { kind: 'file', filePath: resolveSchemaFile(schemasDir, value) };
  }
  return null;
}

async function validateConcept({ relPath, text, fileSet, model, schemasDir, result }) {
  let parsed;
  try {
    parsed = parseConcept(text, relPath);
  } catch (error) {
    result.addError(relPath, error.message);
    return;
  }

  const { frontmatter } = parsed;

  if (typeof frontmatter.type !== 'string' || frontmatter.type.length === 0) {
    result.addError(relPath, 'missing required `type` field (OKF v0.2 §4.1, §11)');
  }

  let validator = model.default;
  let label = 'okf-v0.2';
  try {
    const schemaRef = resolveSchemaRef(frontmatter?.schema, schemasDir);
    if (schemaRef) {
      label = schemaRef.kind === 'file' ? schemaRef.filePath : schemaRef.ref;
      validator = schemaRef.kind === 'file'
        ? await model.forFile(schemaRef.filePath)
        : await model.forRef(schemaRef.ref);
    }
  } catch (error) {
    result.addError(relPath, `could not load frontmatter schema \`${label}\`: ${error.message}`);
    validator = null;
  }
  if (validator) {
    for (const message of schemaErrors(label, validator, frontmatter)) {
      result.addError(relPath, message);
    }
  }

  if ('okf_version' in frontmatter) {
    result.addWarning(relPath, 'okf_version belongs in a bundle-root index.md (OKF v0.2 §8, §12), not in concept frontmatter');
  }

  validatePathFields({ relPath, frontmatter, fileSet, result });
  validateBodyLinks({ relPath, body: parsed.body, fileSet, result });
}

function validateIndexPresence({ relDirs, relFiles, result }) {
  const relMd = new Set(relFiles.filter((rel) => rel.endsWith('.md')));
  for (const dir of relDirs) {
    const base = dir ? `${dir}/` : '';
    const hasMarkdownBelow = [...relMd].some((rel) => rel.startsWith(base));
    if (!hasMarkdownBelow) {
      continue;
    }
    const indexRel = `${base}index.md`;
    if (!relMd.has(indexRel)) {
      result.addWarning(indexRel, 'missing index.md for progressive disclosure (OKF v0.2 §8, optional)');
    }
  }
}

export async function validateBundle(bundleRoot, options = {}) {
  const result = new ValidationResult();
  const version = options.version ?? '0.2';
  const schemasDir = options.schemasDir ?? null;

  if (!fs.existsSync(bundleRoot)) {
    result.addError(bundleRoot, 'bundle root does not exist');
    return result;
  }
  if (!fs.statSync(bundleRoot).isDirectory()) {
    result.addError(bundleRoot, 'bundle root is not a directory');
    return result;
  }

  const model = buildValidators({ version });
  const fileSet = buildFileSet(bundleRoot);
  const { relFiles, relDirs } = walkBundle(bundleRoot);

  validateIndexPresence({ relDirs, relFiles, result });

  for (const rel of relFiles.filter((file) => file.endsWith('.md')).sort()) {
    const filePath = path.join(bundleRoot, rel);
    const text = fs.readFileSync(filePath, 'utf8');
    const baseName = path.posix.basename(rel);
    if (baseName === 'index.md') {
      validateIndex({ relPath: rel, text, fileSet, result });
    } else if (baseName === 'log.md') {
      validateLog({ relPath: rel, text, fileSet, result });
    } else {
      await validateConcept({ relPath: rel, text, fileSet, model, schemasDir, result });
    }
  }

  return result;
}

export {
  SCHEMA_BASE_URL,
  SUPPORTED_OKF_VERSIONS,
};

export function parseBundle(bundleRoot) {
  const { relFiles, relDirs } = walkBundle(bundleRoot);
  const fileSet = buildFileSet(bundleRoot);
  return { relFiles, relDirs, fileSet };
}