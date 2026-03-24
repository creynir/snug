import puppeteer, { type Browser, type Page } from 'puppeteer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrowserAdapter, PageHandle, RenderInput, Viewport } from '../types.js';
import { getWarmEndpoint, saveWarmHandle, cleanWarmHandle } from './warm.js';

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

export class PuppeteerAdapter implements BrowserAdapter {
  private browser: Browser | null = null;
  private keepAliveMs: number;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private owned = false; // true if we launched the browser (vs connected to warm)

  constructor(opts?: { keepAliveMs?: number }) {
    this.keepAliveMs = opts?.keepAliveMs ?? 3 * 60 * 1000; // 3 minutes default
  }

  async init(): Promise<void> {
    // Try connecting to a warm browser first
    const wsEndpoint = await getWarmEndpoint();
    if (wsEndpoint) {
      try {
        this.browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
        this.owned = false;
        this.resetKeepAlive();
        return;
      } catch {
        await cleanWarmHandle();
      }
    }

    // Cold start — launch a new browser
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    this.owned = true;

    // Save warm handle for future connections
    const process = this.browser.process();
    if (process?.pid) {
      await saveWarmHandle(this.browser.wsEndpoint(), process.pid);
    }

    this.resetKeepAlive();
  }

  async render(input: RenderInput): Promise<PageHandle> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    this.resetKeepAlive();

    const vp = input.viewport ?? DEFAULT_VIEWPORT;
    const page = await this.browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });

    if (input.filePath) {
      const absPath = resolve(input.filePath);
      const fileUrl = pathToFileURL(absPath).href;
      await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    } else if (input.html) {
      // Inject <base> tag if baseUrl is provided for relative resource resolution
      let html = input.html;
      if (input.baseUrl) {
        const baseTag = `<base href="${input.baseUrl}">`;
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${baseTag}`);
        } else if (html.includes('<html>')) {
          html = html.replace('<html>', `<html><head>${baseTag}</head>`);
        } else {
          html = `<head>${baseTag}</head>${html}`;
        }
      }
      await page.setContent(html, { waitUntil: 'networkidle0' });
    } else {
      throw new Error('Either filePath or html must be provided.');
    }

    // Wait for fonts to finish loading
    await page.evaluate(() => document.fonts.ready);

    return new PuppeteerPageHandle(page, vp);
  }

  async dispose(): Promise<void> {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    if (this.browser) {
      if (this.owned) {
        await this.browser.close();
        await cleanWarmHandle();
      } else {
        this.browser.disconnect();
      }
      this.browser = null;
    }
  }

  private resetKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
    }

    if (this.keepAliveMs > 0 && this.owned) {
      this.keepAliveTimer = setTimeout(async () => {
        await this.dispose();
      }, this.keepAliveMs);

      // Don't let the timer keep the process alive
      this.keepAliveTimer.unref();
    }
  }
}

class PuppeteerPageHandle implements PageHandle {
  constructor(
    private page: Page,
    private vp: Viewport,
  ) {}

  async evaluate<T>(fn: string | (() => T)): Promise<T> {
    if (typeof fn === 'string') {
      return this.page.evaluate(fn) as Promise<T>;
    }
    return this.page.evaluate(fn);
  }

  async evaluateWithArgs<T, A extends unknown[]>(
    fn: string | ((...args: A) => T),
    ...args: A
  ): Promise<T> {
    if (typeof fn === 'string') {
      return this.page.evaluate(fn) as Promise<T>;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.page.evaluate(fn as any, ...args) as Promise<T>;
  }

  viewport(): Viewport {
    return { ...this.vp };
  }

  async close(): Promise<void> {
    await this.page.close();
  }
}
