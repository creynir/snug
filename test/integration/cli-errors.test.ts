import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');
const FIXTURES = resolve(__dirname, '../fixtures');

/**
 * Helper: run CLI and return { code, stdout, stderr } regardless of exit code.
 * Never throws — always resolves.
 */
function runCLI(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [CLI_PATH, ...args],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        const code = err ? (err as any).code ?? null : 0;
        resolve({
          code,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

describe('CLI error handling (integration)', () => {
  // ── Exit code 2: file not found — verify stderr contains meaningful message ──

  it('prints error message on stderr for missing file', async () => {
    const result = await runCLI(['check', '/nonexistent/path/file.html']);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
    expect(result.stderr.toLowerCase()).toContain('error');
  }, 30000);

  // ── No arguments (neither file nor --stdin) → should exit 2 or show help ──

  it('exits with non-zero code when no file and no --stdin is given', async () => {
    const result = await runCLI(['check']);
    expect(result.code).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ── Invalid --depth value (negative number) → should exit 2 ──

  it('exits 2 for negative --depth value', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--depth', '-1', fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  // ── Invalid --width (0 or negative) → should handle gracefully ──

  it('exits 2 for zero --width value', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--width', '0', fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  it('exits 2 for negative --width value', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--width', '-100', fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  // ── Invalid --height (0 or negative) → should handle gracefully ──

  it('exits 2 for zero --height value', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--height', '0', fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  it('exits 2 for negative --height value', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--height', '-50', fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  // ── No subcommand at all → should exit non-zero ──

  it('exits non-zero when no subcommand is provided', async () => {
    const result = await runCLI([]);
    expect(result.code).toBeGreaterThanOrEqual(1);
  }, 30000);
});
