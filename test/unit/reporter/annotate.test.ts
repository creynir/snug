import { describe, it, expect } from 'vitest';
import { annotateTree } from '../../../src/reporter/annotate.js';
import type { ExtractedElement, Issue } from '../../../src/types.js';

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

describe('annotateTree', () => {
  it('produces compact labels with bounds', () => {
    const tree = makeElement({ selector: 'body', bounds: { x: 0, y: 0, w: 1280, h: 2400 } });
    const result = annotateTree(tree, []);
    expect(result.label).toBe('body [0,0 1280x2400]');
  });

  it('attaches issues inline to matching nodes', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.wide', bounds: { x: 0, y: 0, w: 1500, h: 200 } }),
      ],
    });
    const issues: Issue[] = [
      {
        type: 'viewport-overflow',
        severity: 'error',
        element: '.wide',
        detail: 'Overflows right by 220px',
      },
    ];
    const result = annotateTree(tree, issues);
    expect(result.children?.[0].issues?.length).toBe(1);
    expect(result.children?.[0].issues?.[0].type).toBe('viewport-overflow');
  });

  it('includes computed styles only on nodes with issues', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.ok',
          computed: { position: 'relative' },
        }),
        makeElement({
          selector: '.bad',
          computed: { position: 'absolute', left: '-30px' },
        }),
      ],
    });
    const issues: Issue[] = [
      { type: 'containment', severity: 'error', element: '.bad', detail: 'Overflows parent' },
    ];
    const result = annotateTree(tree, issues);
    expect(result.children?.[0].computed).toBeUndefined(); // .ok — no issues
    expect(result.children?.[1].computed).toBeDefined();    // .bad — has issue
  });

  it('preserves text content', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({ selector: '.title', text: 'Hello World' }),
      ],
    });
    const result = annotateTree(tree, []);
    expect(result.children?.[0].text).toBe('Hello World');
  });
});
