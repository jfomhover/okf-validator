# Intent

This document captures *what* this project is and *why*. It is the north
star; `spec/plan.md` is the roadmap for getting here from the current
state.

---

## What this project is

A **Node.js package that validates Open Knowledge Format (OKF) bundles**,
shipped from this repository together with a **versioned default JSON
Schema** that describes the common OKF v0.2 concept fields.

Three concrete products live in this repo:

1. **A validator package** (`@<org>/okf-validator`, installable from npm)
   that parses an OKF bundle directory and reports a conformance verdict
   against the OKF specification, distinguishing **errors** (hard
   conformance violations) from **warnings** (soft guidance that a
   conformant consumer must tolerate).
2. **A versioned, addressable default schema** under `schemas/okf/<version>/`.
   `schemas/okf/v0.2/schema.json` is reachable at a stable public GitHub
   URL and can therefore be referenced from OKF YAML frontmatter and by
   any JSON Schema tooling. It covers only the *common* OKF v0.2 fields;
   a concept document may point at a **custom schema URL** via its
   `schema` frontmatter key, and the validator then validates that
   document against the custom schema instead.
3. **A CI/CD workflow** that (a) validates the validator against the
   official OKF bundles from
   `https://github.com/GoogleCloudPlatform/knowledge-catalog`, and
   (b) publishes the package to npm under the organization scope.

This is a wholesale rewrite of the original **OKF starter kit** (a
content-writing template with a bundled content tree). The writing
template aspect is gone: this repository is now a *tool* repository, not
a *content* repository.

## Why it exists

OKF is intentionally schema-less-at-runtime: "no schema registry, no
central authority, no required tooling" (SPEC §1). That permissiveness is
a feature — any YAML frontmatter with a `type` is consumable — but it
creates a real gap. Producers and consumers independently guess at what a
conformant bundle looks like, and the official spec leaves structural
rules (§11 conformance, §8 index files, §9 log files, §5 provenance/
trust/lifecycle, §10 attested computations) to be reimplemented by hand
everywhere a bundle actually needs to be *checked*.

This project closes that gap with two things the ecosystem is missing:

- **A deterministic conformance checker** that reads the spec's rules
  once, encodes them, and exposes them as a reusable library + CLI.
- **Machine-readable versions of the spec** (JSON Schema) that can be
  pulled directly from the repository's public GitHub URL, so producers
  get schema validation in editors/CI for free without writing any code.

The existence of the *official* bundles (checked into
`GoogleCloudPlatform/knowledge-catalog`) gives us a real, canonical test
corpus: "does the validator agree that the official bundles are
conformant?" is the project's most important recurring check.

## Non-goals (removed from scope)

- Being a content-authoring template or starter kit. No `content/` tree,
  no per-content-type starter documents.
- Prescribing how to *consume* bundles (no serving, indexing, or
  visualization runtime).
- Defining a fixed taxonomy or registering concept `type` values — OKF
  explicitly leaves `type` open, and this project never rejects unknown
  types; stricter per-type rules belong in a bundle editor's own schema.
- Implementing the v0.2 attestation runtime protocol (receipts, verdicts,
  executors). The schemas *describe* the `executor`/`attester`/`runtime`
  contract fields; nothing here executes computations.
- Becoming a formal authority for the OKF spec. The spec stays canonical
  in `knowledge-catalog`; this repo is a faithful downstream encoding of
  it.

## Design principles

1. **Spec-first, not repo-first.** Field shapes, severities, and
   structural rules come from `GoogleCloudPlatform/knowledge-catalog`
   `okf/SPEC.md` v0.2 (§4–§13). Where the spec says "MUST", we error;
   where it says "SHOULD" we typically warn; where it says "MUST NOT
   reject", we never hard-fail.
2. **Errors vs. warnings are a real product decision.** The spec's
   conformance model (§11) separates hard requirements from "soft
   guidance consumers MUST NOT reject". We encode that split:
   - **Errors** — a bundle is *not* v0.2 conformant: unparseable/missing
     frontmatter, missing/empty `type`, reserved-file structural
     violations.
   - **Warnings** — informative, non-fatal: missing `index.md`, broken
     internal links, and other things the spec says consumers must
     tolerate but authors usually still want to know about.
3. **Official bundles are the ground truth corpus.** The validator must
   report zero errors on every bundle under
   `knowledge-catalog/okf/bundles/`. Where the official bundles exercise
   an ambiguous corner of the spec (e.g. `log.md` carrying frontmatter,
   root-relative-but-unslashed path-valued fields), the validator
   resolves the ambiguity *leniently* and notes it, so real bundles keep
   passing.
4. **Schemas are versioned and URL-addressable.** Base URL for `$id`s is
   a stable raw GitHub URL for this repository, e.g.
   `https://raw.githubusercontent.com/<org>/<repo>/main/schemas/okf/v0.2/...`.
   Versioned directories (`v0.2`) make future spec revisions additive,
   and the `okf_version` key in bundle-root `index.md` frontmatter lets a
   bundle declare which version it targets.
5. **Keep the schema surface canonical but permissive.** The single
    default schema covers only the common OKF v0.2 fields: it sets
    `additionalProperties: true`, enforces only the always-required `type`,
    and types the known §5/§10 families loosely. Everything a concept
    carries beyond that is the bundle editor's decision, expressed by
    pointing the document at a custom `schema` reference — an
    `http`/`https`/`file` URL, or (given a `--schemas <dir>` flag / a
    `schemasDir` option) a path resolved under that directory — which the
    validator uses instead of the default for that document. Unknown
    `type` values are never flagged.
6. **Small, dependency-light, testable core.** Parsing + structural
   checks live apart from JSON Schema validation. `node:test` covers
   the parser, the conformance rules, the CLI, and — when the official
   clone is available — the full official corpus.

## Open questions / decisions deferred

Decisions that need the maintainer's input before implementation are
called out in `spec/plan.md` ("Decisions needed"). The two that matter
for publishing are the npm package name/scope and the canonical schema
base URL (both derive from the GitHub org + repository identity).

## How a bundle gets validated (summary)

1. Walk the bundle root for `*.md` files, ignoring everything else
   (`viz.html`, `.py`, READMEs, etc.).
2. Parse each file's YAML frontmatter (required for concept docs; absent
   or restricted for reserved files).
3. Run structural conformance checks (reserved filename rules, §8/§9).
4. For each concept: if its frontmatter has a `schema` key, resolve it —
    an `http`/`https`/`file` URL loads that schema directly, a path (given
    a `--schemas <dir>` flag) resolves to a file under that directory —
    and validate the document's frontmatter against it; otherwise validate
    against the default `schemas/okf/v0.2/schema.json`. A schema reference
    that cannot be resolved, loaded, or compiled is an error on that
    document.
5. Run soft checks (index presence, internal link resolution, optional
   family shape) that are reported as warnings.
6. Emit a structured report (errors + warnings) and exit non-zero iff any
   errors were found.