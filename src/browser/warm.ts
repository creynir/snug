import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOCK_FILE = join(tmpdir(), 'snug-browser.json');

interface WarmHandle {
  wsEndpoint: string;
  pid: number;
  createdAt: number;
}

export async function getWarmEndpoint(): Promise<string | null> {
  try {
    const raw = await readFile(SOCK_FILE, 'utf8');
    const handle: WarmHandle = JSON.parse(raw);

    // Check if the process is still alive
    try {
      process.kill(handle.pid, 0);
    } catch {
      await cleanWarmHandle();
      return null;
    }

    return handle.wsEndpoint;
  } catch {
    return null;
  }
}

export async function saveWarmHandle(wsEndpoint: string, pid: number): Promise<void> {
  const handle: WarmHandle = {
    wsEndpoint,
    pid,
    createdAt: Date.now(),
  };
  await writeFile(SOCK_FILE, JSON.stringify(handle), 'utf8');
}

export async function cleanWarmHandle(): Promise<void> {
  try {
    await unlink(SOCK_FILE);
  } catch {
    // Already gone — fine
  }
}
