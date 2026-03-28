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

// ── Intentionality scoring ──

function parseZ(val: string | undefined): number {
  if (!val || val === 'auto') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function computeIntentionalityScore(
  occluderEl: ExtractedElement,
  coveredEl: ExtractedElement,
  viewport: Viewport,
  parentMap: Map<ExtractedElement, ExtractedElement | null>,
): number {
  let score = 0;
  const vpArea = viewport.width * viewport.height;

  // Signal 1: Viewport coverage
  const occluderArea = occluderEl.bounds.w * occluderEl.bounds.h;
  const coverage = occluderArea / vpArea;
  if (coverage >= 0.80) score += 3;
  else if (coverage >= 0.40) score += 2;
  else if (coverage >= 0.15) score += 1;

  // Signal 2: Position fixed + full extent
  if (occluderEl.computed?.position === 'fixed') {
    score += 1;
    if (occluderEl.bounds.w >= viewport.width * 0.9 && occluderEl.bounds.h >= viewport.height * 0.9) {
      score += 2;
    }
  }

  // Signal 3: Z-index gap
  const occluderZ = parseZ(occluderEl.computed?.zIndex);
  const coveredZ = parseZ(coveredEl.computed?.zIndex);
  const zGap = Math.abs(occluderZ - coveredZ);
  if (zGap >= 100) score += 2;
  else if (zGap >= 10) score += 1;

  // Signal 4: DOM distance — occluder is direct child of body/html
  const occluderParent = parentMap.get(occluderEl);
  if (occluderParent && (occluderParent.tag === 'body' || occluderParent.tag === 'html')) {
    score += 1;
  }

  return score;
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

      const occluderArea = occluderEl.bounds.w * occluderEl.bounds.h;
      const score = computeIntentionalityScore(occluderEl, coveredEl, viewport, parentMap);

      // Score >= 4: suppress entirely (definitionally intentional)
      if (score >= 4) continue;

      // Determine severity
      let severity: 'error' | 'warning' = 'warning';
      if (score < 2) {
        const isSubmit = coveredEl.tag === 'button' && coveredEl.attributes?.type === 'submit';
        const isCriticalInteractive =
          ['input', 'select', 'textarea'].includes(coveredEl.tag) || isSubmit || coveredEl.tag === 'a';
        if (isCriticalInteractive && entry.ratio <= 0.5) {
          severity = 'error';
        }
      }

      const occludedPercent = Math.round((1 - entry.ratio) * 100);
      const coveredText = coveredEl.text?.trim().slice(0, 40) || '';
      const textInfo = coveredText ? ` Text: "${coveredText}"` : '';

      issues.push({
        type: 'occlusion',
        severity,
        element: occluderEl.selector,
        element2: coveredEl.selector,
        detail: `${occluderEl.selector} covers ${coveredEl.selector} (${occludedPercent}% occluded).${textInfo}`,
        data: {
          visibilityRatio: entry.ratio,
          occludedPercent,
          intentionalityScore: score,
          isCritical: severity === 'error',
        },
        context: {
          check: 'occlusion',
          coveredHasText: String(hasText),
          occluderPosition: occluderEl.computed?.position ?? 'static',
          occluderViewportCoverage: String(Math.round(occluderArea / vpArea * 100)),
          intentionalityScore: String(score),
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
