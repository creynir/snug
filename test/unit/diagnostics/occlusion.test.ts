import { describe, it, expect } from 'vitest';
import { checkOcclusion, collectProbeTargets } from '../../../src/diagnostics/occlusion.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';
import type { VisibilityMap, ElementVisibility } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 200, h: 200 },
    children: [],
    ...overrides,
  };
}

/**
 * Build a flat tree with a root and N children, returning the root.
 * Children get DFS indices 1..N (root is 0).
 */
function buildTree(children: ExtractedElement[]): ExtractedElement {
  return makeElement({
    selector: '.root',
    bounds: { x: 0, y: 0, w: 1280, h: 800 },
    children,
  });
}

/**
 * Build a VisibilityMap from entries.
 */
function buildVisibility(
  entries: Array<{ index: number; ratio: number; occludedBy: Array<{ index: number; coverage: number }> }>
): VisibilityMap {
  const map: VisibilityMap = new Map();
  for (const e of entries) {
    map.set(e.index, { ratio: e.ratio, occludedBy: e.occludedBy });
  }
  return map;
}

// ──────────────────────────────────────────
// checkOcclusion — FOLLOWUP-009: intentionality scoring
// ──────────────────────────────────────────

describe('checkOcclusion — intentionality scoring', () => {
  // Viewport area = 1280 * 800 = 1,024,000

  it('1. suppresses when score >= 4 (fixed + full viewport + z-gap >= 100)', () => {
    // Occluder: position:fixed, bounds=viewport, zIndex=1000
    // Covered: p with text, zIndex undefined (auto=0), ratio=0.0
    // Score: coverage(+3) + fixed(+1) + fullExtent(+2) + zGap(+2) = 8 → suppress
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Hidden text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({
        selector: '.modal-overlay',
        tag: 'div',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        computed: { position: 'fixed', zIndex: '1000' },
      }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues).toEqual([]);
  });

  it('2. warning when score 2-3 (large overlay + moderate z-gap + body child)', () => {
    // Occluder: 600x400 = 240,000 / 1,024,000 = 23.4% → +1 coverage
    // zIndex 50 vs 0 → gap=50 → +1
    // Parent is body → +1
    // Score: 1 + 1 + 1 = 3 → warning
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({ selector: '.covered-p', tag: 'p', text: 'Some content', bounds: { x: 10, y: 10, w: 200, h: 50 }, computed: { zIndex: '0' } }),
        makeElement({
          selector: '.overlay',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          computed: { zIndex: '50' },
        }),
      ],
    });
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data!.intentionalityScore).toBe(3);
  });

  it('3. warning when score 0-1 and covered has text (not interactive)', () => {
    // Occluder: 100x50 = 5,000 / 1,024,000 = 0.5% → +0 coverage
    // No special position, no z-index, not body child
    // Score: 0 → warning (text, not interactive)
    const tree = buildTree([
      makeElement({ selector: '.covered-span', tag: 'span', text: 'Readable text', bounds: { x: 10, y: 10, w: 200, h: 30 } }),
      makeElement({ selector: '.small-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 50 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data!.intentionalityScore).toBe(0);
  });

  it('4. error when score < 2 and covered input occluded > 50%', () => {
    // Occluder: small div, score=0
    // Covered: input, ratio=0.3 (<=0.5)
    // Score 0, interactive, ratio<=0.5 → error
    const tree = buildTree([
      makeElement({ selector: '.covered-input', tag: 'input', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.small-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.3, occludedBy: [{ index: 2, coverage: 0.7 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].data!.isCritical).toBe(true);
  });

  it('5. error when score < 2 and covered `a` link occluded > 50%', () => {
    // Occluder: small div, score=0
    // Covered: a with text, ratio=0.4 (<=0.5)
    // Score 0, interactive, ratio<=0.5 → error
    const tree = buildTree([
      makeElement({ selector: '.covered-link', tag: 'a', text: 'Click here', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.small-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 80, h: 20 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.4, occludedBy: [{ index: 2, coverage: 0.6 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].data!.isCritical).toBe(true);
  });

  it('6. warning (not error) when score >= 2 even for interactive control', () => {
    // Occluder: 700x600 = 420,000 / 1,024,000 = 41% → +2 coverage
    // Covered: input, ratio=0.3 (would be error at score < 2)
    // Score: 2 → warning overrides interactive error rule
    const tree = buildTree([
      makeElement({ selector: '.covered-input', tag: 'input', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.large-occluder', tag: 'div', bounds: { x: 0, y: 0, w: 700, h: 600 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.3, occludedBy: [{ index: 2, coverage: 0.7 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data!.intentionalityScore).toBe(2);
  });

  it('7. viewport coverage 80%+ awards +3', () => {
    // Occluder: 1200x700 = 840,000 / 1,024,000 = 82% → +3
    // No other signals
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.huge-occluder', tag: 'div', bounds: { x: 0, y: 0, w: 1200, h: 700 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(3);
  });

  it('8. viewport coverage 40-79% awards +2', () => {
    // Occluder: 700x600 = 420,000 / 1,024,000 = 41% → +2
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.mid-occluder', tag: 'div', bounds: { x: 0, y: 0, w: 700, h: 600 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(2);
  });

  it('9. viewport coverage 15-39% awards +1', () => {
    // Occluder: 400x400 = 160,000 / 1,024,000 = 15.6% → +1
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.small-occluder', tag: 'div', bounds: { x: 0, y: 0, w: 400, h: 400 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(1);
  });

  it('10a. position:fixed + full viewport extent → +3 total (fixed+fullExtent), suppresses with coverage', () => {
    // Occluder: position:fixed, 1200x750 (>=90% of 1280 and 800)
    // Coverage: 1200*750 = 900,000 / 1,024,000 = 87.9% → +3
    // Fixed → +1, fullExtent → +2
    // Score: 3 + 1 + 2 = 6 → suppress
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Hidden', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({
        selector: '.fixed-full',
        tag: 'div',
        bounds: { x: 0, y: 0, w: 1200, h: 750 },
        computed: { position: 'fixed' },
      }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues).toEqual([]);
  });

  it('10b. position:fixed but NOT full viewport extent → only +1 for fixed', () => {
    // Occluder: position:fixed, 400x100 (not >=90% of either dimension)
    // Coverage: 400*100 = 40,000 / 1,024,000 = 3.9% → +0
    // Fixed → +1, NOT full extent → +0
    // Score: 0 + 1 = 1 → warning
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Partially hidden', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({
        selector: '.fixed-small',
        tag: 'div',
        bounds: { x: 0, y: 0, w: 400, h: 100 },
        computed: { position: 'fixed' },
      }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data!.intentionalityScore).toBe(1);
  });

  it('11a. z-index gap >= 100 awards +2', () => {
    // Occluder: zIndex=200, covered: zIndex=50 → gap=150 → +2
    // Occluder: 100x50 = 5,000 / 1,024,000 = 0.5% → +0 coverage
    // Score: 0 + 2 = 2 → warning
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Text', bounds: { x: 10, y: 10, w: 200, h: 50 }, computed: { zIndex: '50' } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 50 }, computed: { zIndex: '200' } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(2);
  });

  it('11b. z-index gap 10-99 awards +1', () => {
    // Occluder: zIndex=30, covered: zIndex=5 → gap=25 → +1
    // Occluder: 100x50 → +0 coverage
    // Score: 0 + 1 = 1 → warning
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Text', bounds: { x: 10, y: 10, w: 200, h: 50 }, computed: { zIndex: '5' } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 50 }, computed: { zIndex: '30' } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(1);
  });

  it('12. occluder as direct child of body awards +1 for DOM distance', () => {
    // Root is body, occluder is direct child → +1
    // Occluder: 100x50 = 5,000 → +0 coverage, no other signals
    // Score: 0 + 1 = 1
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({ selector: '.covered-p', tag: 'p', text: 'Body text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
        makeElement({ selector: '.body-child-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 50 } }),
      ],
    });
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].data!.intentionalityScore).toBe(1);
  });

  it('13. includes intentionalityScore in context as string', () => {
    // Any scenario that produces an issue — verify context.intentionalityScore is a string
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Check context', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 50 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    const ctx = issues[0].context!;
    expect(ctx.intentionalityScore).toBeDefined();
    expect(typeof ctx.intentionalityScore).toBe('string');
    // Also verify existing context fields are still present
    expect(ctx.check).toBe('occlusion');
    expect(ctx.coveredHasText).toBe('true');
    expect(typeof ctx.occluderViewportCoverage).toBe('string');
  });

  it('14. does not report when ratio >= 0.7 (threshold unchanged)', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-btn', tag: 'button', text: 'Click', bounds: { x: 10, y: 10, w: 100, h: 40 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 20, h: 40 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.8, occludedBy: [{ index: 2, coverage: 0.2 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues).toEqual([]);
  });

  it('15. returns empty when no visibility map provided', () => {
    const tree = buildTree([
      makeElement({ selector: '.child', tag: 'input', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
    ]);
    const issues = checkOcclusion(tree, viewport);
    expect(issues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// collectProbeTargets
// ──────────────────────────────────────────

describe('collectProbeTargets', () => {
  it('19. includes elements with text content', () => {
    const tree = buildTree([
      makeElement({ selector: '.text-el', tag: 'div', text: 'Hello world', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    const selectors = targets.map((t) => {
      // Walk tree by DFS index to find selector
      const els: ExtractedElement[] = [];
      function walk(el: ExtractedElement) { els.push(el); el.children.forEach(walk); }
      walk(tree);
      return els[t.index]?.selector;
    });
    expect(selectors).toContain('.text-el');
  });

  it('20. includes interactive elements (button, input, a, role=button)', () => {
    const tree = buildTree([
      makeElement({ selector: '.btn', tag: 'button', bounds: { x: 10, y: 10, w: 80, h: 30 } }),
      makeElement({ selector: '.inp', tag: 'input', bounds: { x: 100, y: 10, w: 150, h: 30 } }),
      makeElement({ selector: '.link', tag: 'a', bounds: { x: 260, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.role-btn', tag: 'div', bounds: { x: 370, y: 10, w: 80, h: 30 }, attributes: { role: 'button' } }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    const indices = targets.map((t) => t.index);
    // DFS: root=0, .btn=1, .inp=2, .link=3, .role-btn=4
    expect(indices).toContain(1);
    expect(indices).toContain(2);
    expect(indices).toContain(3);
    expect(indices).toContain(4);
  });

  it('21. includes media elements (img with non-trivial bounds)', () => {
    const tree = buildTree([
      makeElement({ selector: '.image', tag: 'img', bounds: { x: 10, y: 10, w: 300, h: 200 } }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets.some((t) => t.index === 1)).toBe(true);
  });

  it('22. excludes pure layout containers (div with no text, not interactive, not media)', () => {
    const tree = buildTree([
      makeElement({ selector: '.layout-div', tag: 'div', bounds: { x: 10, y: 10, w: 500, h: 400 } }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    // Should not include the plain div (index 1), may include root (index 0) depending on logic
    const nonRootTargets = targets.filter((t) => t.index !== 0);
    expect(nonRootTargets).toEqual([]);
  });

  it('23. excludes elements entirely outside viewport', () => {
    const tree = buildTree([
      makeElement({ selector: '.offscreen', tag: 'button', text: 'Hidden', bounds: { x: 2000, y: 2000, w: 100, h: 30 } }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    expect(targets.every((t) => t.index !== 1)).toBe(true);
  });

  it('24. excludes elements inside SVG subtrees', () => {
    const tree = buildTree([
      makeElement({
        selector: 'svg.icon',
        tag: 'svg',
        bounds: { x: 10, y: 10, w: 50, h: 50 },
        children: [
          makeElement({ selector: 'svg.icon > text', tag: 'text', text: 'SVG text', bounds: { x: 10, y: 10, w: 40, h: 20 } }),
        ],
      }),
    ]);
    const targets = collectProbeTargets(tree, viewport);
    // Neither the svg nor its children should be targets
    // DFS: root=0, svg.icon=1, svg.icon > text=2
    expect(targets.every((t) => t.index !== 1 && t.index !== 2)).toBe(true);
  });

  it('25. caps at 200 targets', () => {
    const children: ExtractedElement[] = [];
    for (let i = 0; i < 250; i++) {
      children.push(
        makeElement({
          selector: `.item-${i}`,
          tag: 'p',
          text: `Text ${i}`,
          bounds: { x: 10, y: i * 3, w: 100, h: 2 },
        })
      );
    }
    const tree = buildTree(children);
    const targets = collectProbeTargets(tree, viewport);
    expect(targets.length).toBeLessThanOrEqual(200);
  });

  it('26. returns correct DFS index for each target', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.wrapper',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({ selector: '.deep-btn', tag: 'button', text: 'Click', bounds: { x: 10, y: 10, w: 80, h: 30 } }),
          ],
        }),
        makeElement({ selector: '.sibling-link', tag: 'a', text: 'Link', bounds: { x: 10, y: 50, w: 100, h: 20 } }),
      ],
    });
    // DFS walk: root=0, .wrapper=1, .deep-btn=2, .sibling-link=3
    const targets = collectProbeTargets(tree, viewport);
    const deepBtn = targets.find((t) => t.index === 2);
    const siblingLink = targets.find((t) => t.index === 3);
    expect(deepBtn).toBeDefined();
    expect(deepBtn!.bounds).toEqual({ x: 10, y: 10, w: 80, h: 30 });
    expect(siblingLink).toBeDefined();
    expect(siblingLink!.bounds).toEqual({ x: 10, y: 50, w: 100, h: 20 });
  });

  it('27. prioritizes critical > functional when cap is hit', () => {
    const children: ExtractedElement[] = [];
    // 100 critical elements (input)
    for (let i = 0; i < 100; i++) {
      children.push(
        makeElement({
          selector: `.critical-${i}`,
          tag: 'input',
          bounds: { x: 10, y: i * 3, w: 100, h: 2 },
        })
      );
    }
    // 150 functional elements (p with text) — total 250, exceeds cap
    for (let i = 0; i < 150; i++) {
      children.push(
        makeElement({
          selector: `.functional-${i}`,
          tag: 'p',
          text: `Paragraph ${i}`,
          bounds: { x: 10, y: 300 + i * 3, w: 100, h: 2 },
        })
      );
    }
    const tree = buildTree(children);
    const targets = collectProbeTargets(tree, viewport);
    expect(targets.length).toBeLessThanOrEqual(200);

    // All critical elements should be included
    const els: ExtractedElement[] = [];
    function walk(el: ExtractedElement) { els.push(el); el.children.forEach(walk); }
    walk(tree);

    const criticalIndices = new Set<number>();
    els.forEach((el, idx) => {
      if (el.tag === 'input') criticalIndices.add(idx);
    });

    const targetIndices = new Set(targets.map((t) => t.index));
    for (const ci of criticalIndices) {
      expect(targetIndices.has(ci)).toBe(true);
    }
  });
});
