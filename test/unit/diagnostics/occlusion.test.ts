import { describe, it, expect } from 'vitest';
import { checkOcclusion } from '../../../src/diagnostics/occlusion.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 200, h: 200 },
    children: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────
// Task 3: Cross-Level Occlusion Detection
// ──────────────────────────────────────────

describe('checkOcclusion — cross-level occlusion (FOLLOWUP-007 Task 3)', () => {
  it('9. flags element A covering element B when in different subtrees and B has text', () => {
    // Two subtrees under root, A and B overlap, B has text
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.panel-a',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              computed: { 'z-index': '10' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.panel-b',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              text: 'Important text content',
              computed: { 'z-index': '1' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const occlusion = issues.find((i) => i.type === 'occlusion');
    expect(occlusion).toBeDefined();
    // panel-a covers panel-b
    expect(occlusion!.element).toBe('.panel-a');
    expect(occlusion!.element2).toBe('.panel-b');
  });

  it('10. does not flag when A is ancestor of B (parent-child)', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.parent',
          bounds: { x: 100, y: 100, w: 400, h: 300 },
          children: [
            makeElement({
              selector: '.child',
              bounds: { x: 100, y: 100, w: 400, h: 300 },
              text: 'Child text',
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('11. does not flag when A and B are direct siblings (handled by sibling-overlap)', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.sibling-a',
          bounds: { x: 100, y: 100, w: 300, h: 200 },
          computed: { 'z-index': '10' },
        }),
        makeElement({
          selector: '.sibling-b',
          bounds: { x: 100, y: 100, w: 300, h: 200 },
          text: 'Sibling text',
          computed: { 'z-index': '1' },
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('12. does not flag when overlap < 50% of smaller element', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.panel-a',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              computed: { 'z-index': '10' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.panel-b',
              // Only slight overlap: x overlap = 350-300 = 50px, y overlap = 200
              // overlap area = 50*200 = 10000, smaller area = 200*200 = 40000
              // ratio = 10000/40000 = 25% < 50%
              bounds: { x: 300, y: 100, w: 200, h: 200 },
              text: 'Some text',
              computed: { 'z-index': '1' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('13. does not flag when neither element has text', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.box-a',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              // No text
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.box-b',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              // No text
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('14. does not flag when covered element (bottom) has no text but top does', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.top-panel',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              text: 'Top panel text',
              computed: { 'z-index': '10' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.bottom-panel',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              // No text — bottom element has no text, so no readability issue
              computed: { 'z-index': '1' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('15. correctly determines top element by z-index', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.low-z',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              text: 'Low z-index text',
              computed: { 'z-index': '1' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.high-z',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              computed: { 'z-index': '99' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.find((i) => i.type === 'occlusion');
    expect(occlusion).toBeDefined();
    // high-z is the top (covering) element, low-z is covered
    expect(occlusion!.element).toBe('.high-z');
    expect(occlusion!.element2).toBe('.low-z');
  });

  it('16. correctly determines top element by DOM order when z-index equal', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.first-in-dom',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              text: 'First in DOM',
              computed: { 'z-index': 'auto' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.later-in-dom',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              computed: { 'z-index': 'auto' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.find((i) => i.type === 'occlusion');
    expect(occlusion).toBeDefined();
    // Later in DOM order = on top when z-index is equal
    expect(occlusion!.element).toBe('.later-in-dom');
    expect(occlusion!.element2).toBe('.first-in-dom');
  });

  it('17. does not flag elements with area < 100px\u00B2', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.tiny-a',
              // 9 * 9 = 81 < 100
              bounds: { x: 100, y: 100, w: 9, h: 9 },
              computed: { 'z-index': '10' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.tiny-b',
              bounds: { x: 100, y: 100, w: 9, h: 9 },
              text: 'Tiny text',
              computed: { 'z-index': '1' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.filter((i) => i.type === 'occlusion');
    expect(occlusion).toEqual([]);
  });

  it('18. severity is error', () => {
    const tree = makeElement({
      selector: '.root',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      children: [
        makeElement({
          selector: '.subtree-a',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.covering',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              computed: { 'z-index': '10' },
            }),
          ],
        }),
        makeElement({
          selector: '.subtree-b',
          bounds: { x: 0, y: 0, w: 600, h: 400 },
          children: [
            makeElement({
              selector: '.covered',
              bounds: { x: 100, y: 100, w: 300, h: 200 },
              text: 'Covered text',
              computed: { 'z-index': '1' },
            }),
          ],
        }),
      ],
    });

    const issues = checkOcclusion(tree, viewport);
    const occlusion = issues.find((i) => i.type === 'occlusion');
    expect(occlusion).toBeDefined();
    expect(occlusion!.severity).toBe('error');
  });
});
