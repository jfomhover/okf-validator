import fs from 'node:fs';
import path from 'node:path';

/**
 * Builds the complete relative file and directory inventory for a bundle.
 * This is supporting structure for other checks and raises no issues itself.
 */
export function walkBundle(bundleRoot) {
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

/**
 * Checks progressive-disclosure indexes for every Markdown-containing directory.
 * This validator requires an index for every Markdown-containing directory,
 * so each missing index is an ERROR even though OKF itself describes indexes as optional.
 */
export function validateIndexPresence({ relDirs, relFiles, result }) {
  const relMd = new Set(relFiles.filter((rel) => rel.endsWith('.md')));
  for (const dir of relDirs) {
    const base = dir ? `${dir}/` : '';
    const hasMarkdownBelow = [...relMd].some((rel) => rel.startsWith(base));
    if (!hasMarkdownBelow) {
      continue;
    }
    const indexRel = `${base}index.md`;
    if (!relMd.has(indexRel)) {
      result.addError(indexRel, 'missing index.md for progressive disclosure (OKF v0.2 §8)');
    }
  }
}
