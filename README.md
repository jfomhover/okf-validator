# @thingsai/okf-validator

> ⚠️ **Experimental.** Everything here may change without notice — flags, API, schema, package. Use it with that in mind.

Validate [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundles — the format Google's knowledge-catalog uses. One tool, three ways to use it:

| | |
|---|---|
| 💻 **CLI** | `npx okf-validate <path>` — check bundles locally or in CI |
| 🤖 **Agent skill** | teach opencode / Claude Code / Copilot to run it for you |

Checks OKF v0.2 conformance out of the box against a single versioned default JSON Schema — and honors your own custom schemas, per document, when you need stricter rules.

## Quick start

```sh
npm install @thingsai/okf-validator
npx okf-validate ./my-bundle
```

Requires Node.js ≥ 18. Output: `errors: 0, warnings: 2` — warnings are informative, errors fail the run.

## 💻 CLI

Point it at a bundle, a folder of bundles, or a `bundles/` corpus:

```sh
npx okf-validate ./my-bundle                                  # one bundle
npx okf-validate /path/to/knowledge-catalog/okf/bundles       # whole corpus
npx okf-validate --json ./my-bundle                           # machine-readable report
npx okf-validate --schemas ./my-schemas ./my-bundle           # resolve custom schema: paths
```

Exit codes: `0` conformant · `1` errors · `2` usage error. `npx okf-validate --help` lists all flags.

## 🤖 Agent skill

`skills/okf-validate/` teaches a coding agent when to reach for the validator, how to install it, and what to run — then you can just say *"validate this bundle"* and let the agent take it from there.

It's standard [Agent Skills](https://agentskills.io) (`SKILL.md` + frontmatter), so it works in opencode, Claude Code, Codex, GitHub Copilot CLI, Cursor, and 30+ other agents.

```sh
npx skills add ThingsAI-io/okf-validator                              # all skills
npx skills add ThingsAI-io/okf-validator --skill okf-validate         # just this one
```

Or drop `skills/okf-validate/` into any discovery directory (`.opencode/skills/`, `~/.config/opencode/skills/`, …). Full reference: `skills/okf-validate/references/usage.md`.

## Custom schemas — your rules, per document

A concept's `schema:` frontmatter key chooses its validator:

- **URL** (`https`/`http`/`file`) → fetched and enforced for that document.
- **Path** (`schema: revenue`) + `--schemas <dir>` → resolved under that directory, with a `.schema.json` fallback.
- **Anything else** (`okf_bundle`, absent) → the bundled default schema applies.

The default schema is deliberately permissive: `type` is the only required field, the §5/§10 families are loosely typed, and unknown keys always pass (extensions are legal OKF). Strict per-type rules belong in a custom schema — the validator never judges what your schema requires.

## What it checks

**Errors** — the bundle is *not* conformant:

- missing, malformed, or non-mapping frontmatter; missing or empty `type`
- reserved `index.md`/`log.md` violations (frontmatter where it isn't allowed, non-ISO date headings)
- a `schema:` reference that can't be loaded or resolved

**Warnings** — informative, never fatal:

- missing `index.md`, broken internal links, unresolvable path fields
- `log.md` frontmatter / entries not newest-first, misplaced or unsupported `okf_version`

Never flagged: unknown keys, unknown `type` values, absolute-URL links, `#anchor` links.

## License

MIT © ThingsAI.io