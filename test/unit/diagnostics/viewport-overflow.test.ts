import { describe, it, expect } from 'vitest';
import { checkViewportOverflow } from '../../../src/diagnostics/viewport-overflow.js';
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

describe('checkViewportOverflow', () => {
  it('returns no issues for elements within viewport', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.child', bounds: { x: 0, y: 0, w: 800, h: 400 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects element overflowing right edge', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.wide', bounds: { x: 0, y: 0, w: 1500, h: 200 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('viewport-overflow');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].data?.overflowX).toBe(220); // 1500 - 1280
  });

  it('detects element overflowing left edge', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.shifted', bounds: { x: -50, y: 0, w: 300, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('viewport-overflow');
  });

  it('detects overflow in nested elements', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.parent',
          children: [
            makeElement({ selector: '.deep-wide', bounds: { x: 1000, y: 0, w: 500, h: 100 } }),
          ],
        }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.some(i => i.element === '.deep-wide')).toBe(true);
  });
});
