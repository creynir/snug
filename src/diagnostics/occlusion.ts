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
  const vpArea = viewport.width * viewport.height;

  // Build element→index reverse map for parent-child dedup
  const elementToIndex = new Map<ExtractedElement, number>();
  elements.forEach((el, i) => elementToIndex.set(el, i));

  for (const [coveredIndex, entry] of visibility) {
    if (entry.ratio >= 0.7) continue;

    const coveredEl = elements[coveredIndex];
    if (!coveredEl) continue;

    // Gate: only report elements with text or interactive role
    const hasText = hasTextRecursive(coveredEl);
    const isInteractive = INTERACTIVE_TAGS.has(coveredEl.tag) ||
      (coveredEl.attributes?.role !== undefined && INTERACTIVE_ROLES.has(coveredEl.attributes.role));
    if (!hasText && !isInteractive) continue;

    for (const occluder of entry.occludedBy) {
      const occluderEl = elements[occluder.index];
      if (!occluderEl) continue;

      // Parent-child dedup: skip child when parent is occluded by same occluder with parent ratio <= child ratio
      const parent = parentMap.get(coveredEl);
      if (parent) {
        const parentIdx = elementToIndex.get(parent);
        if (parentIdx !== undefined && visibility.has(parentIdx)) {
          const parentEntry = visibility.get(parentIdx)!;
          const parentOccludedBySame = parentEntry.occludedBy.some(o => o.index === occluder.index);
          if (parentOccludedBySame && parentEntry.ratio <= entry.ratio) continue;
        }
      }

      // Severity: interactive control occluded >50% = error, else warning
      const isSubmit = coveredEl.tag === 'button' && coveredEl.attributes?.type === 'submit';
      const isCriticalInteractive =
        ['input', 'select', 'textarea'].includes(coveredEl.tag) || isSubmit || coveredEl.tag === 'a';
      const severity: 'error' | 'warning' = (isCriticalInteractive && entry.ratio <= 0.5) ? 'error' : 'warning';

      const occludedPercent = Math.round((1 - entry.ratio) * 100);
      const coveredText = coveredEl.text?.trim().slice(0, 40) || '';
      const textInfo = coveredText ? ` Text: "${coveredText}"` : '';

      const occluderArea = occluderEl.bounds.w * occluderEl.bounds.h;

      issues.push({
        type: 'occlusion',
        severity,
        element: occluderEl.selector,
        element2: coveredEl.selector,
        detail: `${occluderEl.selector} covers ${coveredEl.selector} (${occludedPercent}% occluded).${textInfo}`,
        data: {
          visibilityRatio: entry.ratio,
          occludedPercent,
          isCritical: isCriticalInteractive,
        },
        context: {
          check: 'occlusion',
          coveredHasText: String(hasText),
          occluderPosition: occluderEl.computed?.position ?? 'static',
          occluderViewportCoverage: String(Math.round(occluderArea / vpArea * 100)),
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
