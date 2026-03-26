import { describe, it, expect } from 'vitest';
import { checkSemantic } from '../../../src/diagnostics/semantic.js';
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
// B1. Missing Alt Text — missing-alt
// ──────────────────────────────────────────

describe('checkSemantic — B1: missing-alt', () => {
  it('flags <img> without alt attribute', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hero img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 300 },
          attributes: { src: 'photo.jpg' },
          // No alt attribute at all
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const altIssues = issues.filter((i) => i.context?.check === 'missing-alt');
    expect(altIssues.length).toBe(1);
    expect(altIssues[0].severity).toBe('warning');
    expect(altIssues[0].type).toBe('semantic');
    expect(altIssues[0].element).toBe('.hero img');
  });

  it('does not flag <img alt=""> (empty alt valid for decorative)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.decorative img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 100, h: 100 },
          attributes: { src: 'spacer.gif', alt: '' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const altIssues = issues.filter((i) => i.context?.check === 'missing-alt');
    expect(altIssues).toEqual([]);
  });

  it('does not flag <img alt="description">', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.photo img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 300 },
          attributes: { src: 'photo.jpg', alt: 'A sunset over the ocean' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const altIssues = issues.filter((i) => i.context?.check === 'missing-alt');
    expect(altIssues).toEqual([]);
  });

  it('does not flag hidden image (0x0 bounds)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.tracking img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 0, h: 0 },
          attributes: { src: 'pixel.gif' },
          // No alt, but 0x0 so invisible — should not flag
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const altIssues = issues.filter((i) => i.context?.check === 'missing-alt');
    expect(altIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// B2. Duplicate IDs — duplicate-id
// ──────────────────────────────────────────

describe('checkSemantic — B2: duplicate-id', () => {
  it('flags two elements with same id — severity error', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '#main-title',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          attributes: { id: 'main-title' },
        }),
        makeElement({
          selector: 'div#main-title',
          tag: 'div',
          bounds: { x: 0, y: 100, w: 600, h: 200 },
          attributes: { id: 'main-title' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const idIssues = issues.filter((i) => i.context?.check === 'duplicate-id');
    expect(idIssues.length).toBe(1);
    expect(idIssues[0].severity).toBe('error');
    expect(idIssues[0].type).toBe('semantic');
  });

  it('does not flag unique IDs', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '#header',
          tag: 'header',
          bounds: { x: 0, y: 0, w: 1280, h: 64 },
          attributes: { id: 'header' },
        }),
        makeElement({
          selector: '#footer',
          tag: 'footer',
          bounds: { x: 0, y: 700, w: 1280, h: 100 },
          attributes: { id: 'footer' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const idIssues = issues.filter((i) => i.context?.check === 'duplicate-id');
    expect(idIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// B3. Empty Interactive Element — empty-interactive
// ──────────────────────────────────────────

describe('checkSemantic — B3: empty-interactive', () => {
  it('flags <button> with no text and no aria-label', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.toolbar button',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 40, h: 40 },
          // No text, no aria-label, no aria-labelledby, no title, no children with text
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const emptyIssues = issues.filter((i) => i.context?.check === 'empty-interactive');
    expect(emptyIssues.length).toBe(1);
    expect(emptyIssues[0].severity).toBe('warning');
    expect(emptyIssues[0].type).toBe('semantic');
    expect(emptyIssues[0].element).toBe('.toolbar button');
  });

  it('does not flag <button>Click me</button> (has text)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form button',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 100, h: 40 },
          text: 'Click me',
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const emptyIssues = issues.filter((i) => i.context?.check === 'empty-interactive');
    expect(emptyIssues).toEqual([]);
  });

  it('does not flag <button aria-label="Close"> (has aria-label)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.modal button',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 32, h: 32 },
          attributes: { 'aria-label': 'Close' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const emptyIssues = issues.filter((i) => i.context?.check === 'empty-interactive');
    expect(emptyIssues).toEqual([]);
  });

  it('does not flag <button><span>OK</span></button> (text in child subtree)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.dialog button',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 80, h: 40 },
          children: [
            makeElement({
              selector: '.dialog button span',
              tag: 'span',
              bounds: { x: 4, y: 4, w: 72, h: 32 },
              text: 'OK',
            }),
          ],
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const emptyIssues = issues.filter((i) => i.context?.check === 'empty-interactive');
    expect(emptyIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// B4. Heading Hierarchy Violation — heading-hierarchy
// ──────────────────────────────────────────

describe('checkSemantic — B4: heading-hierarchy', () => {
  it('flags h1 → h3 (skipped h2)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.page h1',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          text: 'Page Title',
        }),
        makeElement({
          selector: '.section h3',
          tag: 'h3',
          bounds: { x: 0, y: 100, w: 400, h: 32 },
          text: 'Subsection',
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const hierarchyIssues = issues.filter((i) => i.context?.check === 'heading-hierarchy');
    expect(hierarchyIssues.length).toBeGreaterThanOrEqual(1);
    expect(hierarchyIssues[0].severity).toBe('warning');
    expect(hierarchyIssues[0].type).toBe('semantic');
  });

  it('flags multiple <h1> elements', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hero h1',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          text: 'Welcome',
        }),
        makeElement({
          selector: '.about h1',
          tag: 'h1',
          bounds: { x: 0, y: 400, w: 600, h: 48 },
          text: 'About Us',
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const hierarchyIssues = issues.filter((i) => i.context?.check === 'heading-hierarchy');
    expect(hierarchyIssues.length).toBeGreaterThanOrEqual(1);
    expect(hierarchyIssues[0].severity).toBe('warning');
  });

  it('does not flag h1 → h2 → h3', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.page h1',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          text: 'Title',
        }),
        makeElement({
          selector: '.section h2',
          tag: 'h2',
          bounds: { x: 0, y: 100, w: 400, h: 36 },
          text: 'Section',
        }),
        makeElement({
          selector: '.subsection h3',
          tag: 'h3',
          bounds: { x: 0, y: 200, w: 300, h: 32 },
          text: 'Subsection',
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const hierarchyIssues = issues.filter((i) => i.context?.check === 'heading-hierarchy');
    expect(hierarchyIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// B5. Positive tabindex — tabindex-positive
// ──────────────────────────────────────────

describe('checkSemantic — B5: tabindex-positive', () => {
  it('flags tabindex="5"', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form input',
          tag: 'input',
          bounds: { x: 0, y: 0, w: 200, h: 30 },
          attributes: { tabindex: '5' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tabIssues = issues.filter((i) => i.context?.check === 'tabindex-positive');
    expect(tabIssues.length).toBe(1);
    expect(tabIssues[0].severity).toBe('warning');
    expect(tabIssues[0].type).toBe('semantic');
    expect(tabIssues[0].element).toBe('.form input');
  });

  it('does not flag tabindex="0"', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.card',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 300, h: 200 },
          attributes: { tabindex: '0' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tabIssues = issues.filter((i) => i.context?.check === 'tabindex-positive');
    expect(tabIssues).toEqual([]);
  });

  it('does not flag tabindex="-1"', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.offscreen',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 300, h: 200 },
          attributes: { tabindex: '-1' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tabIssues = issues.filter((i) => i.context?.check === 'tabindex-positive');
    expect(tabIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// D1. Invisible Interactive Element — invisible-interactive
// ──────────────────────────────────────────

describe('checkSemantic — D1: invisible-interactive', () => {
  it('flags button with opacity: 0', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hidden-btn',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 100, h: 40 },
          computed: { opacity: '0' },
          text: 'Submit',
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const invisIssues = issues.filter((i) => i.context?.check === 'invisible-interactive');
    expect(invisIssues.length).toBe(1);
    expect(invisIssues[0].severity).toBe('warning');
    expect(invisIssues[0].type).toBe('semantic');
    expect(invisIssues[0].element).toBe('.hidden-btn');
  });

  it('flags link with visibility: hidden', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hidden-link',
          tag: 'a',
          bounds: { x: 0, y: 0, w: 150, h: 24 },
          computed: { visibility: 'hidden' },
          text: 'Click here',
          attributes: { href: '/page' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const invisIssues = issues.filter((i) => i.context?.check === 'invisible-interactive');
    expect(invisIssues.length).toBe(1);
    expect(invisIssues[0].severity).toBe('warning');
    expect(invisIssues[0].element).toBe('.hidden-link');
  });

  it('does not flag visible button', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.visible-btn',
          tag: 'button',
          bounds: { x: 0, y: 0, w: 100, h: 40 },
          text: 'Submit',
          // No opacity or visibility in computed — defaults are visible
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const invisIssues = issues.filter((i) => i.context?.check === 'invisible-interactive');
    expect(invisIssues).toEqual([]);
  });

  it('does not flag non-interactive div with opacity: 0', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.spacer',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 100, h: 100 },
          computed: { opacity: '0' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const invisIssues = issues.filter((i) => i.context?.check === 'invisible-interactive');
    expect(invisIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// D2. Zero-Size Form Control — zero-size-control
// ──────────────────────────────────────────

describe('checkSemantic — D2: zero-size-control', () => {
  it('flags input with width: 0', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form input.email',
          tag: 'input',
          bounds: { x: 0, y: 0, w: 0, h: 30 },
          attributes: { type: 'text' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const zeroIssues = issues.filter((i) => i.context?.check === 'zero-size-control');
    expect(zeroIssues.length).toBe(1);
    expect(zeroIssues[0].severity).toBe('error');
    expect(zeroIssues[0].type).toBe('semantic');
    expect(zeroIssues[0].element).toBe('.form input.email');
  });

  it('flags select with height: 1', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form select',
          tag: 'select',
          bounds: { x: 0, y: 0, w: 200, h: 1 },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const zeroIssues = issues.filter((i) => i.context?.check === 'zero-size-control');
    expect(zeroIssues.length).toBe(1);
    expect(zeroIssues[0].severity).toBe('error');
  });

  it('does not flag input[type=hidden]', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form input.csrf',
          tag: 'input',
          bounds: { x: 0, y: 0, w: 0, h: 0 },
          attributes: { type: 'hidden' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const zeroIssues = issues.filter((i) => i.context?.check === 'zero-size-control');
    expect(zeroIssues).toEqual([]);
  });

  it('does not flag normally-sized input', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.form input.name',
          tag: 'input',
          bounds: { x: 0, y: 0, w: 200, h: 30 },
          attributes: { type: 'text' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const zeroIssues = issues.filter((i) => i.context?.check === 'zero-size-control');
    expect(zeroIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// D3. Modal Overflow — modal-overflow
// ──────────────────────────────────────────

describe('checkSemantic — D3: modal-overflow', () => {
  it('flags dialog taller than viewport without overflow:auto', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.modal',
          tag: 'dialog',
          bounds: { x: 100, y: 0, w: 600, h: 1200 },
          // 1200 > viewport height 800, no overflow:auto
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const modalIssues = issues.filter((i) => i.context?.check === 'modal-overflow');
    expect(modalIssues.length).toBe(1);
    expect(modalIssues[0].severity).toBe('error');
    expect(modalIssues[0].type).toBe('semantic');
    expect(modalIssues[0].element).toBe('.modal');
  });

  it('does not flag dialog taller than viewport with overflow:auto', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.modal',
          tag: 'dialog',
          bounds: { x: 100, y: 0, w: 600, h: 1200 },
          computed: { overflow: 'auto' },
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const modalIssues = issues.filter((i) => i.context?.check === 'modal-overflow');
    expect(modalIssues).toEqual([]);
  });

  it('does not flag dialog smaller than viewport', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.modal',
          tag: 'dialog',
          bounds: { x: 100, y: 100, w: 600, h: 400 },
          // 400 < viewport height 800
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const modalIssues = issues.filter((i) => i.context?.check === 'modal-overflow');
    expect(modalIssues).toEqual([]);
  });

  it('does not flag non-dialog element taller than viewport', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.long-content',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 1280, h: 2000 },
          // Tall but not a dialog — normal page scrolling
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const modalIssues = issues.filter((i) => i.context?.check === 'modal-overflow');
    expect(modalIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// D4. Table Column Misalignment — table-misalignment
// ──────────────────────────────────────────

describe('checkSemantic — D4: table-misalignment', () => {
  it('flags th and td with different x positions (> 2px)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'table',
          tag: 'table',
          bounds: { x: 0, y: 0, w: 600, h: 200 },
          children: [
            makeElement({
              selector: 'table > thead',
              tag: 'thead',
              bounds: { x: 0, y: 0, w: 600, h: 40 },
              children: [
                makeElement({
                  selector: 'table > thead > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 0, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > thead > tr > th:nth-child(1)',
                      tag: 'th',
                      bounds: { x: 0, y: 0, w: 200, h: 40 },
                    }),
                    makeElement({
                      selector: 'table > thead > tr > th:nth-child(2)',
                      tag: 'th',
                      bounds: { x: 200, y: 0, w: 200, h: 40 },
                    }),
                  ],
                }),
              ],
            }),
            makeElement({
              selector: 'table > tbody',
              tag: 'tbody',
              bounds: { x: 0, y: 40, w: 600, h: 160 },
              children: [
                makeElement({
                  selector: 'table > tbody > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 40, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > tbody > tr > td:nth-child(1)',
                      tag: 'td',
                      bounds: { x: 10, y: 40, w: 190, h: 40 },
                      // x=10 vs th x=0 — 10px difference > 2px
                    }),
                    makeElement({
                      selector: 'table > tbody > tr > td:nth-child(2)',
                      tag: 'td',
                      bounds: { x: 200, y: 40, w: 200, h: 40 },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tableIssues = issues.filter((i) => i.context?.check === 'table-misalignment');
    expect(tableIssues.length).toBeGreaterThanOrEqual(1);
    expect(tableIssues[0].severity).toBe('error');
    expect(tableIssues[0].type).toBe('semantic');
    expect(tableIssues[0].element).toBeDefined();
    expect(tableIssues[0].element2).toBeDefined();
  });

  it('flags th and td with different widths (> 2px)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'table',
          tag: 'table',
          bounds: { x: 0, y: 0, w: 600, h: 200 },
          children: [
            makeElement({
              selector: 'table > thead',
              tag: 'thead',
              bounds: { x: 0, y: 0, w: 600, h: 40 },
              children: [
                makeElement({
                  selector: 'table > thead > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 0, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > thead > tr > th:nth-child(1)',
                      tag: 'th',
                      bounds: { x: 0, y: 0, w: 300, h: 40 },
                    }),
                  ],
                }),
              ],
            }),
            makeElement({
              selector: 'table > tbody',
              tag: 'tbody',
              bounds: { x: 0, y: 40, w: 600, h: 160 },
              children: [
                makeElement({
                  selector: 'table > tbody > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 40, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > tbody > tr > td:nth-child(1)',
                      tag: 'td',
                      bounds: { x: 0, y: 40, w: 250, h: 40 },
                      // w=250 vs th w=300 — 50px difference > 2px
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tableIssues = issues.filter((i) => i.context?.check === 'table-misalignment');
    expect(tableIssues.length).toBeGreaterThanOrEqual(1);
    expect(tableIssues[0].severity).toBe('error');
  });

  it('does not flag aligned columns (within 2px)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'table',
          tag: 'table',
          bounds: { x: 0, y: 0, w: 600, h: 200 },
          children: [
            makeElement({
              selector: 'table > thead',
              tag: 'thead',
              bounds: { x: 0, y: 0, w: 600, h: 40 },
              children: [
                makeElement({
                  selector: 'table > thead > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 0, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > thead > tr > th:nth-child(1)',
                      tag: 'th',
                      bounds: { x: 0, y: 0, w: 200, h: 40 },
                    }),
                    makeElement({
                      selector: 'table > thead > tr > th:nth-child(2)',
                      tag: 'th',
                      bounds: { x: 200, y: 0, w: 200, h: 40 },
                    }),
                  ],
                }),
              ],
            }),
            makeElement({
              selector: 'table > tbody',
              tag: 'tbody',
              bounds: { x: 0, y: 40, w: 600, h: 160 },
              children: [
                makeElement({
                  selector: 'table > tbody > tr',
                  tag: 'tr',
                  bounds: { x: 0, y: 40, w: 600, h: 40 },
                  children: [
                    makeElement({
                      selector: 'table > tbody > tr > td:nth-child(1)',
                      tag: 'td',
                      bounds: { x: 1, y: 40, w: 199, h: 40 },
                      // x=1 vs th x=0 — 1px difference <= 2px
                      // w=199 vs th w=200 — 1px difference <= 2px
                    }),
                    makeElement({
                      selector: 'table > tbody > tr > td:nth-child(2)',
                      tag: 'td',
                      bounds: { x: 201, y: 40, w: 199, h: 40 },
                      // x=201 vs th x=200 — 1px difference <= 2px
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tableIssues = issues.filter((i) => i.context?.check === 'table-misalignment');
    expect(tableIssues).toEqual([]);
  });

  it('does not flag non-table elements', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.grid',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 600, h: 200 },
          children: [
            makeElement({
              selector: '.grid-row',
              tag: 'div',
              bounds: { x: 0, y: 0, w: 600, h: 40 },
              children: [
                makeElement({
                  selector: '.grid-cell',
                  tag: 'div',
                  bounds: { x: 0, y: 0, w: 200, h: 40 },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const issues = checkSemantic(tree, viewport);
    const tableIssues = issues.filter((i) => i.context?.check === 'table-misalignment');
    expect(tableIssues).toEqual([]);
  });
});
