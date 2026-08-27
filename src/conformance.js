import fs from 'node:fs';
import path from 'node:path';

import { buildFileSet } from './links.js';
import { SCHEMA_BASE_URL, SUPPORTED_OKF_VERSIONS } from './schemas.js';
import { ValidationResult } from './report.js';
import { validateConcept } from './conformance/concept.js';
import { validateLog, validateIndex } from './conformance/reserved.js';
import { buildSchemaModel } from './conformance/schema.js';
import { validateIndexPresence, walkBundle } from './conformance/structure.js';

/**
 * Validates one bundle through the categorized conformance checks.
 * Bundle-root failures are ERRORs; individual category checks document their own severity.
 */
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

  const model = buildSchemaModel(version);
  const fileSet = buildFileSet(bundleRoot);
  const { relFiles, relDirs } = walkBundle(bundleRoot);

  validateIndexPresence({ relDirs, relFiles, result });

  for (const rel of relFiles.filter((file) => file.endsWith('.md')).sort()) {
    const filePath = path.join(bundleRoot, rel);
    const text = fs.readFileSync(filePath, 'utf8');
    const baseName = path.posix.basename(rel);
    if (baseName === 'index.md') {
      validateIndex({ relPath: rel, text, fileSet, relDirs, relFiles, result });
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

/**
 * Walks a bundle without running conformance checks.
 * This is an inspection API and raises no validation issues.
 */
export function parseBundle(bundleRoot) {
  const { relFiles, relDirs } = walkBundle(bundleRoot);
  const fileSet = buildFileSet(bundleRoot);
  return { relFiles, relDirs, fileSet };
}
