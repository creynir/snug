import type { ExtractedElement, Issue, IssueSeverity, Viewport } from '../types.js';

/**
 * Detect children whose bounds extend beyond their parent's bounds.
 *
 * Algorithm:
 *   For each parent-child pair, check if child bounds is a subset of parent bounds.
 *   Skip parents with overflow:hidden/scroll/auto (clipping is intentional).
 *   Report per-edge overflow distances.
 *
 * Severity: error if overflow > 20px, warning otherwise.
 * Tolerance: 1px to account for sub-pixel rounding.
 *
 * See HLD §3.5.2 for full specification.
 */
export function checkContainment(tree: ExtractedElement, _viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, issues);
  return issues;
}

const CLIP_VALUES = new Set(['hidden', 'scroll', 'auto']);
const TOLERANCE = 1;

function walk(parent: ExtractedElement, issues: Issue[]): void {
  const cs = parent.computed;
  const overflowAll = cs?.overflow;
  const clipBothAxes = overflowAll !== undefined && CLIP_VALUES.has(overflowAll);
  const clipX = clipBothAxes || (cs?.overflowX !== undefined && CLIP_VALUES.has(cs.overflowX));
  const clipY = clipBothAxes || (cs?.overflowY !== undefined && CLIP_VALUES.has(cs.overflowY));

  const parentRight = parent.bounds.x + parent.bounds.w;
  const parentBottom = parent.bounds.y + parent.bounds.h;

  for (const child of parent.children) {
    const childRight = child.bounds.x + child.bounds.w;
    const childBottom = child.bounds.y + child.bounds.h;

    let overflowLeft = Math.max(0, parent.bounds.x - child.bounds.x);
    let overflowTop = Math.max(0, parent.bounds.y - child.bounds.y);
    let overflowRight = Math.max(0, childRight - parentRight);
    let overflowBottom = Math.max(0, childBottom - parentBottom);

    // Zero out clipped axes
    if (clipX) {
      overflowLeft = 0;
      overflowRight = 0;
    }
    if (clipY) {
      overflowTop = 0;
      overflowBottom = 0;
    }

    // Apply 1px tolerance
    if (overflowLeft <= TOLERANCE) overflowLeft = 0;
    if (overflowTop <= TOLERANCE) overflowTop = 0;
    if (overflowRight <= TOLERANCE) overflowRight = 0;
    if (overflowBottom <= TOLERANCE) overflowBottom = 0;

    const maxOverflow = Math.max(overflowLeft, overflowTop, overflowRight, overflowBottom);
    if (maxOverflow > 0) {
      let severity: IssueSeverity = maxOverflow > 20 ? 'error' : 'warning';
      const sides: string[] = [];
      if (overflowLeft > 0) sides.push(`left(${overflowLeft}px)`);
      if (overflowTop > 0) sides.push(`top(${overflowTop}px)`);
      if (overflowRight > 0) sides.push(`right(${overflowRight}px)`);
      if (overflowBottom > 0) sides.push(`bottom(${overflowBottom}px)`);

      const edgeMounted = isEdgeMounted(
        child,
        overflowLeft,
        overflowRight,
        overflowTop,
        overflowBottom,
      );

      if (edgeMounted) {
        severity = 'warning';
      }

      const issue: Issue = {
        type: 'containment',
        severity,
        element: child.selector,
        element2: parent.selector,
        detail: `Exceeds parent bounds on ${sides.join(', ')}`,
        computed: child.computed,
        data: { overflowRight, overflowBottom, overflowLeft, overflowTop },
      };

      if (edgeMounted) {
        issue.context = { edgeMounted: 'true' };
      }

      issues.push(issue);
    }

    // Recurse into child
    walk(child, issues);
  }
}

const MAX_EDGE_ELEMENT_SIZE = 30;

function isEdgeMounted(
  child: ExtractedElement,
  overflowLeft: number,
  overflowRight: number,
  overflowTop: number,
  overflowBottom: number,
): boolean {
  if (overflowLeft > 0 && child.bounds.w <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowLeft / child.bounds.w;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  if (overflowRight > 0 && child.bounds.w <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowRight / child.bounds.w;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  if (overflowTop > 0 && child.bounds.h <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowTop / child.bounds.h;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  if (overflowBottom > 0 && child.bounds.h <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowBottom / child.bounds.h;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  return false;
}
