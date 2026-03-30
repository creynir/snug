import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getWarmEndpoint, saveWarmHandle, cleanWarmHandle } from '../../../src/browser/warm.js';

/** The handle file path must match the one in src/browser/warm.ts */
const SOCK_FILE = join(tmpdir(), 'snug-browser.json');

describe('warm browser handle', () => {
  beforeEach(async () => {
    await cleanWarmHandle();
  });

  afterEach(async () => {
    await cleanWarmHandle();
  });

  it('returns null when no handle exists', async () => {
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBeNull();
  });

  it('saves and retrieves a warm handle', async () => {
    // Use current process PID so the liveness check passes
    await saveWarmHandle('ws://127.0.0.1:9222/test', process.pid);
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBe('ws://127.0.0.1:9222/test');
  });

  it('returns null for stale handle (dead PID)', async () => {
    // Use a PID that almost certainly doesn't exist
    await saveWarmHandle('ws://127.0.0.1:9222/dead', 999999);
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBeNull();
  });

  it('cleans up handle file', async () => {
    await saveWarmHandle('ws://127.0.0.1:9222/cleanup', process.pid);
    await cleanWarmHandle();
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBeNull();
  });

  // ── Phase 5: Edge Cases ──

  it('returns null for corrupted JSON in handle file (does not crash)', async () => {
    // Write malformed JSON directly to the handle file
    await writeFile(SOCK_FILE, '{this is not valid json!!!', 'utf8');
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBeNull();
  });

  it('returns null for handle file with missing wsEndpoint field', async () => {
    // Write JSON that lacks the wsEndpoint property
    await writeFile(SOCK_FILE, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), 'utf8');
    const endpoint = await getWarmEndpoint();
    // Should return null (or undefined) since there is no wsEndpoint
    expect(endpoint).toBeNull();
  });

  it('returns null for handle file with missing pid field', async () => {
    // Write JSON that lacks the pid property — process.kill(undefined, 0) should fail
    await writeFile(SOCK_FILE, JSON.stringify({ wsEndpoint: 'ws://127.0.0.1:9222/nopid', createdAt: Date.now() }), 'utf8');
    const endpoint = await getWarmEndpoint();
    // Should return null because pid is missing/invalid and liveness check should fail gracefully
    expect(endpoint).toBeNull();
  });

  it('does not throw when cleanWarmHandle is called and no file exists', async () => {
    // Ensure no file exists first
    await cleanWarmHandle();
    // Call again — should not throw
    await expect(cleanWarmHandle()).resolves.toBeUndefined();
  });

  it('returns the same endpoint when getWarmEndpoint is called multiple times (idempotent)', async () => {
    await saveWarmHandle('ws://127.0.0.1:9222/idempotent', process.pid);
    const first = await getWarmEndpoint();
    const second = await getWarmEndpoint();
    const third = await getWarmEndpoint();
    expect(first).toBe('ws://127.0.0.1:9222/idempotent');
    expect(second).toBe('ws://127.0.0.1:9222/idempotent');
    expect(third).toBe('ws://127.0.0.1:9222/idempotent');
  });

  it('overwrites existing handle when saveWarmHandle is called again (last writer wins)', async () => {
    await saveWarmHandle('ws://127.0.0.1:9222/first', process.pid);
    await saveWarmHandle('ws://127.0.0.1:9222/second', process.pid);
    const endpoint = await getWarmEndpoint();
    expect(endpoint).toBe('ws://127.0.0.1:9222/second');
  });
});
