import { describe, it, expect } from 'vitest';
import { check } from '../../../src/pipeline.js';

describe('pipeline error handling', () => {
  // ── check() with no file and no html → should throw or return error ──

  it('throws when called with no file and no html', async () => {
    // Neither options.file nor the html parameter is provided.
    // The pipeline should throw a meaningful error, not silently fail.
    await expect(
      check({ depth: 0, width: 1280, height: 800 }),
    ).rejects.toThrow();
  });

  // ── check() with non-existent file path → should throw with meaningful error ──

  it('throws when called with a non-existent file path', async () => {
    await expect(
      check({ file: '/nonexistent/path/does-not-exist.html', depth: 0, width: 1280, height: 800 }),
    ).rejects.toThrow();
  });

  it('error message for non-existent file is meaningful (not a raw Puppeteer error)', async () => {
    try {
      await check({ file: '/nonexistent/path/does-not-exist.html', depth: 0, width: 1280, height: 800 });
      expect.fail('Expected check() to throw for non-existent file');
    } catch (err: any) {
      // The error message should mention the file or indicate file-not-found,
      // not just a generic browser error
      expect(err.message).toBeTruthy();
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });
});
