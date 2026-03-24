import { describe, it, expect } from 'vitest';
// NOTE: countElements is currently a private (non-exported) function in pipeline.ts.
// This import will fail until Green exports it. That's expected — it's a failing test.
// Green should add: export { countElements } to src/pipeline.ts (or export it directly).
import { countElements } from '../../../src/pipeline.js';
import type { ExtractedElement } from '../../../src/types.js';

function makeElement(
  overrides: Partial<ExtractedElement> = {},
): ExtractedElement {
  return {
    selector: '.node',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

describe('countElements', () => {
  it('returns 1 for a single node with no children', () => {
    const tree = makeElement({ selector: 'body' });
    expect(countElements(tree)).toBe(1);
  });

  it('returns 3 for a node with 2 children', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.child-1' }),
        makeElement({ selector: '.child-2' }),
      ],
    });
    expect(countElements(tree)).toBe(3);
  });

  it('counts a deeply nested tree correctly', () => {
    // body > .a > .b > .c  = 4 nodes
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.a',
          children: [
            makeElement({
              selector: '.b',
              children: [makeElement({ selector: '.c' })],
            }),
          ],
        }),
      ],
    });
    expect(countElements(tree)).toBe(4);
  });

  it('counts a wide tree correctly', () => {
    // body with 5 children, each a leaf = 6
    const tree = makeElement({
      selector: 'body',
      children: Array.from({ length: 5 }, (_, i) =>
        makeElement({ selector: `.child-${i}` }),
      ),
    });
    expect(countElements(tree)).toBe(6);
  });

  it('counts a mixed-depth tree correctly', () => {
    // body
    //   .a (leaf)
    //   .b
    //     .b1 (leaf)
    //     .b2
    //       .b2a (leaf)
    //   .c (leaf)
    // Total: 7
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.a' }),
        makeElement({
          selector: '.b',
          children: [
            makeElement({ selector: '.b1' }),
            makeElement({
              selector: '.b2',
              children: [makeElement({ selector: '.b2a' })],
            }),
          ],
        }),
        makeElement({ selector: '.c' }),
      ],
    });
    expect(countElements(tree)).toBe(7);
  });

  it('handles a tree matching the clean.html fixture structure', () => {
    // body > header > .logo, body > main > .card-grid > .card x3, body > footer > p
    // body(1) + header(2) + logo(3) + main(4) + card-grid(5) + card(6,7,8) + footer(9) + p(10)
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: 'header',
          tag: 'header',
          children: [makeElement({ selector: '.logo', tag: 'div' })],
        }),
        makeElement({
          selector: 'main',
          tag: 'main',
          children: [
            makeElement({
              selector: '.card-grid',
              tag: 'div',
              children: [
                makeElement({ selector: '.card:nth-of-type(1)', tag: 'div' }),
                makeElement({ selector: '.card:nth-of-type(2)', tag: 'div' }),
                makeElement({ selector: '.card:nth-of-type(3)', tag: 'div' }),
              ],
            }),
          ],
        }),
        makeElement({
          selector: 'footer',
          tag: 'footer',
          children: [makeElement({ selector: 'p', tag: 'p' })],
        }),
      ],
    });
    expect(countElements(tree)).toBe(10);
  });
});
