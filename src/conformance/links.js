import path from 'node:path';

import {
  extractLinks,
  isExternalTarget,
  isPathLike,
  resolveTarget,
} from '../links.js';
import { isPlainObject } from '../parser.js';

/**
 * Checks relative Markdown links against the bundle file tree.
 * Broken links are tolerated by OKF, so unresolved targets are WARNs.
 */
export function validateBodyLinks({ relPath, body, fileSet, result }) {
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

/**
 * Checks one path-valued frontmatter field against the bundle file tree.
 * These fields may also be scope descriptors, so unresolved local-looking paths are WARNs.
 */
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

/**
 * Checks all OKF fields that can contain bundle-relative paths.
 * Unresolved values remain WARNs because `sources.resource` can be a non-path scope descriptor.
 */
export function validatePathFields({ relPath, frontmatter, fileSet, result }) {
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

/**
 * Finds direct Markdown-containing child directories for an index.
 * This is supporting structure for the index-link completeness check.
 */
function directMarkdownSubdirectories({ relPath, relDirs, relFiles }) {
  const parent = path.posix.dirname(relPath) === '.' ? '' : path.posix.dirname(relPath);
  const prefix = parent ? `${parent}/` : '';
  return relDirs.filter((dir) => {
    if (!dir || !dir.startsWith(prefix)) {
      return false;
    }
    const remainder = dir.slice(prefix.length);
    if (!remainder || remainder.includes('/')) {
      return false;
    }
    return relFiles.some((file) => file.startsWith(`${dir}/`) && file.endsWith('.md'));
  });
}

/**
 * Finds direct concept Markdown files for an index.
 * Reserved index.md and log.md files are structural files, not index entries.
 */
function directMarkdownFiles({ relPath, relFiles }) {
  const parent = path.posix.dirname(relPath) === '.' ? '' : path.posix.dirname(relPath);
  const prefix = parent ? `${parent}/` : '';
  return relFiles.filter((file) => {
    if (!file.startsWith(prefix) || !file.endsWith('.md')) {
      return false;
    }
    const remainder = file.slice(prefix.length);
    if (!remainder || remainder.includes('/')) {
      return false;
    }
    const baseName = path.posix.basename(file);
    return baseName !== 'index.md' && baseName !== 'log.md';
  });
}

/**
 * Checks that each index links to each direct concept file and
 * Markdown-containing subdirectory. Progressive disclosure is recommended
 * but optional, so omitted entries are WARNs.
 */
export function validateIndexContents({ relPath, body, fileSet, relDirs, relFiles, result }) {
  const linked = new Set(
    extractLinks(body)
      .map((target) => resolveTarget({ target, fileRel: relPath, fileSet }))
      .filter((resolved) => resolved.ok && resolved.matching)
      .map((resolved) => resolved.matching.toLowerCase())
  );

  for (const file of directMarkdownFiles({ relPath, relFiles })) {
    if (!linked.has(file.toLowerCase())) {
      result.addWarning(
        relPath,
        `index.md is missing a link to file \`${file}\` (OKF v0.2 §8, optional)`
      );
    }
  }

  for (const directory of directMarkdownSubdirectories({ relPath, relDirs, relFiles })) {
    if (!linked.has(`${directory}/index.md`.toLowerCase())) {
      result.addWarning(
        relPath,
        `index.md is missing a link to subdirectory \`${directory}/\` (OKF v0.2 §8, optional)`
      );
    }
  }
}
