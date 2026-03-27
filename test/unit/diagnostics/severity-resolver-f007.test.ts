import { describe, it, expect } from 'vitest';
import { resolveSeverity } from '../../../src/diagnostics/severity-resolver.js';
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
// Task 1: Compound Control Flag Override
// ──────────────────────────────────────────

describe('resolveSeverity — compound control flag override (FOLLOWUP-007 Task 1)', () => {
  it('1. does not upgrade sibling-overlap to error when issue has compoundControl context, even on critical element (input)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.form input',
          tag: 'input',
          attributes: { type: 'text' },
        }),
        makeElement({
          selector: '.form .icon',
          tag: 'span',
          bounds: { x: 0, y: 0, w: 20, h: 20 },
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'warning',
        element: '.form input',
        element2: '.form .icon',
        detail: 'Siblings overlap (compound form control)',
        context: { compoundControl: 'true' },
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // Should stay warning, NOT be upgraded to error despite critical tier
    expect(resolved[0].severity).toBe('warning');
  });

  it('2. still upgrades sibling-overlap to error for critical element without compoundControl context', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.form input',
          tag: 'input',
          attributes: { type: 'text' },
        }),
        makeElement({
          selector: '.form .other',
          tag: 'div',
          bounds: { x: 0, y: 0, w: 100, h: 100 },
        }),
      ],
    });

    const issues = [
      makeIssue({
        type: 'sibling-overlap',
        severity: 'warning',
        element: '.form input',
        element2: '.form .other',
        detail: 'Siblings overlap',
        // No compoundControl context
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // Should be upgraded to error for critical element without compoundControl
    expect(resolved[0].severity).toBe('error');
  });

  it('3. does not affect non-overlap issues on critical elements (viewport-overflow on input still upgrades)', () => {
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
        context: { compoundControl: 'true' },
      }),
    ];

    const resolved = resolveSeverity(issues, tree, viewport);
    expect(resolved.length).toBe(1);
    // viewport-overflow on critical element should still be upgraded to error
    expect(resolved[0].severity).toBe('error');
  });
});
