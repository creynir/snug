import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { PuppeteerAdapter } from '../../src/browser/puppeteer.js';
import { extractDOM } from '../../src/extractor/extract.js';
import type { BrowserAdapter, ExtractedElement } from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures');

/**
 * Recursively search for an element matching a predicate.
 */
function findInTree(
  el: ExtractedElement,
  predicate: (node: ExtractedElement) => boolean,
): ExtractedElement | undefined {
  if (predicate(el)) return el;
  for (const child of el.children) {
    const found = findInTree(child, predicate);
    if (found) return found;
  }
  return undefined;
}

// ──────────────────────────────────────────
// Task 5: Extend sr-only Detection to top:-800px
// ──────────────────────────────────────────

describe('sr-only negative-top detection (FOLLOWUP-007 Task 5)', () => {
  let adapter: BrowserAdapter;

  beforeAll(async () => {
    adapter = new PuppeteerAdapter({ keepAliveMs: 0 });
    await adapter.init();
  }, 30000);

  afterAll(async () => {
    await adapter.dispose();
  });

  it('22. skip-link with position:absolute and top:-800px is excluded from extracted tree', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'sr-only-top.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // The skip-link with top:-800px should NOT appear in the extracted tree
      const skipLink = findInTree(
        tree,
        (node) =>
          node.tag === 'a' &&
          (node.selector?.includes('skip-link') ?? false),
      );
      expect(skipLink).toBeUndefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('23. element with position:absolute and top:-50px is NOT excluded (partially visible)', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'sr-only-top.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // Element with top:-50px and height:100px has bottom at 50px (visible)
      // Should NOT be excluded
      const partial = findInTree(
        tree,
        (node) => node.selector?.includes('partially-above') ?? false,
      );
      expect(partial).toBeDefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('24. skip-link is included when includeHidden is true', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'sr-only-top.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page, { includeHidden: true });

      // With includeHidden, even the skip-link should be present
      const skipLink = findInTree(
        tree,
        (node) =>
          node.tag === 'a' &&
          (node.selector?.includes('skip-link') ?? false),
      );
      expect(skipLink).toBeDefined();
    } finally {
      await page.close();
    }
  }, 30000);
});
