import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { PuppeteerAdapter } from '../../src/browser/puppeteer.js';
import { extractDOM } from '../../src/extractor/extract.js';
import { check } from '../../src/pipeline.js';
import type { BrowserAdapter, ExtractedElement } from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures');

// ── extractDOM visibility probe ──

describe('extractDOM visibility probe (integration)', () => {
  let adapter: BrowserAdapter;

  beforeAll(async () => {
    adapter = new PuppeteerAdapter({ keepAliveMs: 0 });
    await adapter.init();
  }, 30000);

  afterAll(async () => {
    await adapter.dispose();
  });

  it('returns visibility field when probeVisibility is not false', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });

      expect(result).toHaveProperty('visibility');
      expect(result.visibility).toBeDefined();
      expect(result.visibility).toBeInstanceOf(Map);
    } finally {
      await page.close();
    }
  }, 30000);

  it('returns visibility field by default (probeVisibility defaults to true)', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page);

      expect(result).toHaveProperty('visibility');
      expect(result.visibility).toBeDefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('returns visibility as undefined when probeVisibility is false', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: false });

      expect(result.visibility).toBeUndefined();
    } finally {
      await page.close();
    }
  }, 30000);

  it('visibility map contains entries for elements with text content', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });
      const visibility = result.visibility!;

      // The fixture has text elements (#covered-text, #behind-modal, #semi-covered-text)
      // At least some of them should appear as probe targets in the visibility map
      expect(visibility.size).toBeGreaterThan(0);

      // Find text elements in the tree by DFS index
      const elements: ExtractedElement[] = [];
      function walk(el: ExtractedElement): void {
        elements.push(el);
        for (const child of el.children) walk(child);
      }
      walk(result.tree);

      const textIndices = elements
        .map((el, i) => ({ el, i }))
        .filter(({ el }) => el.text && el.text.trim().length > 0)
        .map(({ i }) => i);

      // At least one text element should be in the visibility map
      const hasTextEntry = textIndices.some((idx) => visibility.has(idx));
      expect(hasTextEntry).toBe(true);
    } finally {
      await page.close();
    }
  }, 30000);

  it('visibility map does NOT contain entries for pure layout containers', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });
      const visibility = result.visibility!;

      // Flatten tree
      const elements: ExtractedElement[] = [];
      function walk(el: ExtractedElement): void {
        elements.push(el);
        for (const child of el.children) walk(child);
      }
      walk(result.tree);

      // Pure layout containers: #text-section, #semi-section are divs with no text,
      // no interactive role, no media. They should NOT be probe targets.
      for (const [idx] of visibility) {
        const el = elements[idx];
        // Every probed element must have text content (directly or recursively),
        // be interactive, or be a media element
        const hasText = hasTextRecursive(el);
        const isInteractive = ['input', 'select', 'textarea', 'button', 'a'].includes(el.tag);
        const isMedia = ['img', 'video', 'canvas'].includes(el.tag);
        expect(hasText || isInteractive || isMedia).toBe(true);
      }
    } finally {
      await page.close();
    }
  }, 30000);

  it('fully visible element has ratio === 1.0 and empty occludedBy', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'clean.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });
      const visibility = result.visibility!;

      // clean.html has no occlusion — all probed elements should be fully visible
      for (const [, entry] of visibility) {
        expect(entry.ratio).toBe(1.0);
        expect(entry.occludedBy).toEqual([]);
      }
    } finally {
      await page.close();
    }
  }, 30000);

  it('element covered by absolutely positioned panel has ratio < 1.0', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });
      const visibility = result.visibility!;

      // Find #covered-text in the tree by DFS
      const elements: ExtractedElement[] = [];
      function walk(el: ExtractedElement): void {
        elements.push(el);
        for (const child of el.children) walk(child);
      }
      walk(result.tree);

      const coveredIdx = elements.findIndex(
        (el) => el.selector?.includes('covered-text') && !el.selector?.includes('semi'),
      );
      expect(coveredIdx).toBeGreaterThan(-1);

      const entry = visibility.get(coveredIdx);
      expect(entry).toBeDefined();
      expect(entry!.ratio).toBeLessThan(1.0);
    } finally {
      await page.close();
    }
  }, 30000);

  it('element covered by panel has occludedBy with the covering element index', async () => {
    const page = await adapter.render({
      filePath: resolve(FIXTURES, 'occlusion.html'),
      viewport: { width: 1280, height: 800 },
    });

    try {
      const result = await extractDOM(page, { probeVisibility: true });
      const visibility = result.visibility!;

      // Flatten tree
      const elements: ExtractedElement[] = [];
      function walk(el: ExtractedElement): void {
        elements.push(el);
        for (const child of el.children) walk(child);
      }
      walk(result.tree);

      const coveredIdx = elements.findIndex(
        (el) => el.selector?.includes('covered-text') && !el.selector?.includes('semi'),
      );
      const panelIdx = elements.findIndex(
        (el) => el.selector?.includes('covering-panel'),
      );

      expect(coveredIdx).toBeGreaterThan(-1);
      expect(panelIdx).toBeGreaterThan(-1);

      const entry = visibility.get(coveredIdx);
      expect(entry).toBeDefined();
      expect(entry!.occludedBy.length).toBeGreaterThan(0);
      expect(entry!.occludedBy.some((o) => o.index === panelIdx)).toBe(true);
    } finally {
      await page.close();
    }
  }, 30000);
});

// ── Full pipeline on occlusion.html ──

describe('occlusion pipeline (integration)', () => {
  it('detects occlusion issues in occlusion.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'occlusion.html'),
      keepAlive: 0,
    });

    const occlusions = report.issues.filter((i) => i.type === 'occlusion');
    expect(occlusions.length).toBeGreaterThan(0);
  }, 30000);

  it('panel covering text produces type occlusion with severity error', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'occlusion.html'),
      keepAlive: 0,
    });

    const occlusions = report.issues.filter((i) => i.type === 'occlusion');

    // #covering-panel fully covers #covered-text — should be error
    const panelIssue = occlusions.find(
      (i) =>
        (i.element?.includes('covering-panel') && i.element2?.includes('covered-text')) ||
        (i.element?.includes('covered-text') && i.element2?.includes('covering-panel')),
    );
    expect(panelIssue).toBeDefined();
    expect(panelIssue!.severity).toBe('error');
  }, 30000);

  it('full-viewport modal backdrop does NOT produce occlusion issue', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'occlusion.html'),
      keepAlive: 0,
    });

    const occlusions = report.issues.filter((i) => i.type === 'occlusion');

    // modal-backdrop is position:fixed covering >=50% viewport — intentional overlay
    const modalIssue = occlusions.find(
      (i) =>
        i.element?.includes('modal-backdrop') || i.element2?.includes('modal-backdrop'),
    );
    expect(modalIssue).toBeUndefined();
  }, 30000);

  it('semi-transparent overlay produces type occlusion with severity warning', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'occlusion.html'),
      keepAlive: 0,
    });

    const occlusions = report.issues.filter((i) => i.type === 'occlusion');

    // #semi-overlay (opacity:0.3) over #semi-covered-text — should be warning
    const semiIssue = occlusions.find(
      (i) =>
        (i.element?.includes('semi-overlay') && i.element2?.includes('semi-covered-text')) ||
        (i.element?.includes('semi-covered-text') && i.element2?.includes('semi-overlay')),
    );
    expect(semiIssue).toBeDefined();
    expect(semiIssue!.severity).toBe('warning');
  }, 30000);

  it('clean.html produces zero occlusion issues (regression)', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    const occlusions = report.issues.filter((i) => i.type === 'occlusion');
    expect(occlusions).toEqual([]);
  }, 30000);
});

// ── Helper ──

function hasTextRecursive(el: ExtractedElement): boolean {
  if (el.text?.trim().length) return true;
  for (const child of el.children) {
    if (hasTextRecursive(child)) return true;
  }
  return false;
}
