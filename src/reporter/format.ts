import type { SnugReport } from '../types.js';
import { annotateTree } from './annotate.js';

/**
 * Format a SnugReport as a YAML string for stdout.
 *
 * Output structure:
 *   - Header: viewport, element_count, summary (error/warning counts)
 *   - Issues: flat list of all issues with full detail
 *   - Tree: bird-view AST tree with inline issue annotations
 *
 * YAML options:
 *   - lineWidth: 0 (no line wrapping — agents parse full lines)
 *   - Block style by default
 *   - Compact bounds notation [x,y wxh] pre-formatted as strings
 *
 * See HLD §3.7 and §5.1 for full output specification.
 */
export function formatReport(report: SnugReport): string {
  // TODO: implement per HLD §3.7 and §5.1
  // 1. Annotate tree: annotateTree(report.tree, report.issues)
  // 2. Build report object:
  //    - viewport: { width, height }
  //    - element_count: report.elementCount
  //    - summary: { errors: count, warnings: count }
  //    - issues: report.issues (flat list)
  //    - tree: annotated tree (compact notation)
  // 3. Serialize with yaml package
  //    - import { stringify } from 'yaml'
  //    - stringify(reportObj, { lineWidth: 0 })
  // 4. Return YAML string
  throw new Error('Not implemented');
}
