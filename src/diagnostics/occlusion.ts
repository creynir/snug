import type { ExtractedElement, Issue, Viewport, Bounds, VisibilityMap } from '../types.js';
import { classifyElement } from './severity-resolver.js';

// ── Helpers ──

function flattenDFS(tree: ExtractedElement): ExtractedElement[] {
  const result: ExtractedElement[] = [];
  function walk(el: ExtractedElement): void {
    result.push(el);
    for (const child of el.children) walk(child);
  }
  walk(tree);
  return result;
}

function buildParentMap(tree: ExtractedElement): Map<ExtractedElement, ExtractedElement | null> {
  const map = new Map<ExtractedElement, ExtractedElement | null>();
  map.set(tree, null);
  function walk(el: ExtractedElement): void {
    for (const child of el.children) {
      map.set(child, el);
      walk(child);
    }
  }
  walk(tree);
  return map;
}

function hasTextRecursive(el: ExtractedElement): boolean {
  if (el.text?.trim().length) return true;
  for (const child of el.children) {
    if (hasTextRecursive(child)) return true;
  }
  return false;
}

const INTERACTIVE_TAGS = new Set(['input', 'select', 'textarea', 'button', 'a']);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio',
  'combobox', 'listbox', 'slider', 'switch', 'tab',
]);
const MEDIA_TAGS = new Set(['img', 'video', 'canvas']);

function isInsideSVG(index: number, elements: ExtractedElement[], parentMap: Map<ExtractedElement, ExtractedElement | null>): boolean {
  let el: ExtractedElement | null | undefined = elements[index];
  while (el) {
    if (el.tag === 'svg') return true;
    el = parentMap.get(el) ?? null;
  }
  return false;
}

function isOutsideViewport(b: Bounds, vp: Viewport): boolean {
  return b.x + b.w < 0 || b.x > vp.width || b.y + b.h < 0 || b.y > vp.height;
}

// ── checkOcclusion ──

export function checkOcclusion(
  tree: ExtractedElement,
  viewport: Viewport,
  visibility?: VisibilityMap,
): Issue[] {
  if (!visibility || visibility.size === 0) return [];

  const elements = flattenDFS(tree);
  const parentMap = buildParentMap(tree);
  const issues: Issue[] = [];

  for (const [coveredIndex, entry] of visibility) {
    if (entry.ratio >= 0.7) continue;

    const coveredEl = elements[coveredIndex];
    if (!coveredEl) continue;

    const tier = classifyElement(coveredEl);
    if (tier === 'decorative') continue;

    for (const occluder of entry.occludedBy) {
      const occluderEl = elements[occluder.index];
      if (!occluderEl) continue;

      // Sibling dedup: same parent + interactive functional covered → skip
      // Interactive functional elements (button, a) overlapping siblings is usually intentional
      const coveredParent = parentMap.get(coveredEl) ?? null;
      const occluderParent = parentMap.get(occluderEl) ?? null;
      if (coveredParent && occluderParent && coveredParent === occluderParent) {
        const isInteractive = INTERACTIVE_TAGS.has(coveredEl.tag) ||
          (coveredEl.attributes?.role !== undefined && INTERACTIVE_ROLES.has(coveredEl.attributes.role));
        if (isInteractive && tier !== 'critical') continue;
      }

      // Intentional overlay skips
      const occluderArea = occluderEl.bounds.w * occluderEl.bounds.h;
      const vpArea = viewport.width * viewport.height;
      if (occluderEl.computed?.position === 'fixed' && occluderArea >= vpArea * 0.5) continue;
      if (occluderEl.tag === 'dialog') continue;
      if (occluderEl.attributes?.role === 'dialog') continue;

      const opacity = occluderEl.computed?.opacity;
      if (opacity === '0') continue;

      // Determine severity
      let severity: 'error' | 'warning';
      const opacityNum = opacity !== undefined ? parseFloat(opacity) : 1;
      if (opacityNum > 0 && opacityNum < 0.5) {
        severity = 'warning';
      } else if (entry.ratio <= 0.3) {
        severity = 'error';
      } else if (tier === 'critical') {
        severity = 'error';
      } else {
        severity = 'warning';
      }

      const occludedPercent = Math.round((1 - entry.ratio) * 100);

      issues.push({
        type: 'occlusion',
        severity,
        element: occluderEl.selector,
        element2: coveredEl.selector,
        detail: `${occluderEl.selector} covers ${coveredEl.selector} (${occludedPercent}% occluded, visibility ratio ${entry.ratio})`,
        data: {
          visibilityRatio: entry.ratio,
          occludedPercent,
          isCritical: tier === 'critical',
        },
        context: {
          semanticTier: tier,
          check: 'occlusion',
        },
      });
    }
  }

  return issues;
}

// ── collectProbeTargets ──

export function collectProbeTargets(
  tree: ExtractedElement,
  viewport: Viewport,
): Array<{ index: number; bounds: Bounds }> {
  const elements = flattenDFS(tree);
  const parentMap = buildParentMap(tree);

  const critical: Array<{ index: number; bounds: Bounds }> = [];
  const functional: Array<{ index: number; bounds: Bounds }> = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    // Skip SVG subtrees
    if (isInsideSVG(i, elements, parentMap)) continue;

    // Skip outside viewport
    if (isOutsideViewport(el.bounds, viewport)) continue;

    // Determine if target qualifies
    const hasText = hasTextRecursive(el);
    const isInteractive = INTERACTIVE_TAGS.has(el.tag) ||
      (el.attributes?.role !== undefined && INTERACTIVE_ROLES.has(el.attributes.role));
    const isMedia = MEDIA_TAGS.has(el.tag) && el.bounds.w * el.bounds.h > 0;

    if (!hasText && !isInteractive && !isMedia) continue;

    const tier = classifyElement(el);
    const entry = { index: i, bounds: el.bounds };

    if (tier === 'critical') {
      critical.push(entry);
    } else {
      functional.push(entry);
    }
  }

  // Cap at 200: all critical first, then functional
  if (critical.length + functional.length <= 200) {
    return [...critical, ...functional];
  }

  const remaining = 200 - critical.length;
  return [...critical, ...functional.slice(0, Math.max(0, remaining))];
}
