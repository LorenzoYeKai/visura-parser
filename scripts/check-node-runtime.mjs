import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

import { parseVisura } from 'visura-parser';

const fixture = new URL(
  '../test/fixtures/synthetic/ordinary.pdf',
  import.meta.url,
);
const expectedFile = new URL(
  '../test/fixtures/synthetic/ordinary.expected.json',
  import.meta.url,
);
const bytes = new Uint8Array(await readFile(fixture));
const original = bytes.slice();
/** @type {unknown} */
const expected = JSON.parse(await readFile(expectedFile, 'utf8'));
const actual = await parseVisura(bytes, { filename: 'ordinary.pdf' });

assert.deepEqual(actual, expected);
assert.deepEqual(bytes, original);
console.log(
  `Built ESM package parsed the synthetic fixture on ${process.version}.`,
);
