import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { PuppeteerAdapter } from '../../src/browser/puppeteer.js';
import { extractDOM } from '../../src/extractor/extract.js';
import type { BrowserAdapter, ExtractedElement } from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures');

/**
 * Recursively collect all selectors in the extracted tree.
 */
function collectSelectors(el: ExtractedElement): string[] {
  const selectors = [el.selector];
  for (const child of el.children) {
    selectors.push(...collectSelectors(child));
  }
  return selectors;
}

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

describe('sr-only element filtering (integration)', () => {
  let adapter: BrowserAdapter;

  beforeAll(async () => {
    adapter = new PuppeteerAdapter({ keepAliveMs: 0 });
    await adapter.init();
  }, 30000);

  afterAll(async () => {
    await adapter.dispose();
  });

  it('excludes sr-only skip-link (clip:rect + position:absolute) from extracted tree', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);
      const selectors = collectSelectors(tree);

      // The sr-only skip-link should NOT appear in the extracted tree
      const skipLink = findInTree(
        tree,
        (node) => node.tag === 'a' && (node.text?.includes('Skip to main') ?? false),
      );
      expect(skipLink).toBeUndefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('excludes visually-hidden span (1x1px + position:absolute) from extracted tree', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // The visually-hidden span should NOT appear in the extracted tree
      const hiddenSpan = findInTree(
        tree,
        (node) =>
          node.tag === 'span' &&
          (node.selector?.includes('visually-hidden') ?? false),
      );
      expect(hiddenSpan).toBeUndefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('excludes off-screen element (left:-9999px) from extracted tree', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // The off-screen element should NOT appear in the extracted tree
      const offScreen = findInTree(
        tree,
        (node) =>
          node.selector?.includes('off-screen') ?? false,
      );
      expect(offScreen).toBeUndefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('does NOT exclude normal position:absolute element with standard dimensions', async () => {
    // clean.html does not have a normal absolute-positioned element by default,
    // but we verify that elements like the header/logo (which are not sr-only)
    // are still present in the tree after extraction
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page);

      // Normal structural elements should still be present
      const header = findInTree(tree, (node) => node.tag === 'header');
      expect(header).toBeDefined();

      const main = findInTree(tree, (node) => node.tag === 'main');
      expect(main).toBeDefined();

      const footer = findInTree(tree, (node) => node.tag === 'footer');
      expect(footer).toBeDefined();

      // The logo div (a normal element inside header) should be present
      const logo = findInTree(
        tree,
        (node) => node.selector?.includes('logo') ?? false,
      );
      expect(logo).toBeDefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('includes sr-only elements when includeHidden is true', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const { tree } = await extractDOM(page, { includeHidden: true });

      // With includeHidden, sr-only elements SHOULD appear in the tree
      const skipLink = findInTree(
        tree,
        (node) => node.tag === 'a' && (node.text?.includes('Skip to main') ?? false),
      );
      expect(skipLink).toBeDefined();

      const hiddenSpan = findInTree(
        tree,
        (node) =>
          node.tag === 'span' &&
          (node.selector?.includes('visually-hidden') ?? false),
      );
      expect(hiddenSpan).toBeDefined();

      const offScreen = findInTree(
        tree,
        (node) =>
          node.selector?.includes('off-screen') ?? false,
      );
      expect(offScreen).toBeDefined();
    } finally {
      await page.close();
    }
  }, 30000);

  // ── Negative-top positioning detection ──

  describe('negative-top positioning', () => {
    it('skip-link with position:absolute and top:-800px is excluded from extracted tree', async () => {
      const page = await adapter.render({
        filePath: resolve(FIXTURES, 'sr-only-top.html'),
        viewport: { width: 1280, height: 800 },
      });

      try {
        const { tree } = await extractDOM(page);

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

    it('element with position:absolute and top:-50px is NOT excluded (partially visible)', async () => {
      const page = await adapter.render({
        filePath: resolve(FIXTURES, 'sr-only-top.html'),
        viewport: { width: 1280, height: 800 },
      });

      try {
        const { tree } = await extractDOM(page);

        const partial = findInTree(
          tree,
          (node) => node.selector?.includes('partially-above') ?? false,
        );
        expect(partial).toBeDefined();
      } finally {
        await page.close();
      }
    }, 30000);

    it('skip-link is included when includeHidden is true', async () => {
      const page = await adapter.render({
        filePath: resolve(FIXTURES, 'sr-only-top.html'),
        viewport: { width: 1280, height: 800 },
      });

      try {
        const { tree } = await extractDOM(page, { includeHidden: true });

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
});
