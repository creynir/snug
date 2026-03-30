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
  // ── Happy path ──

  it('returns no issues when all elements fit within viewport', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({ selector: '.hero', bounds: { x: 0, y: 0, w: 800, h: 400 } }),
        makeElement({ selector: '.sidebar', bounds: { x: 800, y: 0, w: 480, h: 400 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for element exactly at viewport width boundary', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({ selector: '.exact', bounds: { x: 0, y: 0, w: 1280, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for an element at x=0 with zero width', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.empty', bounds: { x: 0, y: 0, w: 0, h: 0 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Right overflow detection ──

  it('detects element overflowing viewport right edge', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.wide', bounds: { x: 0, y: 0, w: 1500, h: 200 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find(i => i.element === '.wide');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('viewport-overflow');
    expect(issue!.severity).toBe('error');
    expect(issue!.data?.overflowX).toBe(220); // 1500 - 1280
  });

  it('detects right overflow when element is positioned past viewport', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.offset', bounds: { x: 1200, y: 0, w: 200, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find(i => i.element === '.offset');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('viewport-overflow');
    expect(issue!.severity).toBe('error');
    expect(issue!.data?.overflowX).toBe(120); // 1200 + 200 - 1280
  });

  it('detects right overflow by just 1px', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.barely', bounds: { x: 0, y: 0, w: 1281, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find(i => i.element === '.barely');
    expect(issue).toBeDefined();
    expect(issue!.data?.overflowX).toBe(1);
  });

  // ── Left overflow detection ──

  it('detects element overflowing viewport left edge', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.shifted', bounds: { x: -50, y: 0, w: 300, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find(i => i.element === '.shifted');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('viewport-overflow');
    expect(issue!.severity).toBe('error');
  });

  it('detects left overflow by exactly 1px', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.nudge', bounds: { x: -1, y: 0, w: 100, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some(i => i.element === '.nudge')).toBe(true);
  });

  // ── Both edges simultaneously ──

  it('detects element overflowing both left and right edges', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.huge', bounds: { x: -100, y: 0, w: 2000, h: 200 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    // Should have at least two issues for .huge: left AND right overflow
    const hugeIssues = issues.filter(i => i.element === '.huge');
    expect(hugeIssues.length).toBeGreaterThanOrEqual(2);
    expect(hugeIssues.every(i => i.type === 'viewport-overflow')).toBe(true);
    expect(hugeIssues.every(i => i.severity === 'error')).toBe(true);
  });

  // ── Vertical overflow is NOT flagged ──

  it('does not flag vertical overflow (scrollable pages are normal)', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 5000 },
      children: [
        makeElement({ selector: '.tall', bounds: { x: 0, y: 0, w: 800, h: 3000 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('does not flag element below viewport fold', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.below', bounds: { x: 0, y: 900, w: 500, h: 500 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Recursive detection ──

  it('detects overflow in deeply nested elements', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.level-1',
          children: [
            makeElement({
              selector: '.level-2',
              children: [
                makeElement({
                  selector: '.deep-wide',
                  bounds: { x: 1000, y: 0, w: 500, h: 100 },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.some(i => i.element === '.deep-wide')).toBe(true);
  });

  it('detects overflow in the root element itself', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1500, h: 800 },
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.some(i => i.element === 'body')).toBe(true);
  });

  it('flags multiple elements that each overflow independently', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.a', bounds: { x: 0, y: 0, w: 1400, h: 100 } }),
        makeElement({ selector: '.b', bounds: { x: -20, y: 200, w: 100, h: 100 } }),
        makeElement({ selector: '.c', bounds: { x: 1100, y: 400, w: 300, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues.some(i => i.element === '.a')).toBe(true);
    expect(issues.some(i => i.element === '.b')).toBe(true);
    expect(issues.some(i => i.element === '.c')).toBe(true);
  });

  // ── Issue data fields ──

  it('includes computed styles in the issued report', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.styled',
          bounds: { x: 0, y: 0, w: 1500, h: 200 },
          computed: { width: '1500px', position: 'absolute' },
        }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    const issue = issues.find(i => i.element === '.styled');
    expect(issue).toBeDefined();
    expect(issue!.computed).toBeDefined();
  });

  it('includes a human-readable detail string', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.wide', bounds: { x: 0, y: 0, w: 1500, h: 100 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, viewport);
    const issue = issues.find(i => i.element === '.wide');
    expect(issue).toBeDefined();
    expect(typeof issue!.detail).toBe('string');
    expect(issue!.detail.length).toBeGreaterThan(0);
  });

  // ── Empty tree ──

  it('returns no issues for a leaf element within viewport', () => {
    const tree = makeElement({ selector: '.leaf', bounds: { x: 10, y: 10, w: 50, h: 50 } });
    const issues = checkViewportOverflow(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Different viewport sizes ──

  it('respects different viewport width values', () => {
    const narrowViewport: Viewport = { width: 375, height: 667 };
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.card', bounds: { x: 0, y: 0, w: 400, h: 200 } }),
      ],
    });
    const issues = checkViewportOverflow(tree, narrowViewport);
    expect(issues.some(i => i.element === '.card')).toBe(true);
    expect(issues.find(i => i.element === '.card')!.data?.overflowX).toBe(25);
  });

  // ── A4: SVG child skip ──

  describe('SVG subtree skip (A4)', () => {
    it('does not flag <rect> inside <svg> extending beyond viewport', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: 'svg.chart',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 800, h: 400 },
            children: [
              makeElement({
                selector: 'rect.bar',
                tag: 'rect',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
                // Extends beyond viewport at 1280px — but it's inside an SVG,
                // so its bounds are SVG coordinate space, not document layout.
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const rectIssues = issues.filter(i => i.element === 'rect.bar');
      expect(rectIssues).toEqual([]);
    });

    it('does not flag <path> inside <svg> extending beyond viewport', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: 'svg.line-chart',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 600, h: 300 },
            children: [
              makeElement({
                selector: 'path.line',
                tag: 'path',
                bounds: { x: -100, y: 0, w: 1600, h: 300 },
                // Overflows both left and right — but inside SVG subtree
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const pathIssues = issues.filter(i => i.element === 'path.line');
      expect(pathIssues).toEqual([]);
    });

    it('still flags <div> extending beyond viewport (not SVG child)', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.wide-div',
            tag: 'div',
            bounds: { x: 0, y: 0, w: 1500, h: 200 },
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      expect(issues.some(i => i.element === '.wide-div')).toBe(true);
    });

    it('still flags <svg> element itself extending beyond viewport', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: 'svg.oversized',
            tag: 'svg',
            bounds: { x: 0, y: 0, w: 1500, h: 400 },
            // The SVG element itself overflows — this should be flagged.
            // Only children inside SVG are skipped.
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      expect(issues.some(i => i.element === 'svg.oversized')).toBe(true);
    });
  });

  // ── Clipping-ancestor context (FOLLOWUP-001 Change 2) ──

  describe('clipping-ancestor context', () => {
    it('reports error for overflow with no clipping ancestor (existing behavior)', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.wide',
            bounds: { x: 0, y: 0, w: 1500, h: 200 },
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
      expect(issue!.context).toBeUndefined();
    });

    it('reports warning (not error) for overflow inside overflow:hidden parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clipping-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.clipped-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.clipped-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('reports warning for overflow inside overflow:scroll parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.scroll-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'scroll' },
            children: [
              makeElement({
                selector: '.scrolled-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.scrolled-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('reports warning for overflow inside overflow:auto parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.auto-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'auto' },
            children: [
              makeElement({
                selector: '.auto-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.auto-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('includes context.clippedBy with the clipping ancestor selector', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clipping-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.clipped-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.clipped-wide');
      expect(issue).toBeDefined();
      expect(issue!.context).toBeDefined();
      expect(issue!.context!.clippedBy).toBe('.clipping-wrapper');
    });

    it('detail string mentions the clipping ancestor', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clipping-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.clipped-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.clipped-wide');
      expect(issue).toBeDefined();
      expect(issue!.detail).toContain('.clipping-wrapper');
    });

    it('clipping context propagates through multiple nesting levels', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.grandparent',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.parent',
                bounds: { x: 0, y: 0, w: 800, h: 200 },
                children: [
                  makeElement({
                    selector: '.grandchild',
                    bounds: { x: 0, y: 0, w: 1500, h: 200 },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.grandchild');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.context).toBeDefined();
    });

    it('element with its own overflow:hidden that also overflows viewport is still error', () => {
      // The element IS the clipping root, not clipped BY an ancestor
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.self-clipping',
            bounds: { x: 0, y: 0, w: 1500, h: 200 },
            computed: { overflow: 'hidden' },
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.self-clipping');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('multiple clipping ancestors: uses the nearest one', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.outer-clip',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.inner-clip',
                bounds: { x: 0, y: 0, w: 800, h: 200 },
                computed: { overflow: 'hidden' },
                children: [
                  makeElement({
                    selector: '.deep-wide',
                    bounds: { x: 0, y: 0, w: 1500, h: 200 },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.deep-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.context).toBeDefined();
      expect(issue!.context!.clippedBy).toBe('.inner-clip');
    });

    // ── FOLLOWUP-010: clipping ancestor straddling viewport edge ──

    it('downgrades to warning when clipping ancestor straddles viewport right edge', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clipping-straddle-right',
            bounds: { x: 1000, y: 0, w: 400, h: 200 }, // right edge at 1400, past viewport 1280
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.child-right',
                bounds: { x: 1000, y: 0, w: 500, h: 200 }, // overflows viewport
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.child-right');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.context).toBeDefined();
      expect(issue!.context!.clippedBy).toBe('.clipping-straddle-right');
    });

    it('downgrades to warning when clipping ancestor straddles viewport left edge', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clipping-straddle-left',
            bounds: { x: -100, y: 0, w: 600, h: 200 }, // starts before viewport
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.child-left',
                bounds: { x: -50, y: 0, w: 300, h: 200 }, // overflows left
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.child-left');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.context).toBeDefined();
      expect(issue!.context!.clippedBy).toBe('.clipping-straddle-left');
    });

    it('clipping ancestor straddles viewport — ancestor error, child warning', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.straddle-ancestor',
            bounds: { x: 1000, y: 0, w: 400, h: 200 }, // overflows viewport itself (right edge 1400)
            computed: { overflow: 'hidden' },
            children: [
              makeElement({
                selector: '.straddle-child',
                bounds: { x: 1000, y: 0, w: 500, h: 200 }, // also overflows viewport
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const ancestorIssue = issues.find(i => i.element === '.straddle-ancestor');
      expect(ancestorIssue).toBeDefined();
      expect(ancestorIssue!.severity).toBe('error'); // no clipping ancestor of its own
      const childIssue = issues.find(i => i.element === '.straddle-child');
      expect(childIssue).toBeDefined();
      expect(childIssue!.severity).toBe('warning'); // has clipping ancestor
    });

    it('downgrades to warning with overflow:auto when ancestor straddles viewport', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.auto-straddle',
            bounds: { x: 1000, y: 0, w: 400, h: 200 }, // right edge at 1400, past viewport
            computed: { overflow: 'auto' },
            children: [
              makeElement({
                selector: '.auto-straddle-child',
                bounds: { x: 1000, y: 0, w: 500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.auto-straddle-child');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.context).toBeDefined();
      expect(issue!.context!.clippedBy).toBe('.auto-straddle');
    });
  });

  // ── Off-screen parent suppression ──

  describe('off-screen parent suppression', () => {
    it('does not flag children when parent bounds are fully right of viewport (x >= viewport.width)', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.drawer',
            bounds: { x: 1400, y: 0, w: 600, h: 800 },
            children: [
              makeElement({
                selector: '.drawer-child-a',
                bounds: { x: 1420, y: 50, w: 200, h: 100 },
              }),
              makeElement({
                selector: '.drawer-child-b',
                bounds: { x: 1500, y: 200, w: 300, h: 100 },
              }),
            ],
          }),
        ],
      });

      const issues = checkViewportOverflow(tree, viewport);
      const childIssues = issues.filter(
        (i) => i.element === '.drawer-child-a' || i.element === '.drawer-child-b',
      );
      expect(childIssues).toEqual([]);
    });

    it('does not flag children when parent bounds are fully left of viewport (x + w <= 0)', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.offscreen-left',
            bounds: { x: -600, y: 0, w: 500, h: 400 },
            children: [
              makeElement({
                selector: '.left-child',
                bounds: { x: -550, y: 50, w: 200, h: 100 },
              }),
            ],
          }),
        ],
      });

      const issues = checkViewportOverflow(tree, viewport);
      const childIssues = issues.filter((i) => i.element === '.left-child');
      expect(childIssues).toEqual([]);
    });

    it('does not flag children when parent bounds are fully below viewport (y >= viewport.height)', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 2000 },
        children: [
          makeElement({
            selector: '.offscreen-below',
            bounds: { x: -100, y: 900, w: 1500, h: 400 },
            children: [
              makeElement({
                selector: '.below-child',
                bounds: { x: -50, y: 950, w: 1400, h: 200 },
              }),
            ],
          }),
        ],
      });

      const issues = checkViewportOverflow(tree, viewport);
      const childIssues = issues.filter((i) => i.element === '.below-child');
      expect(childIssues).toEqual([]);
    });

    it('still flags children when parent is partially on-screen', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.partially-visible',
            bounds: { x: 1100, y: 0, w: 600, h: 400 },
            children: [
              makeElement({
                selector: '.visible-child',
                bounds: { x: 1200, y: 50, w: 200, h: 100 },
              }),
            ],
          }),
        ],
      });

      const issues = checkViewportOverflow(tree, viewport);
      const childIssues = issues.filter((i) => i.element === '.visible-child');
      expect(childIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('still flags the off-screen parent element itself (only children suppressed)', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 800 },
        children: [
          makeElement({
            selector: '.drawer',
            bounds: { x: 1400, y: 0, w: 600, h: 800 },
            children: [
              makeElement({
                selector: '.drawer-item',
                bounds: { x: 1420, y: 50, w: 200, h: 100 },
              }),
            ],
          }),
        ],
      });

      const issues = checkViewportOverflow(tree, viewport);
      const parentIssues = issues.filter((i) => i.element === '.drawer');
      expect(parentIssues.length).toBeGreaterThanOrEqual(1);
      const childIssues = issues.filter((i) => i.element === '.drawer-item');
      expect(childIssues).toEqual([]);
    });
  });

  // ── FOLLOWUP-011 B1: overflow:clip as clipping ancestor ──

  describe('overflow:clip as clipping ancestor (B1)', () => {
    it('reports warning (not error) for overflow inside overflow:clip parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clip-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { overflow: 'clip' },
            children: [
              makeElement({
                selector: '.clipped-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.clipped-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });
  });

  // ── FOLLOWUP-011 B2: contain:paint/content/strict as clipping ancestor ──

  describe('contain:paint/content/strict as clipping ancestor (B2)', () => {
    it('reports warning for overflow inside contain:paint parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.contain-paint-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { contain: 'paint' },
            children: [
              makeElement({
                selector: '.contained-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.contained-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('reports warning for overflow inside contain:content parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.contain-content-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { contain: 'content' },
            children: [
              makeElement({
                selector: '.contained-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.contained-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('reports warning for overflow inside contain:strict parent', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.contain-strict-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { contain: 'strict' },
            children: [
              makeElement({
                selector: '.contained-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.contained-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('does NOT treat contain:layout as clipping ancestor (layout does not clip)', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.contain-layout-wrapper',
            bounds: { x: 0, y: 0, w: 800, h: 200 },
            computed: { contain: 'layout' },
            children: [
              makeElement({
                selector: '.not-clipped-wide',
                bounds: { x: 0, y: 0, w: 1500, h: 200 },
              }),
            ],
          }),
        ],
      });
      const issues = checkViewportOverflow(tree, viewport);
      const issue = issues.find(i => i.element === '.not-clipped-wide');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });
  });
});
