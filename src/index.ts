/**
 * Snug — Lightweight layout diagnostics for AI agents.
 *
 * Library API. Exports the pipeline and core types for programmatic use.
 */

// Core pipeline
export { check } from './pipeline.js';

// Types
export type {
  Bounds,
  Viewport,
  ExtractedElement,
  ExtractionOptions,
  Issue,
  IssueType,
  IssueSeverity,
  DiagnosticFn,
  SnugReport,
  AnnotatedNode,
  AnnotatedIssue,
  BrowserAdapter,
  RenderInput,
  PageHandle,
  CheckOptions,
} from './types.js';

// Browser adapters
export { PuppeteerAdapter } from './browser/puppeteer.js';

// Individual diagnostics (for custom pipelines)
export { checkViewportOverflow } from './diagnostics/viewport-overflow.js';
export { checkContainment } from './diagnostics/containment.js';
export { checkSiblingOverlap } from './diagnostics/sibling-overlap.js';
export { checkTruncation } from './diagnostics/truncation.js';
export { checkSpacingAnomaly } from './diagnostics/spacing-anomaly.js';
export { checkAspectRatio } from './diagnostics/aspect-ratio.js';
export { runDiagnostics } from './diagnostics/index.js';

// Reporter
export { annotateTree } from './reporter/annotate.js';
export { formatReport } from './reporter/format.js';

// Extractor
export { extractDOM } from './extractor/extract.js';
