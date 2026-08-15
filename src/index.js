import { validateBundle, parseBundle } from './conformance.js';
import {
  loadDefaultSchema,
  loadSchemaFromRef,
  loadSchemaFromFile,
  resolveSchemaFile,
  compileSchema,
  isUrlReference,
  readSchemaDocument,
  buildValidators,
  schemaDir,
  schemaJsonPath,
} from './schemas.js';
import { SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS, buildSchemaBaseUrl } from './versions.js';
import { ValidationResult } from './report.js';

export {
  validateBundle,
  parseBundle,
  loadDefaultSchema,
  loadSchemaFromRef,
  loadSchemaFromFile,
  resolveSchemaFile,
  compileSchema,
  isUrlReference,
  readSchemaDocument,
  buildValidators,
  schemaDir,
  schemaJsonPath,
  SCHEMA_BASE_URL,
  buildSchemaBaseUrl,
  SUPPORTED_OKF_VERSIONS,
  ValidationResult,
};

export async function validateBundles(roots, options = {}) {
  const results = new Map();
  for (const root of roots) {
    results.set(root, await validateBundle(root, options));
  }
  return results;
}