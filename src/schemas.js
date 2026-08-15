import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS } from './versions.js';

const URL_REFERENCE_RE = /^(https?:|file:)/i;

function createAjv() {
  return new Ajv2020({
    allErrors: true,
    strict: false,
    loadSchema: async (uri) => readSchemaDocument(uri),
  });
}

export function schemaDir(version) {
  return fileURLToPath(new URL(`../schemas/okf/v${version}/`, import.meta.url));
}

export function schemaJsonPath(version) {
  return path.join(schemaDir(version), 'schema.json');
}

export function isUrlReference(value) {
  return typeof value === 'string' && URL_REFERENCE_RE.test(value);
}

export async function readSchemaDocument(ref) {
  if (/^https?:/i.test(ref)) {
    const response = await fetch(ref);
    if (!response.ok) {
      throw new Error(`unable to fetch schema ${ref}: HTTP ${response.status}`);
    }
    return JSON.parse(await response.text());
  }
  if (/^file:/i.test(ref)) {
    return JSON.parse(fs.readFileSync(fileURLToPath(ref), 'utf8'));
  }
  throw new Error(`unsupported schema reference: ${ref}`);
}

export function compileSchema(document) {
  return createAjv().compile(document);
}

function readDefaultSchema(version) {
  if (!SUPPORTED_OKF_VERSIONS.includes(version)) {
    throw new Error(`Unsupported OKF version "${version}". Supported: ${SUPPORTED_OKF_VERSIONS.join(', ')}`);
  }
  return JSON.parse(fs.readFileSync(schemaJsonPath(version), 'utf8'));
}

export function loadDefaultSchema({ version = '0.2' } = {}) {
  return compileSchema(readDefaultSchema(version));
}

export async function loadSchemaFromRef(ref) {
  return createAjv().compileAsync(await readSchemaDocument(ref));
}

export async function loadSchemaFromFile(filePath) {
  return createAjv().compileAsync(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

const SCHEMA_JSON_EXT = '.schema.json';

export function resolveSchemaFile(schemasDir, ref) {
  if (typeof ref !== 'string' || !ref.trim()) {
    throw new Error('schema reference is empty');
  }
  const cleaned = ref.trim().replaceAll('\\', '/');
  let candidates;
  if (/^[A-Za-z]:\//.test(cleaned) || cleaned.startsWith('/')) {
    const abs = path.resolve(cleaned);
    const exact = abs.endsWith('.json');
    candidates = exact ? [abs] : [abs, `${abs}${SCHEMA_JSON_EXT}`];
  } else {
    const rel = path.posix.normalize(cleaned).replace(/^\.\//, '');
    if (rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) {
      throw new Error(`schema reference "${ref}" resolves outside the --schemas directory`);
    }
    const joined = path.join(schemasDir, ...rel.split('/'));
    const exact = rel.endsWith('.json');
    candidates = exact ? [joined] : [joined, `${joined}${SCHEMA_JSON_EXT}`];
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`no schema file found for reference "${ref}" under ${schemasDir}`);
}

export function buildValidators({ version = '0.2' } = {}) {
  const ajvInstance = createAjv();
  const custom = new Map();
  const loadCustom = async (ref) => {
    const validator = await ajvInstance.compileAsync(await readSchemaDocument(ref));
    custom.set(ref, validator);
    return validator;
  };
  const loadFile = async (filePath) => {
    const validator = await loadSchemaFromFile(filePath);
    custom.set(filePath, validator);
    return validator;
  };
  return {
    ajv: ajvInstance,
    default: ajvInstance.compile(readDefaultSchema(version)),
    custom,
    forRef(ref) {
      if (!custom.has(ref)) {
        custom.set(ref, loadCustom(ref));
      }
      return custom.get(ref);
    },
    forFile(filePath) {
      if (!custom.has(filePath)) {
        custom.set(filePath, loadFile(filePath));
      }
      return custom.get(filePath);
    },
  };
}

export { SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS };