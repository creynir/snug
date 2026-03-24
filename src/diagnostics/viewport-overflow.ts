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
  // TODO: implement per HLD §3.5.1
  // - Recurse through all elements
  // - Check right_edge = bounds.x + bounds.w > viewport.width
  // - Check bounds.x < 0 (left overflow)
  // - Emit Issue with computed styles and overflow distance in data
  throw new Error('Not implemented');
}
