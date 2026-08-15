# Plan: rewrite `okf-starter-kit` into `okf-validator`

Status: **rev 3 (approved & implemented)** — decisions A/B/C confirmed
(§7). An earlier critic subagent audit performed on rev 1 (recorded in
§9). Implementation matches this document; see `spec/intent.md`.

## 1. Current state

The repository `okf-starter-kit` (remote `ThingsAI-io/okf-starter-kit`)
is a content-writing template:

- `content/` — a bundled markdown tree (notes, checklists, indexes).
- `schema/` — per-content-type JSON Schemas (`content`, `index`, `note`,
  `checklist`) that *over-constrain* OKF semantics.
- `tools/validate-content.mjs` — a validator tied to template
  conventions (requires `index.md` everywhere, requires frontmatter on
  every concept, treats broken links as errors).
- `test/validate-content.test.mjs` — tests for the template validator.
- `.github/workflows/validate-content.yml` — CI running `npm test` +
  `npm run validate` on the template content.
- `.opencode/` — opencode config + a `content-architect` subagent whose
  instructions reference `content/` and `schema/` (**removed in rev 3** —
  keepers opted out of the whole folder; a skill may be added later).

Observations that steer the rewrite:

- The old validator bakes the *wrong* policy for a general OKF tool: it
  errors on broken links and missing `index.md`, while SPEC §6.1 and §11
  require consumers to *tolerate* those. Severities must be inverted.
- The reference bundles exercise ambiguous corners (e.g.
  `acme_retail/log.md` carries frontmatter; `sources[].resource` values
  like `policies/revenue-recognition.md` are root-relative but lack a
  leading `/`; `attester.resource: attesters/sql_equality.py` points at a
  non-`.md` file). The new validator must be lenient there or the
  official-corpus test fails.
- The reference bundles are the perfect conformance corpus and are not
  shipped in this repo — CI should clone them fresh
  (`https://github.com/GoogleCloudPlatform/knowledge-catalog`).

## 2. Target state

```
.
├── spec/
│   ├── intent.md
│   ├── plan.md                       # this document
│   └── official-corpus-pin.txt       # pinned knowledge-catalog SHA (B1)
├── schemas/
│   └── okf/
│       └── v0.2/
│           └── schema.json            # single default OKF v0.2 schema (common fields only)
├── src/
│   ├── index.js                     # public API
│   ├── cli.js                       # arg parsing/shared by bin
│   ├── parser.js                    # frontmatter/body parsing
│   ├── conformance.js               # structural checks (§8/§9/§11)
│   ├── links.js                     # link + path-resolution checks (§6)
│   ├── schemas.js                   # schema registry + Ajv compile
│   ├── report.js                    # Severity/Issue/ValidationResult
│   └── versions.js                  # supported OKF versions + base URL
├── bin/
│   └── okf-validate.mjs             # executable CLI
├── scripts/
│   └── validate-official.mjs        # run validator over official bundles
├── test/
│   ├── fixtures/
│   │   ├── valid-bundle/            # green fixture (smoke-test target)
│   │   └── invalid-bundle/          # red fixture exercising every error
│   ├── parser.test.mjs
│   ├── conformance.test.mjs
│   ├── schemas.test.mjs
│   ├── cli.test.mjs
│   └── official-bundles.test.mjs    # t.skip loudly when clone missing
├── .github/workflows/
│   └── ci.yml                       # test + official-corpus + publish
├── package.json
├── README.md
└── LICENSE
```

Deleted: `content/`, `schema/`, `tools/`, old `test/`, old workflow, and
the whole `.opencode/` folder (agents + config), per maintainer decision.

## 3. Semantics: error vs. warning

Derived from SPEC §4, §5, §6, §8, §9, §10, §11 (verified against the
official corpus — see §9).

### Errors (bundle is not v0.2 conformant)

- Concept `.md` (non-reserved): missing frontmatter, unterminated
  frontmatter, YAML that fails to parse, frontmatter that is not a
  mapping. (BOM is stripped before the `---` check.)
- Missing or empty `type`.
- Reserved `index.md` violates §8: carries frontmatter other than a
  bundle-root `okf_version` key; a bundle-root `index.md` frontmatter
  that is not exactly `{ okf_version }`. **Decision (C1):** an empty
  frontmatter block (`---\n---`) on a root `index.md` is tolerated (no
  error); only a *non-empty* block that is not `{ okf_version }` errors.
- Reserved `log.md` violates §9: a `## Heading` whose label is not an
  ISO `YYYY-MM-DD` date.
- A `schema` frontmatter value that is a URL (D) but cannot be loaded or
  compiled — the document asked for a specific schema and the validator
  cannot honor it.

**Not an error (rev 3, D):** `type: Attested Computation` without
`runtime`. At rev 2 this was an error (A3, per §10.2 "REQUIRED for this
type"); the user-directed schema model removed all type-specific
requirements from the default schema. An editor who wants `runtime`
required encodes that in their own `schema` URL.

### Warnings (soft guidance, MUST-NOT-reject per §11)

- Directory without `index.md`.
- Broken internal markdown link (body links, §6.1).
- Path-valued frontmatter field (`resource`, `sources[].resource`,
  `computation`, `executor.resource`, `attester.resource`, §6.2) that
  resolves to neither a URL nor an existing bundle file (checked against
  the *full file tree*, not only `*.md` — A1).
- Unknown `type` values are **never** flagged — types are not registered
  centrally and consumers must tolerate them (D; SPEC §4.1). Reserved
  files (`index.md`, `log.md`) are never concept-dispatched (A2).
- `log.md` carries YAML frontmatter (spec is silent — tolerated).
- `log.md` date-grouped entries are not newest-first (§9) — cheap
  ordering check.
- `okf_version` present but in a location other than a bundle-root
  `index.md`, or referencing an unsupported version.

Not flagged at all: unknown additional frontmatter keys (extensions are
blessed, §4.1), missing optional families, unrecognized files, non-`.md`
files, broken *absolute URL* links, and **same-document `#anchor` links**
(body links of the form `#heading` or `path/to/file.md#heading` resolve
via the path part; a bare fragment is a same-document reference and is
never a broken-link warning).

### Path resolution rules (§6.2, lenient)

For path-valued fields and body links:

1. Absolute URL (`http(s)://`, `mailto:`, `tel:`) → external, never
   flagged.
2. Bundle-root path: leading `/` → resolved against bundle root.
3. Document-relative path → resolved against the document's directory.
4. **Leniency:** if a path fails document-relative but a
   bundle-root-relative target exists, accept it (the official bundles
   rely on this for `sources[].resource` / `executor.resource`/
   `attester.resource`).
5. **Scope-descriptor predicate (B5):** a `sources[].resource` value is
   treated as a path only when it matches
   `^[A-Za-z0-9_./-]+(\.[A-Za-z0-9]+)?$` and has no spaces; otherwise it
   is treated as a free-text scope descriptor and skipped. (SPEC itself
   ships an ambiguous example — `dashboards/exec-revenue`, SPEC.md:944 —
   so this is documented as a best-effort heuristic.)

**Path implementation (B6):** all link/path resolution uses `path.posix`
semantics, converting to platform separators only at `fs` call time;
this keeps parser and CLI behavior identical on Windows (dev) and
Linux (CI). Link targets are case-normalized for the existence map so
case-insensitive Windows and case-sensitive Linux agree.

## 4. Schema design

All schemas are Draft 2020-12. `$id`s are absolute, versioned, and
point at this repository's public raw URL:

```
https://raw.githubusercontent.com/<org>/<repo>/main/schemas/okf/v0.2/<file>
```

**Compilation (A5):** schemas are registered by `$id` in *one* Ajv 2020
instance (`allErrors: true`, `strict: false`), which resolves all
internal `$ref`s offline from local files. The schema test asserts this
registered-set compiles and validates — not "standalone" compilation of
a single file (which Ajv cannot resolve without the dependency
registered).

`schemas/okf/v0.2/schema.json` (the ONLY bundled schema — the default):
- `type: object`, `required: ["type"]`, `additionalProperties: true`.
- `type`: non-empty string.
- `title`, `description`: non-empty string.
- `resource`: string.
- `tags`: array of non-empty strings.
- `status`: `["draft","stable","deprecated"]` (absent ⇒ stable, §5.4).
- `stale_after`: `YYYY-MM-DD` pattern (§5.5).
- `generated`: `by` required + actor shape; `at` optional
  ISO-8601 `(Z|[+-]\d{2}:\d{2})` (§5.2). Corpus uses both spellings.
- `verified`: `oneOf` [mapping, non-empty array of mappings]; `by`
  required actor; `at` optional ISO-8601 (§5.2 bare-mapping rule).
- `sources`: array; entry `resource` required; `id`/`title` strings;
  `author` actor; `usage_count` integer; `last_modified` date; per-entry
  `usage_window` (§5.1).
- `usage_window`: `{ from, to }` dates.
- Computation fields (§10; all optional — the default schema imposes no
  per-type requirements, that is the bundle editor's schema's job):
  `runtime`, `parameters` (`{name,type,required}`), `computation`,
  `executor` `{resource,receipt}`, `attester` `{resource}`.
- The `schema` key itself is not modeled (it is an ordinary optional
  extension key; `additionalProperties: true` admits it).

There are **no** `types/*.schema.json` and **no** `bundle.schema.json`.
Everything a concept carries beyond the common fields above is the
bundle editor's decision, expressed through a per-concept `schema:` key
(see §7-D, §7-F): when present with an `http(s)` or `file` URL, the
validator fetches/compiles that schema and validates that document's
frontmatter against it instead of the default. When present with a path
and a `--schemas <dir>` is supplied, the path resolves under that
directory (as written, then `<name>.schema.json`); escaping the directory
is rejected. Any other `schema` value is treated as unspecified and the
default is used. Loading is per-document and cached per bundle; a schema
that cannot be resolved, loaded, or compiled is an error on that document.

## 5. Implementation plan

### 5.1 Repo cleanup
- `git rm -r content schema tools test`; drop the old workflow and the
  `.opencode/` folder; regenerate the lockfile after `package.json`
  changes.

### 5.2 Package metadata (`package.json`)
- Scoped public package; `publishConfig: { "access": "public" }` (B2);
  `type: module`; `exports` (`.` → `src/index.js`, `./schemas/*` →
  `schemas/*`, `./package.json`); `bin: { "okf-validate":
  "./bin/okf-validate.mjs" }`; `files: ["src","schemas","bin"]`;
  `engines.node >= 18`; scripts:
  - `test`: `node --test`
  - `validate`: `node bin/okf-validate.mjs test/fixtures/valid-bundle`
  - `validate:official`: `node scripts/validate-official.mjs`
  - `prepublishOnly`: `npm test`
- `dependencies`: `ajv`, `yaml` (already present).

### 5.3 `src/*`
- **parser.js** — split frontmatter/body; require `---` delimiters; strip
  BOMs; parse with `yaml` default (1.2 core) schema. Add an explicit
  parsability **regression test that date-shaped scalar values
  (`stale_after`, `last_modified`, `usage_window.from/to`, `generated.at`)
  survive as strings, not `Date` objects (B3)** — required for pattern
  validation and JSON-serializable reports.
- **report.js** — `Issue { severity, file, message }`;
  `ValidationResult { errors, warnings, addError, addWarning, summary }`.
- **links.js** — markdown link extraction; §6.2 lenient resolver per §3,
  using `path.posix` + full-file-tree existence (A1, B6).
- **conformance.js** — structural rules of §3 (BOM, index/log rules
  with the C1 empty-block decision, reserved-file non-dispatch A2,
  log ordering, `# Computation` contract warning). Validates each concept
  against the default schema, or against the schema resolved from the
  document's `schema` frontmatter key (D) — URLs, or paths resolved under
  `options.schemasDir` (F). `validateBundle` is **async** because a
  custom `schema` URL may require a fetch.
- **schemas.js** — one default schema (`schemas/okf/<version>/schema.json`)
  plus per-reference custom-schema loading. Custom schemas come from
  `http(s)`/`file` URLs or from a `--schemas` directory (paths resolved
  with a `<name>.schema.json` fallback, traversal rejected), are compiled
  in a fresh Ajv instance per build (avoids fixed-`$id` collisions), and
  are cached per bundle. Exposes `loadDefaultSchema`, `loadSchemaFromRef`,
  `loadSchemaFromFile`, `resolveSchemaFile`, `readSchemaDocument`,
  `isUrlReference`, `compileSchema`, `buildValidators`.
- **versions.js** — `SCHEMA_BASE_URL` (decision B) + per-version layout;
  base URL honored for both raw-GitHub and installed-package use.
- **index.js** — public API: `validateBundle(root, opts)` (async),
  `parseBundle(root)`, `SUPPORTED_OKF_VERSIONS`, `SCHEMA_BASE_URL`,
  schema accessors.

### 5.4 CLI
- `bin/okf-validate.mjs <path>...` — each path is a bundle root or a
  directory containing `bundles/*`; flags `--version`, `--okf-version`,
  `--schemas <dir>`, `--json`. `--schemas` must point at an existing
  directory (else exit 2); it is threaded into `validateBundle` as
  `schemasDir` and makes non-URL `schema:` frontmatter values resolve to
  files under it. Exit 1 iff errors; print errors + warning count to
  stderr.

### 5.5 Official-corpus harness
- `scripts/validate-official.mjs [repoPath]`: clone resolution (arg →
  `$OKF_OFFICIAL_REPO` → sibling `../knowledge-catalog` → shallow clone
  of `https://github.com/GoogleCloudPlatform/knowledge-catalog`). Verify
  the checkout against the pinned SHA in `spec/official-corpus-pin.txt`
  (B1) — mismatch printed loudly, not silently auto-refreshed. Locate
  bundles under `okf/bundles/*` or `bundles/*`; run validator; print
  per-bundle error/warning counts; exit non-zero on any errors.

### 5.6 Tests
- Parser: valid/missing/unterminated/non-mapping/BOM; body extraction;
  date-shaped scalars stay strings (B3).
- Conformance: each §3 rule; bare `verified` mapping; actor formats;
  unknown concept types pass silently (D); official-style
  leniencies produce **warnings, not errors** in the fixtures — put the
  real corpus quirks in fixtures too (B4): log.md frontmatter, unslashed
  root-relative `sources[].resource`, `.py` attester target, `+00:00`
  timestamps, bare-`verified`.
- Schemas: `schemas/okf/v0.2/` contains **exactly one file**
  (`schema.json`); default validator enforces `type` + the common fields
  and permits unknown keys; a custom schema (D) referenced by `file://`
  URL compiles and validates; `loadSchemaFromFile`/`buildValidators.forFile`
  compile from a filesystem path; `resolveSchemaFile` resolves exact
  paths, `.schema.json` fallback, subdirectories, and rejects traversal /
  missing / empty references; non-URL schema values are ignored;
  `readSchemaDocument` rejects non-URL references.
- Custom-schema override: a document with `schema: <file://…>` is
  validated against that schema (e.g. it may require `runtime`, which the
  default does not); a different document without it is validated against
  the default — per document, not per bundle. A schema URL that cannot be
  loaded is an error on that document. With `schemasDir`, a `schema:`
  path is resolved and enforced per document, missing or escaping
  references are errors on that document, and documents that do not
  reference it keep the default (F).
- CLI: exit codes, `--json` shape, `--version`, `--schemas` (missing dir /
  non-directory → exit 2; enforcing a path-based `schema:` → exit 1;
  without the flag the same bundle stays green).
- Fixtures: `valid-bundle/` green; `invalid-bundle/` red per error rule
  (incl. an unloadable `schema:` URL); the empty-root-`index.md`
  frontmatter case is pinned (C1).
- `official-bundles.test.mjs`: skip via `t.skip` with a loud message
  when the clone is absent (C2); asserts zero errors across all official
  bundles at the pinned SHA.

### 5.7 CI/CD (`.github/workflows/ci.yml`)
- **`test` job** (push + PR): checkout, Node 20 *and* Node 24 (C3),
  `npm ci`, `npm test`, `npm run validate`.
- **`official` job** (push + PR + `workflow_dispatch`): checkout,
  `npm ci`, clone pinned knowledge-catalog, `npm run validate:official
  -- <clone>`.
- **`publish` job** (tags `v*`): needs test+official; Node 24; `npm ci`;
  `npm publish` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` and
  registry config for the org scope; `permissions: { contents: read }`;
  `publishConfig.access: public` in package.json (B2). README documents
  the version→tag discipline (`npm version <x>` then `git tag v<x>`).

## 6. Sequencing

1. Decisions A/B/C confirmed (§7).
2. Repo cleanup + `package.json` + lockfile.
3. `src/*` + CLI + scripts.
4. `schemas/okf/v0.2/**`.
5. Tests + fixtures; iterate until `npm test` green.
6. `npm run validate:official` green against the local clone at the
   pinned SHA.
7. README, LICENSE header update (no `.opencode` — deleted; a skill may
   be added later).
8. Workflow file; document secrets.

## 7. Decisions (confirmed)

- **A. Package name/scope:** `@thingsai/okf-validator`, public access
  (`publishConfig.access: "public"`).
- **B. Schema base URL:** the repository will be renamed to `okf-validator`
  under the `ThingsAI-io` org, so the canonical base is
  `https://raw.githubusercontent.com/ThingsAI-io/okf-validator/main/schemas/okf/v0.2/`.
  `SCHEMA_ORG`/`SCHEMA_REPO`/`SCHEMA_BRANCH` in `src/versions.js` and the
  `$id`s in `schemas/okf/v0.2/**` are the single place this is encoded; if
  the eventual repo name differs, update both together (`npm run` is not
  needed — a plain text replace).
- **C. Publish trigger:** tags matching `v*`, gated on `test` + `official`
  jobs; version tag must equal `package.json` version.
- **D. Schema model (rev 3, user-directed):** `schemas/okf/<version>/`
  contains **one** schema — `schema.json`, covering only the common OKF
  v0.2 fields (core + §5 provenance/trust/lifecycle + §10 computation
  family), `type` required, everything else optional, extensions
  allowed. There are no per-type schemas and no bundle schema; the
  *bundle editor* decides any stricter shape via a per-concept
  `schema: <URL>` frontmatter key. Validator rule: if a document's
  `schema` value is an `http(s)`/`file` URL, validate that document's
  frontmatter against that schema; otherwise use the default. Non-URL
  `schema` values are unspecified (default applies). `validateBundle`
  becomes async (schema fetch). The default schema consequently imposes
  no type-specific requirements anymore — e.g. `Attested Computation`
  without `runtime` no longer errors (reverses A3); an editor who wants
  that rule puts it in their own schema.
- **E. Known tolerated warning:** `acme_retail/log.md` carries YAML
  frontmatter.
- **F. Schemas directory (user-directed):** new `--schemas <dir>` CLI flag
  (and `validateBundle(root, { schemasDir })` option) resolves **non-URL**
  `schema:` frontmatter values to schema files under that directory —
  tried as written, then with a `.schema.json` suffix. Existence of the
  directory is checked at CLI parse time (exit 2 otherwise); references
  that escape the directory (`..`, absolute) are rejected; missing files
  are an error on the referencing document. Without the flag, path values
  remain unspecified (default schema applies), so bundles never required
  it. URLs (`http(s)`/`file`) always win over the directory.

## 8. Risks / notes

- The pinned corpus (B1) means the `official` job never silently changes
  its gate; ticking the pin is a deliberate, reviewed act.
- `viz.html`/`.py`/`.pyc` artifacts are ignored for *structure/schema*
  checks but *are* legitimate link/path targets (A1).
- Root `index.md` `okf_version` may be string or number; both accepted.
- The whole corpus is CRLF and on Windows the repo — `path.posix`
  resolution (B6) keeps behavior consistent; tests assert link behavior
  on fixtures with LF content while reading actual CRLF files.

## 9. Review log (rev 1 → rev 2 → rev 3)

Audit performed by a research subagent against SPEC.md and the official
bundles. Findings adjudicated:

| # | Finding | Resolution |
|---|---------|------------|
| A1 | `.md`-only resolver trips `attesters/sql_equality.py` (+ body link `sql_equality.py`) | Resolve against full file tree |
| A2 | Spurious unknown-type warning for `log.md`'s `type: Log` | No type dispatch on reserved files |
| A3 | Missing-`runtime` as error is stricter than §11 list | Kept at rev 2; **reversed at rev 3** (D) — the default schema imposes no type-specific requirements; an editor's own schema may require `runtime` |
| A4 | Corpus mixes `Z` and `+00:00` | Pattern accepts both |
| A5 | "Standalone" Ajv compile cannot pass for remote `$id`s | Single-registry compile; test reworded |
| A6 | `okf_version` must be optional in bundle.schema.json | Mark optional |
| B1 | Unpinned `@HEAD` corpus clone | Pin SHA `spec/official-corpus-pin.txt` |
| B2 | Publish hardening | `publishConfig.access`, `NODE_AUTH_TOKEN`, permissions, version→tag docs |
| B3 | Date coercion config-dependent | Pin parser config + regression test |
| B4 | Corpus quirks unavailable when clone missing | Mirror quirks in fixtures |
| B5 | Path-vs-descriptor heuristic unexercised | Positive-match predicate + documented ambiguity |
| B6 | Windows path/CRLF divergence | `path.posix` + case normalization |
| C1 | Empty frontmatter on root `index.md` | Tolerate; pinned in fixture |
| C2 | Silent skip in official test can hide CI gap | `t.skip` with loud message |
| C3 | Node version drift | CI runs min (18/20) and current (24) |
| D1 | (rev 3) Over-engineered schema set (11 type schemas + bundle schema) | User-directed: one default `schema.json` (common fields only); per-concept `schema:` URL overrides; type-specific rules move to editor schemas (D) |
| D2 | (rev 3) `validateBundle` was sync; custom schema URLs need the network | Now async; CLI and official-corpus scripts await it |
| D3 | (rev 3) Shared Ajv registry collided on the default `$id` across calls | Fresh Ajv per build; custom refs cached per bundle within a build |