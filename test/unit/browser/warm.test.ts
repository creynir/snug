import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWarmEndpoint, saveWarmHandle, cleanWarmHandle } from '../../../src/browser/warm.js';

describe('warm browser handle', () => {
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
});
