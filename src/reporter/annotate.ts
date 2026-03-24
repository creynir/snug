import type { AnnotatedNode, AnnotatedIssue, ExtractedElement, Issue } from '../types.js';

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
export function annotateTree(tree: ExtractedElement, issues: Issue[]): AnnotatedNode {
  // 1. Build Map<selector, Issue[]> from issues (keyed by issue.element)
  const issueMap = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = issueMap.get(issue.element);
    if (list) {
      list.push(issue);
    } else {
      issueMap.set(issue.element, [issue]);
    }
  }

  // 2. Recursive walk
  return walkNode(tree, issueMap);
}

function walkNode(node: ExtractedElement, issueMap: Map<string, Issue[]>): AnnotatedNode {
  const { selector, bounds, text, computed, children } = node;

  // Format label: "selector [x,y wxh]"
  const label = `${selector} [${bounds.x},${bounds.y} ${bounds.w}x${bounds.h}]`;

  // Look up issues for this node
  const nodeIssues = issueMap.get(selector);
  const hasIssues = nodeIssues !== undefined && nodeIssues.length > 0;

  // Build the annotated node
  const result: AnnotatedNode = { label };

  // Preserve text if present
  if (text !== undefined) {
    result.text = text;
  }

  // Map Issues to AnnotatedIssues (strip to type, severity, detail, data)
  if (hasIssues) {
    result.issues = nodeIssues.map(toAnnotatedIssue);
  }

  // Computed styles only on nodes with issues
  if (hasIssues && computed !== undefined) {
    result.computed = computed;
  }

  // Recurse children
  if (children.length > 0) {
    result.children = children.map((child) => walkNode(child, issueMap));
  }

  return result;
}

function toAnnotatedIssue(issue: Issue): AnnotatedIssue {
  const result: AnnotatedIssue = {
    type: issue.type,
    severity: issue.severity,
    detail: issue.detail,
  };
  if (issue.data !== undefined) {
    result.data = issue.data;
  }
  return result;
}
