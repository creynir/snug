import type { AnnotatedNode, ExtractedElement, Issue } from '../types.js';

/**
 * Annotate the extracted DOM tree with diagnostic issues.
 *
 * Takes the raw ExtractedElement tree and the flat Issue[] list,
 * and produces an AnnotatedNode tree where:
 * - Each node has a compact label: "selector [x,y wxh]"
 * - Issues are attached inline to the nodes where they occur
 * - Computed styles are only included on nodes with issues
 * - Text content is preserved for leaf-like elements
 *
 * Algorithm:
 *   1. Build a Map<selector, Issue[]> from the flat issues list.
 *   2. Walk the ExtractedElement tree depth-first.
 *   3. At each node, format label, look up issues, attach inline.
 *   4. Only include computed styles on nodes that have issues.
 *
 * See HLD §3.6 for full specification.
 */
export function annotateTree(
  tree: ExtractedElement,
  issues: Issue[],
): AnnotatedNode {
  // TODO: implement per HLD §3.6
  // - Build Map<selector, Issue[]> from issues (keyed by issue.element)
  // - Recursive walk of tree
  // - Format label: `${selector} [${bounds.x},${bounds.y} ${bounds.w}x${bounds.h}]`
  // - Match issues to nodes by selector
  // - Only attach computed when issues exist
  // - Recurse into children
  throw new Error('Not implemented');
}
