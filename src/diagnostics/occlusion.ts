import type { ExtractedElement, Issue, Viewport } from '../types.js';

function hasTextInSubtree(el: ExtractedElement): boolean {
  if (el.text?.trim().length) return true;
  for (const child of el.children) {
    if (hasTextInSubtree(child)) return true;
  }
  return false;
}

function getZIndex(el: ExtractedElement): number {
  const z = el.computed?.['z-index'] ?? el.computed?.zIndex;
  if (z === undefined || z === 'auto') return 0;
  const n = parseInt(z, 10);
  return isNaN(n) ? 0 : n;
}

export function checkOcclusion(tree: ExtractedElement, _viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  const elements: ExtractedElement[] = [];
  const parentPaths = new Map<ExtractedElement, ExtractedElement[]>();
  const domOrder = new Map<ExtractedElement, number>();
  let order = 0;

  function flatten(el: ExtractedElement, path: ExtractedElement[]): void {
    domOrder.set(el, order++);
    if (el.bounds.w * el.bounds.h > 100) {
      elements.push(el);
      parentPaths.set(el, [...path]);
    }
    for (const child of el.children) {
      flatten(child, [...path, el]);
    }
  }
  flatten(tree, []);

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];

      // AABB overlap
      const overlapX = Math.max(0,
        Math.min(a.bounds.x + a.bounds.w, b.bounds.x + b.bounds.w) -
        Math.max(a.bounds.x, b.bounds.x));
      const overlapY = Math.max(0,
        Math.min(a.bounds.y + a.bounds.h, b.bounds.y + b.bounds.h) -
        Math.max(a.bounds.y, b.bounds.y));
      if (overlapX <= 0 || overlapY <= 0) continue;

      const overlapArea = overlapX * overlapY;
      const smallerArea = Math.min(
        a.bounds.w * a.bounds.h,
        b.bounds.w * b.bounds.h);
      if (overlapArea / smallerArea < 0.5) continue;

      // Skip ancestor-descendant
      const pathA = parentPaths.get(a) ?? [];
      const pathB = parentPaths.get(b) ?? [];
      if (pathA.includes(b) || pathB.includes(a)) continue;

      // Skip direct siblings (handled by sibling-overlap)
      const parentA = pathA[pathA.length - 1];
      const parentB = pathB[pathB.length - 1];
      if (parentA !== undefined && parentA === parentB) continue;

      // Skip when one is a descendant of a sibling of the other
      // (e.g., .panel-a is child of .subtree-a which is sibling of .subtree-b)
      if (parentB !== undefined && pathA.includes(parentB)) continue;
      if (parentA !== undefined && pathB.includes(parentA)) continue;

      // Determine top element by z-index, fall back to DOM order
      const zA = getZIndex(a);
      const zB = getZIndex(b);
      let topEl: ExtractedElement;
      let bottomEl: ExtractedElement;
      if (zA !== zB) {
        topEl = zA > zB ? a : b;
        bottomEl = zA > zB ? b : a;
      } else {
        // Later in DOM order = on top
        const orderA = domOrder.get(a) ?? 0;
        const orderB = domOrder.get(b) ?? 0;
        topEl = orderB > orderA ? b : a;
        bottomEl = orderB > orderA ? a : b;
      }

      // Only flag if bottom element has text
      if (!hasTextInSubtree(bottomEl)) continue;

      issues.push({
        type: 'occlusion',
        severity: 'error',
        element: topEl.selector,
        element2: bottomEl.selector,
        detail: `Covers ${bottomEl.selector} by ${overlapX}x${overlapY}px (${Math.round(overlapArea / smallerArea * 100)}% of smaller element). Covered element contains text that may be unreadable.`,
        data: { overlapX, overlapY, overlapArea },
      });
    }
  }
  return issues;
}
