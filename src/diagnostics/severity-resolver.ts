import type { ExtractedElement, Issue, Viewport } from '../types.js';

const CRITICAL_TAGS = new Set(['input', 'select', 'textarea', 'dialog']);
const CRITICAL_ROLES = new Set(['dialog']);
const FUNCTIONAL_TAGS = new Set([
  'nav', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'main', 'header', 'footer', 'aside', 'img', 'video', 'table',
  'p', 'li', 'td', 'th', 'article', 'section',
]);
const FUNCTIONAL_ROLES = new Set(['navigation']);

function findInTree(tree: ExtractedElement, selector: string): ExtractedElement | null {
  if (tree.selector === selector) return tree;
  for (const child of tree.children) {
    const found = findInTree(child, selector);
    if (found) return found;
  }
  return null;
}

function hasText(el: ExtractedElement): boolean {
  if (el.text?.trim().length) return true;
  for (const child of el.children) {
    if (hasText(child)) return true;
  }
  return false;
}

export function classifyElement(el: ExtractedElement): 'critical' | 'functional' | 'decorative' {
  if (CRITICAL_TAGS.has(el.tag)) return 'critical';
  if (el.tag === 'button' && el.attributes?.type === 'submit') return 'critical';
  if (el.attributes?.role && CRITICAL_ROLES.has(el.attributes.role)) return 'critical';

  if (FUNCTIONAL_TAGS.has(el.tag)) return 'functional';
  if (el.attributes?.role && FUNCTIONAL_ROLES.has(el.attributes.role)) return 'functional';

  return 'decorative';
}

export function resolveSeverity(issues: Issue[], tree: ExtractedElement, _viewport: Viewport): Issue[] {
  return issues.map((issue) => {
    const el = findInTree(tree, issue.element);
    const tier = el ? classifyElement(el) : 'decorative';
    const originalSeverity = issue.severity;
    let severity = issue.severity;
    let severityReason: string | undefined;

    // Rule 3 (Text-on-text override) — check first, applied last
    // Skip when different z-index (intentional layering)
    let textOnText = false;
    if (issue.type === 'sibling-overlap' && issue.element2 && issue.data?.sameZIndex !== false) {
      const el2 = findInTree(tree, issue.element2);
      if (el && el2 && hasText(el) && hasText(el2)) {
        textOnText = true;
      }
    }

    // Rule 1: Critical upgrade
    if (tier === 'critical' && severity === 'warning') {
      if (issue.type === 'sibling-overlap' && issue.context?.compoundControl === 'true') {
        // Skip — compound form control overlap is always intentional
      } else {
        severity = 'error';
        severityReason = 'Critical element affected — may block user task.';
      }
    }

    // Rule 2: Decorative downgrade (containment or sibling-overlap only)
    if (
      tier === 'decorative' &&
      severity === 'error' &&
      (issue.type === 'containment' || issue.type === 'sibling-overlap')
    ) {
      severity = 'warning';
      severityReason = 'Generic element — spatial issue may be intentional.';
    }

    // Rule 3: Text-on-text override (overrides Rule 2)
    if (textOnText) {
      severity = 'error';
      severityReason = 'Text overlapping text — content is unreadable.';
    }

    const ruleApplied = severity !== originalSeverity || severityReason !== undefined;
    const hasContext = ruleApplied || tier !== 'decorative' || issue.context !== undefined;

    if (!hasContext) {
      return { ...issue, severity };
    }

    const context: Record<string, string> = {
      ...issue.context,
      semanticTier: tier,
    };

    if (severity !== originalSeverity) {
      context.originalSeverity = originalSeverity;
    }

    if (severityReason) {
      context.severityReason = severityReason;
    }

    return { ...issue, severity, context };
  });
}
