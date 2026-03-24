import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

describe('CLI (integration)', () => {
  it('exits 0 for clean layout', async () => {
    const fixture = resolve(__dirname, '../fixtures/clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);
    expect(stdout).toContain('viewport:');
    expect(stdout).toContain('errors: 0');
  }, 15000);

  it('exits 1 for layout with issues', async () => {
    const fixture = resolve(__dirname, '../fixtures/overflow.html');
    try {
      await exec('node', [CLI_PATH, 'check', fixture]);
      // If it doesn't throw, it exited 0 — that's wrong
      expect.fail('Expected exit code 1');
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stdout).toContain('viewport-overflow');
    }
  }, 15000);

  it('exits 2 for missing file', async () => {
    try {
      await exec('node', [CLI_PATH, 'check', '/nonexistent/file.html']);
      expect.fail('Expected exit code 2');
    } catch (err: any) {
      expect(err.code).toBe(2);
    }
  }, 15000);

  it('outputs valid YAML', async () => {
    const fixture = resolve(__dirname, '../fixtures/clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);
    // Basic YAML structure check
    expect(stdout).toContain('viewport:');
    expect(stdout).toContain('element_count:');
    expect(stdout).toContain('summary:');
    expect(stdout).toContain('tree:');
  }, 15000);
});
