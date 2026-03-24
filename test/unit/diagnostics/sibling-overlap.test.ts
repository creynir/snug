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

describe('parseZIndex', () => {
  it('treats auto as 0', () => {
    expect(parseZIndex('auto')).toBe(0);
  });
  it('treats undefined as 0', () => {
    expect(parseZIndex(undefined)).toBe(0);
  });
  it('parses numeric strings', () => {
    expect(parseZIndex('5')).toBe(5);
    expect(parseZIndex('10')).toBe(10);
  });
});

describe('checkSiblingOverlap', () => {
  it('returns no issues for non-overlapping siblings', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 100, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: 120, y: 0, w: 100, h: 100 } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects overlapping siblings with same z-index as error', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 }, computed: { position: 'absolute' } }),
        makeElement({ selector: '.b', bounds: { x: 150, y: 50, w: 200, h: 200 }, computed: { position: 'absolute' } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('sibling-overlap');
    expect(issues[0].severity).toBe('error'); // same z-index (auto)
    expect(issues[0].data?.sameZIndex).toBe(true);
  });

  it('detects overlapping siblings with different z-index as warning', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.base', bounds: { x: 0, y: 0, w: 300, h: 200 }, computed: { position: 'absolute', zIndex: '1' } }),
        makeElement({ selector: '.top', bounds: { x: 100, y: 50, w: 300, h: 200 }, computed: { position: 'absolute', zIndex: '10' } }),
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning'); // different z-index
    expect(issues[0].data?.sameZIndex).toBe(false);
  });

  it('skips trivial overlaps (< 1% of smaller element)', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 200, h: 200 } }),
        makeElement({ selector: '.b', bounds: { x: 198, y: 0, w: 200, h: 200 } }), // 2px overlap on 40000px² — trivial
      ],
    });
    const issues = checkSiblingOverlap(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('checks overlap recursively in nested elements', () => {
    const tree = makeElement({
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
});
