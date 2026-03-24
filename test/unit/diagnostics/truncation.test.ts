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
  // ── Happy path ──

  it('returns no issues for elements without scroll data', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.normal' }),
        makeElement({ selector: '.another' }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when scroll dimensions match client dimensions', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.fits',
          scroll: { scrollWidth: 200, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for empty tree', () => {
    const tree = makeElement({ selector: '.empty', children: [] });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Horizontal truncation detection ──

  it('detects horizontal truncation with overflow:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.h-truncated',
          scroll: { scrollWidth: 340, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden', textOverflow: 'ellipsis', width: '200px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].element).toBe('.h-truncated');
    expect(issues[0].data?.clippedPx).toBe(140); // 340 - 200
  });

  it('detects horizontal truncation with overflowX:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.x-hidden',
          scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflowX: 'hidden', width: '200px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
    expect(issues[0].data?.scrollWidth).toBe(500);
    expect(issues[0].data?.clientWidth).toBe(200);
    expect(issues[0].data?.clippedPx).toBe(300);
  });

  // ── Vertical truncation detection ──

  it('detects vertical truncation with overflow:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.v-truncated',
          bounds: { x: 0, y: 0, w: 300, h: 48 },
          scroll: { scrollWidth: 300, scrollHeight: 96, clientWidth: 300, clientHeight: 48 },
          computed: { overflow: 'hidden', height: '48px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
    expect(issues[0].severity).toBe('warning');
  });

  it('detects vertical truncation with overflowY:hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.y-hidden',
          scroll: { scrollWidth: 200, scrollHeight: 100, clientWidth: 200, clientHeight: 48 },
          computed: { overflowY: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('truncation');
  });

  // ── Both horizontal and vertical truncation ──

  it('detects both horizontal and vertical truncation simultaneously', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.both-clipped',
          scroll: { scrollWidth: 400, scrollHeight: 100, clientWidth: 200, clientHeight: 50 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    // Should have two issues: one horizontal, one vertical
    expect(issues.length).toBe(2);
    expect(issues.every(i => i.type === 'truncation')).toBe(true);
    expect(issues.every(i => i.severity === 'warning')).toBe(true);
  });

  // ── Non-hidden overflow modes should not trigger ──

  it('does not flag truncation when overflow is auto (scrollbar available)', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.scrollable',
          scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'auto' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('does not flag truncation when overflow is scroll', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.with-scrollbar',
          scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'scroll' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('does not flag truncation when overflow is visible', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.visible-overflow',
          scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'visible' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('does not flag horizontal truncation when overflowX is auto but detects vertical if overflowY is hidden', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.mixed-overflow',
          scroll: { scrollWidth: 500, scrollHeight: 100, clientWidth: 200, clientHeight: 50 },
          computed: { overflowX: 'auto', overflowY: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    // Only vertical truncation should be flagged
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.mixed-overflow');
  });

  // ── Recursive detection ──

  it('detects truncation in deeply nested elements', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({
          selector: '.wrapper',
          children: [
            makeElement({
              selector: '.deep-truncated',
              scroll: { scrollWidth: 400, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
              computed: { overflow: 'hidden' },
            }),
          ],
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.deep-truncated');
  });

  it('detects truncation at multiple tree levels', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({
          selector: '.level1',
          scroll: { scrollWidth: 300, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
          children: [
            makeElement({
              selector: '.level2',
              scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 150, clientHeight: 24 },
              computed: { overflow: 'hidden' },
            }),
          ],
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(2);
    expect(issues.some(i => i.element === '.level1')).toBe(true);
    expect(issues.some(i => i.element === '.level2')).toBe(true);
  });

  // ── Issue data fields ──

  it('includes scroll dimensions and clippedPx in data', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.truncated',
          scroll: { scrollWidth: 340, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.scrollWidth).toBe(340);
    expect(issues[0].data?.clientWidth).toBe(200);
    expect(issues[0].data?.clippedPx).toBe(140);
  });

  it('includes computed styles in the issue', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.styled',
          scroll: { scrollWidth: 400, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '200px' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].computed).toBeDefined();
  });

  it('includes a non-empty detail string', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.truncated',
          scroll: { scrollWidth: 340, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(typeof issues[0].detail).toBe('string');
    expect(issues[0].detail.length).toBeGreaterThan(0);
  });

  // ── Severity ──

  it('always reports warning severity for truncation', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.severe',
          scroll: { scrollWidth: 2000, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  // ── Edge cases ──

  it('handles element where scrollWidth equals clientWidth (no truncation)', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.exact-fit',
          scroll: { scrollWidth: 200, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
          computed: { overflow: 'hidden' },
        }),
      ],
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects truncation in the root element itself if it has scroll data', () => {
    const tree = makeElement({
      selector: '.root-truncated',
      scroll: { scrollWidth: 500, scrollHeight: 24, clientWidth: 200, clientHeight: 24 },
      computed: { overflow: 'hidden' },
    });
    const issues = checkTruncation(tree, viewport);
    expect(issues.some(i => i.element === '.root-truncated')).toBe(true);
  });
});
