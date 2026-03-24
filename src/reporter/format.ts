import { stringify } from 'yaml';
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
  // 1. Annotate tree
  const tree = annotateTree(report.tree, report.issues);

  // 2. Count errors and warnings
  let errors = 0;
  let warnings = 0;
  for (const issue of report.issues) {
    if (issue.severity === 'error') errors++;
    else warnings++;
  }

  // 3. Build report object
  const obj = {
    viewport: report.viewport,
    element_count: report.elementCount,
    summary: { errors, warnings },
    issues: report.issues,
    tree,
  };

  // 4. Serialize with yaml package
  return stringify(obj, { lineWidth: 0 });
}
