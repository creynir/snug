import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect children whose bounds extend beyond their parent's bounds.
 *
 * Algorithm:
 *   For each parent-child pair, check if child bounds ⊆ parent bounds.
 *   Skip parents with overflow:hidden/scroll/auto (clipping is intentional).
 *   Report per-edge overflow distances.
 *
 * Severity: error if overflow > 20px, warning otherwise.
 * Tolerance: 1px to account for sub-pixel rounding.
 *
 * See HLD §3.5.2 for full specification.
 */
export function checkContainment(tree: ExtractedElement, viewport: Viewport): Issue[] {
  // TODO: implement per HLD §3.5.2
  // - Recursive: for each element, check all children against parent bounds
  // - Skip if parent.computed.overflow is hidden/scroll/auto
  // - Skip if parent.computed.overflowX or overflowY is hidden/scroll/auto (per axis)
  // - Calculate overflowRight, overflowBottom, overflowLeft, overflowTop
  // - 1px tolerance for rounding
  // - Include child's computed styles in issue
  throw new Error('Not implemented');
}
