# okf-validate usage reference

The command ships with the `@thingsai/okf-validator` npm package (`bin: okf-validate`).
Run it through npx once installed, or without installing via
`npx --package @thingsai/okf-validator okf-validate ...`. Read this reference when you
need the full flag list, the schema model, or trouble to shoot.

## What to run

```bash
npm install --save-dev @thingsai/okf-validator            # once per project (needs network)
npx okf-validate --help                                    # full flag list
npx okf-validate <path>...                                 # validate bundle(s)
npx okf-validate --json <path>...                          # machine-readable report
npx okf-validate --schemas <dir> <path>...                 # resolve path schema: refs
npx okf-validate --okf-version 0.2 <path>...               # explicit OKF version
```

On Windows the same commands work through `npx`; the binary also lives at
`node_modules/.bin/okf-validate` after install.

## Command-line reference

| flag | behavior |
|---|---|
| `<path>...` | one or more bundle roots; also accepts a directory of bundle subdirectories or a directory containing a `bundles/` folder |
| `--okf-version <v>` | OKF version to validate against (default `0.2`; supported list printed by `--help`) |
| `--schemas <dir>` | directory of custom schemas; non-URL `schema:` frontmatter values resolve to files under it (path as written, then `<name>.schema.json`) |
| `--json` | print a machine-readable report instead of the human summary |
| `--version` | print the package version and exit 0 |
| `--help` | usage and exit 0 |

Exit codes: `0` all conformant, `1` any errors, `2` usage error. Warnings never fail.

## JSON report shape

```json
{
  "okfVersion": "0.2",
  "bundles": [
    {
      "root": "./my-bundle",
      "errors":   [{ "severity": "error", "file": "a.md", "message": "..." }],
      "warnings": [{ "severity": "warning", "file": "b.md", "message": "..." }],
      "summary":  { "errors": 1, "warnings": 1 }
    }
  ],
  "totals": { "errors": 1, "warnings": 1 }
}
```

## Schema model

- The bundled default (`schemas/okf/v0.2/schema.json`) covers only the common OKF v0.2
  fields: `type` is required, the §5/§10 families are loosely typed, unknown keys are
  allowed. It is always available offline.
- A concept's `schema:` frontmatter key overrides the default for **that document**:
  - URL (`http(s)`/`file`) → fetched/read and compiled once per bundle.
  - path + `--schemas <dir>` → resolved under the directory (as written, then with
    `.schema.json` appended); `..` escapes are rejected.
  - any other value (e.g. `okf_bundle`) → treated as unspecified; default applies.
- An unresolvable, unloadable, or uncompilable schema is an **error** on the
  referencing document.

## Error / warning catalog

**Errors (exit 1):**
- missing, unterminated, invalid, or non-mapping YAML frontmatter on a concept
- missing or empty `type`
- non-root `index.md` carrying frontmatter; root `index.md` with keys other than
  `okf_version`
- `log.md` heading that is not an ISO `YYYY-MM-DD` date
- unresolvable `schema:` reference (fetch failure, missing file, `..` escape)
- JSON-Schema violations, reported as `[<schema>]: frontmatter...: <detail>`
- bundle root missing or not a directory

**Warnings (never fail):**
- missing `index.md` in a directory
- unsupported or misplaced `okf_version`
- `log.md` carrying frontmatter, or entries not newest-first
- internal markdown links that do not resolve to a file in the bundle
- path-valued frontmatter fields that do not resolve

## Troubleshooting

| symptom | fix |
|---|---|
| `command not found: okf-validate` | not installed / not on PATH; install the package or use `npx --package @thingsai/okf-validator okf-validate` |
| exit 2 | usage error — bad path, unknown flag, `--schemas` dir missing or not a directory; read the message |
| `could not load frontmatter schema ...` | the `schema:` URL/path is wrong or unreachable; fix the reference or drop `--schemas` |
| custom schema "ignored" | `--schemas` was not passed, or the `schema:` value is a URL (URLs win over paths) |
| network required? | only when a document's `schema:` is an `http(s)` URL; the default schema is bundled and offline |