import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect text/content truncation where content overflows a hidden container.
 *
 * Algorithm:
 *   For each element that has scroll data (scrollWidth > clientWidth or
 *   scrollHeight > clientHeight), check if overflow is set to 'hidden'.
 *   If so, content is being clipped — report the clipped amount.
 *
 * Severity: warning (truncation may be intentional with text-overflow: ellipsis,
 * but agents should still know about it).
 *
 * See HLD §3.5.4 for full specification.
 */
export function checkTruncation(tree: ExtractedElement, viewport: Viewport): Issue[] {
  // TODO: implement per HLD §3.5.4
  // - Recurse through all elements
  // - Check element.scroll exists
  // - Horizontal: scrollWidth > clientWidth AND overflow/overflowX is 'hidden'
  // - Vertical: scrollHeight > clientHeight AND overflow/overflowY is 'hidden'
  // - Include overflow, textOverflow, whiteSpace, width in computed
  // - Include scrollWidth, clientWidth, clippedPx in data
  throw new Error('Not implemented');
}
