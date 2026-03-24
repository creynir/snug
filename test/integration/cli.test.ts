import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');
const FIXTURES = resolve(__dirname, '../fixtures');

describe('CLI (integration)', () => {
  // ── Exit code 0: no issues ──

  it('exits 0 for clean layout', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);
    expect(stdout).toContain('viewport:');
    expect(stdout).toContain('errors: 0');
  }, 30000);

  // ── Exit code 1: issues found ──

  it('exits 1 for layout with overflow issues', async () => {
    const fixture = resolve(FIXTURES, 'overflow.html');
    try {
      await exec('node', [CLI_PATH, 'check', fixture]);
      expect.fail('Expected exit code 1 but got 0');
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stdout).toContain('viewport-overflow');
    }
  }, 30000);

  it('exits 1 for layout with overlap issues', async () => {
    const fixture = resolve(FIXTURES, 'overlap.html');
    try {
      await exec('node', [CLI_PATH, 'check', fixture]);
      expect.fail('Expected exit code 1 but got 0');
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stdout).toContain('sibling-overlap');
    }
  }, 30000);

  // ── Exit code 2: runtime error ──

  it('exits 2 for missing file', async () => {
    try {
      await exec('node', [CLI_PATH, 'check', '/nonexistent/path/file.html']);
      expect.fail('Expected exit code 2 but got 0');
    } catch (err: any) {
      expect(err.code).toBe(2);
    }
  }, 30000);

  // ── YAML output structure ──

  it('outputs valid YAML containing all required sections', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);

    expect(stdout).toContain('viewport:');
    expect(stdout).toContain('element_count:');
    expect(stdout).toContain('summary:');
    expect(stdout).toContain('issues:');
    expect(stdout).toContain('tree:');
  }, 30000);

  it('YAML output includes error and warning counts in summary', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);

    expect(stdout).toContain('errors: 0');
    expect(stdout).toContain('warnings: 0');
  }, 30000);

  it('YAML output for problematic file includes issue details', async () => {
    const fixture = resolve(FIXTURES, 'overflow.html');
    try {
      await exec('node', [CLI_PATH, 'check', fixture]);
      expect.fail('Expected exit code 1');
    } catch (err: any) {
      expect(err.code).toBe(1);
      // Output should contain the issue type and severity
      expect(err.stdout).toContain('viewport-overflow');
      expect(err.stdout).toContain('error');
    }
  }, 30000);

  // ── CLI flags ──

  it('accepts --width and --height flags', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [
      CLI_PATH, 'check',
      '--width', '375',
      '--height', '667',
      fixture,
    ]);

    expect(stdout).toContain('width: 375');
    expect(stdout).toContain('height: 667');
  }, 30000);

  it('accepts --depth flag', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    // With depth=1, should still produce valid output with fewer elements
    const { stdout } = await exec('node', [
      CLI_PATH, 'check',
      '--depth', '1',
      fixture,
    ]);

    expect(stdout).toContain('viewport:');
    expect(stdout).toContain('element_count:');
  }, 30000);

  it('accepts --keep-alive flag', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    // keep-alive 0 means no lingering browser
    const { stdout } = await exec('node', [
      CLI_PATH, 'check',
      '--keep-alive', '0',
      fixture,
    ]);

    expect(stdout).toContain('viewport:');
  }, 30000);

  it('uses default viewport 1280x800 when no flags provided', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);

    expect(stdout).toContain('width: 1280');
    expect(stdout).toContain('height: 800');
  }, 30000);

  // ── Stdin mode ──

  it('accepts --stdin flag to read HTML from stdin', async () => {
    const html = '<html><body><div style="width:100px;height:100px;">Hello</div></body></html>';

    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolvePromise, reject) => {
        const child = execFile(
          'node',
          [CLI_PATH, 'check', '--stdin'],
          { timeout: 30000 },
          (err, stdout, stderr) => {
            if (err && (err as any).code !== 1) {
              reject(err);
            } else {
              resolvePromise({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          },
        );
        child.stdin!.write(html);
        child.stdin!.end();
      },
    );

    expect(stdout).toContain('viewport:');
  }, 30000);

  it('accepts --stdin with --base-url flag', async () => {
    const html = '<html><body><div style="width:100px;height:100px;">Hello</div></body></html>';

    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolvePromise, reject) => {
        const child = execFile(
          'node',
          [CLI_PATH, 'check', '--stdin', '--base-url', 'http://localhost:3000'],
          { timeout: 30000 },
          (err, stdout, stderr) => {
            if (err && (err as any).code !== 1) {
              reject(err);
            } else {
              resolvePromise({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          },
        );
        child.stdin!.write(html);
        child.stdin!.end();
      },
    );

    expect(stdout).toContain('viewport:');
  }, 30000);

  // ── Element count in output ──

  it('element_count in output is a positive integer', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const { stdout } = await exec('node', [CLI_PATH, 'check', fixture]);

    // element_count: should be followed by a positive number
    const match = stdout.match(/element_count:\s*(\d+)/);
    expect(match).not.toBeNull();
    const count = parseInt(match![1], 10);
    expect(count).toBeGreaterThan(0);
  }, 30000);
});
