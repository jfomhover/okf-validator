---
name: okf-validate
description: Runs the @thingsai/okf-validator CLI to validate Open Knowledge Format (OKF)
  v0.2 bundles. The agent checks bundle conformance (missing/malformed frontmatter, type,
  index.md and log.md rules, internal links) and validates each concept's frontmatter
  against the bundled default JSON Schema or a per-document custom schema (URL or a path
  resolved via --schemas). Use whenever the user asks to validate an OKF bundle, check OKF
  v0.2 conformance, run okf-validate, lint OKF markdown frontmatter, or wire the validator
  into a project or CI.
license: MIT
allowed-tools: Read Write Bash(npx:*, npm:*, node:*)
---

# okf-validate

Validate OKF v0.2 bundles with the `@thingsai/okf-validator` CLI. It checks bundle
structure and validates concept frontmatter against JSON Schemas. Errors fail the run;
warnings are reported but never fatal.

## When to use me

- The user asks to validate an OKF bundle or "check OKF v0.2 conformance".
- The user wants `okf-validate` run on a bundle, a corpus directory, or added to CI.
- The user wants concept frontmatter checked against custom schemas they maintain
  (via a `--schemas` directory or per-document `schema:` URLs).

## Setup (once per project)

Install as a dev dependency (needs network on first install):

```bash
npm install --save-dev @thingsai/okf-validator
```

For ad-hoc runs without installing, npx pulls the package on demand:

```bash
npx --package @thingsai/okf-validator okf-validate --help
```

## Validate

```bash
npx okf-validate <path>...
```

Each `<path>` is a bundle root, a directory containing bundle subdirectories, or a
directory containing a `bundles/` folder. Multiple paths are allowed.

- Single bundle: `npx okf-validate ./my-bundle`
- Whole corpus: `npx okf-validate /path/to/knowledge-catalog/okf/bundles`
- Machine-readable report: `npx okf-validate --json ./my-bundle`
- Resolve path-based `schema:` refs from a directory: `npx okf-validate --schemas ./my-schemas ./my-bundle`

## Output and exit codes

- `0` — every bundle conformant (no errors).
- `1` — at least one bundle has errors.
- `2` — usage error (bad path, unknown flag, missing `--schemas` dir).
- Warnings never fail the run. Read errors + warning count from the stderr summary.

## Edge cases

- A concept's `schema:` frontmatter value picks its validation schema: an
  `http(s)`/`file` URL overrides the default for that document (fetched once); with
  `--schemas <dir>` a path value resolves under that directory (as written, then
  `<name>.schema.json`). An unloadable or missing schema is an **error** on that
  document.
- Without `--schemas`, plain-path `schema:` values use the bundled default schema —
  they never fail on their own.
- Non-bundle paths and flag mistakes exit `2`; read the printed message.

See `references/usage.md` for the full command reference, the schema model, the
`--json` report shape, and the error/warning catalog.