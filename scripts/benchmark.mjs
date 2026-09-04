import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';

import { parseVisura, VisuraParseError } from 'visura-parser';

/** @param {string | Uint8Array} value */
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {number[]} values */
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return {
    totalMs,
    documentsPerSecond: (values.length * 1000) / totalMs,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log('Usage: bun run benchmark -- [directory] [runs=3]');
    return;
  }
  const directory =
    args[0] ??
    fileURLToPath(new URL('../test/fixtures/synthetic/', import.meta.url));
  const runs = Number(args[1] ?? 3);
  if (
    args.length > 2 ||
    !Number.isSafeInteger(runs) ||
    runs < 1 ||
    runs > 100
  ) {
    throw new Error('Expected a directory and a run count from 1 to 100.');
  }
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((file) => file.isFile() && file.name.toLowerCase().endsWith('.pdf'))
    .map((file) => file.name)
    .sort();
  if (files.length === 0) throw new Error('No PDF files found.');
  // Keep filesystem reads and result hashing outside the timed parse calls.
  const inputs = [];
  for (const file of files) {
    inputs.push(new Uint8Array(await readFile(join(directory, file))));
  }
  const inputHashes = inputs.map(hash);
  /** @type {string[]} */
  const expected = [];
  /** @type {Record<string, number>} */
  const rejections = {};
  let accepted = 0;
  const samples = [];
  let coldPass;
  for (let run = 0; run <= runs; run += 1) {
    const durations = [];
    for (const [index, bytes] of inputs.entries()) {
      let output;
      const start = performance.now();
      try {
        output = { value: await parseVisura(bytes) };
        durations.push(performance.now() - start);
        if (run === 0) accepted += 1;
      } catch (error) {
        durations.push(performance.now() - start);
        if (!(error instanceof VisuraParseError)) {
          throw new Error('Unexpected parser error; inspect locally.', {
            cause: error,
          });
        }
        output = { error: error.code, message: error.message };
        if (run === 0)
          rejections[error.code] = (rejections[error.code] ?? 0) + 1;
      }
      const digest = hash(JSON.stringify(output));
      if (run === 0) expected.push(digest);
      else if (digest !== expected[index]) {
        throw new Error('Parser output changed between benchmark passes.');
      }
      if (hash(bytes) !== inputHashes[index]) {
        throw new Error('Parser modified its input bytes.');
      }
    }
    if (run === 0) coldPass = summarize(durations);
    else samples.push(summarize(durations));
  }
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model,
        files: files.length,
        inputBytes: inputs.reduce((sum, bytes) => sum + bytes.byteLength, 0),
        accepted,
        rejections,
        corpusDigest: hash(JSON.stringify(inputHashes)),
        resultDigest: hash(JSON.stringify(expected)),
        coldPass,
        warmPasses: samples,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch {
  // Filesystem errors and PDF.js causes can contain private paths or values.
  console.error(
    'Benchmark failed. Check the directory, run count, and parser locally.',
  );
  process.exitCode = 1;
}
