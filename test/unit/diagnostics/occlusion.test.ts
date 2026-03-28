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
// checkOcclusion — FOLLOWUP-008: warn-by-default
// ──────────────────────────────────────────

describe('checkOcclusion — warn-by-default occlusion detection', () => {
  it('1. reports warning for occluded element with text (default severity)', () => {
    // DFS: root=0, covered-span=1, occluder=2
    const tree = buildTree([
      makeElement({ selector: '.covered-span', tag: 'span', text: 'Node title', bounds: { x: 10, y: 10, w: 200, h: 30 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 30 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.2, occludedBy: [{ index: 2, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('occlusion');
    expect(issues[0].severity).toBe('warning');
  });

  it('2. reports error for occluded input with ratio <= 0.5', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-input', tag: 'input', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.4, occludedBy: [{ index: 2, coverage: 0.6 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('3. reports error for occluded button[type=submit] with ratio <= 0.5', () => {
    const tree = buildTree([
      makeElement({ selector: '.submit-btn', tag: 'button', text: 'Submit', bounds: { x: 10, y: 10, w: 120, h: 40 }, attributes: { type: 'submit' } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 120, h: 40 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.3, occludedBy: [{ index: 2, coverage: 0.7 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('4. reports warning (not error) for occluded button[type=submit] with ratio > 0.5', () => {
    const tree = buildTree([
      makeElement({ selector: '.submit-btn', tag: 'button', text: 'Submit', bounds: { x: 10, y: 10, w: 120, h: 40 }, attributes: { type: 'submit' } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 50, h: 40 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.6, occludedBy: [{ index: 2, coverage: 0.4 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('5. reports warning for element behind position:absolute (no filtering)', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Behind absolute', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.abs-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 50 }, computed: { position: 'absolute' } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('6. reports warning for element behind position:fixed large overlay (no filtering)', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Behind fixed overlay', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({
        selector: '.fixed-overlay',
        tag: 'div',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        computed: { position: 'fixed' },
      }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('7. does not report for element with ratio >= 0.7', () => {
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

  it('8. does not report for element with no text and not interactive', () => {
    const tree = buildTree([
      makeElement({ selector: '.plain-div', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 200 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 200 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues).toEqual([]);
  });

  it('9. returns empty array when no visibility map provided', () => {
    const tree = buildTree([
      makeElement({ selector: '.child', tag: 'input', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
    ]);
    const issues = checkOcclusion(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('10. includes context fields: coveredHasText, occluderPosition, occluderViewportCoverage', () => {
    // DFS: root=0, subtree-a=1, covered-p=2, subtree-b=3, occluder=4
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({ selector: '.covered-p', tag: 'p', text: 'Some text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({ selector: '.abs-occluder', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 100 }, computed: { position: 'absolute' } }),
          ],
        }),
      ],
    });
    const visibility = buildVisibility([
      { index: 2, ratio: 0.2, occludedBy: [{ index: 4, coverage: 0.8 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    const ctx = issues[0].context!;
    expect(ctx.check).toBe('occlusion');
    expect(ctx.coveredHasText).toBe('true');
    expect(ctx.occluderPosition).toBe('absolute');
    expect(typeof ctx.occluderViewportCoverage).toBe('string');
    expect(parseFloat(ctx.occluderViewportCoverage as string)).toBeGreaterThan(0);
  });

  it('11. includes covered text in detail string', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-p', tag: 'p', text: 'Important content here', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 2, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].detail).toContain('Text: "Important content here"');
  });

  it('12. deduplicates: skips child when parent is occluded by same occluder', () => {
    // DFS: root=0, parent-div=1, child-span=2, occluder=3
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.parent-div',
          tag: 'div',
          text: 'Parent text',
          bounds: { x: 10, y: 10, w: 300, h: 200 },
          children: [
            makeElement({ selector: '.child-span', tag: 'span', text: 'Child text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
          ],
        }),
        makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 300, h: 200 } }),
      ],
    });
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 3, coverage: 1.0 }] },
      { index: 2, ratio: 0.1, occludedBy: [{ index: 3, coverage: 0.9 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    // Parent ratio (0.0) <= child ratio (0.1) → child is deduplicated
    expect(issues.length).toBe(1);
    expect(issues[0].element2).toBe('.parent-div');
  });

  it('13. reports error for occluded `a` link with ratio <= 0.5', () => {
    const tree = buildTree([
      makeElement({ selector: '.covered-link', tag: 'a', text: 'Click here', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
      makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 100, h: 30 } }),
    ]);
    const visibility = buildVisibility([
      { index: 1, ratio: 0.3, occludedBy: [{ index: 2, coverage: 0.7 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('14. does NOT deduplicate when parent is occluded by different occluder', () => {
    // DFS: root=0, parent-div=1, child-span=2, occluder-a=3, occluder-b=4
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.parent-div',
          tag: 'div',
          text: 'Parent text',
          bounds: { x: 10, y: 10, w: 300, h: 200 },
          children: [
            makeElement({ selector: '.child-span', tag: 'span', text: 'Child text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
          ],
        }),
        makeElement({ selector: '.occluder-a', tag: 'div', bounds: { x: 10, y: 10, w: 300, h: 200 } }),
        makeElement({ selector: '.occluder-b', tag: 'div', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
      ],
    });
    const visibility = buildVisibility([
      { index: 1, ratio: 0.0, occludedBy: [{ index: 3, coverage: 1.0 }] },
      { index: 2, ratio: 0.0, occludedBy: [{ index: 4, coverage: 1.0 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(2);
  });

  it('15. does NOT deduplicate when parent ratio > child ratio', () => {
    // DFS: root=0, parent-div=1, child-span=2, occluder=3
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.parent-div',
          tag: 'div',
          text: 'Parent text',
          bounds: { x: 10, y: 10, w: 300, h: 200 },
          children: [
            makeElement({ selector: '.child-span', tag: 'span', text: 'Child text', bounds: { x: 10, y: 10, w: 200, h: 50 } }),
          ],
        }),
        makeElement({ selector: '.occluder', tag: 'div', bounds: { x: 10, y: 10, w: 300, h: 200 } }),
      ],
    });
    const visibility = buildVisibility([
      { index: 1, ratio: 0.5, occludedBy: [{ index: 3, coverage: 0.5 }] },
      { index: 2, ratio: 0.1, occludedBy: [{ index: 3, coverage: 0.9 }] },
    ]);
    const issues = checkOcclusion(tree, viewport, visibility);
    expect(issues.length).toBe(2);
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
