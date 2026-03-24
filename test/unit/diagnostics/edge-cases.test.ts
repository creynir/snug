import { describe, it, expect } from 'vitest';
import { runDiagnostics } from '../../../src/diagnostics/index.js';
import { checkViewportOverflow } from '../../../src/diagnostics/viewport-overflow.js';
import { checkContainment } from '../../../src/diagnostics/containment.js';
import { checkSiblingOverlap } from '../../../src/diagnostics/sibling-overlap.js';
import { checkTruncation } from '../../../src/diagnostics/truncation.js';
import { checkSpacingAnomaly } from '../../../src/diagnostics/spacing-anomaly.js';
import { checkAspectRatio } from '../../../src/diagnostics/aspect-ratio.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────
// Empty tree (body with no children)
// ──────────────────────────────────────────

describe('diagnostics: empty tree', () => {
  const emptyTree = makeElement({
    selector: 'body',
    tag: 'body',
    bounds: { x: 0, y: 0, w: 1280, h: 800 },
    children: [],
  });

  it('runDiagnostics returns [] for empty tree', () => {
    const issues = runDiagnostics(emptyTree, viewport);
    expect(issues).toEqual([]);
  });

  it('viewport-overflow returns [] for empty tree', () => {
    expect(checkViewportOverflow(emptyTree, viewport)).toEqual([]);
  });

  it('containment returns [] for empty tree', () => {
    expect(checkContainment(emptyTree, viewport)).toEqual([]);
  });

  it('sibling-overlap returns [] for empty tree', () => {
    expect(checkSiblingOverlap(emptyTree, viewport)).toEqual([]);
  });

  it('truncation returns [] for empty tree', () => {
    expect(checkTruncation(emptyTree, viewport)).toEqual([]);
  });

  it('spacing-anomaly returns [] for empty tree', () => {
    expect(checkSpacingAnomaly(emptyTree, viewport)).toEqual([]);
  });

  it('aspect-ratio returns [] for empty tree', () => {
    expect(checkAspectRatio(emptyTree, viewport)).toEqual([]);
  });
});

// ──────────────────────────────────────────
// Deeply nested tree (10+ levels)
// ──────────────────────────────────────────

describe('diagnostics: deeply nested tree', () => {
  /** Build a linear chain of elements: body > .d0 > .d1 > ... > .dN */
  function buildDeepTree(depth: number): ExtractedElement {
    let leaf = makeElement({
      selector: `.d${depth}`,
      bounds: { x: 10, y: 10, w: 50, h: 50 },
    });
    for (let i = depth - 1; i >= 0; i--) {
      leaf = makeElement({
        selector: `.d${i}`,
        bounds: { x: 0, y: 0, w: 200, h: 200 },
        children: [leaf],
      });
    }
    return makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [leaf],
    });
  }

  it('runDiagnostics does not throw on 15-level deep tree', () => {
    const tree = buildDeepTree(15);
    expect(() => runDiagnostics(tree, viewport)).not.toThrow();
  });

  it('runDiagnostics does not throw on 50-level deep tree', () => {
    const tree = buildDeepTree(50);
    expect(() => runDiagnostics(tree, viewport)).not.toThrow();
  });

  it('viewport-overflow does not stack overflow on 100-level deep tree', () => {
    const tree = buildDeepTree(100);
    expect(() => checkViewportOverflow(tree, viewport)).not.toThrow();
  });

  it('containment does not stack overflow on 100-level deep tree', () => {
    const tree = buildDeepTree(100);
    expect(() => checkContainment(tree, viewport)).not.toThrow();
  });

  it('sibling-overlap does not stack overflow on 100-level deep tree', () => {
    const tree = buildDeepTree(100);
    expect(() => checkSiblingOverlap(tree, viewport)).not.toThrow();
  });
});

// ──────────────────────────────────────────
// Zero-size bounds
// ──────────────────────────────────────────

describe('diagnostics: zero-size bounds', () => {
  it('viewport-overflow handles zero-size element at origin without error', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.zero', bounds: { x: 0, y: 0, w: 0, h: 0 } }),
      ],
    });
    expect(() => checkViewportOverflow(tree, viewport)).not.toThrow();
  });

  it('containment handles zero-size child without error', () => {
    const tree = makeElement({
      selector: '.parent',
      bounds: { x: 0, y: 0, w: 200, h: 200 },
      children: [
        makeElement({ selector: '.zero-child', bounds: { x: 0, y: 0, w: 0, h: 0 } }),
      ],
    });
    expect(() => checkContainment(tree, viewport)).not.toThrow();
  });

  it('sibling-overlap handles two zero-size siblings at same position without division by zero', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.z1', bounds: { x: 50, y: 50, w: 0, h: 0 } }),
        makeElement({ selector: '.z2', bounds: { x: 50, y: 50, w: 0, h: 0 } }),
      ],
    });
    // Should not crash (division by zero on area) and should return []
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('aspect-ratio handles image with zero-size bounds without division by zero', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.zero-img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 0, h: 0 },
          natural: { width: 800, height: 600 },
        }),
      ],
    });
    // Should skip element, not divide by zero
    expect(() => checkAspectRatio(tree, viewport)).not.toThrow();
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('spacing-anomaly handles zero-width siblings without error', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.s1', bounds: { x: 0, y: 0, w: 0, h: 50 } }),
        makeElement({ selector: '.s2', bounds: { x: 0, y: 50, w: 0, h: 50 } }),
        makeElement({ selector: '.s3', bounds: { x: 0, y: 100, w: 0, h: 50 } }),
      ],
    });
    expect(() => checkSpacingAnomaly(tree, viewport)).not.toThrow();
  });

  it('zero-size parent with zero-size child does not throw in containment', () => {
    const tree = makeElement({
      selector: '.zero-parent',
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      children: [
        makeElement({ selector: '.zero-child', bounds: { x: 0, y: 0, w: 0, h: 0 } }),
      ],
    });
    expect(() => checkContainment(tree, viewport)).not.toThrow();
  });
});

// ──────────────────────────────────────────
// Very large bounds values
// ──────────────────────────────────────────

describe('diagnostics: very large bounds values', () => {
  it('viewport-overflow handles extremely large bounds without overflow', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.huge',
          bounds: { x: 0, y: 0, w: 1e8, h: 1e8 },
        }),
      ],
    });
    expect(() => checkViewportOverflow(tree, viewport)).not.toThrow();
    const issues = checkViewportOverflow(tree, viewport);
    // Should detect overflow
    expect(issues.length).toBeGreaterThan(0);
  });

  it('sibling-overlap handles large coordinate values without overflow', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.big-a',
          bounds: { x: 0, y: 0, w: 1e7, h: 1e7 },
        }),
        makeElement({
          selector: '.big-b',
          bounds: { x: 5e6, y: 5e6, w: 1e7, h: 1e7 },
        }),
      ],
    });
    expect(() => checkSiblingOverlap(tree, viewport)).not.toThrow();
  });

  it('containment handles large overflow distances without issues', () => {
    const tree = makeElement({
      selector: '.small-parent',
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      children: [
        makeElement({
          selector: '.giant-child',
          bounds: { x: 0, y: 0, w: 1e8, h: 1e8 },
        }),
      ],
    });
    expect(() => checkContainment(tree, viewport)).not.toThrow();
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('aspect-ratio handles very large image dimensions', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.huge-img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 1e6, h: 5e5 },
          natural: { width: 1e6, height: 5e5 },
        }),
      ],
    });
    // Same aspect ratio, should not flag
    expect(() => checkAspectRatio(tree, viewport)).not.toThrow();
    expect(checkAspectRatio(tree, viewport)).toEqual([]);
  });
});

// ──────────────────────────────────────────
// Tree with single child at each level
// ──────────────────────────────────────────

describe('diagnostics: single child per level', () => {
  const singleChildTree = makeElement({
    selector: 'body',
    tag: 'body',
    bounds: { x: 0, y: 0, w: 1280, h: 800 },
    children: [
      makeElement({
        selector: '.wrapper',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.inner',
            bounds: { x: 10, y: 10, w: 1260, h: 780 },
            children: [
              makeElement({
                selector: '.content',
                bounds: { x: 20, y: 20, w: 1240, h: 760 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  it('containment reports no issues for properly nested single-child chain', () => {
    const issues = checkContainment(singleChildTree, viewport);
    expect(issues).toEqual([]);
  });

  it('sibling-overlap reports no issues (no siblings to compare)', () => {
    const issues = checkSiblingOverlap(singleChildTree, viewport);
    expect(issues).toEqual([]);
  });

  it('spacing-anomaly reports no issues (fewer than 3 siblings at each level)', () => {
    const issues = checkSpacingAnomaly(singleChildTree, viewport);
    expect(issues).toEqual([]);
  });

  it('viewport-overflow reports no issues for well-contained chain', () => {
    const issues = checkViewportOverflow(singleChildTree, viewport);
    expect(issues).toEqual([]);
  });

  it('runDiagnostics returns [] for well-behaved single-child chain', () => {
    const issues = runDiagnostics(singleChildTree, viewport);
    expect(issues).toEqual([]);
  });
});
