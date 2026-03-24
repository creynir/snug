import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { PuppeteerAdapter } from '../../src/browser/puppeteer.js';
import { extractDOM } from '../../src/extractor/extract.js';
import type { BrowserAdapter } from '../../src/types.js';

describe('DOM extraction (integration)', () => {
  let adapter: BrowserAdapter;

  beforeAll(async () => {
    adapter = new PuppeteerAdapter({ keepAliveMs: 0 }); // no keep-alive in tests
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  it('extracts tree from clean.html', async () => {
    const page = await adapter.render({
      filePath: resolve(__dirname, '../fixtures/clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree, viewport } = await extractDOM(page);

      expect(viewport).toEqual({ width: 1280, height: 800 });
      expect(tree.tag).toBe('body');
      expect(tree.children.length).toBeGreaterThan(0);

      // Should have header, main, footer
      const tags = tree.children.map((c) => c.tag);
      expect(tags).toContain('header');
      expect(tags).toContain('main');
      expect(tags).toContain('footer');
    } finally {
      await page.close();
    }
  });

  it('respects depth limit', async () => {
    const page = await adapter.render({
      filePath: resolve(__dirname, '../fixtures/clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page, { depth: 1 });

      // Depth 1: body's direct children only, no grandchildren
      for (const child of tree.children) {
        expect(child.children).toEqual([]);
      }
    } finally {
      await page.close();
    }
  });

  it('captures bounds as integers', async () => {
    const page = await adapter.render({
      filePath: resolve(__dirname, '../fixtures/clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      function checkBounds(el: typeof tree): void {
        expect(Number.isInteger(el.bounds.x)).toBe(true);
        expect(Number.isInteger(el.bounds.y)).toBe(true);
        expect(Number.isInteger(el.bounds.w)).toBe(true);
        expect(Number.isInteger(el.bounds.h)).toBe(true);
        el.children.forEach(checkBounds);
      }
      checkBounds(tree);
    } finally {
      await page.close();
    }
  });
});
