# Contributing

## Local setup

Use Node.js 24 for the development tools and install Bun 1.3.12. The library
supports Node.js 20 and newer; CI checks the built package on 20, 22, and 24.
Fork and clone the repository, then run:

```sh
bun install --frozen-lockfile
bun run check
```

The committed synthetic fixtures are enough to run every required check.
You do not need the maintainer's private corpus or any service credentials.

Use `bun run changeset` for a change that affects the published package.

Maintainers can follow the [release guide](docs/releasing.md) to configure npm
trusted publishing and review automated releases.

## Project map

- `src/index.ts` is the public entry point.
- `src/internal/` contains parser implementation details.
- `src/internal/extract-pdf.ts` is the PDF.js boundary.
- `outputSchema.json` is the public output contract.
- `docs/architecture.md` explains the parser pipeline and determinism rules.

Read `docs/architecture.md` before adding parser modules, exported types, or
new document-family behavior.

## Working on a parser change

Start with a small fix to a field grammar or a synthetic layout test. For a new
document family or a public schema change, open an issue describing the input
layout and expected output before building a larger implementation.

Use `test/helpers/pdf.ts` to construct text PDFs from synthetic positioned text.
Domain parsers also accept plain extracted pages; see `test/internal/` for
examples that need no PDF construction. Run the test you changed first:

```sh
bun run test test/internal/parse-document.test.ts
```

Performance changes must preserve complete output and typed errors. Run
`bun run benchmark -- /path/to/local/pdfs 3` before and after your change on
the same Node version and machine. Compare both hashes, rejection counts, and
warm timings. The default `bun run benchmark` uses the public synthetic fixture
to check the command; it does not represent a varied corpus. Read
[the performance review](docs/performance-review.md) for measurement limits.

## Fixture policy

Italian Chamber of Commerce records can include names, addresses, identifiers,
and other personal data. Do not commit a real Visura unless every sensitive
value has been replaced and the replacement document still exercises the
layout under test.

Keep private local documents under `test/fixtures/private/`. Git ignores that
directory. Committed fixtures must be synthetic or demonstrably anonymized.
Each fixture should have a reviewed expected-output file beside it once parser
work begins.

## Pull requests

Keep parsing changes tied to fixtures. A new document layout should arrive with
a minimal fixture and an assertion that fails before the parser change. Run the
full `bun run check` command before opening a pull request.

Before submitting, check that the pull request:

- preserves deterministic output for the same PDF bytes and options;
- does not add network, OCR, language-model, clock, locale, random, or
  process-global state to parser code;
- keeps PDF-specific types at the extraction boundary;
- avoids committing private documents, generated `dist/`, corpus output,
  coverage output, caches, or secrets;
- includes a changeset when published behavior changes.

For small internal refactors, explain the parser behavior that should stay the
same and list the command you used to verify it. For parser fixes, include the
smallest fixture or unit test that would have failed before the change.
