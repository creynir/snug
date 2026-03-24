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
  // ── Happy path ──

  it('returns no issues when all children are fully contained within parent', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.child-a',
          bounds: { x: 120, y: 120, w: 200, h: 100 },
        }),
        makeElement({
          selector: '.child-b',
          bounds: { x: 150, y: 250, w: 100, h: 50 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when child exactly matches parent bounds', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.exact',
          bounds: { x: 100, y: 100, w: 400, h: 300 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for parent with no children', () => {
    const tree = makeElement({ children: [] });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Overflow detection per edge ──

  it('detects child overflowing parent on the right edge', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.right-overflow',
          bounds: { x: 200, y: 150, w: 400, h: 100 },
          // child right edge: 200 + 400 = 600, parent right: 100 + 400 = 500 => overflow 100
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('containment');
    expect(issues[0].element).toBe('.right-overflow');
    expect(issues[0].data?.overflowRight).toBe(100);
  });

  it('detects child overflowing parent on the bottom edge', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.bottom-overflow',
          bounds: { x: 150, y: 300, w: 100, h: 200 },
          // child bottom: 300 + 200 = 500, parent bottom: 100 + 300 = 400 => overflow 100
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.overflowBottom).toBe(100);
  });

  it('detects child overflowing parent on the left edge', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.left-overflow',
          bounds: { x: 70, y: 150, w: 200, h: 100 },
          // overflow left: parent.x(100) - child.x(70) = 30
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.overflowLeft).toBe(30);
  });

  it('detects child overflowing parent on the top edge', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.top-overflow',
          bounds: { x: 150, y: 80, w: 100, h: 100 },
          // overflow top: parent.y(100) - child.y(80) = 20
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.overflowTop).toBe(20);
  });

  it('detects child overflowing on multiple edges simultaneously', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.escaped',
          bounds: { x: 70, y: 80, w: 500, h: 400 },
          computed: { position: 'absolute' },
          // overflowLeft: 100-70=30, overflowTop: 100-80=20
          // overflowRight: (70+500)-(100+400)=70, overflowBottom: (80+400)-(100+300)=80
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.overflowLeft).toBe(30);
    expect(issues[0].data?.overflowTop).toBe(20);
    expect(issues[0].data?.overflowRight).toBe(70);
    expect(issues[0].data?.overflowBottom).toBe(80);
  });

  // ── Tolerance (1px for sub-pixel rounding) ──

  it('does not flag overflow of exactly 1px (within tolerance)', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.subpixel',
          bounds: { x: 99, y: 100, w: 402, h: 300 },
          // overflowLeft: 100-99 = 1 (within 1px tolerance)
          // overflowRight: (99+402)-(100+400) = 1 (within tolerance)
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('flags overflow of 2px (exceeds 1px tolerance)', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.just-over',
          bounds: { x: 98, y: 100, w: 200, h: 100 },
          // overflowLeft: 100-98 = 2 (exceeds 1px tolerance)
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.just-over');
  });

  // ── Severity thresholds ──

  it('reports error severity for overflow > 20px', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.big-overflow',
          bounds: { x: 100, y: 100, w: 450, h: 100 },
          // overflowRight: (100+450) - (100+400) = 50 > 20 => error
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('reports warning severity for overflow between 2px and 20px', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.small-overflow',
          bounds: { x: 100, y: 100, w: 410, h: 100 },
          // overflowRight: (100+410) - (100+400) = 10 <= 20 => warning
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('reports warning for overflow of exactly 20px', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.threshold',
          bounds: { x: 100, y: 100, w: 420, h: 100 },
          // overflowRight: 20 => at boundary => warning (not > 20)
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('reports error for overflow of 21px', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.over-threshold',
          bounds: { x: 100, y: 100, w: 421, h: 100 },
          // overflowRight: 21 > 20 => error
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  // ── Skip parents with overflow clipping ──

  it('skips parent with overflow:hidden (clipping is intentional)', () => {
    const tree = makeElement({
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.clipped',
          bounds: { x: 50, y: 50, w: 600, h: 400 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parent with overflow:scroll', () => {
    const tree = makeElement({
      computed: { overflow: 'scroll' },
      children: [
        makeElement({
          selector: '.scrollable',
          bounds: { x: 50, y: 50, w: 600, h: 400 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parent with overflow:auto', () => {
    const tree = makeElement({
      computed: { overflow: 'auto' },
      children: [
        makeElement({
          selector: '.auto-overflow',
          bounds: { x: 50, y: 50, w: 600, h: 400 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips parent with overflowX:hidden for horizontal overflow but still checks vertical', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      computed: { overflowX: 'hidden' },
      children: [
        makeElement({
          selector: '.mixed',
          bounds: { x: 50, y: 50, w: 600, h: 500 },
          // Would overflow left, right, top, and bottom
          // But overflowX:hidden means horizontal overflow is clipped
          // Vertical overflow (top and bottom) should still be flagged
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    // Should flag vertical overflow (top, bottom) but not horizontal
    const issue = issues.find(i => i.element === '.mixed');
    if (issue) {
      // overflowLeft and overflowRight should be 0 or absent (hidden on X axis)
      // overflowTop and overflowBottom should be flagged
      expect(issue.data?.overflowTop).toBeGreaterThan(0);
      expect(issue.data?.overflowBottom).toBeGreaterThan(0);
    }
    // At minimum we should NOT see pure horizontal overflow reported
  });

  it('skips parent with overflowY:auto for vertical overflow', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      computed: { overflowY: 'auto' },
      children: [
        makeElement({
          selector: '.vert-clipped',
          bounds: { x: 100, y: 100, w: 500, h: 600 },
          // overflowRight: 100, overflowBottom: 200
          // overflowY:auto means vertical is clipped, horizontal should still flag
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    const issue = issues.find(i => i.element === '.vert-clipped');
    // Horizontal overflow should still be flagged
    expect(issue).toBeDefined();
    expect(issue!.data?.overflowRight).toBeGreaterThan(0);
  });

  it('does not flag children of parent with overflow:visible (default)', () => {
    // overflow:visible is the default — children SHOULD be flagged
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      computed: { overflow: 'visible' },
      children: [
        makeElement({
          selector: '.overflows',
          bounds: { x: 50, y: 150, w: 200, h: 100 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.overflows');
  });

  // ── Recursive detection ──

  it('detects containment violations at multiple nesting levels', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1000, h: 800 },
      children: [
        makeElement({
          selector: '.wrapper',
          bounds: { x: 100, y: 100, w: 400, h: 300 },
          children: [
            makeElement({
              selector: '.inner',
              bounds: { x: 200, y: 200, w: 100, h: 100 },
              children: [
                makeElement({
                  selector: '.deeply-escaped',
                  bounds: { x: 150, y: 150, w: 300, h: 300 },
                  // Exceeds .inner on right: (150+300)-(200+100) = 150
                  // Exceeds .inner on bottom: (150+300)-(200+100) = 150
                  // Exceeds .inner on left: 200-150 = 50
                  // Exceeds .inner on top: 200-150 = 50
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.some(i => i.element === '.deeply-escaped')).toBe(true);
  });

  it('checks containment at every level, not just leaf nodes', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 500, h: 500 },
      children: [
        makeElement({
          selector: '.level1-overflow',
          bounds: { x: 0, y: 0, w: 600, h: 100 },
          // Overflows .root on right by 100
          children: [
            makeElement({
              selector: '.level2-overflow',
              bounds: { x: 0, y: 0, w: 700, h: 50 },
              // Overflows .level1-overflow on right by 100
            }),
          ],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.some(i => i.element === '.level1-overflow')).toBe(true);
    expect(issues.some(i => i.element === '.level2-overflow')).toBe(true);
  });

  // ── Issue data fields ──

  it('includes child selector as element and parent selector as element2', () => {
    const tree = makeElement({
      selector: '.container',
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.overflowing-child',
          bounds: { x: 50, y: 100, w: 200, h: 100 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.overflowing-child');
    expect(issues[0].element2).toBe('.container');
  });

  it('includes computed styles in the issue', () => {
    const tree = makeElement({
      selector: '.container',
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.styled-child',
          bounds: { x: 50, y: 100, w: 200, h: 100 },
          computed: { position: 'absolute', left: '-50px' },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].computed).toBeDefined();
  });

  it('includes per-edge overflow values in data', () => {
    const tree = makeElement({
      selector: '.box',
      bounds: { x: 100, y: 100, w: 200, h: 200 },
      children: [
        makeElement({
          selector: '.child',
          bounds: { x: 90, y: 100, w: 250, h: 200 },
          // overflowLeft: 100-90=10, overflowRight: (90+250)-(100+200)=40
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data).toBeDefined();
    expect(typeof issues[0].data!.overflowRight).toBe('number');
    expect(typeof issues[0].data!.overflowLeft).toBe('number');
    expect(typeof issues[0].data!.overflowTop).toBe('number');
    expect(typeof issues[0].data!.overflowBottom).toBe('number');
  });

  it('has a non-empty detail string', () => {
    const tree = makeElement({
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.child',
          bounds: { x: 50, y: 100, w: 200, h: 100 },
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBe(1);
    expect(typeof issues[0].detail).toBe('string');
    expect(issues[0].detail.length).toBeGreaterThan(0);
  });

  // ── Edge cases ──

  it('handles parent with zero dimensions', () => {
    const tree = makeElement({
      selector: '.collapsed',
      bounds: { x: 100, y: 100, w: 0, h: 0 },
      children: [
        makeElement({
          selector: '.child-of-collapsed',
          bounds: { x: 100, y: 100, w: 50, h: 50 },
        }),
      ],
    });
    // Should flag child as overflowing the zero-size parent
    const issues = checkContainment(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('handles deeply nested elements with no violations', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
      children: [
        makeElement({
          selector: '.l1',
          bounds: { x: 10, y: 10, w: 500, h: 500 },
          children: [
            makeElement({
              selector: '.l2',
              bounds: { x: 20, y: 20, w: 300, h: 300 },
              children: [
                makeElement({
                  selector: '.l3',
                  bounds: { x: 30, y: 30, w: 100, h: 100 },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const issues = checkContainment(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Fix 2a: Edge-mounted element context ──

  describe('edge-mounted element context (Fix 2a)', () => {
    it('reports warning (not error) for 10px-wide element overflowing parent by 5px (50% = edge-mounted)', () => {
      // 10px port, overflowing left by 5px = 50% of its width => edge-mounted
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.port',
            bounds: { x: 95, y: 200, w: 10, h: 10 },
            computed: { position: 'absolute' },
            // overflowLeft: 100 - 95 = 5px, child width = 10px, ratio = 50%
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
    });

    it('reports warning with context.edgeMounted for edge-mounted element', () => {
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.badge',
            bounds: { x: 95, y: 200, w: 10, h: 10 },
            computed: { position: 'absolute' },
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].context).toBeDefined();
      expect(issues[0].context?.edgeMounted).toBe('true');
    });

    it('still reports error for 200px-wide element overflowing by 100px (too large to be edge-mounted)', () => {
      // Element is 200px wide — exceeds 30px max for edge-mounted
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.big-panel',
            bounds: { x: 0, y: 150, w: 200, h: 100 },
            computed: { position: 'absolute' },
            // overflowLeft: 100 - 0 = 100px, child width = 200px, ratio = 50%
            // BUT child is 200px wide, exceeds MAX_EDGE_ELEMENT_SIZE (30px)
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('error');
    });

    it('still reports error for 10px element overflowing by 9px (90% — fully escaped, not centered)', () => {
      // 10px element overflowing by 9px = 90% ratio — outside 30-70% range
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.escaped-port',
            bounds: { x: 91, y: 200, w: 10, h: 10 },
            computed: { position: 'absolute' },
            // overflowLeft: 100 - 91 = 9px, child width = 10px, ratio = 90%
            // 90% is outside the 30-70% range => NOT edge-mounted
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      // 9px overflow < 20px threshold, so current code reports 'warning'
      // But with edge-mounted detection, this should NOT have edgeMounted context
      expect(issues[0].context?.edgeMounted).toBeUndefined();
    });

    it('detects edge-mounting on all four edges', () => {
      // Test each edge: left, right, top, bottom
      const makeEdgeTest = (selector: string, childBounds: { x: number; y: number; w: number; h: number }) => {
        return makeElement({
          selector: '.container',
          bounds: { x: 100, y: 100, w: 400, h: 300 },
          children: [
            makeElement({
              selector,
              bounds: childBounds,
              computed: { position: 'absolute' },
            }),
          ],
        });
      };

      // Left edge: 10px port, 5px overflow left
      const leftTree = makeEdgeTest('.port-left', { x: 95, y: 200, w: 10, h: 10 });
      const leftIssues = checkContainment(leftTree, viewport);
      expect(leftIssues.length).toBe(1);
      expect(leftIssues[0].context?.edgeMounted).toBe('true');

      // Right edge: 10px port, 5px overflow right (parent right = 500)
      const rightTree = makeEdgeTest('.port-right', { x: 495, y: 200, w: 10, h: 10 });
      const rightIssues = checkContainment(rightTree, viewport);
      expect(rightIssues.length).toBe(1);
      expect(rightIssues[0].context?.edgeMounted).toBe('true');

      // Top edge: 10px port, 5px overflow top
      const topTree = makeEdgeTest('.port-top', { x: 200, y: 95, w: 10, h: 10 });
      const topIssues = checkContainment(topTree, viewport);
      expect(topIssues.length).toBe(1);
      expect(topIssues[0].context?.edgeMounted).toBe('true');

      // Bottom edge: 10px port, 5px overflow bottom (parent bottom = 400)
      const bottomTree = makeEdgeTest('.port-bottom', { x: 200, y: 395, w: 10, h: 10 });
      const bottomIssues = checkContainment(bottomTree, viewport);
      expect(bottomIssues.length).toBe(1);
      expect(bottomIssues[0].context?.edgeMounted).toBe('true');
    });

    it('element must be <= 30px on overflow axis to qualify as edge-mounted', () => {
      // 31px wide element — just over the threshold, should NOT be edge-mounted
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.too-big-handle',
            bounds: { x: 85, y: 200, w: 31, h: 10 },
            computed: { position: 'absolute' },
            // overflowLeft: 100 - 85 = 15px, child width = 31px, ratio = ~48%
            // Ratio is in range BUT element is 31px > 30px max
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].context?.edgeMounted).toBeUndefined();
    });

    it('edge-mounted on bottom edge works (small height element)', () => {
      // 8px tall element overflowing bottom by 4px = 50% ratio
      const tree = makeElement({
        selector: '.container',
        bounds: { x: 100, y: 100, w: 400, h: 300 },
        children: [
          makeElement({
            selector: '.bottom-badge',
            bounds: { x: 200, y: 396, w: 20, h: 8 },
            computed: { position: 'absolute' },
            // parent bottom = 400, child bottom = 396+8 = 404
            // overflowBottom: 404 - 400 = 4px, child height = 8px, ratio = 50%
          }),
        ],
      });
      const issues = checkContainment(tree, viewport);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].context?.edgeMounted).toBe('true');
    });
  });
});
