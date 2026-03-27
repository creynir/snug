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

// ──────────────────────────────────────────
// Task 2: Skip Children of Off-Screen Parents
// ──────────────────────────────────────────

describe('checkViewportOverflow — off-screen parent suppression (FOLLOWUP-007 Task 2)', () => {
  it('4. does not flag children when parent bounds are fully right of viewport (x >= viewport.width)', () => {
    // Parent is a hidden drawer entirely off-screen to the right
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
    // Children of the off-screen drawer should NOT be flagged
    const childIssues = issues.filter(
      (i) => i.element === '.drawer-child-a' || i.element === '.drawer-child-b',
    );
    expect(childIssues).toEqual([]);
  });

  it('5. does not flag children when parent bounds are fully left of viewport (x + w <= 0)', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.offscreen-left',
          bounds: { x: -600, y: 0, w: 500, h: 400 },
          // x + w = -600 + 500 = -100 <= 0 => fully left of viewport
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

  it('6. does not flag children when parent bounds are fully below viewport (y >= viewport.height)', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 2000 },
      children: [
        makeElement({
          selector: '.offscreen-below',
          bounds: { x: -100, y: 900, w: 1500, h: 400 },
          // y >= 800 => fully below viewport
          children: [
            makeElement({
              selector: '.below-child',
              bounds: { x: -50, y: 950, w: 1400, h: 200 },
              // Would overflow left AND right, but parent is off-screen below
            }),
          ],
        }),
      ],
    });

    const issues = checkViewportOverflow(tree, viewport);
    const childIssues = issues.filter((i) => i.element === '.below-child');
    expect(childIssues).toEqual([]);
  });

  it('7. still flags children when parent is partially on-screen', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.partially-visible',
          bounds: { x: 1100, y: 0, w: 600, h: 400 },
          // x=1100, w=600 => right edge at 1700, left edge at 1100 < 1280 => partially on screen
          children: [
            makeElement({
              selector: '.visible-child',
              bounds: { x: 1200, y: 50, w: 200, h: 100 },
              // right edge at 1400 > 1280 => overflows viewport
            }),
          ],
        }),
      ],
    });

    const issues = checkViewportOverflow(tree, viewport);
    // Child of partially-visible parent SHOULD still be flagged
    const childIssues = issues.filter((i) => i.element === '.visible-child');
    expect(childIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('8. still flags the off-screen parent element itself (only children suppressed)', () => {
    const tree = makeElement({
      selector: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.drawer',
          bounds: { x: 1400, y: 0, w: 600, h: 800 },
          // Fully right of viewport => off-screen
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
    // The parent itself SHOULD still be flagged
    const parentIssues = issues.filter((i) => i.element === '.drawer');
    expect(parentIssues.length).toBeGreaterThanOrEqual(1);
    // But children should NOT be flagged
    const childIssues = issues.filter((i) => i.element === '.drawer-item');
    expect(childIssues).toEqual([]);
  });
});
