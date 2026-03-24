import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect overlapping sibling elements using AABB intersection tests.
 *
 * IMPORTANT: Check ALL siblings regardless of position (absolute/fixed/etc).
 * AI agents use position:absolute extensively — filtering it out would miss
 * the majority of real issues in agent-generated HTML.
 *
 * Z-index severity heuristic (Phase 1):
 *   - Same z-index + overlap → error (elements competing for same layer)
 *   - Different z-index + overlap → warning (might be intentional stacking)
 *   - Treat z-index 'auto' as 0 for comparison purposes
 *
 * Algorithm:
 *   For each parent, compare all pairs of direct children (O(k²) per level).
 *   AABB intersection: overlapX = max(0, min(a.right, b.right) - max(a.left, b.left))
 *   Skip trivial overlaps (< 1% of smaller element area).
 *
 * See HLD §3.5.3 for full specification.
 */
export function checkSiblingOverlap(tree: ExtractedElement, viewport: Viewport): Issue[] {
  // TODO: implement per HLD §3.5.3
  // - Recurse: for each element, check all pairs of children
  // - AABB intersection test with 1px tolerance
  // - Skip if overlapArea / smallerArea < 0.01
  // - Parse z-index (auto → 0) for both elements
  // - Use determineSeverity(overlapPercent, sameZIndex)
  // - Include both elements' position + zIndex in computed
  // - Include sameZIndex boolean in data
  throw new Error('Not implemented');
}

/**
 * Parse z-index value from computed style.
 * 'auto' and undefined → 0, numeric strings → parsed int.
 */
export function parseZIndex(value: string | undefined): number {
  // TODO: implement
  throw new Error('Not implemented');
}
