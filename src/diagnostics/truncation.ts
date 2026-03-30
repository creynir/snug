import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect text/content truncation where content overflows a hidden container.
 *
 * Algorithm:
 *   For each element that has scroll data (scrollWidth > clientWidth or
 *   scrollHeight > clientHeight), check if overflow is set to 'hidden'.
 *   If so, content is being clipped -- report the clipped amount.
 *
 * Severity: warning (truncation may be intentional with text-overflow: ellipsis,
 * but agents should still know about it).
 *
 * See HLD §3.5.4 for full specification.
 */
export function checkTruncation(tree: ExtractedElement, _viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, issues);
  return issues;
}

function walk(el: ExtractedElement, issues: Issue[]): void {
  if (el.scroll) {
    const cs = el.computed;
    const overflowAll = cs?.overflow;
    const overflowX = cs?.overflowX;
    const overflowY = cs?.overflowY;

    const xIsHidden = overflowAll === 'hidden' || overflowX === 'hidden';
    const yIsHidden = overflowAll === 'hidden' || overflowY === 'hidden';

    // C5: 3px truncation threshold — skip sub-pixel rounding
    const clippedH = el.scroll.scrollHeight - el.scroll.clientHeight;
    const clippedW = el.scroll.scrollWidth - el.scroll.clientWidth;
    if (clippedH <= 2 && clippedW <= 2) {
      // Sub-pixel rounding, not real truncation — skip
    } else {
      // Horizontal truncation
      if (el.scroll.scrollWidth > el.scroll.clientWidth && xIsHidden && clippedW > 2) {
        const clippedPx = clippedW;
        const issue: Issue = {
          type: 'truncation',
          severity: 'warning',
          element: el.selector,
          detail: `Content truncated horizontally. scrollWidth=${el.scroll.scrollWidth} > clientWidth=${el.scroll.clientWidth}, clipped by ${clippedPx}px`,
          computed: cs,
          data: { scrollWidth: el.scroll.scrollWidth, clientWidth: el.scroll.clientWidth, clippedPx },
        };
        // C6: text-overflow:ellipsis context marker
        if (cs?.textOverflow === 'ellipsis') {
          issue.context = { ...issue.context, intentionalEllipsis: 'true' };
        }
        issues.push(issue);
      }

      // Vertical truncation
      if (el.scroll.scrollHeight > el.scroll.clientHeight && yIsHidden && clippedH > 2) {
        const clippedPx = clippedH;
        const issue: Issue = {
          type: 'truncation',
          severity: 'warning',
          element: el.selector,
          detail: `Content truncated vertically. scrollHeight=${el.scroll.scrollHeight} > clientHeight=${el.scroll.clientHeight}, clipped by ${clippedPx}px`,
          computed: cs,
          data: {
            scrollHeight: el.scroll.scrollHeight,
            clientHeight: el.scroll.clientHeight,
            clippedPx,
          },
        };
        // C6: text-overflow:ellipsis context marker
        if (cs?.textOverflow === 'ellipsis') {
          issue.context = { ...issue.context, intentionalEllipsis: 'true' };
        }
        issues.push(issue);
      }
    }
  }

  for (const child of el.children) {
    walk(child, issues);
  }
}
