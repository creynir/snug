import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect inconsistent spacing between sibling elements using statistical
 * outlier detection.
 *
 * Algorithm:
 *   1. Requires >= 3 siblings to establish a pattern.
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
  const issues: Issue[] = [];
  walk(tree, issues);
  return issues;
}

function walk(el: ExtractedElement, issues: Issue[]): void {
  const siblings = el.children;

  if (siblings.length >= 3) {
    const axis = detectAxis(siblings);

    const gaps: { gap: number; between: [ExtractedElement, ExtractedElement] }[] = [];
    for (let i = 0; i < siblings.length - 1; i++) {
      let gap: number;
      if (axis === 'horizontal') {
        gap = siblings[i + 1].bounds.x - (siblings[i].bounds.x + siblings[i].bounds.w);
      } else {
        gap = siblings[i + 1].bounds.y - (siblings[i].bounds.y + siblings[i].bounds.h);
      }
      gaps.push({ gap, between: [siblings[i], siblings[i + 1]] });
    }

    const mode = computeMode(
      gaps.map((g) => g.gap),
      2,
    );
    const threshold = Math.max(4, Math.abs(mode) * 0.2);

    for (const { gap, between } of gaps) {
      const deviation = Math.abs(gap - mode);
      if (deviation > threshold) {
        issues.push({
          type: 'spacing-anomaly',
          severity: 'warning',
          element: between[1].selector,
          element2: between[0].selector,
          detail: `Gap ${gap}px deviates from sibling pattern (${mode}px). Delta: ${deviation}px`,
          data: { gap, mode, deviation },
        });
      }
    }
  }

  for (const child of el.children) {
    walk(child, issues);
  }
}

/**
 * Detect whether siblings are laid out horizontally or vertically.
 * Compares x-range vs y-range of sibling positions.
 */
export function detectAxis(siblings: ExtractedElement[]): 'horizontal' | 'vertical' {
  const xs = siblings.map((s) => s.bounds.x);
  const ys = siblings.map((s) => s.bounds.y);

  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);

  return xRange > yRange ? 'horizontal' : 'vertical';
}

/**
 * Find the statistical mode of a set of values, with tolerance grouping.
 * Groups values within `tolerance` px, returns the median of the largest group.
 */
export function computeMode(values: number[], tolerance: number): number {
  const sorted = [...values].sort((a, b) => a - b);

  let bestGroup: number[] = [];
  let currentGroup: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - currentGroup[0] <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      if (currentGroup.length > bestGroup.length) {
        bestGroup = currentGroup;
      }
      currentGroup = [sorted[i]];
    }
  }
  // Final group check
  if (currentGroup.length > bestGroup.length) {
    bestGroup = currentGroup;
  }

  // Return median of the largest group
  const mid = Math.floor(bestGroup.length / 2);
  return bestGroup[mid];
}
