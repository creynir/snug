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

// ──────────────────────────────────────────
// Task 4: Suppress edgeMounted Containment
// ──────────────────────────────────────────

describe('checkContainment — suppress edgeMounted issues (FOLLOWUP-007 Task 4)', () => {
  it('19. does not emit containment issue when isEdgeMounted returns true', () => {
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
          // This qualifies as edge-mounted
        }),
      ],
    });

    const issues = checkContainment(tree, viewport);
    // Should emit NO issues for edge-mounted elements (suppressed entirely)
    const portIssues = issues.filter((i) => i.element === '.port');
    expect(portIssues).toEqual([]);
  });

  it('20. still emits containment issue when overflow is large (not edge-mounted)', () => {
    const tree = makeElement({
      selector: '.container',
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.big-overflow',
          bounds: { x: 50, y: 100, w: 200, h: 100 },
          computed: { position: 'absolute' },
          // overflowLeft: 100 - 50 = 50px, child width = 200px
          // Element is 200px wide > MAX_EDGE_ELEMENT_SIZE (30px) => NOT edge-mounted
        }),
      ],
    });

    const issues = checkContainment(tree, viewport);
    const overflowIssues = issues.filter((i) => i.element === '.big-overflow');
    expect(overflowIssues.length).toBe(1);
    expect(overflowIssues[0].type).toBe('containment');
  });

  it('21. still emits containment issue when element is larger than 30px (not a port/badge)', () => {
    // 40px element overflowing by 20px = 50% ratio — in range, but too large
    const tree = makeElement({
      selector: '.container',
      bounds: { x: 100, y: 100, w: 400, h: 300 },
      children: [
        makeElement({
          selector: '.large-handle',
          bounds: { x: 80, y: 200, w: 40, h: 40 },
          computed: { position: 'absolute' },
          // overflowLeft: 100 - 80 = 20px, child width = 40px, ratio = 50%
          // BUT element is 40px > 30px max for edge-mounted
        }),
      ],
    });

    const issues = checkContainment(tree, viewport);
    const handleIssues = issues.filter((i) => i.element === '.large-handle');
    expect(handleIssues.length).toBe(1);
    expect(handleIssues[0].type).toBe('containment');
  });
});
