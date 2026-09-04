# visura-parser

Visura Parser is a TypeScript library for deterministic parsing of Italian
_Visure camerali_. It accepts text-based PDF bytes and returns typed data in
the [documented output schema](outputSchema.json).

The project is inspired by INDA's
[Visura Parser](https://api.inda.ai/desk/docs/Visura%20Parser/): the PDF must
be text based.

## Motivation

When working with Italian companies, you may need to obtain structured data about them. And yet ther isn't really a free and reliable solution to do that.
This is what happened at Silkware, where we work with and onboard Italian companies on a daily basis.
The _Visura camerale_ is an official document that contains a satisfying amount of information about a company that is easy to obtain and to share for companies.
Currently, there isn't a free and open source solution to extract this information in a structured way.

## Disclaimer

This the development of this library is strongly aided by AI coding agents such as GPT5.6.

## Requirements

- Node.js 20 or newer for consumers
- [Bun](https://bun.sh/) 1.3.12 for contributors

## Usage

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
role names are preserved in structured officer and shareholder records.
See the [example output](exampleOutput.json) and
[the schema](outputSchema.md).

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

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before adding fixtures. Real Visure
often contain personal data and must not be committed.

## License

[MIT](LICENSE)
