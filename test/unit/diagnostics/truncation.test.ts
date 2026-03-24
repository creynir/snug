import { describe, it, expect } from 'vitest';
import { checkTruncation } from '../../../src/diagnostics/truncation.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 200, h: 24 },
    children: [],
    ...overrides,
  };
}

describe('checkTruncation', () => {
  it('returns no issues for elements without scroll overflow', () => {
    const tree = makeElement({ children: [makeElement({ selector: '.normal' })] });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects horizontal truncation with overflow:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.truncated',
          scroll: { scrollWidth: 340, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden', textOverflow: 'ellipsis', width: '200px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
    expect(issues[0].data?.clippedPx).toBe(140);
  });

  it('detects vertical truncation', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.clamped',
          bounds: { x: 0, y: 0, w: 300, h: 48 },
          scroll: { scrollWidth: 300, scrollHeight: 96, clientWidth: 300, clientHeight: 48 },
          computed: { overflow: 'hidden', height: '48px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
  });

  it('ignores scroll overflow without overflow:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.scrollable',
          scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'auto' }, // auto = scrollbar, not clipped
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });
});
