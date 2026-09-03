# visura-parser

Visura Parser is a TypeScript library for deterministic parsing of Italian
_Visure camerali_. It will accept text-based PDF files and return structured,
typed data.

The project is inspired by INDA's
[Visura Parser](https://api.inda.ai/desk/docs/Visura%20Parser/): the PDF must
be text based.

## Requirements

- Node.js 20 or newer for consumers
- [Bun](https://bun.sh/) 1.3.12 for contributors

## Development

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

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before adding fixtures. Real Visure
often contain personal data and must not be committed.

## License

[MIT](LICENSE)
