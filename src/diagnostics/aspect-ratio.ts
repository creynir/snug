import type { ExtractedElement, Issue, IssueSeverity, Viewport } from '../types.js';

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
export function checkAspectRatio(tree: ExtractedElement, _viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, issues);
  return issues;
}

function walk(el: ExtractedElement, issues: Issue[]): void {
  if (el.natural) {
    // Guard against zero dimensions
    if (el.natural.height > 0 && el.natural.width > 0 && el.bounds.h > 0 && el.bounds.w > 0) {
      const naturalRatio = el.natural.width / el.natural.height;
      const renderedRatio = el.bounds.w / el.bounds.h;
      const distortion = Math.abs(naturalRatio - renderedRatio) / naturalRatio;
      const distortionPercent = Math.round(distortion * 100);

      if (distortionPercent > 5) {
        const severity: IssueSeverity = distortionPercent > 15 ? 'error' : 'warning';

        issues.push({
          type: 'aspect-ratio',
          severity,
          element: el.selector,
          detail: `Aspect ratio distorted. Natural: ${el.natural.width}x${el.natural.height} (${naturalRatio.toFixed(2)}), rendered: ${el.bounds.w}x${el.bounds.h} (${renderedRatio.toFixed(2)}). Distortion: ${distortionPercent}%`,
          computed: el.computed,
          data: { naturalRatio, renderedRatio, distortionPercent },
        });
      }
    }
  }

  for (const child of el.children) {
    walk(child, issues);
  }
}
