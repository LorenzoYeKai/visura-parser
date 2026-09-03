# Contributing

## Local setup

Install Bun 1.3.12, then run:

```sh
bun install
bun run check
```

Use `bun run changeset` for a change that affects the published package.

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
