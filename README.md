# visura-parser

Visura Parser is a TypeScript library for deterministic parsing of Italian
_Visure camerali_. It accepts text-based PDF bytes and returns typed data in
the [documented output schema](outputSchema.json).

The project is inspired by INDA's
[Visura Parser](https://api.inda.ai/desk/docs/Visura%20Parser/): the PDF must
be text based.

## Motivation

When working with Italian companies, you often need structured data about them.
We wanted an open source parser that we could inspect, test, and improve.

This came up at Silkware, where we work with and onboard Italian companies. The
_Visura camerale_ is easy for companies to obtain and share, and it contains
enough official registry data to make structured extraction useful.

## Disclaimer

This library is developed with substantial help from AI coding agents.
Contributions must meet the same fixture, correctness, and review requirements
regardless of how the code was written.
The parser should be treated as a best-effort tool, so it may fail for Visure layouts that are not in the private corpus. Feel free to open an issue if you encounter a layout that is not supported, or contribute yourself.

## Requirements

- Node.js 20 or newer for consumers
- [Bun](https://bun.sh/) 1.3.12 for contributors

## Usage

Install the ESM package in your application:

```sh
npm install visura-parser
```

```ts
import { readFile } from 'node:fs/promises';
import { parseVisura, VisuraParseError } from 'visura-parser';

try {
  const bytes = new Uint8Array(await readFile('visura.pdf'));
  const data = await parseVisura(bytes, { filename: 'visura.pdf' });
  console.log(data.companyName, data.reaNumber);
} catch (error) {
  if (error instanceof VisuraParseError) {
    console.error(error.code);
  } else {
    throw error;
  }
}
```

The parser performs no filesystem or network access. `filename` is optional
and is copied to `filename`; it is not inferred from the PDF.

Missing fields are omitted. Counts and monetary amounts are numbers; explicit
availability values are booleans. Dates use ISO `YYYY-MM-DD`. Official Italian
role names are preserved in structured officer and shareholder records. Current
secondary offices and local business units are returned in `localUnits`, in
their printed order.
See the [example output](exampleOutput.json) and
[the schema](outputSchema.json).

Ordinary, historical, evasion reports, and the supported shareholder Visura
block are recognized. A block has no `reportType`. Image-only PDFs,
password-required inputs, invalid PDFs, and unrelated documents produce typed
errors; there is no OCR or language-model fallback.

## Development

Parse a local PDF and print its JSON without building first:

```sh
bun run parse -- "/path/to/visura.pdf"
```

The command writes JSON to stdout and errors to stderr. It exits with code 1
on a read or parse failure, or 2 for invalid arguments. Use `--help` for usage.
The output can contain personal data; keep it local and out of Git.

```sh
bun install
bun run check
```

Useful commands:

| Command                 | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `bun run build`         | Compile the package into `dist/`            |
| `bun run typecheck`     | Check TypeScript without emitting files     |
| `bun run test`          | Run the test suite once                     |
| `bun run test:watch`    | Run tests while files change                |
| `bun run lint`          | Run ESLint                                  |
| `bun run format`        | Format supported files                      |
| `bun run package:check` | Inspect the built npm package and its types |

To verify the supplied private corpus without logging document values:

```sh
bun run corpus:check -- /path/to/visure-examples --reference
```

The reference gate accounts for all 346 inputs: 341 supported text-based
documents, three textless PDFs, one invalid PDF, and one unrelated PDF. It
validates the complete schema, checks core identity presence, and compares
repeated parses. Omit `--reference` for another folder.

Each run saves successful parser outputs in a fresh `corpus-output/run-…/`
directory, ignored by Git. A source named `example.pdf` produces
`example.pdf.json`. The JSON summary includes the absolute `outputDirectory`
path. Rejected inputs have no output file; their counts remain in the summary.
These files can contain personal data, just like the source PDFs.

## Contributing

Read [the contributor guide](https://github.com/LorenzoYeKai/visura-parser/blob/main/CONTRIBUTING.md) before adding fixtures. Real Visure
often contain personal data and must not be committed.

The public tests and synthetic fixtures work without access to the private
corpus. To measure the built package on Node.js:

```sh
bun run benchmark
bun run benchmark -- /path/to/local/pdfs 3
```

The benchmark prints aggregate timings and result hashes, without filenames or
document values. See [the performance review and audit](https://github.com/LorenzoYeKai/visura-parser/blob/main/docs/performance-review.md)
for the measurement method, findings, and remaining work.

## License

[MIT](LICENSE)
