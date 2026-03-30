import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');
const FIXTURES = resolve(__dirname, '../fixtures');

/**
 * Helper: run CLI and return { code, stdout, stderr } regardless of exit code.
 * Never throws — always resolves.
 */
function runCLI(args: string[], timeout = 30000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [CLI_PATH, ...args],
      { timeout },
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

/**
 * Start a minimal HTTP server serving a static HTML fixture.
 * Returns the server and the URL.
 */
function startServer(fixturePath: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const html = readFileSync(fixturePath, 'utf8');
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, url: `http://127.0.0.1:${addr.port}` });
      } else {
        reject(new Error('Could not get server address'));
      }
    });
  });
}

describe('URL input (integration)', () => {
  let server: Server | undefined;

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  // ── Test 37: --url with local HTTP server works ──

  it('37. snug check --url with local HTTP server works', async () => {
    const { server: s, url } = await startServer(resolve(FIXTURES, 'clean.html'));
    server = s;

    const result = await runCLI(['check', '--url', url]);
    // clean.html has no issues → exit code 0
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('viewport:');
    expect(result.stdout).toContain('tree:');

    server.close();
    server = undefined;
  }, 30000);

  // ── Test 38: unreachable server → exit code 2 ──

  it('38. snug check --url with unreachable server exits with code 2', async () => {
    // Port 1 is almost certainly unreachable
    const result = await runCLI(['check', '--url', 'http://127.0.0.1:1/nonexistent'], 15000);
    expect(result.code).toBe(2);
  }, 30000);

  // ── Test 39: timeout → exit code 2 ──

  it('39. snug check --url with timeout exits with code 2', async () => {
    // Create a server that never responds
    const hangServer = createServer((_req, _res) => {
      // Intentionally never send a response — simulate timeout
    });
    await new Promise<void>((resolve) => {
      hangServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = hangServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const result = await runCLI(['check', '--url', `http://127.0.0.1:${port}`], 60000);
    expect(result.code).toBe(2);

    hangServer.close();
  }, 60000);

  // ── Test 40: --url and file simultaneously → validation error ──

  it('40. cannot use --url and file simultaneously (validation error)', async () => {
    const fixture = resolve(FIXTURES, 'clean.html');
    const result = await runCLI(['check', '--url', 'http://localhost:3000', fixture]);
    // Should fail with validation error, exit code 2
    expect(result.code).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ── Test 41: --url and --stdin simultaneously → validation error ──

  it('41. cannot use --url and --stdin simultaneously (validation error)', async () => {
    const result = await runCLI(['check', '--url', 'http://localhost:3000', '--stdin']);
    // Should fail with validation error, exit code 2
    expect(result.code).toBeGreaterThanOrEqual(1);
  }, 30000);
});
