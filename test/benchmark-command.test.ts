import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('benchmarks the built public parser without printing document values or filenames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'visura-benchmark-'));
  try {
    await copyFile(
      new URL('./fixtures/synthetic/ordinary.pdf', import.meta.url),
      join(directory, 'private-name.pdf'),
    );
    await writeFile(join(directory, 'invalid.pdf'), 'private invalid content');
    const run = () =>
      spawnSync('node', ['scripts/benchmark.mjs', directory, '1'], {
        encoding: 'utf8',
        timeout: 15_000,
      });
    const first = run();
    const second = run();
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    const report = JSON.parse(first.stdout) as Record<string, unknown>;
    expect(report).toMatchObject({
      files: 2,
      accepted: 1,
      rejections: { 'invalid-pdf': 1 },
      warmPasses: [{ totalMs: expect.any(Number) as unknown }],
    });
    const replay = JSON.parse(second.stdout) as Record<string, unknown>;
    expect(report['corpusDigest']).toBe(replay['corpusDigest']);
    expect(report['resultDigest']).toBe(replay['resultDigest']);
    expect(first.stdout).not.toContain('private');
    expect(first.stdout).not.toContain(directory);
    expect(first.stderr).toBe('');
    const invalid = spawnSync(
      'node',
      ['scripts/benchmark.mjs', directory, '0'],
      {
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr).not.toContain(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
