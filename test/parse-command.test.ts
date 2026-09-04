import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function run(...args: string[]) {
  return spawnSync('bun', ['run', 'parse', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

describe('local parse command', () => {
  it('prints the complete expected JSON through the package command', () => {
    const result = run('test/fixtures/synthetic/ordinary.pdf');
    const expected: unknown = JSON.parse(
      readFileSync(
        new URL('./fixtures/synthetic/ordinary.expected.json', import.meta.url),
        'utf8',
      ),
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
  });

  it('shows help successfully', () => {
    const result = run('--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: bun run parse');
  });

  it.each([[], ['one.pdf', 'two.pdf']])(
    'rejects invalid arguments %j',
    (...args) => {
      const result = run(...args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage: bun run parse');
    },
  );

  it('reports an unreadable path without printing JSON', () => {
    const result = run('test/fixtures/synthetic/nonexistent.pdf');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('read-error:');
  });

  it('reports the typed parser error for a non-PDF file', () => {
    const result = run('README.md');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('invalid-pdf:');
  });
});
