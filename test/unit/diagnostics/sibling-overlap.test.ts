import { describe, it, expect } from 'vitest';
import { checkSiblingOverlap, parseZIndex } from '../../../src/diagnostics/sibling-overlap.js';
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
// parseZIndex
// ──────────────────────────────────────────

describe('parseZIndex', () => {
  it('treats "auto" as 0', () => {
    expect(parseZIndex('auto')).toBe(0);
  });

  it('treats undefined as 0', () => {
    expect(parseZIndex(undefined)).toBe(0);
  });

  it('parses positive numeric strings', () => {
    expect(parseZIndex('5')).toBe(5);
    expect(parseZIndex('10')).toBe(10);
    expect(parseZIndex('999')).toBe(999);
  });

  it('parses negative numeric strings', () => {
    expect(parseZIndex('-1')).toBe(-1);
    expect(parseZIndex('-100')).toBe(-100);
  });

  it('parses zero as 0', () => {
    expect(parseZIndex('0')).toBe(0);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(parseZIndex('abc')).toBe(0);
    expect(parseZIndex('')).toBe(0);
  });
});

// ──────────────────────────────────────────
// checkSiblingOverlap
// ──────────────────────────────────────────

describe('checkSiblingOverlap', () => {
  // ── Happy path ──

  it('returns no issues for non-overlapping siblings', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: 120, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.c', bounds: { x: 240, y: 0, w: 100, h: 100 } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when parent has only one child', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.only', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when parent has no children', () => {
    const tree = makeElement({ selector: '.empty', children: [] });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── AABB intersection detection ──

  it('detects overlapping siblings', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.a',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'absolute' },
        }),
        makeElement({
          selector: '.b',
          bounds: { x: 100, y: 50, w: 200, h: 200 },
          computed: { position: 'absolute' },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('sibling-overlap');
    expect(issues[0].element).toBe('.a');
    expect(issues[0].element2).toBe('.b');
  });

  it('detects fully overlapping siblings (one covers the other)', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.big',
          bounds: { x: 0, y: 0, w: 500, h: 500 },
        }),
        makeElement({
          selector: '.small',
          bounds: { x: 50, y: 50, w: 100, h: 100 },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    // overlapArea = 100*100 = 10000, smallerArea = 100*100 = 10000 => 100%
    expect(issues[0].type).toBe('sibling-overlap');
  });

  // ── 1px tolerance ──

  it('does not flag overlap of exactly 1px on each axis (within tolerance)', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: 99, y: 99, w: 100, h: 100 } }),
        // overlapX = min(100,199) - max(0,99) = 100-99 = 1
        // overlapY = min(100,199) - max(0,99) = 100-99 = 1
        // Both <= 1, so within tolerance
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('flags overlap of 2px on both axes (exceeds tolerance)', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: 98, y: 0, w: 100, h: 100 } }),
        // overlapX = min(100,198) - max(0,98) = 100-98 = 2
        // overlapY = min(100,100) - max(0,0) = 100
        // Both > 1, overlapArea = 2*100 = 200, smallerArea = 10000 => 2%
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
  });

  // ── Trivial overlap skip (< 1% of smaller element) ──

  it('skips trivial overlaps less than 1% of smaller element area', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({ selector: '.b', bounds: { x: 198, y: 0, w: 200, h: 200 } }),
        // overlapX = min(200,398) - max(0,198) = 200-198 = 2
        // overlapY = 200
        // overlapArea = 2*200 = 400, smallerArea = 40000 => 1%
        // Exactly 1% should pass, but < 1% should be skipped
      ],
    });
    // 400/40000 = 0.01 = exactly 1% — spec says skip < 1% (strictly less than)
    // This is at the boundary so should be flagged
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
  });

  it('skips overlap that is less than 1% of the smaller element', () => {
    // Make a very tiny overlap relative to element area
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 1000, h: 1000 } }),
        makeElement({ selector: '.b', bounds: { x: 998, y: 998, w: 1000, h: 1000 } }),
        // overlapX = min(1000,1998) - max(0,998) = 1000-998 = 2
        // overlapY = min(1000,1998) - max(0,998) = 1000-998 = 2
        // overlapArea = 2*2 = 4, smallerArea = 1000000 => 0.0004% — trivial
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Z-index severity heuristic ──

  it('reports error for same z-index overlap > 10%', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.a',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: 'auto' },
        }),
        makeElement({
          selector: '.b',
          bounds: { x: 50, y: 50, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: 'auto' },
        }),
      ],
    });
    // overlapX = min(200,250)-max(0,50) = 200-50 = 150
    // overlapY = min(200,250)-max(0,50) = 200-50 = 150
    // overlapArea = 150*150 = 22500, smallerArea = 40000 => 56.25%
    // Same z-index (both auto=0) + > 10% => error
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].data?.sameZIndex).toBe(true);
  });

  it('reports warning for same z-index overlap <= 10%', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.a',
          bounds: { x: 0, y: 0, w: 100, h: 100 },
          computed: { position: 'absolute' },
        }),
        makeElement({
          selector: '.b',
          bounds: { x: 95, y: 0, w: 100, h: 100 },
          computed: { position: 'absolute' },
        }),
      ],
    });
    // overlapX = min(100,195) - max(0,95) = 100-95 = 5
    // overlapY = 100
    // overlapArea = 500, smallerArea = 10000 => 5%
    // Same z-index (both auto=0) + <= 10% => warning
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data?.sameZIndex).toBe(true);
  });

  it('reports warning for different z-index overlap <= 50%', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.base',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: '1' },
        }),
        makeElement({
          selector: '.overlay',
          bounds: { x: 100, y: 50, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: '10' },
        }),
      ],
    });
    // overlapX = min(200,300)-max(0,100) = 200-100 = 100
    // overlapY = min(200,250)-max(0,50) = 200-50 = 150
    // overlapArea = 15000, smallerArea = 40000 => 37.5%
    // Different z-index + <= 50% => warning
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data?.sameZIndex).toBe(false);
  });

  it('reports error for different z-index overlap > 50%', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.base',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: '1' },
        }),
        makeElement({
          selector: '.overlay',
          bounds: { x: 10, y: 10, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: '5' },
        }),
      ],
    });
    // overlapX = min(200,210)-max(0,10) = 200-10 = 190
    // overlapY = min(200,210)-max(0,10) = 200-10 = 190
    // overlapArea = 36100, smallerArea = 40000 => 90.25%
    // Different z-index + > 50% => error
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].data?.sameZIndex).toBe(false);
  });

  // ── All sibling pairs (O(k^2)) ──

  it('checks all sibling pairs, not just adjacent ones', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({ selector: '.b', bounds: { x: 300, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.c', bounds: { x: 50, y: 50, w: 200, h: 200 } }),
        // .a and .c overlap significantly; .b does not overlap .a
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.some(i => i.element === '.a' && i.element2 === '.c')).toBe(true);
  });

  it('detects multiple overlapping pairs among siblings', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 150, h: 150 } }),
        makeElement({ selector: '.b', bounds: { x: 100, y: 0, w: 150, h: 150 } }),
        makeElement({ selector: '.c', bounds: { x: 200, y: 0, w: 150, h: 150 } }),
        // .a overlaps .b, .b overlaps .c
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  // ── Checks ALL siblings regardless of position ──

  it('checks siblings regardless of CSS position property', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.static',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'static' },
        }),
        makeElement({
          selector: '.absolute',
          bounds: { x: 50, y: 50, w: 200, h: 200 },
          computed: { position: 'absolute' },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
  });

  it('checks siblings even without computed styles', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({ selector: '.b', bounds: { x: 50, y: 50, w: 200, h: 200 } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
  });

  // ── Recursive detection ──

  it('checks overlap recursively in nested elements', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({
          selector: '.wrapper',
          children: [
            makeElement({ selector: '.inner-a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
            makeElement({ selector: '.inner-b', bounds: { x: 100, y: 0, w: 200, h: 200 } }),
          ],
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.inner-a');
    expect(issues[0].element2).toBe('.inner-b');
  });

  it('detects overlap at multiple tree levels', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({ selector: '.top-a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({
          selector: '.top-b',
          bounds: { x: 50, y: 50, w: 200, h: 200 },
          children: [
            makeElement({ selector: '.nested-a', bounds: { x: 50, y: 50, w: 100, h: 100 } }),
            makeElement({ selector: '.nested-b', bounds: { x: 100, y: 50, w: 100, h: 100 } }),
          ],
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    // Should detect both top-level and nested overlaps
    expect(issues.some(i => i.element === '.top-a')).toBe(true);
    expect(issues.some(i => i.element === '.nested-a' || i.element === '.nested-b')).toBe(true);
  });

  // ── Data fields ──

  it('includes both elements position and zIndex in computed', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.el-a',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'absolute', zIndex: '5' },
        }),
        makeElement({
          selector: '.el-b',
          bounds: { x: 50, y: 50, w: 200, h: 200 },
          computed: { position: 'fixed', zIndex: '10' },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].computed).toBeDefined();
  });

  it('includes sameZIndex boolean in data', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.a',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { zIndex: '5' },
        }),
        makeElement({
          selector: '.b',
          bounds: { x: 50, y: 50, w: 200, h: 200 },
          computed: { zIndex: '5' },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.sameZIndex).toBe(true);
  });

  it('includes overlap dimensions in data', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({
          selector: '.a',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
        }),
        makeElement({
          selector: '.b',
          bounds: { x: 100, y: 100, w: 200, h: 200 },
        }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.overlapX).toBe(100); // min(200,300)-max(0,100)
    expect(issues[0].data?.overlapY).toBe(100); // min(200,300)-max(0,100)
    expect(issues[0].data?.overlapArea).toBe(10000);
  });

  it('includes a non-empty detail string', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({ selector: '.b', bounds: { x: 50, y: 50, w: 200, h: 200 } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(typeof issues[0].detail).toBe('string');
    expect(issues[0].detail.length).toBeGreaterThan(0);
  });

  // ── Edge cases ──

  it('handles siblings with zero area', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 0, h: 0 } }),
        makeElement({ selector: '.b', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
      ],
    });
    // overlapX and overlapY are 0, so no overlap
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('handles non-overlapping siblings that touch edges exactly', () => {
    const tree = makeElement({
      selector: '.parent',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: 100, y: 0, w: 100, h: 100 } }),
        // They touch at x=100 but do not overlap (overlapX = 0)
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── SVG subtree skip (FOLLOWUP-001 Change 3) ──

  describe('SVG subtree skip', () => {
    it('does not check overlap between SVG children (path, polyline inside svg)', () => {
      // SVG drawing primitives overlap by design (an icon is composed of overlapping shapes).
      // The diagnostic should NOT recurse into SVG subtrees.
      const tree = makeElement({
        selector: '.icon-container',
        children: [
          makeElement({
            selector: 'svg.icon',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 24, h: 24 },
            children: [
              makeElement({
                selector: 'path.stroke',
                tag: 'path',
                bounds: { x: 0, y: 0, w: 20, h: 20 },
                computed: { position: 'static' },
              }),
              makeElement({
                selector: 'polyline.arrow',
                tag: 'polyline',
                bounds: { x: 5, y: 5, w: 14, h: 14 },
                computed: { position: 'static' },
              }),
              // 89% overlap — normal for icon drawing, should NOT be flagged
            ],
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      // No overlap issues from SVG internals
      const svgChildIssues = issues.filter(
        i =>
          ['path.stroke', 'polyline.arrow'].includes(i.element) ||
          ['path.stroke', 'polyline.arrow'].includes(i.element2 ?? ''),
      );
      expect(svgChildIssues).toEqual([]);
    });

    it('still checks overlap between SVG element and non-SVG siblings', () => {
      // The SVG element itself participates as a sibling.
      const tree = makeElement({
        selector: '.toolbar',
        children: [
          makeElement({
            selector: 'svg.icon',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 100, h: 100 },
          }),
          makeElement({
            selector: '.label',
            tag: 'span',
            bounds: { x: 20, y: 20, w: 100, h: 100 },
            // Significant overlap with the SVG element
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      // Should detect overlap between svg and span at the parent level
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(
        issues.some(
          i =>
            (i.element === 'svg.icon' && i.element2 === '.label') ||
            (i.element === '.label' && i.element2 === 'svg.icon'),
        ),
      ).toBe(true);
    });

    it('does not recurse into SVG subtrees', () => {
      // Even if SVG children have significant overlaps that would normally be flagged,
      // the diagnostic must skip them entirely.
      const tree = makeElement({
        selector: '.container',
        children: [
          makeElement({
            selector: 'svg.chart',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            children: [
              makeElement({
                selector: 'rect.bg',
                tag: 'rect',
                bounds: { x: 0, y: 0, w: 200, h: 200 },
              }),
              makeElement({
                selector: 'circle.point',
                tag: 'circle',
                bounds: { x: 50, y: 50, w: 100, h: 100 },
              }),
              // 100% overlap of circle within rect — normal for SVG, should not be flagged
            ],
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues).toEqual([]);
    });
  });

  // ── Fix 1b: Skip inline element overlap ──

  describe('inline element skip (Fix 1b)', () => {
    it('does not flag overlap between two display:inline siblings', () => {
      const tree = makeElement({
        selector: '.code-block',
        children: [
          makeElement({
            selector: '.token-key',
            tag: 'span',
            bounds: { x: 0, y: 0, w: 60, h: 20 },
            computed: { display: 'inline' },
          }),
          makeElement({
            selector: '.token-punct',
            tag: 'span',
            bounds: { x: 50, y: 0, w: 30, h: 20 },
            computed: { display: 'inline' },
            // 10px overlap with .token-key — normal inline text flow
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      const inlineIssues = issues.filter(
        i =>
          (i.element === '.token-key' && i.element2 === '.token-punct') ||
          (i.element === '.token-punct' && i.element2 === '.token-key'),
      );
      expect(inlineIssues).toEqual([]);
    });

    it('does not flag overlap between two display:inline-block siblings', () => {
      const tree = makeElement({
        selector: '.tag-list',
        children: [
          makeElement({
            selector: '.tag-a',
            tag: 'span',
            bounds: { x: 0, y: 0, w: 80, h: 24 },
            computed: { display: 'inline-block' },
          }),
          makeElement({
            selector: '.tag-b',
            tag: 'span',
            bounds: { x: 70, y: 0, w: 80, h: 24 },
            computed: { display: 'inline-block' },
            // 10px overlap — normal for inline-block wrapping
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      const inlineIssues = issues.filter(
        i =>
          (i.element === '.tag-a' && i.element2 === '.tag-b') ||
          (i.element === '.tag-b' && i.element2 === '.tag-a'),
      );
      expect(inlineIssues).toEqual([]);
    });

    it('still flags overlap between inline and block sibling (mixed)', () => {
      const tree = makeElement({
        selector: '.mixed-container',
        children: [
          makeElement({
            selector: '.inline-el',
            tag: 'span',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            computed: { display: 'inline' },
          }),
          makeElement({
            selector: '.block-el',
            tag: 'div',
            bounds: { x: 50, y: 50, w: 200, h: 200 },
            computed: { display: 'block' },
            // Significant overlap — one inline, one block => should still flag
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('still flags overlap between two block siblings (unchanged behavior)', () => {
      const tree = makeElement({
        selector: '.parent',
        children: [
          makeElement({
            selector: '.block-a',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            computed: { display: 'block' },
          }),
          makeElement({
            selector: '.block-b',
            bounds: { x: 50, y: 50, w: 200, h: 200 },
            computed: { display: 'block' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── A5: Compound form control overlap suppression ──

  describe('compound form control overlap suppression (A5)', () => {
    it('downgrades overlap between input and small absolute-positioned sibling to warning', () => {
      const tree = makeElement({
        selector: '.form-group',
        children: [
          makeElement({
            selector: 'input.search',
            tag: 'input',
            bounds: { x: 0, y: 0, w: 300, h: 40 },
            computed: { display: 'block' },
          }),
          makeElement({
            selector: '.search-icon',
            tag: 'div',
            bounds: { x: 270, y: 8, w: 24, h: 24 },
            computed: { position: 'absolute' },
            // Small icon (24x24 <= 32px) overlapping the input — compound control pattern
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].context?.compoundControl).toBe('true');
    });

    it('downgrades overlap between select and small absolute-positioned SVG icon to warning', () => {
      const tree = makeElement({
        selector: '.dropdown-wrapper',
        children: [
          makeElement({
            selector: 'select.dropdown',
            tag: 'select',
            bounds: { x: 0, y: 0, w: 200, h: 36 },
            computed: { display: 'block' },
          }),
          makeElement({
            selector: 'svg.chevron',
            tag: 'svg',
            bounds: { x: 176, y: 10, w: 16, h: 16 },
            computed: { position: 'absolute' },
            // 16x16 SVG chevron overlapping select — compound control
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].context?.compoundControl).toBe('true');
    });

    it('does not downgrade overlap between two regular divs', () => {
      const tree = makeElement({
        selector: '.container',
        children: [
          makeElement({
            selector: '.panel-a',
            tag: 'div',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            computed: { display: 'block' },
          }),
          makeElement({
            selector: '.panel-b',
            tag: 'div',
            bounds: { x: 100, y: 50, w: 200, h: 200 },
            computed: { position: 'absolute' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      // No compound control context — neither element is a form control
      expect(issues[0].context?.compoundControl).toBeUndefined();
    });

    it('does not downgrade when the "icon" is larger than 32px', () => {
      const tree = makeElement({
        selector: '.form-group',
        children: [
          makeElement({
            selector: 'input.text-input',
            tag: 'input',
            bounds: { x: 0, y: 0, w: 300, h: 40 },
            computed: { display: 'block' },
          }),
          makeElement({
            selector: '.big-overlay',
            tag: 'div',
            bounds: { x: 200, y: 0, w: 100, h: 40 },
            computed: { position: 'absolute' },
            // 100x40 — too large (both dimensions exceed 32px) to be a compound control icon
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      // Should NOT have compound control context — the "icon" is too large
      expect(issues[0].context?.compoundControl).toBeUndefined();
    });
  });

  // ── Fix 2b: Stacking layer context ──

  describe('stacking layer context (Fix 2b)', () => {
    it('reports warning when both siblings are position:fixed and cover >80% viewport', () => {
      // Two full-viewport fixed elements: canvas bg + modal backdrop
      const tree = makeElement({
        selector: '.app',
        children: [
          makeElement({
            selector: '.canvas-bg',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'fixed', zIndex: '1' },
          }),
          makeElement({
            selector: '.modal-backdrop',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'fixed', zIndex: '100' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
    });

    it('includes context.stackingLayers in the issue', () => {
      const tree = makeElement({
        selector: '.app',
        children: [
          makeElement({
            selector: '.bg-layer',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'fixed', zIndex: '1' },
          }),
          makeElement({
            selector: '.overlay-layer',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'fixed', zIndex: '50' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].context).toBeDefined();
      expect(issues[0].context?.stackingLayers).toBe('true');
    });

    it('still reports error when only ONE sibling is position:fixed', () => {
      const tree = makeElement({
        selector: '.app',
        children: [
          makeElement({
            selector: '.fixed-bg',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'fixed', zIndex: '1' },
          }),
          makeElement({
            selector: '.absolute-panel',
            bounds: { x: 0, y: 0, w: 1280, h: 800 },
            computed: { position: 'absolute', zIndex: '1' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      // Same z-index, 100% overlap => error by existing logic
      // Only one is fixed, so NOT stacking layers
      expect(issues[0].context?.stackingLayers).toBeUndefined();
    });

    it('still reports error for two position:fixed elements that are small (not full-viewport)', () => {
      const tree = makeElement({
        selector: '.app',
        children: [
          makeElement({
            selector: '.small-fixed-a',
            bounds: { x: 10, y: 10, w: 100, h: 100 },
            computed: { position: 'fixed', zIndex: '1' },
          }),
          makeElement({
            selector: '.small-fixed-b',
            bounds: { x: 50, y: 50, w: 100, h: 100 },
            computed: { position: 'fixed', zIndex: '1' },
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      // Both fixed but small (100x100 = 10000, viewport = 1024000 => ~1%)
      // NOT stacking layers, should remain error (same z-index, significant overlap)
      expect(issues[0].severity).toBe('error');
      expect(issues[0].context?.stackingLayers).toBeUndefined();
    });
  });

  // ── FOLLOWUP-011 C1: Negative margin alignment ──

  describe('negative margin alignment (C1)', () => {
    it('14. negative margin matching overlap + overlap < 50% → warning with negativeMargin context', () => {
      const tree = makeElement({
        selector: '.parent',
        children: [
          makeElement({
            selector: '.a',
            bounds: { x: 0, y: 0, w: 100, h: 100 },
            computed: { position: 'absolute' },
          }),
          makeElement({
            selector: '.b',
            bounds: { x: 80, y: 0, w: 100, h: 100 },
            computed: { position: 'absolute', marginLeft: '-20px' },
            // overlapX = min(100,180) - max(0,80) = 100-80 = 20
            // overlapY = 100
            // overlapArea = 20*100 = 2000, smallerArea = 10000 => 20% < 50%
            // marginLeft = -20px, overlapX = 20 => |abs(-20) - 20| = 0 <= 2 => match
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].context?.negativeMargin).toBe('true');
    });

    it('15. negative margin but overlap > 50% → still error', () => {
      const tree = makeElement({
        selector: '.parent',
        children: [
          makeElement({
            selector: '.a',
            bounds: { x: 0, y: 0, w: 100, h: 100 },
            computed: { position: 'absolute' },
          }),
          makeElement({
            selector: '.b',
            bounds: { x: 20, y: 0, w: 100, h: 100 },
            computed: { position: 'absolute', marginLeft: '-80px' },
            // overlapX = min(100,120) - max(0,20) = 100-20 = 80
            // overlapY = 100
            // overlapArea = 80*100 = 8000, smallerArea = 10000 => 80% > 50%
            // Even though negative margin matches, overlap too large
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('error');
    });
  });

  // ── FOLLOWUP-011 C2: pointer-events:none ──

  describe('pointer-events:none visual-only layer (C2)', () => {
    it('16. pointer-events:none on one sibling → warning with visualOnlyLayer context', () => {
      const tree = makeElement({
        selector: '.parent',
        children: [
          makeElement({
            selector: '.base-layer',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            computed: { position: 'absolute' },
          }),
          makeElement({
            selector: '.decorative-overlay',
            bounds: { x: 0, y: 0, w: 200, h: 200 },
            computed: { position: 'absolute', pointerEvents: 'none' },
            // 100% overlap but pointer-events:none → visual-only, no interactive conflict
          }),
        ],
      });
      const issues = checkSiblingOverlap(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].context?.visualOnlyLayer).toBe('true');
    });
  });
});
