import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

it('saves complete JSON results in separate git-ignored directories for each corpus run', async () => {
  const corpus = await mkdtemp(join(tmpdir(), 'visura-corpus-test-'));
  const outputDirectories: string[] = [];
  try {
    const fixture = new URL(
      './fixtures/synthetic/ordinary.pdf',
      import.meta.url,
    );
    await copyFile(fixture, join(corpus, 'ordinary.pdf'));
    await copyFile(fixture, join(corpus, 'second.report.PDF'));
    await writeFile(join(corpus, 'invalid.pdf'), 'not a PDF');
    const expected = JSON.parse(
      await readFile(
        new URL('./fixtures/synthetic/ordinary.expected.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;

    for (let run = 0; run < 2; run += 1) {
      const process = spawnSync('bun', ['run', 'corpus:check', '--', corpus], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 15_000,
      });
      expect(process.error).toBeUndefined();
      expect(process.status).toBe(0);
      const report = JSON.parse(process.stdout) as { outputDirectory: string };
      expect(report).toMatchObject({
        files: 3,
        parsed: 2,
        meaningful: 2,
        expectedRejections: { 'invalid-pdf': 1 },
        unexpectedErrors: 0,
        schemaFailures: 0,
        determinismMismatches: 0,
      });
      expect(
        report.outputDirectory.startsWith(join(ROOT, 'corpus-output', 'run-')),
      ).toBe(true);
      outputDirectories.push(report.outputDirectory);
      expect((await readdir(report.outputDirectory)).sort()).toEqual([
        'ordinary.pdf.json',
        'second.report.PDF.json',
      ]);
      for (const filename of ['ordinary.pdf', 'second.report.PDF']) {
        const path = join(report.outputDirectory, `${filename}.json`);
        const contents = await readFile(path, 'utf8');
        expect(JSON.parse(contents)).toEqual({ ...expected, filename });
        expect(contents.endsWith('\n')).toBe(true);
        const ignored = spawnSync('git', ['check-ignore', '--quiet', path], {
          cwd: ROOT,
        });
        expect(ignored.status).toBe(0);
      }
    }
    expect(new Set(outputDirectories).size).toBe(2);
  } finally {
    await rm(corpus, { recursive: true, force: true });
    for (const directory of outputDirectories)
      await rm(directory, { recursive: true, force: true });
  }
});
