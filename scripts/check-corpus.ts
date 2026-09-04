import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type SchemaObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  parseVisura,
  VisuraParseError,
  type VisuraDocument,
} from '../src/index.js';

interface CorpusReport {
  outputDirectory: string;
  files: number;
  parsed: number;
  meaningful: number;
  expectedRejections: Record<string, number>;
  unexpectedErrors: number;
  schemaFailures: number;
  determinismMismatches: number;
  documentTypes: Record<string, number>;
  fieldPresence: Record<string, number>;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

async function main(): Promise<void> {
  const corpusDirectory = resolve(
    process.argv[2] ?? '/Users/lorenzo/Documents/CP/visure-examples',
  );
  const schemaPath = new URL('../outputSchema.json', import.meta.url);
  const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as SchemaObject;
  const ajv = new Ajv2020({ allErrors: true });
  addFormats.default(ajv);
  const validate = ajv.compile<VisuraDocument>(schema);
  const files = (await readdir(corpusDirectory))
    .filter((filename) => filename.toLowerCase().endsWith('.pdf'))
    .sort();
  const outputRoot = fileURLToPath(
    new URL('../corpus-output/', import.meta.url),
  );
  await mkdir(outputRoot, { recursive: true });
  const outputDirectory = await mkdtemp(join(outputRoot, 'run-'));
  const report: CorpusReport = {
    outputDirectory,
    files: files.length,
    parsed: 0,
    meaningful: 0,
    expectedRejections: {},
    unexpectedErrors: 0,
    schemaFailures: 0,
    determinismMismatches: 0,
    documentTypes: {},
    fieldPresence: {},
  };

  for (const filename of files) {
    const bytes = new Uint8Array(
      await readFile(join(corpusDirectory, filename)),
    );
    try {
      const output = await parseVisura(bytes, { filename: basename(filename) });
      await writeFile(
        join(outputDirectory, `${filename}.json`),
        `${JSON.stringify(output, undefined, 2)}\n`,
        { mode: 0o600 },
      );
      const replay = await parseVisura(bytes, { filename: basename(filename) });
      if (!validate(output)) report.schemaFailures += 1;
      if (JSON.stringify(output) !== JSON.stringify(replay))
        report.determinismMismatches += 1;
      report.parsed += 1;
      if (
        output.companyName !== undefined &&
        output.reaNumber !== undefined &&
        output.taxCode !== undefined &&
        output.legalForm !== undefined
      ) {
        report.meaningful += 1;
      }
      increment(
        report.documentTypes,
        output.reportType ?? 'supported-visura-block',
      );
      for (const key of Object.keys(output))
        increment(report.fieldPresence, key);
    } catch (error) {
      if (
        error instanceof VisuraParseError &&
        (error.code === 'invalid-pdf' ||
          error.code === 'text-unavailable' ||
          error.code === 'unsupported-pdf')
      ) {
        increment(report.expectedRejections, error.code);
        try {
          await parseVisura(bytes, { filename: basename(filename) });
          report.determinismMismatches += 1;
        } catch (replayError) {
          if (
            !(replayError instanceof VisuraParseError) ||
            replayError.code !== error.code
          ) {
            report.determinismMismatches += 1;
          }
        }
      } else {
        report.unexpectedErrors += 1;
      }
    }
  }

  console.log(JSON.stringify(report, undefined, 2));

  const referenceMatches =
    !process.argv.includes('--reference') ||
    (report.files === 346 &&
      report.parsed === 341 &&
      report.expectedRejections['invalid-pdf'] === 1 &&
      report.expectedRejections['text-unavailable'] === 3 &&
      report.expectedRejections['unsupported-pdf'] === 1);

  if (
    !referenceMatches ||
    report.meaningful !== report.parsed ||
    report.schemaFailures > 0 ||
    report.determinismMismatches > 0 ||
    report.unexpectedErrors > 0 ||
    report.parsed + sum(report.expectedRejections) !== files.length
  ) {
    process.exitCode = 1;
  }
}

function sum(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

await main();
