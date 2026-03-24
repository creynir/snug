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

describe('detectAxis', () => {
  it('detects horizontal layout', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 0, w: 100, h: 40 } }),
      makeElement({ bounds: { x: 120, y: 0, w: 100, h: 40 } }),
      makeElement({ bounds: { x: 240, y: 0, w: 100, h: 40 } }),
    ];
    expect(detectAxis(siblings)).toBe('horizontal');
  });

  it('detects vertical layout', () => {
    const siblings = [
      makeElement({ bounds: { x: 0, y: 0, w: 300, h: 60 } }),
      makeElement({ bounds: { x: 0, y: 80, w: 300, h: 60 } }),
      makeElement({ bounds: { x: 0, y: 160, w: 300, h: 60 } }),
    ];
    expect(detectAxis(siblings)).toBe('vertical');
  });
});

describe('computeMode', () => {
  it('finds the mode of a simple set', () => {
    expect(computeMode([16, 16, 16, 48, 16], 2)).toBe(16);
  });

  it('handles tolerance grouping', () => {
    // 15, 16, 17 should group together (within tolerance 2)
    expect(computeMode([15, 16, 17, 40], 2)).toBe(16); // median of group
  });
});

describe('checkSpacingAnomaly', () => {
  it('returns no issues for consistent spacing', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.d', bounds: { x: 348, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects spacing outlier', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 116, y: 0, w: 100, h: 40 } }), // gap 16
        makeElement({ selector: '.c', bounds: { x: 232, y: 0, w: 100, h: 40 } }), // gap 16
        makeElement({ selector: '.d', bounds: { x: 388, y: 0, w: 100, h: 40 } }), // gap 56 ← outlier
        makeElement({ selector: '.e', bounds: { x: 504, y: 0, w: 100, h: 40 } }), // gap 16
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('spacing-anomaly');
    expect(issues[0].data?.mode).toBe(16);
  });

  it('skips groups with fewer than 3 siblings', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 40 } }),
        makeElement({ selector: '.b', bounds: { x: 200, y: 0, w: 100, h: 40 } }),
      ],
    });
    const issues = checkSpacingAnomaly(tree, viewport);
    expect(issues).toEqual([]);
  });
});
