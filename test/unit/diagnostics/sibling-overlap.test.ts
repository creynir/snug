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
});
