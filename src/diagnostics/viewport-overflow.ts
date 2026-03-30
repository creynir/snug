import type { ExtractedElement, Issue, IssueSeverity, Viewport } from '../types.js';

/**
 * Detect elements whose bounds extend beyond the viewport edges.
 *
 * Algorithm:
 *   For each element (recursive), check if right_edge > viewport.width
 *   or bounds.x < 0. Only horizontal overflow is flagged as error
 *   (vertical overflow is normal for scrollable pages).
 *
 * Clipping-ancestor context (FOLLOWUP-001 Change 2):
 *   If an overflowing element has an ancestor with overflow:hidden/scroll/auto,
 *   it is visually clipped — downgrade to warning and include context.clippedBy.
 *   The clipping ancestor clips the child regardless of the ancestor's own
 *   position relative to the viewport, so severity is always warning.
 *
 * See HLD §3.5.1 for full specification.
 */
export function checkViewportOverflow(tree: ExtractedElement, viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, viewport, issues, undefined, false, []);
  return issues;
}

function isAncestorFullyOffScreen(ancestors: ExtractedElement[], viewport: Viewport): boolean {
  return ancestors.some(a =>
    a.bounds.x + a.bounds.w <= 0 ||
    a.bounds.y + a.bounds.h <= 0 ||
    a.bounds.x >= viewport.width ||
    a.bounds.y >= viewport.height
  );
}

function hasContainPaint(el: ExtractedElement): boolean {
  const contain = el.computed?.contain;
  if (!contain) return false;
  return contain.includes('paint') || contain === 'strict' || contain === 'content';
}

function isClippingElement(el: ExtractedElement): boolean {
  if (hasContainPaint(el)) return true;
  const overflow = el.computed?.overflow as string | undefined;
  const overflowX = el.computed?.overflowX as string | undefined;
  return (
    overflow === 'hidden' ||
    overflow === 'scroll' ||
    overflow === 'auto' ||
    overflow === 'clip' ||
    overflowX === 'hidden' ||
    overflowX === 'scroll' ||
    overflowX === 'auto' ||
    overflowX === 'clip'
  );
}

function walk(
  el: ExtractedElement,
  viewport: Viewport,
  issues: Issue[],
  clippingAncestor: ExtractedElement | undefined,
  insideSvg: boolean,
  ancestors: ExtractedElement[],
): void {
  if (isAncestorFullyOffScreen(ancestors, viewport)) return;

  const rightEdge = el.bounds.x + el.bounds.w;

  if (!insideSvg && rightEdge > viewport.width) {
    const overflowX = rightEdge - viewport.width;
    if (clippingAncestor) {
      const severity: IssueSeverity = 'warning';
      issues.push({
        type: 'viewport-overflow',
        severity,
        element: el.selector,
        detail: `Overflows viewport right edge by ${overflowX}px (visually clipped by ${clippingAncestor.selector})`,
        computed: el.computed,
        data: { overflowX },
        context: { clippedBy: clippingAncestor.selector },
      });
    } else {
      issues.push({
        type: 'viewport-overflow',
        severity: 'error',
        element: el.selector,
        detail: `Overflows viewport right edge by ${overflowX}px`,
        computed: el.computed,
        data: { overflowX },
      });
    }
  }

  if (!insideSvg && el.bounds.x < 0) {
    if (clippingAncestor) {
      const severity: IssueSeverity = 'warning';
      issues.push({
        type: 'viewport-overflow',
        severity,
        element: el.selector,
        detail: `Overflows viewport left edge by ${Math.abs(el.bounds.x)}px (visually clipped by ${clippingAncestor.selector})`,
        computed: el.computed,
        data: { overflowX: Math.abs(el.bounds.x) },
        context: { clippedBy: clippingAncestor.selector },
      });
    } else {
      issues.push({
        type: 'viewport-overflow',
        severity: 'error',
        element: el.selector,
        detail: `Overflows viewport left edge by ${Math.abs(el.bounds.x)}px`,
        computed: el.computed,
        data: { overflowX: Math.abs(el.bounds.x) },
      });
    }
  }

  // Determine the clipping ancestor for children
  const nextClipping = isClippingElement(el) ? el : clippingAncestor;
  const nextInsideSvg = insideSvg || el.tag === 'svg';

  for (const child of el.children) {
    walk(child, viewport, issues, nextClipping, nextInsideSvg, [...ancestors, el]);
  }
}
