import { describe, it, expect } from 'vitest';
import { checkViewportFit } from '../../../src/diagnostics/viewport-fit.js';
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

describe('checkViewportFit', () => {
  // ── Scrollable pages: no issues ──

  it('returns no issues when page is scrollable (body overflow: auto)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 1200 },
      computed: { overflow: 'auto' },
      children: [
        makeElement({
          selector: '.tall-content',
          bounds: { x: 0, y: 0, w: 1280, h: 1200 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when page is scrollable (body overflow: visible)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 1200 },
      computed: { overflow: 'visible' },
      children: [
        makeElement({
          selector: '.tall-content',
          bounds: { x: 0, y: 0, w: 1280, h: 1200 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues when page is scrollable (body overflow: scroll)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 1200 },
      computed: { overflow: 'scroll' },
      children: [
        makeElement({
          selector: '.tall-content',
          bounds: { x: 0, y: 0, w: 1280, h: 1200 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Check A: Children extending below viewport ──

  it('detects child extending below viewport on non-scrollable page', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.header',
          bounds: { x: 0, y: 0, w: 1280, h: 40 },
        }),
        makeElement({
          selector: '.main',
          bounds: { x: 0, y: 40, w: 1280, h: 500 },
        }),
        makeElement({
          selector: '.footer',
          bounds: { x: 0, y: 750, w: 1280, h: 100 },
          // bottomEdge = 750 + 100 = 850 > 800
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const footerIssue = issues.find(i => i.element === '.footer');
    expect(footerIssue).toBeDefined();
    expect(footerIssue!.type).toBe('viewport-fit');
    expect(footerIssue!.severity).toBe('error');
  });

  it('reports error severity for children below viewport (Check A)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.overflowing',
          bounds: { x: 0, y: 700, w: 1280, h: 200 },
          // bottomEdge = 700 + 200 = 900 > 800
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const issue = issues.find(i => i.element === '.overflowing');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
  });

  it('includes bottomEdge, viewportHeight, overflowY in data for Check A', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.overflowing',
          bounds: { x: 0, y: 700, w: 1280, h: 200 },
          // bottomEdge = 900, viewportHeight = 800, overflowY = 100
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const issue = issues.find(i => i.element === '.overflowing');
    expect(issue).toBeDefined();
    expect(issue!.data?.bottomEdge).toBe(900);
    expect(issue!.data?.viewportHeight).toBe(800);
    expect(issue!.data?.overflowY).toBe(100);
  });

  it('does not flag elements above viewport height', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.header',
          bounds: { x: 0, y: 0, w: 1280, h: 40 },
        }),
        makeElement({
          selector: '.main',
          bounds: { x: 0, y: 40, w: 1280, h: 700 },
          // bottomEdge = 740, within viewport
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const checkAIssues = issues.filter(i => i.data?.bottomEdge !== undefined);
    expect(checkAIssues).toEqual([]);
  });

  it('non-scrollable page with everything fitting returns no issues', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.header',
          bounds: { x: 0, y: 0, w: 1280, h: 40 },
        }),
        makeElement({
          selector: '.main',
          bounds: { x: 0, y: 40, w: 1280, h: 500 },
        }),
        makeElement({
          selector: '.footer',
          bounds: { x: 0, y: 540, w: 1280, h: 22 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Check B: Content compression ──

  it('detects content compression (scrollHeight > clientHeight + overflow:hidden) on non-scrollable page', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.bottom-panel',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'hidden' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.bottom-panel' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeDefined();
    expect(compressionIssue!.type).toBe('viewport-fit');
  });

  it('reports warning severity for content compression (Check B)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.compressed',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'hidden' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.compressed' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeDefined();
    expect(compressionIssue!.severity).toBe('warning');
  });

  it('includes scrollHeight, clientHeight, compressionPx in data for Check B', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.compressed',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'hidden' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.compressed' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeDefined();
    expect(compressionIssue!.data?.scrollHeight).toBe(36);
    expect(compressionIssue!.data?.clientHeight).toBe(22);
    expect(compressionIssue!.data?.compressionPx).toBe(14);
  });

  it('does not flag compression when element has overflow: auto (has scrollbar)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.scrollable-panel',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'auto' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.scrollable-panel' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeUndefined();
  });

  it('does not flag compression when element has overflow: scroll', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.scrollable-panel',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'scroll' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.scrollable-panel' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeUndefined();
  });

  // ── Single layout container child pattern ──

  it('works with body having a single layout container child (body > #app > children)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '#app',
          bounds: { x: 0, y: 0, w: 1280, h: 800 },
          children: [
            makeElement({
              selector: '.header',
              bounds: { x: 0, y: 0, w: 1280, h: 40 },
            }),
            makeElement({
              selector: '.main',
              bounds: { x: 0, y: 40, w: 1280, h: 500 },
            }),
            makeElement({
              selector: '.footer',
              bounds: { x: 0, y: 750, w: 1280, h: 100 },
              // bottomEdge = 850 > 800
            }),
          ],
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    // Should detect that .footer extends below viewport, even through the single #app container
    const footerIssue = issues.find(i => i.element === '.footer');
    expect(footerIssue).toBeDefined();
    expect(footerIssue!.type).toBe('viewport-fit');
    expect(footerIssue!.severity).toBe('error');
  });

  // ── Detail string ──

  it('detail string mentions bottom edge and viewport height for Check A', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.overflowing',
          bounds: { x: 0, y: 700, w: 1280, h: 200 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const issue = issues.find(i => i.element === '.overflowing');
    expect(issue).toBeDefined();
    expect(issue!.detail).toContain('900');   // bottomEdge
    expect(issue!.detail).toContain('800');   // viewport height
  });

  it('detail string mentions scrollHeight and clientHeight for Check B', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflow: 'hidden' },
      children: [
        makeElement({
          selector: '.compressed',
          bounds: { x: 0, y: 740, w: 1280, h: 22 },
          computed: { overflow: 'hidden' },
          scroll: {
            scrollWidth: 1280,
            scrollHeight: 36,
            clientWidth: 1280,
            clientHeight: 22,
          },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const compressionIssue = issues.find(
      i => i.element === '.compressed' && i.data?.compressionPx !== undefined,
    );
    expect(compressionIssue).toBeDefined();
    expect(compressionIssue!.detail).toContain('36');  // scrollHeight
    expect(compressionIssue!.detail).toContain('22');  // clientHeight
  });

  // ── overflow-y: hidden also triggers non-scrollable detection ──

  it('detects non-scrollable page via overflow-y: hidden', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 1280, h: 800 },
      computed: { overflowY: 'hidden' },
      children: [
        makeElement({
          selector: '.overflowing',
          bounds: { x: 0, y: 700, w: 1280, h: 200 },
        }),
      ],
    });
    const issues = checkViewportFit(tree, viewport);
    const issue = issues.find(i => i.element === '.overflowing');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('viewport-fit');
  });
});
