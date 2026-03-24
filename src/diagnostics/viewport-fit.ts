import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect layout failures on non-scrollable pages.
 *
 * Check A: Direct children extending below the viewport on non-scrollable pages.
 * Check B: Content compression (scrollHeight > clientHeight + overflow:hidden).
 *
 * Only runs when body has overflow: hidden or overflow-y: hidden.
 *
 * See FOLLOWUP-001 Change 1 for full specification.
 */
export function checkViewportFit(tree: ExtractedElement, viewport: Viewport): Issue[] {
  if (!isNonScrollable(tree)) return [];

  const issues: Issue[] = [];

  // Check A: Children extending below viewport
  checkChildrenBelowViewport(tree, viewport, issues);
  // Single layout container pattern (body > #app > children)
  if (tree.children.length === 1) {
    checkChildrenBelowViewport(tree.children[0], viewport, issues);
  }

  // Check B: Content compression (recursive)
  walkCompression(tree, issues);

  return issues;
}

function isNonScrollable(tree: ExtractedElement): boolean {
  const overflow = tree.computed?.overflow as string | undefined;
  const overflowY = tree.computed?.overflowY as string | undefined;
  return overflow === 'hidden' || overflowY === 'hidden';
}

function checkChildrenBelowViewport(
  parent: ExtractedElement,
  viewport: Viewport,
  issues: Issue[],
): void {
  for (const child of parent.children) {
    const bottomEdge = child.bounds.y + child.bounds.h;
    if (bottomEdge > viewport.height) {
      // Avoid duplicate issues if the same element was already flagged
      if (issues.some(i => i.element === child.selector && i.data?.bottomEdge !== undefined)) continue;
      issues.push({
        type: 'viewport-fit',
        severity: 'error',
        element: child.selector,
        detail: `Extends below viewport on non-scrollable page. Bottom edge at ${bottomEdge}px, viewport ends at ${viewport.height}px`,
        computed: child.computed,
        data: { bottomEdge, viewportHeight: viewport.height, overflowY: bottomEdge - viewport.height },
      });
    }
  }
}

function walkCompression(el: ExtractedElement, issues: Issue[]): void {
  if (el.scroll && el.scroll.scrollHeight > el.scroll.clientHeight) {
    const elOverflow = el.computed?.overflow as string | undefined;
    if (elOverflow === 'hidden') {
      const compressionPx = el.scroll.scrollHeight - el.scroll.clientHeight;
      issues.push({
        type: 'viewport-fit',
        severity: 'warning',
        element: el.selector,
        detail: `Content compressed on non-scrollable page. Needs ${el.scroll.scrollHeight}px, rendered at ${el.scroll.clientHeight}px (missing ${compressionPx}px)`,
        computed: el.computed,
        data: { scrollHeight: el.scroll.scrollHeight, clientHeight: el.scroll.clientHeight, compressionPx },
      });
    }
  }

  for (const child of el.children) {
    walkCompression(child, issues);
  }
}
