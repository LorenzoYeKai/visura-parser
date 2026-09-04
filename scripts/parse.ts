import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { parseVisura, VisuraParseError } from '../src/index.js';

const USAGE = 'Usage: bun run parse -- <path-to-visura.pdf>';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(USAGE);
    return;
  }

  const filename = args[0];
  if (args.length !== 1 || filename === undefined || filename.length === 0) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(filename));
  } catch {
    console.error(
      'read-error: Could not read the input file. Check the path and permissions.',
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await parseVisura(bytes, { filename: basename(filename) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof VisuraParseError
        ? `${error.code}: ${error.message}`
        : 'unexpected-error: Parsing failed.',
    );
    process.exitCode = 1;
  }
}

await main();
