import { describe, it, expect } from 'vitest';
import { checkSpacingAnomaly, detectAxis, computeMode } from '../../../src/diagnostics/spacing-anomaly.js';
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
// detectAxis
// ──────────────────────────────────────────

describe('detectAxis', () => {
  it('detects horizontal layout when xRange > yRange', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 0, w: 100, h: 40 } }),
      makeElement({ bounds: { x: 120, y: 0, w: 100, h: 40 } }),
      makeElement({ bounds: { x: 240, y: 0, w: 100, h: 40 } }),
    ];
    // xRange = 240 - 0 = 240, yRange = 0 - 0 = 0
    expect(detectAxis(siblings)).toBe('horizontal');
  });

  it('detects vertical layout when yRange > xRange', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 0, w: 300, h: 60 } }),
      makeElement({ bounds: { x: 0, y: 80, w: 300, h: 60 } }),
      makeElement({ bounds: { x: 0, y: 160, w: 300, h: 60 } }),
    ];
    // xRange = 0 - 0 = 0, yRange = 160 - 0 = 160
    expect(detectAxis(siblings)).toBe('vertical');
  });

  it('returns vertical when xRange equals yRange', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 0, w: 50, h: 50 } }),
      makeElement({ bounds: { x: 100, y: 100, w: 50, h: 50 } }),
      makeElement({ bounds: { x: 200, y: 200, w: 50, h: 50 } }),
    ];
    // xRange = 200, yRange = 200 — equal, spec says if xRange > yRange => horizontal, else vertical
    expect(detectAxis(siblings)).toBe('vertical');
  });

  it('handles elements with slight y-variation in a horizontal layout', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 2, w: 80, h: 40 } }),
      makeElement({ bounds: { x: 100, y: 0, w: 80, h: 40 } }),
      makeElement({ bounds: { x: 200, y: 3, w: 80, h: 40 } }),
    ];
    // xRange = 200, yRange = 3
    expect(detectAxis(siblings)).toBe('horizontal');
  });

  it('handles elements with slight x-variation in a vertical layout', () => {
    const siblings = [
      makeElement({ bounds: { x: 2, y: 0, w: 200, h: 40 } }),
      makeElement({ bounds: { x: 0, y: 60, w: 200, h: 40 } }),
      makeElement({ bounds: { x: 1, y: 120, w: 200, h: 40 } }),
    ];
    // xRange = 2, yRange = 120
    expect(detectAxis(siblings)).toBe('vertical');
  });
});

// ──────────────────────────────────────────
// computeMode
// ──────────────────────────────────────────

describe('computeMode', () => {
  it('finds the mode of a uniform set', () => {
    expect(computeMode([16, 16, 16, 16], 2)).toBe(16);
  });

  it('finds the mode with one outlier', () => {
    expect(computeMode([16, 16, 16, 48, 16], 2)).toBe(16);
  });

  it('handles tolerance grouping within 2px', () => {
    // 15, 16, 17 should group together (within tolerance 2 from first)
    const result = computeMode([15, 16, 17, 40], 2);
    expect(result).toBe(16); // median of [15, 16, 17]
  });

  it('returns median of the largest group', () => {
    // Two groups: [10, 11, 12] and [30, 31]
    const result = computeMode([10, 11, 12, 30, 31], 2);
    expect(result).toBe(11); // median of [10, 11, 12]
  });

  it('handles single value', () => {
    expect(computeMode([20], 2)).toBe(20);
  });

  it('handles two equal values', () => {
    expect(computeMode([10, 10], 2)).toBe(10);
  });

  it('handles values already sorted', () => {
    expect(computeMode([5, 5, 5, 20, 20], 2)).toBe(5);
  });

  it('handles unsorted input correctly', () => {
    // Should still find the mode regardless of input order
    const result = computeMode([48, 16, 16, 16, 48], 2);
    expect(result).toBe(16);
  });

  it('handles all different values with no grouping possible', () => {
    // [10, 20, 30] — each forms its own group of size 1
    const result = computeMode([10, 20, 30], 2);
    // Should return one of them (likely the first encountered largest group)
    expect(typeof result).toBe('number');
  });

  it('handles negative gaps', () => {
    // Negative gaps can occur when siblings overlap
    const result = computeMode([-5, -5, -5, 10], 2);
    expect(result).toBe(-5);
  });
});

// ──────────────────────────────────────────
// checkSpacingAnomaly
// ──────────────────────────────────────────

describe('checkSpacingAnomaly', () => {
  // ── Happy path ──

  it('returns no issues for consistent horizontal spacing', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.d', bounds: { x: 348, y: 0, w: 100, h: 40 } }),  // gap 16
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for consistent vertical spacing', () => {
    const tree = makeElement({
      selector: '.column',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 300, h: 50 } }),
        makeElement({ selector: '.b', bounds: { x: 0, y: 70, w: 300, h: 50 } }),   // gap 20
        makeElement({ selector: '.c', bounds: { x: 0, y: 140, w: 300, h: 50 } }),  // gap 20
        makeElement({ selector: '.d', bounds: { x: 0, y: 210, w: 300, h: 50 } }),  // gap 20
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Skip parents with fewer than 3 children ──

  it('skips parents with fewer than 3 children', () => {
    const tree = makeElement({
      selector: '.pair',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 200, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parents with exactly 2 children', () => {
    const tree = makeElement({
      selector: '.two',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 300, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parents with 1 child', () => {
    const tree = makeElement({
      selector: '.single',
      children: [
        makeElement({ selector: '.only', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parents with no children', () => {
    const tree = makeElement({ selector: '.empty', children: [] });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Outlier detection ──

  it('detects a spacing outlier in horizontal layout', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.d', bounds: { x: 388, y: 0, w: 100, h: 40 } }),  // gap 56 ← outlier
        makeElement({ selector: '.e', bounds: { x: 504, y: 0, w: 100, h: 40 } }),  // gap 16
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('spacing-anomaly');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].data?.mode).toBe(16);
    expect(issues[0].data?.gap).toBe(56);
    expect(issues[0].data?.deviation).toBe(40); // 56 - 16
  });

  it('detects a spacing outlier in vertical layout', () => {
    const tree = makeElement({
      selector: '.column',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 300, h: 50 } }),
        makeElement({ selector: '.b', bounds: { x: 0, y: 70, w: 300, h: 50 } }),   // gap 20
        makeElement({ selector: '.c', bounds: { x: 0, y: 140, w: 300, h: 50 } }),  // gap 20
        makeElement({ selector: '.d', bounds: { x: 0, y: 260, w: 300, h: 50 } }),  // gap 70 ← outlier
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('spacing-anomaly');
    expect(issues[0].data?.gap).toBe(70);
    expect(issues[0].data?.mode).toBe(20);
  });

  it('detects multiple outliers', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.c', bounds: { x: 272, y: 0, w: 100, h: 40 } }),  // gap 56 ← outlier
        makeElement({ selector: '.d', bounds: { x: 388, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.e', bounds: { x: 548, y: 0, w: 100, h: 40 } }),  // gap 60 ← outlier
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(2);
  });

  // ── Deviation threshold: max(4px, mode * 0.2) ──

  it('does not flag deviation within max(4, mode * 0.2) threshold', () => {
    // mode = 20, threshold = max(4, 20*0.2) = max(4, 4) = 4
    // deviation of 4 should NOT be flagged (threshold is strict >)
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 120, y: 0, w: 100, h: 40 } }),   // gap 20
        makeElement({ selector: '.c', bounds: { x: 240, y: 0, w: 100, h: 40 } }),   // gap 20
        makeElement({ selector: '.d', bounds: { x: 364, y: 0, w: 100, h: 40 } }),   // gap 24 (deviation=4)
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('flags deviation exceeding max(4, mode * 0.2) threshold', () => {
    // mode = 20, threshold = max(4, 4) = 4
    // deviation of 5 > 4 => flagged
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 120, y: 0, w: 100, h: 40 } }),   // gap 20
        makeElement({ selector: '.c', bounds: { x: 240, y: 0, w: 100, h: 40 } }),   // gap 20
        makeElement({ selector: '.d', bounds: { x: 365, y: 0, w: 100, h: 40 } }),   // gap 25 (deviation=5)
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.deviation).toBe(5);
  });

  it('uses 4px minimum threshold for small mode values', () => {
    // mode = 2, threshold = max(4, 2*0.2) = max(4, 0.4) = 4
    // deviation of 4 should NOT be flagged
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 102, y: 0, w: 100, h: 40 } }),   // gap 2
        makeElement({ selector: '.c', bounds: { x: 204, y: 0, w: 100, h: 40 } }),   // gap 2
        makeElement({ selector: '.d', bounds: { x: 308, y: 0, w: 100, h: 40 } }),   // gap 4 (deviation=2 < 4)
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('uses 20% of mode as threshold when mode is large', () => {
    // mode = 100, threshold = max(4, 100*0.2) = max(4, 20) = 20
    // deviation of 21 > 20 => flagged
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 50, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 150, y: 0, w: 50, h: 40 } }),    // gap 100
        makeElement({ selector: '.c', bounds: { x: 300, y: 0, w: 50, h: 40 } }),    // gap 100
        makeElement({ selector: '.d', bounds: { x: 471, y: 0, w: 50, h: 40 } }),    // gap 121 (deviation=21)
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
  });

  // ── Issue data fields ──

  it('includes gap, mode, and deviation in data', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.d', bounds: { x: 400, y: 0, w: 100, h: 40 } }),  // gap 68 ← outlier
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.gap).toBe(68);
    expect(issues[0].data?.mode).toBe(16);
    expect(issues[0].data?.deviation).toBe(52);
  });

  it('sets element to the second sibling and element2 to the first in the pair', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),  // gap 16
        makeElement({ selector: '.outlier', bounds: { x: 400, y: 0, w: 100, h: 40 } }),  // gap 68
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.outlier');   // between[1]
    expect(issues[0].element2).toBe('.c');         // between[0]
  });

  it('has a non-empty detail string', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.d', bounds: { x: 400, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(typeof issues[0].detail).toBe('string');
    expect(issues[0].detail.length).toBeGreaterThan(0);
  });

  // ── Severity ──

  it('always reports warning severity for spacing anomalies', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.d', bounds: { x: 500, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  // ── Recursive detection ──

  it('checks spacing recursively in nested elements', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({
          selector: '.wrapper',
          children: [
            makeElement({ selector: '.nested-a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
            makeElement({ selector: '.nested-b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),  // gap 16
            makeElement({ selector: '.nested-c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),  // gap 16
            makeElement({ selector: '.nested-d', bounds: { x: 400, y: 0, w: 100, h: 40 } }),  // gap 68
          ],
        }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.nested-d');
  });

  // ── Edge cases ──

  it('handles exactly 3 children with consistent spacing', () => {
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 120, y: 0, w: 100, h: 40 } }),  // gap 20
        makeElement({ selector: '.c', bounds: { x: 240, y: 0, w: 100, h: 40 } }),  // gap 20
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('handles negative gaps (overlapping siblings)', () => {
    // All gaps are negative and consistent, so no anomaly
    const tree = makeElement({
      selector: '.row',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 90, y: 0, w: 100, h: 40 } }),   // gap -10
        makeElement({ selector: '.c', bounds: { x: 180, y: 0, w: 100, h: 40 } }),  // gap -10
        makeElement({ selector: '.d', bounds: { x: 270, y: 0, w: 100, h: 40 } }),  // gap -10
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });
});
