import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect elements whose bounds extend beyond the viewport edges.
 *
 * Algorithm:
 *   For each element (recursive), check if right_edge > viewport.width
 *   or bounds.x < 0. Only horizontal overflow is flagged as error
 *   (vertical overflow is normal for scrollable pages).
 *
 * Severity: error (horizontal overflow makes content unreachable without horizontal scroll)
 *
 * See HLD §3.5.1 for full specification.
 */
export function checkViewportOverflow(tree: ExtractedElement, viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, viewport, issues);
  return issues;
}

function walk(el: ExtractedElement, viewport: Viewport, issues: Issue[]): void {
  const rightEdge = el.bounds.x + el.bounds.w;

  if (rightEdge > viewport.width) {
    const overflowX = rightEdge - viewport.width;
    issues.push({
      type: 'viewport-overflow',
      severity: 'error',
      element: el.selector,
      detail: `Overflows viewport right edge by ${overflowX}px`,
      computed: el.computed,
      data: { overflowX },
    });
  }

  if (el.bounds.x < 0) {
    issues.push({
      type: 'viewport-overflow',
      severity: 'error',
      element: el.selector,
      detail: `Overflows viewport left edge by ${Math.abs(el.bounds.x)}px`,
      computed: el.computed,
      data: { overflowX: Math.abs(el.bounds.x) },
    });
  }

  for (const child of el.children) {
    walk(child, viewport, issues);
  }
}
