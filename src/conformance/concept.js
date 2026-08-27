import { parseConcept } from '../parser.js';
import { validateBodyLinks, validatePathFields } from './links.js';
import { resolveSchemaRef, schemaErrors } from './schema.js';

/**
 * Checks one concept's frontmatter syntax, required type, selected schema, paths, and links.
 * Parse failures, missing type, schema failures, and schema violations are ERRORs;
 * misplaced okf_version, unresolved paths, and broken links are WARNs.
 */
export async function validateConcept({ relPath, text, fileSet, model, schemasDir, result }) {
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
