import { describe, it, expect } from 'vitest';
import { checkContainment } from '../../../src/diagnostics/containment.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.parent',
    tag: 'div',
    bounds: { x: 100, y: 100, w: 400, h: 300 },
    children: [],
    ...overrides,
  };
}

describe('checkContainment', () => {
  it('returns no issues when children are contained', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.child', bounds: { x: 120, y: 120, w: 200, h: 100 }, children: [] }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects child overflowing parent on left and top', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.escaped',
          bounds: { x: 70, y: 80, w: 200, h: 100 },
          computed: { position: 'absolute', left: '-30px', top: '-20px' },
          children: [],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('containment');
    expect(issues[0].data?.overflowLeft).toBe(30);
    expect(issues[0].data?.overflowTop).toBe(20);
  });

  it('skips parent with overflow:hidden (intentional clipping)', () => {
    const tree = makeElement({
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.clipped',
          bounds: { x: 50, y: 50, w: 600, h: 400 },
          children: [],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('uses 1px tolerance for rounding', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.near-edge',
          bounds: { x: 99, y: 100, w: 200, h: 100 }, // 1px over — within tolerance
          children: [],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });
});
