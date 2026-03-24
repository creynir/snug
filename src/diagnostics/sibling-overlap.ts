import type { ExtractedElement, Issue, IssueSeverity, Viewport } from '../types.js';

/**
 * Detect overlapping sibling elements using AABB intersection tests.
 *
 * IMPORTANT: Check ALL siblings regardless of position (absolute/fixed/etc).
 * AI agents use position:absolute extensively — filtering it out would miss
 * the majority of real issues in agent-generated HTML.
 *
 * Z-index severity heuristic (Phase 1):
 *   - Same z-index + overlap -> error (elements competing for same layer)
 *   - Different z-index + overlap -> warning (might be intentional stacking)
 *   - Treat z-index 'auto' as 0 for comparison purposes
 *
 * Algorithm:
 *   For each parent, compare all pairs of direct children (O(k^2) per level).
 *   AABB intersection: overlapX = max(0, min(a.right, b.right) - max(a.left, b.left))
 *   Skip trivial overlaps (< 1% of smaller element area).
 *
 * See HLD §3.5.3 for full specification.
 */
export function checkSiblingOverlap(tree: ExtractedElement, viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, issues);
  return issues;
}

function walk(parent: ExtractedElement, issues: Issue[]): void {
  const siblings = parent.children;

  for (let i = 0; i < siblings.length; i++) {
    for (let j = i + 1; j < siblings.length; j++) {
      const a = siblings[i];
      const b = siblings[j];

      const overlapX = Math.max(
        0,
        Math.min(a.bounds.x + a.bounds.w, b.bounds.x + b.bounds.w) -
          Math.max(a.bounds.x, b.bounds.x),
      );
      const overlapY = Math.max(
        0,
        Math.min(a.bounds.y + a.bounds.h, b.bounds.y + b.bounds.h) -
          Math.max(a.bounds.y, b.bounds.y),
      );

      // 1px tolerance on each axis
      if (overlapX <= 1 || overlapY <= 1) continue;

      const overlapArea = overlapX * overlapY;
      const areaA = a.bounds.w * a.bounds.h;
      const areaB = b.bounds.w * b.bounds.h;
      const smallerArea = Math.min(areaA, areaB);

      // Skip trivial overlaps (< 1% of smaller element)
      if (smallerArea === 0 || overlapArea / smallerArea < 0.01) continue;

      const zA = parseZIndex(a.computed?.zIndex);
      const zB = parseZIndex(b.computed?.zIndex);
      const sameZIndex = zA === zB;

      const overlapPercent = overlapArea / smallerArea;
      const severity = determineSeverity(overlapPercent, sameZIndex);

      issues.push({
        type: 'sibling-overlap',
        severity,
        element: a.selector,
        element2: b.selector,
        detail: `Overlaps by ${overlapX}x${overlapY}px (${Math.round(overlapPercent * 100)}% of smaller element)`,
        computed: {
          [a.selector]: a.computed ?? {},
          [b.selector]: b.computed ?? {},
        },
        data: { overlapX, overlapY, overlapArea, sameZIndex },
      });
    }
  }

  for (const child of parent.children) {
    walk(child, issues);
  }
}

function determineSeverity(overlapPercent: number, sameZIndex: boolean): IssueSeverity {
  if (sameZIndex) {
    return overlapPercent > 0.10 ? 'error' : 'warning';
  }
  return overlapPercent > 0.50 ? 'error' : 'warning';
}

/**
 * Parse z-index value from computed style.
 * 'auto' and undefined -> 0, numeric strings -> parsed int.
 */
export function parseZIndex(value: string | undefined): number {
  if (value === undefined || value === 'auto') return 0;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}
