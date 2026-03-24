import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect aspect ratio distortion in images/video elements.
 *
 * Algorithm:
 *   For each element with natural dimensions (img elements that have loaded),
 *   compare natural aspect ratio to rendered aspect ratio.
 *   Flag if distortion exceeds 5%.
 *
 * Severity: error if distortion > 15%, warning if > 5%.
 *
 * See HLD §3.5.6 for full specification.
 */
export function checkAspectRatio(tree: ExtractedElement, viewport: Viewport): Issue[] {
  // TODO: implement per HLD §3.5.6
  // - Recurse through all elements
  // - Check element.natural exists (and dimensions > 0)
  // - Calculate naturalRatio = natural.width / natural.height
  // - Calculate renderedRatio = bounds.w / bounds.h
  // - Guard against zero bounds.h or natural.height
  // - distortion = abs(naturalRatio - renderedRatio) / naturalRatio
  // - > 15% → error, > 5% → warning
  // - Include objectFit, width, height in computed
  // - Include naturalRatio, renderedRatio, distortionPercent in data
  throw new Error('Not implemented');
}
