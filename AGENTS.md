# Agent guide for visura-parser

## Project overview

`visura-parser` is an open source TypeScript library for deterministic parsing
of Italian _Visure camerali_. The planned input is a text-based PDF. The planned
output is structured, typed data with enough source evidence to explain how
each value was obtained.

- License: MIT
- Package format: ESM only
- Supported consumer runtime: Node.js 20 or newer
- Contributor package manager: Bun 1.3.12

## Repository structure

```text
src/
  index.ts                 # Public package entry point
test/
  index.test.ts            # Package import smoke test
  fixtures/
    README.md              # Fixture privacy rules
    private/               # Ignored local documents, never commit
docs/
  architecture.md          # Parser constraints and proposed stages
.changeset/                # Release notes and version changes
.github/workflows/
  ci.yml                   # Pull request and main branch checks
  release.yml              # Changesets release workflow
```

Keep `src/index.ts` limited to public exports. Put implementation code in
focused modules under `src/` once real fixtures establish the required
boundaries.

## Intended processing direction

The exact modules are not settled. New work should preserve this dependency
direction unless fixtures demonstrate that it needs to change:

```text
PDF bytes
  -> input validation
  -> positioned text extraction
  -> layout normalization
  -> document and section recognition
  -> field parsing
  -> cross-field validation
  -> public result mapping
```

Earlier stages must not import later stages. PDF-specific types should stop at
the extraction boundary. Field parsers should consume plain internal data so
they can be tested without constructing PDF files.

Read `docs/architecture.md` before introducing parser modules or public types.

## Build and development

### Prerequisites

- Node.js 20 or newer
- Bun 1.3.12, pinned in `package.json`

Use Bun for dependency installation and project scripts. Do not create npm,
pnpm, or Yarn lockfiles.

### Commands

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `bun install`           | Install dependencies from `bun.lock`                      |
| `bun run check`         | Run every required local and package check                |
| `bun run build`         | Emit JavaScript, declarations, and source maps to `dist/` |
| `bun run typecheck`     | Check TypeScript without emitting files                   |
| `bun run lint`          | Run typed ESLint rules                                    |
| `bun run format:check`  | Check formatting without changing files                   |
| `bun run format`        | Format supported files with Prettier                      |
| `bun run test`          | Run the Vitest suite once                                 |
| `bun run test:watch`    | Run Vitest in watch mode                                  |
| `bun run test:coverage` | Generate V8 coverage reports                              |
| `bun run package:check` | Validate the packed ESM package and declarations          |
| `bun run changeset`     | Describe a user-visible package change                    |

Run `bun run check` before handing work back. For a focused test during
development, pass its path to Vitest:

```sh
bun run test test/index.test.ts
```

## TypeScript configuration

- TypeScript runs in strict mode.
- Source modules use NodeNext resolution and ESM syntax.
- Relative TypeScript imports use `.js` extensions so emitted imports work in
  Node.js.
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled.
- Production builds compile only `src/**/*.ts` into `dist/`.
- Tests and configuration files are type-checked but not published.

Do not weaken compiler options to make a change pass. Narrow unknown input at
the system boundary, then keep internal functions typed and predictable.

## Testing

Vitest runs TypeScript tests directly. Test files use the `.test.ts` suffix and
live under `test/`. As parser modules appear, mirror the relevant `src/`
structure where that makes tests easier to find.

Use the smallest test level that proves the behavior:

- Unit tests cover text normalization and individual field grammars.
- Integration tests parse complete PDFs and compare the complete public result.
- Property tests cover locale-sensitive values such as dates, currency amounts,
  tax identifiers, and REA numbers.
- Package tests verify behavior through the public entry point.

Every parser fix should include a failing test or fixture that demonstrates the
problem. Do not update an expected output until you can explain why the old
value was wrong.

### Fixture privacy

Real Visure can contain names, home addresses, tax identifiers, and other
personal data.

- Commit only synthetic or fully anonymized fixtures.
- Store local source documents under `test/fixtures/private/`.
- Never paste private document contents into snapshots, issues, logs, commit
  messages, or review comments.
- Inspect test failure output before sharing it outside the local environment.
- Keep a reviewed expected-output file beside each committed integration fixture
  once parser development starts.

Anonymization must preserve the layout and character classes needed by the
test. Replacing every value with `REDACTED` usually destroys the behavior the
fixture was meant to cover.

## Determinism rules

For identical PDF bytes and the same library version, the parser must return
the same value or the same typed error.

Parsing code must not depend on:

- network calls or remote parsing services,
- language models or OCR fallback,
- the current clock, time zone, or host locale,
- randomness,
- process-global mutable state,
- nondeterministic iteration or concurrency order.

Parse Italian dates and numbers with explicit rules. Sort collections before
serializing them when source order is not part of the document meaning. Keep
page, line, and text-span evidence long enough to diagnose recognition and
field errors.

Reject unsupported or image-only PDFs with an explicit error. Do not guess
missing text.

## Code style and conventions

Prettier owns formatting. ESLint checks correctness and typed TypeScript rules.
Follow the existing configuration instead of reproducing style rules in code
review comments.

Use these naming conventions unless a nearby module establishes a clearer one:

| Entity                  | Convention                  | Example                 |
| ----------------------- | --------------------------- | ----------------------- |
| Source files            | kebab-case                  | `extract-text.ts`       |
| Test files              | source name plus `.test.ts` | `extract-text.test.ts`  |
| Types and classes       | PascalCase                  | `VisuraDocument`        |
| Functions and variables | camelCase                   | `extractText`           |
| Constants               | UPPER_SNAKE_CASE            | `SUPPORTED_PDF_VERSION` |

Prefer pure functions for normalization, recognition, field parsing, and
validation. Keep filesystem, PDF library, and other external interactions at
module boundaries. Avoid hidden caches and singleton state.

Add a runtime dependency only when the standard library cannot reasonably do
the job. For PDF libraries, verify that text positions and page boundaries are
available and stable before adoption. Record the decision and add a fixture
that exercises the required behavior.

## Public API and compatibility

Export public values and types through `src/index.ts`. Do not add package deep
imports unless they are intentional, documented entry points in `package.json`.

Before publishing the first parser API, ground its input type, result schema,
and error model in representative anonymized fixtures. Do not copy another
provider's response format without checking it against the source documents and
this project's goals.

After a public contract exists:

- treat output schema changes as API changes,
- preserve unknown sections in an observable form,
- add a changeset for user-visible behavior,
- update examples and type-level tests with the implementation.

## CI and releases

GitHub Actions runs `bun run check` for pull requests and pushes to `main`.
Changesets prepares release pull requests and package versions.

Agents must never publish a release, create a version tag, or trigger a manual
release job. A human maintainer owns npm credentials and the final publish
decision.

## Definition of done

Before finishing a change:

1. Inspect the changed files and confirm the work stayed within scope.
2. Add or update tests that exercise the real behavior.
3. Run the narrowest relevant test while developing.
4. Run `bun run check` before handoff.
5. Confirm no private fixtures, generated `dist/` files, cache files, or secrets
   are staged.
6. Add a changeset when published behavior changes.
7. Report deferred decisions or checks that could not run.
