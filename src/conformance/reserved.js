import { parseDocument } from '../parser.js';
import { SUPPORTED_OKF_VERSIONS } from '../schemas.js';
import { validateBodyLinks, validateIndexContents } from './links.js';

const LOG_HEADING_RE = /^##\s+(.+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a declared OKF version against the versions supported by this validator.
 * Version mismatches are WARNs because the bundle can still be consumed best-effort.
 */
function checkSupportedVersion(value, result, relPath, location) {
  const normalized = String(value);
  if (!SUPPORTED_OKF_VERSIONS.includes(normalized)) {
    result.addWarning(
      relPath,
      `okf_version "${normalized}" in ${location} is not supported; supported versions: ${SUPPORTED_OKF_VERSIONS.join(', ')}`
    );
  }
}

/**
 * Checks reserved index.md syntax, body links, and directory navigation.
 * Forbidden frontmatter is an ERROR; unsupported versions and missing navigation are WARNs.
 */
export function validateIndex({ relPath, text, fileSet, relDirs, relFiles, result }) {
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
  validateIndexContents({ relPath, body: parsed.body, fileSet, relDirs, relFiles, result });
}

/**
 * Checks reserved log.md frontmatter, date headings, ordering, and body links.
 * Invalid date headings are ERRORs; frontmatter, ordering, and broken links are WARNs.
 */
export function validateLog({ relPath, text, fileSet, result }) {
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
