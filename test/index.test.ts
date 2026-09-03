import { describe, expect, it } from 'vitest';

describe('package entry point', () => {
  it('can be imported', async () => {
    const publicApi: unknown = await import('../src/index.js');

    expect(publicApi).toBeDefined();
  });
});
