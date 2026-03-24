import type { DiagnosticFn, ExtractedElement, Issue, Viewport } from '../types.js';
import { checkViewportOverflow } from './viewport-overflow.js';
import { checkContainment } from './containment.js';
import { checkSiblingOverlap } from './sibling-overlap.js';
import { checkTruncation } from './truncation.js';
import { checkSpacingAnomaly } from './spacing-anomaly.js';
import { checkAspectRatio } from './aspect-ratio.js';

/** Default diagnostic suite -- all Phase 1 checks. */
const DEFAULT_DIAGNOSTICS: DiagnosticFn[] = [
  checkViewportOverflow,
  checkContainment,
  checkSiblingOverlap,
  checkTruncation,
  checkSpacingAnomaly,
  checkAspectRatio,
];

/**
 * Run all diagnostics over the extracted element tree.
 *
 * Each diagnostic is a pure function: (tree, viewport) -> Issue[].
 * Results are concatenated into a flat Issue[] array.
 *
 * Accepts optional custom diagnostics array for extensibility.
 */
export function runDiagnostics(
  tree: ExtractedElement,
  viewport: Viewport,
  diagnostics?: DiagnosticFn[],
): Issue[] {
  if (!diagnostics) {
    throw new Error('Not implemented');
  }
  const issues: Issue[] = [];
  for (const fn of diagnostics) {
    issues.push(...fn(tree, viewport));
  }
  return issues;
}
