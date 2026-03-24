import type { DiagnosticFn, ExtractedElement, Issue, Viewport } from '../types.js';
import { checkViewportOverflow } from './viewport-overflow.js';
import { checkContainment } from './containment.js';
import { checkSiblingOverlap } from './sibling-overlap.js';
import { checkTruncation } from './truncation.js';
import { checkSpacingAnomaly } from './spacing-anomaly.js';
import { checkAspectRatio } from './aspect-ratio.js';

/** Default diagnostic suite — all Phase 1 checks. */
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
 * Each diagnostic is a pure function: (tree, viewport) → Issue[].
 * Results are concatenated and sorted by tree depth (issues closer
 * to root first).
 *
 * Accepts optional custom diagnostics array for extensibility.
 */
export function runDiagnostics(
  tree: ExtractedElement,
  viewport: Viewport,
  diagnostics: DiagnosticFn[] = DEFAULT_DIAGNOSTICS,
): Issue[] {
  // TODO: implement
  // - Run each diagnostic function
  // - Concatenate all Issue[] results
  // - Sort by tree depth (optional — issues closer to root first)
  // - Return flat Issue[]
  throw new Error('Not implemented');
}
