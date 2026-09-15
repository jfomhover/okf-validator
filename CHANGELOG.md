# Changelog

## Unreleased

### Added

- Added reusable `schemas/toolkit/graph.schema.json` for typed `graph` relationships.
- Added graph composition to the toolkit reference schema.

## 0.1.7 - 2026-08-28

### Added

- Added explicit `bundle:` frontmatter references for files inside the current OKF bundle.
- Resolved `bundle:` references recursively through nested objects and arrays.
- Added errors for missing bundle targets and paths escaping the bundle root.
- Documented the bundle-reference convention in the README and validator skill reference.

### Tests

- Added coverage for valid nested bundle references, missing targets, and bundle-root escapes.
