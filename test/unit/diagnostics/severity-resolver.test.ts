import { describe, it, expect } from 'vitest';
import { resolveSeverity, classifyElement } from '../../../src/diagnostics/severity-resolver.js';
import type { ExtractedElement, Issue, Viewport } from '../../../src/types.js';

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

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    type: 'viewport-overflow',
    severity: 'warning',
    element: '.test',
    detail: 'Test issue',
    ...overrides,
  };
}

// ──────────────────────────────────────────
// Tier Classification
// ──────────────────────────────────────────

describe('classifyElement — tier classification', () => {
  it('1. classifies button[type=submit] as critical', () => {
    const el = makeElement({
      tag: 'button',
      selector: '.form button',
      attributes: { type: 'submit' },
    });
    expect(classifyElement(el)).toBe('critical');
  });

  it('2. classifies <input> as critical', () => {
    const el = makeElement({
      tag: 'input',
      selector: '.form input',
      attributes: { type: 'text' },
    });
    expect(classifyElement(el)).toBe('critical');
  });

  it('3. classifies <dialog> as critical', () => {
    const el = makeElement({
      tag: 'dialog',
      selector: '.modal',
    });
    expect(classifyElement(el)).toBe('critical');
  });

  it('4. classifies <nav> as functional', () => {
    const el = makeElement({
      tag: 'nav',
      selector: '.main-nav',
    });
    expect(classifyElement(el)).toBe('functional');
  });

  it('5. classifies <img> as functional', () => {
    const el = makeElement({
      tag: 'img',
      selector: '.hero img',
    });
    expect(classifyElement(el)).toBe('functional');
  });

  it('6. classifies <p> as functional', () => {
    const el = makeElement({
      tag: 'p',
      selector: '.content p',
    });
    expect(classifyElement(el)).toBe('functional');
  });

  it('7. classifies <div> as decorative', () => {
    const el = makeElement({
      tag: 'div',
      selector: '.wrapper',
    });
    expect(classifyElement(el)).toBe('decorative');
  });

  it('8. classifies <span> as decorative', () => {
    const el = makeElement({
      tag: 'span',
      selector: '.icon',
    });
    expect(classifyElement(el)).toBe('decorative');
  });
});

// ──────────────────────────────────────────
// Upgrades — Critical Elements
// ──────────────────────────────────────────

describe('resolveSeverity — critical upgrades', () => {
  it('9. upgrades warning to error for critical element (input with viewport-overflow)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.form input',
          tag: 'input',
          attributes: { type: 'email' },
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'viewport-overflow',
        severity: 'warning',
        element: '.form input',
        detail: 'Element extends beyond viewport',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('error');
    expect(resolved[0].context?.severityReason).toBe(
      'Critical element affected — may block user task.'
    );
  });

  it('10. does not upgrade error (already error — no change needed)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.form select',
          tag: 'select',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.form select',
        detail: 'Element escapes parent bounds',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('error');
    // Should not have originalSeverity since it was already error
    expect(resolved[0].context?.originalSeverity).toBeUndefined();
  });

  it('11. does not upgrade functional element warning', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.nav',
          tag: 'nav',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'viewport-overflow',
        severity: 'warning',
        element: '.nav',
        detail: 'Element extends beyond viewport',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('warning');
  });
});

// ──────────────────────────────────────────
// Downgrades — Decorative Elements
// ──────────────────────────────────────────

describe('resolveSeverity — decorative downgrades', () => {
  it('12. downgrades containment error to warning for <div>', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.wrapper',
          tag: 'div',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.wrapper',
        detail: 'Child escapes parent bounds',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('warning');
    expect(resolved[0].context?.severityReason).toBe(
      'Generic element — spatial issue may be intentional.'
    );
  });

  it('13. downgrades sibling-overlap error to warning for <span>', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.icon-a',
          tag: 'span',
        }),
        makeElement({
          selector: '.icon-b',
          tag: 'span',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'error',
        element: '.icon-a',
        element2: '.icon-b',
        detail: 'Siblings overlap',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('warning');
    expect(resolved[0].context?.severityReason).toBe(
      'Generic element — spatial issue may be intentional.'
    );
  });

  it('14. does not downgrade viewport-overflow error for decorative element', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.bg-decoration',
          tag: 'div',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'viewport-overflow',
        severity: 'error',
        element: '.bg-decoration',
        detail: 'Element extends beyond viewport',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('error');
  });

  it('15. does not downgrade anything for functional elements', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.hero img',
          tag: 'img',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.hero img',
        detail: 'Image escapes parent',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('error');
  });
});

// ──────────────────────────────────────────
// Text-on-Text Override
// ──────────────────────────────────────────

describe('resolveSeverity — text-on-text override', () => {
  it('16. upgrades sibling-overlap to error when both elements have text', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.label-a',
          tag: 'p',
          text: 'First paragraph',
        }),
        makeElement({
          selector: '.label-b',
          tag: 'p',
          text: 'Second paragraph',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'warning',
        element: '.label-a',
        element2: '.label-b',
        detail: 'Siblings overlap',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('error');
    expect(resolved[0].context?.severityReason).toBe(
      'Text overlapping text — content is unreadable.'
    );
  });

  it('17. does not upgrade when only one element has text', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.text-el',
          tag: 'p',
          text: 'Some text',
        }),
        makeElement({
          selector: '.empty-el',
          tag: 'div',
          // No text
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'warning',
        element: '.text-el',
        element2: '.empty-el',
        detail: 'Siblings overlap',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].severity).toBe('warning');
    expect(resolved[0].context?.severityReason).not.toBe(
      'Text overlapping text — content is unreadable.'
    );
  });

  it('18. text-on-text overrides decorative downgrade (both spans with text — still error)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.tag-a',
          tag: 'span',
          text: 'Tag one',
        }),
        makeElement({
          selector: '.tag-b',
          tag: 'span',
          text: 'Tag two',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'error',
        element: '.tag-a',
        element2: '.tag-b',
        detail: 'Decorative spans overlap with text',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // Text-on-text overrides decorative downgrade — stays error
    expect(resolved[0].severity).toBe('error');
    expect(resolved[0].context?.severityReason).toBe(
      'Text overlapping text — content is unreadable.'
    );
  });
});

// ──────────────────────────────────────────
// Context Fields
// ──────────────────────────────────────────

describe('resolveSeverity — context fields', () => {
  it('19. adds semanticTier to context on all processed issues', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.nav',
          tag: 'nav',
        }),
        makeElement({
          selector: '.wrapper',
          tag: 'div',
        }),
        makeElement({
          selector: '.form input',
          tag: 'input',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'viewport-overflow',
        severity: 'warning',
        element: '.nav',
        detail: 'Nav overflows',
      }),
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.wrapper',
        detail: 'Div containment issue',
      }),
      makeIssue({
        type: 'viewport-overflow',
        severity: 'warning',
        element: '.form input',
        detail: 'Input overflows',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(3);
    expect(resolved[0].context?.semanticTier).toBe('functional');
    expect(resolved[1].context?.semanticTier).toBe('decorative');
    expect(resolved[2].context?.semanticTier).toBe('critical');
  });

  it('20. adds originalSeverity when severity changed', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.form input',
          tag: 'input',
          attributes: { type: 'text' },
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'viewport-overflow',
        severity: 'warning',
        element: '.form input',
        detail: 'Input overflows viewport',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    expect(resolved[0].context?.originalSeverity).toBe('warning');
  });

  it('21. preserves existing context fields', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.card',
          tag: 'div',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.card',
        detail: 'Child escapes parent',
        context: { clippedBy: '.parent', direction: 'right' },
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // Original context fields should still be there
    expect(resolved[0].context?.clippedBy).toBe('.parent');
    expect(resolved[0].context?.direction).toBe('right');
    // And new context fields added
    expect(resolved[0].context?.semanticTier).toBe('decorative');
  });

  it('22. does not add originalSeverity when severity unchanged', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.hero img',
          tag: 'img',
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'containment',
        severity: 'error',
        element: '.hero img',
        detail: 'Image escapes container',
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // Functional element, error severity — no rule changes it
    expect(resolved[0].severity).toBe('error');
    expect(resolved[0].context?.originalSeverity).toBeUndefined();
    // But semanticTier should still be there
    expect(resolved[0].context?.semanticTier).toBe('functional');
  });
});
