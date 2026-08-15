# @thingsai/okf-validator

Validate [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
v0.2 bundles: parse markdown + YAML frontmatter and enforce OKF v0.2
conformance. Field validation uses **one versioned default JSON Schema**
covering only the common OKF v0.2 fields — unless a concept document
points at a **custom schema URL** of its own, in which case that schema
is used instead.

This repository is the home of three things:

1. **A Node package** that validates OKF bundles — a library API and a
   `okf-validate` CLI.
2. **A versioned default JSON Schema** at
   `schemas/okf/v0.2/schema.json`, reachable at a stable public URL.
   Whatever a schema doesn't cover is deliberately left to the bundle
   editor (extensions are legal OKF, SPEC §4.1).
3. **A CI/CD workflow** that validates the validator against the
   *official* OKF bundles from
   [`GoogleCloudPlatform/knowledge-catalog`](https://github.com/GoogleCloudPlatform/knowledge-catalog)
   and publishes the package to npm on version tags.

> This project was rewritten from an authoring template (the old "starter
> kit"). It is no longer a content-writing tool.

## Install

```sh
npm install @thingsai/okf-validator
```

Requires Node.js ≥ 18.

## CLI

```sh
npx okf-validate <path>...
```

Each `<path>` is a bundle root, a directory containing bundle
subdirectories, or a directory containing a `bundles/` folder.

```sh
# Validate a single bundle
okf-validate ./my-bundle

# Validate every bundle checked into an official-style corpus
okf-validate /path/to/knowledge-catalog/okf/bundles

# Machine-readable output
okf-validate --json ./my-bundle

# Validate against a schema from your own schemas directory
okf-validate --schemas ./my-schemas ./my-bundle
```

Exit codes: `0` when every bundle has zero errors, `1` when any bundle has
errors, `2` for usage errors. Warnings never fail the run.

Run `okf-validate --help` for the full flag list (`--okf-version`,
`--schemas`, `--json`, `--version`).

## Library

```js
import { validateBundle } from '@thingsai/okf-validator';

const result = await validateBundle('./my-bundle');
console.log(result.summary()); // { errors: 0, warnings: 1 }
result.errors.forEach((issue) => console.log(issue.file, issue.message));
```

Helper exports:

- `parseBundle(root)` — walk a bundle without validating.
- `loadDefaultSchema({ version })`, `buildValidators({ version })` — load
  and compile the default OKF JSON Schema for a given version.
- `schemaDir(version)`, `schemaJsonPath(version)` — filesystem locations
  of a version's schema.
- `isUrlReference(value)` — does a frontmatter `schema` value count as a
  schema URL?
- `readSchemaDocument(url)`, `loadSchemaFromRef(url)` — load and compile
  a custom schema from an `http(s)` or `file` URL.
- `loadSchemaFromFile(path)` — compile a schema from a filesystem path.
- `resolveSchemaFile(schemasDir, ref)` — resolve a non-URL `schema` value
  to a file under `schemasDir` (with `.schema.json` fallback).
- `SCHEMA_BASE_URL`, `SUPPORTED_OKF_VERSIONS` — the canonical schema URL
  base and the version list.

`validateBundle` is async: a concept document whose `schema` key is a URL
triggers a fetch of that schema, so validation can require the network.
`validateBundle(root, { schemasDir })` resolves non-URL `schema` paths
against a local schemas directory instead.

### Validation model

The validator encodes the OKF v0.2 spec's conformance split (§11):

**Errors** — the bundle is *not* v0.2 conformant:

- A concept `.md` without parseable, mapping-typed YAML frontmatter.
- Missing or empty `type`.
- A reserved `index.md` with frontmatter other than a bundle-root
  `okf_version` block.
- A `log.md` whose `## Heading` lines are not ISO `YYYY-MM-DD` dates.
- A frontmatter `schema` URL that cannot be loaded or compiled — or a
  `schema` path that cannot be resolved under `--schemas`.

**Warnings** — informative but never fatal (SPEC §11's explicit
"must-not-reject" list):

- Missing `index.md` in a directory.
- Broken internal links / unresolvable path-valued frontmatter fields
  (`resource`, `sources[].resource`, `computation`,
  `executor.resource`, `attester.resource`). Path resolution is lenient:
  document-relative first, then bundle-root, and URLs are always fine.
- `log.md` carrying frontmatter, or log entries not newest-first.
- `okf_version` in the wrong place or naming an unsupported version.

Unrecognized frontmatter keys, unknown concept `type` values, missing
optional families, broken *absolute-URL* links, and same-document
`#anchor` links are *never* flagged (extensions are blessed, SPEC §4.1;
types are not registered centrally, SPEC §4.1; anchors resolve to the
document carrying the link). If an editor needs stricter per-type or
per-family rules, they put them in their own schema and reference it from
the `schema` key — the validator does not judge what a custom schema
requires.

### Choosing the schema

Field-level validation of a concept's frontmatter follows one rule:

- If the document's frontmatter has a `schema` key whose value is an
  `https`, `http`, or `file` URL, the validator loads that schema and
  validates the document's fields against it (per document — a bundle may
  mix schemas).
- Otherwise, if the value is a **path** (for example `schema: revenue` or
  `schema: trusted/revenue.schema.json`) and a `--schemas <dir>` flag was
  passed, the validator resolves it under that directory — trying the path
  as written, then `path.schema.json` — and validates against the file it
  finds. References that escape the directory (e.g. `../…`) are rejected.
- Otherwise the default schema at
  `https://raw.githubusercontent.com/ThingsAI-io/okf-validator/main/schemas/okf/v0.2/schema.json`
  is used.

If `--schemas` is not given, path-like `schema` values are treated as
unspecified and the default schema is used. `schema` itself is an ordinary
optional key; it is never flagged either way.

## The default schema

The single bundled schema, `schemas/okf/v0.2/schema.json`, covers only
the common OKF v0.2 concept fields:

- `type` (REQUIRED), `title`, `description`, `resource`, `tags`
- provenance family: `sources`, `usage_window`
- trust family: `generated`, `verified`
- lifecycle family: `status` (`draft`|`stable`|`deprecated`), `stale_after`
- computation family (SPEC §10): `runtime`, `parameters`, `computation`,
  `executor`, `attester`

It is deliberately permissive: `type` is the only required key, the
family fields are loosely typed, and `additionalProperties: true` means
any producer-defined key passes. Strictness is the bundle editor's job —
via a custom `schema` URL.

> If you rename or move this repository, update `SCHEMA_ORG`,
> `SCHEMA_REPO`, and `SCHEMA_BRANCH` in `src/versions.js` and the `$id`
> in `schemas/okf/v0.2/schema.json`. They must stay in sync.

## CI/CD

`.github/workflows/ci.yml`:

- **test** — `npm ci && npm test` on Node 18 and 24, plus a fixture smoke
  run (`npm run validate`).
- **official** — clones
  `GoogleCloudPlatform/knowledge-catalog`, checks out the **pinned**
  commit from `spec/official-corpus-pin.txt`, and runs
  `npm run validate:official`. The validator must report zero errors on
  the official bundles or CI fails.
- **publish** — on tags matching `v*` (after test + official pass),
  `npm publish`es the scoped public package.

### What the maintainers need to configure

- An npm **publish token** with `publish` scope for `thingsai`,
  stored as the `NPM_TOKEN` GitHub Actions secret.
- This repo must be **public** (scoped public package + schema URLs).
- To declare a release: `npm version <x.y.z> && git push && git push`
  then tag `git tag v<x.y.z> && git push --tags`. The tag name must equal
  the `package.json` version.

### Bumping the official corpus pin

Upstream bundles change over time. To adopt a newer corpus deliberately:

```sh
npm run update-official-pin        # uses ../knowledge-catalog, or set OKF_OFFICIAL_REPO
git diff spec/official-corpus-pin.txt   # review that the new HEAD/commit line changed
git add spec/official-corpus-pin.txt && git commit
```

`update-official-pin` refuses to pin a corpus that does not validate
cleanly. Pinning is always a reviewed, explicit act — CI never silently
moves the goalposts.

## Development

```sh
npm install
npm test              # unit + fixture + official-corpus tests (corpus skipped if absent)
npm run validate      # CLI smoke test against test/fixtures/valid-bundle
npm run validate:official   # full official-bundle run (needs ../knowledge-catalog or OKF_OFFICIAL_REPO)
```

## License

MIT © ThingsAI.io