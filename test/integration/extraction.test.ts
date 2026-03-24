import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { PuppeteerAdapter } from '../../src/browser/puppeteer.js';
import { extractDOM } from '../../src/extractor/extract.js';
import type { BrowserAdapter, ExtractedElement } from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('DOM extraction (integration)', () => {
  let adapter: BrowserAdapter;

  beforeAll(async () => {
    adapter = new PuppeteerAdapter({ keepAliveMs: 0 });
    await adapter.init();
  }, 30000);

  afterAll(async () => {
    await adapter.dispose();
  });

  // ── Basic tree structure ──

  it('extracts a tree rooted at body from clean.html', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree, viewport } = await extractDOM(page);

      expect(viewport).toEqual({ width: 1280, height: 800 });
      expect(tree.tag).toBe('body');
      expect(tree.selector).toBeDefined();
      expect(tree.children.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 30000);

  it('finds header, main, footer as direct children of body', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);
      const tags = tree.children.map((c) => c.tag);

      expect(tags).toContain('header');
      expect(tags).toContain('main');
      expect(tags).toContain('footer');
    } finally {
      await page.close();
    }
  }, 30000);

  it('includes nested children (card-grid cards inside main)', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);
      const main = tree.children.find((c) => c.tag === 'main');
      expect(main).toBeDefined();
      expect(main!.children.length).toBeGreaterThan(0);

      // card-grid should contain 3 card divs
      const cardGrid = main!.children.find(
        (c) => c.selector?.includes('card-grid'),
      );
      expect(cardGrid).toBeDefined();
      expect(cardGrid!.children.length).toBe(3);
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Bounds are integers ──

  it('captures bounds as integer values for all elements', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      function checkBounds(el: ExtractedElement): void {
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
  }, 30000);

  it('bounds have non-negative width and height for visible elements', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      function checkPositive(el: ExtractedElement): void {
        expect(el.bounds.w).toBeGreaterThanOrEqual(0);
        expect(el.bounds.h).toBeGreaterThanOrEqual(0);
        el.children.forEach(checkPositive);
      }
      checkPositive(tree);
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Depth limiting ──

  it('respects depth=1: body children have no grandchildren', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page, { depth: 1 });

      // At depth 1, body's direct children are extracted but not their children
      for (const child of tree.children) {
        expect(child.children).toEqual([]);
      }
    } finally {
      await page.close();
    }
  }, 30000);

  it('respects depth=2: allows grandchildren but not great-grandchildren', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page, { depth: 2 });

      // body -> children -> grandchildren exist
      const main = tree.children.find((c) => c.tag === 'main');
      expect(main).toBeDefined();
      expect(main!.children.length).toBeGreaterThan(0);

      // But grandchildren's children should be empty
      for (const grandchild of main!.children) {
        expect(grandchild.children).toEqual([]);
      }
    } finally {
      await page.close();
    }
  }, 30000);

  it('depth=0 means unlimited (extracts full tree)', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree: fullTree } = await extractDOM(page, { depth: 0 });
      const { tree: noOptTree } = await extractDOM(page);

      // Both should produce the same tree structure
      function countNodes(el: ExtractedElement): number {
        return 1 + el.children.reduce((sum, c) => sum + countNodes(c), 0);
      }
      expect(countNodes(fullTree)).toBe(countNodes(noOptTree));
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Selectors ──

  it('generates valid selectors for each element', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      function checkSelectors(el: ExtractedElement): void {
        expect(typeof el.selector).toBe('string');
        expect(el.selector.length).toBeGreaterThan(0);
        el.children.forEach(checkSelectors);
      }
      checkSelectors(tree);
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Extraction from different fixtures ──

  it('extracts tree from overflow.html with overflow elements', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'overflow.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      expect(tree.tag).toBe('body');
      expect(tree.children.length).toBeGreaterThanOrEqual(3);

      // The wide-banner should have a width > 1280
      const wideBanner = tree.children.find((c) =>
        c.selector?.includes('wide-banner'),
      );
      expect(wideBanner).toBeDefined();
      expect(wideBanner!.bounds.w).toBeGreaterThan(1280);
    } finally {
      await page.close();
    }
  }, 30000);

  it('extracts tree from overlap.html with positioned elements', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'overlap.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      expect(tree.tag).toBe('body');
      expect(tree.children.length).toBeGreaterThan(0);

      // Should have sections with absolutely positioned children
      const sections = tree.children.filter((c) => c.tag === 'section');
      expect(sections.length).toBeGreaterThanOrEqual(2);
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Viewport ──

  it('returns the correct viewport dimensions', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 375, height: 667 },
    });

    try {
      const { viewport } = await extractDOM(page);
      expect(viewport).toEqual({ width: 375, height: 667 });
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Text content ──

  it('captures text content for elements that have it', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // Footer has a <p> with "Footer content"
      const footer = tree.children.find((c) => c.tag === 'footer');
      expect(footer).toBeDefined();

      function findTextNodes(el: ExtractedElement): ExtractedElement[] {
        const results: ExtractedElement[] = [];
        if (el.text && el.text.length > 0) results.push(el);
        for (const child of el.children) {
          results.push(...findTextNodes(child));
        }
        return results;
      }

      const withText = findTextNodes(tree);
      expect(withText.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 30000);
});
