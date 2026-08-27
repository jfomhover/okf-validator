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
 * Missing indexes are optional in OKF v0.2, so each finding is a WARN, not an ERROR.
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
      result.addWarning(indexRel, 'missing index.md for progressive disclosure (OKF v0.2 §8, optional)');
    }
  }
}
