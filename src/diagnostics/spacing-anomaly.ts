import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect inconsistent spacing between sibling elements using statistical
 * outlier detection.
 *
 * Algorithm:
 *   1. Requires ≥ 3 siblings to establish a pattern.
 *   2. Detect dominant axis (horizontal or vertical) from coordinate ranges.
 *   3. Compute gaps between consecutive siblings along that axis.
 *   4. Find the mode (most common gap, within 2px tolerance grouping).
 *   5. Flag gaps that deviate by > max(4px, 20% of mode).
 *
 * Severity: warning
 *
 * See HLD §3.5.5 for full specification.
 */
export function checkSpacingAnomaly(tree: ExtractedElement, viewport: Viewport): Issue[] {
  // TODO: implement per HLD §3.5.5
  // - Recurse: for each element with ≥ 3 children
  // - detectAxis(siblings) → 'horizontal' | 'vertical'
  // - Compute gaps between consecutive siblings on that axis
  // - computeMode(gaps, tolerance=2)
  // - Flag deviations > max(4, mode * 0.2)
  // - Include gap, mode, deviation in data
  throw new Error('Not implemented');
}

/**
 * Detect whether siblings are laid out horizontally or vertically.
 * Compares x-range vs y-range of sibling positions.
 */
export function detectAxis(siblings: ExtractedElement[]): 'horizontal' | 'vertical' {
  // TODO: implement per HLD §3.5.5
  throw new Error('Not implemented');
}

/**
 * Find the statistical mode of a set of values, with tolerance grouping.
 * Groups values within `tolerance` px, returns the median of the largest group.
 */
export function computeMode(values: number[], tolerance: number): number {
  // TODO: implement per HLD §3.5.5
  throw new Error('Not implemented');
}
