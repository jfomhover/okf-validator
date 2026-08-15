import fs from 'node:fs';
import path from 'node:path';

export const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:'];

export function extractLinks(body) {
  const targets = [];
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1].trim();
    if (target) {
      targets.push(target);
    }
  }
  return targets;
}

export function isExternalTarget(target) {
  return EXTERNAL_PREFIXES.some((prefix) => target.startsWith(prefix));
}

export function stripAnchor(target) {
  return target.split('#', 1)[0];
}

function caseFold(value) {
  return value.toLowerCase();
}

export function buildFileSet(bundleRoot) {
  const set = new Set();
  walkFiles(bundleRoot, (relPath) => set.add(caseFold(relPath)));
  return set;
}

function walkFiles(dir, onFile, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(path.join(dir, entry.name), onFile, relPath);
    } else {
      onFile(relPath);
    }
  }
}

function normalizeInRoot(relPosix) {
  if (!relPosix) {
    return null;
  }
  const normalized = path.posix.normalize(relPosix).replace(/^\.\//, '');
  if (!normalized || normalized === '.') {
    return null;
  }
  if (normalized.startsWith('../') || normalized === '..') {
    return null;
  }
  return normalized;
}

function candidatesFor(relPosix, isDirectory) {
  if (!relPosix) {
    return [];
  }
  if (relPosix.split('/').includes('..')) {
    return [];
  }
  if (isDirectory) {
    return [`${relPosix}/index.md`];
  }
  const extension = path.posix.extname(relPosix);
  if (extension) {
    return [relPosix];
  }
  return [relPosix, `${relPosix}.md`, `${relPosix}/index.md`];
}

export function resolveTarget({ target, fileRel, fileSet }) {
  const clean = stripAnchor(target).trim();
  if (!clean) {
    return { ok: true, reason: 'same-document anchor, not a file reference' };
  }
  if (isExternalTarget(clean)) {
    return { ok: true, external: true };
  }

  const isDirectory = clean.endsWith('/');
  const base = isDirectory ? clean.slice(0, -1) : clean;
  if (!base) {
    return { ok: false, reason: 'unresolvable link target' };
  }

  const candidateRels = [];
  if (clean.startsWith('/')) {
    const rel = normalizeInRoot(base.replace(/^\/+/, ''));
    if (rel) {
      candidateRels.push(rel);
    }
  } else {
    const fileDir = path.posix.dirname(fileRel);
    const docRelative = fileDir === '.' ? base : `${fileDir}/${base}`;
    const docRel = normalizeInRoot(docRelative);
    const rootRel = normalizeInRoot(base);
    if (docRel) {
      candidateRels.push(docRel);
    }
    if (rootRel) {
      candidateRels.push(rootRel);
    }
  }

  for (const rel of candidateRels) {
    for (const candidate of candidatesFor(rel, isDirectory)) {
      if (fileSet.has(caseFold(candidate))) {
        return { ok: true, matching: candidate };
      }
    }
  }

  return { ok: false, reason: 'link or path target does not resolve to a file in the bundle' };
}

export function isPathLike(value) {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value);
}