import type { ExtractedElement, ExtractionOptions, PageHandle, Viewport, VisibilityMap } from '../types.js';
import { collectProbeTargets } from '../diagnostics/occlusion.js';

/**
 * In-page extraction script. This function is serialized and executed
 * inside the browser context via page.evaluate(). It must be self-contained
 * — no closures, no imports.
 */
function extractionScript(opts: { depth: number; includeHidden: boolean }): ExtractedElement {
  const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'br', 'wbr']);

  const SPATIAL_PROPS = [
    'position',
    'display',
    'overflow',
    'overflowX',
    'overflowY',
    'zIndex',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'top',
    'right',
    'bottom',
    'left',
    'transform',
    'width',
    'height',
    'flexDirection',
    'flexWrap',
    'justifyContent',
    'alignItems',
    'gridTemplateColumns',
    'gridTemplateRows',
    'textOverflow',
    'opacity',
    'filter',
    'isolation',
    'willChange',
    'mixBlendMode',
    'perspective',
    'backdropFilter',
    'containerType',
    'visibility',
  ];

  function buildSelector(el: Element): string {
    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).slice(0, 2).join('.');
    const base = classes ? `${tag}.${classes}` : tag;

    const parent = el.parentElement;
    if (!parent) return base;

    // Add :nth-of-type if there are siblings with the same tag
    const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1;
      return `${base}:nth-of-type(${idx})`;
    }

    return base;
  }

  // Properties where 'auto' is the default and should be filtered
  const AUTO_IS_DEFAULT = new Set([
    'width',
    'height',
    'top',
    'right',
    'bottom',
    'left',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'zIndex',
    'willChange',
    'perspective',
  ]);

  const SEMANTIC_ATTRS = ['src', 'href', 'role', 'alt', 'aria-label', 'type', 'id', 'aria-labelledby', 'title', 'tabindex'];

  function getSemanticAttributes(el: Element): Record<string, string> | undefined {
    const result: Record<string, string> = {};
    for (const attr of SEMANTIC_ATTRS) {
      const val = el.getAttribute(attr);
      if (val !== null) result[attr] = val;
    }
    // Implicit ARIA landmark roles from tag semantics
    if (!result.role) {
      const implicitRoles: Record<string, string> = {
        nav: 'navigation',
        header: 'banner',
        main: 'main',
        footer: 'contentinfo',
        aside: 'complementary',
      };
      const implicit = implicitRoles[el.tagName.toLowerCase()];
      if (implicit) result.role = implicit;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function isSrOnly(el: Element): boolean {
    const cs = getComputedStyle(el);
    // Classic sr-only: position absolute, clip rect
    if (cs.position === 'absolute' && cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    // 1x1px variant
    if (cs.position === 'absolute' && cs.width === '1px' && cs.height === '1px') return true;
    // Off-screen positioning
    const rect = el.getBoundingClientRect();
    if (rect.right < -1000 || rect.bottom < -1000) return true;
    // Negative top positioning (skip-links using top: -800px or similar)
    if (cs.position === 'absolute' && rect.bottom < -500) return true;
    return false;
  }

  function getRelevantComputed(el: Element): Record<string, string> {
    const cs = getComputedStyle(el);
    const result: Record<string, string> = {};
    for (const prop of SPATIAL_PROPS) {
      const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      if (!val) continue;
      if (val === 'none' || val === 'normal' || val === '0px') continue;
      if (val === 'auto' && AUTO_IS_DEFAULT.has(prop)) continue;
      if (prop === 'opacity' && val === '1') continue;
      if (prop === 'visibility' && val === 'visible') continue;
      result[prop] = val;
    }
    return result;
  }

  function traverse(el: Element, currentDepth: number): ExtractedElement | null {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return null;

    const rect = el.getBoundingClientRect();

    // Skip zero-size elements unless they're containers (might have overflowing children)
    if (rect.width === 0 && rect.height === 0 && el.children.length === 0) {
      return null;
    }

    // Skip hidden elements unless includeHidden is set
    if (!opts.includeHidden) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return null;
      if (isSrOnly(el)) return null;
    }

    const bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };

    const node: ExtractedElement = {
      selector: buildSelector(el),
      tag,
      bounds,
      children: [],
    };

    // Text content (first 60 chars, only direct text nodes)
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (directText) {
      node.text = directText.length > 60 ? directText.slice(0, 57) + '...' : directText;
    }

    // Computed styles
    node.computed = getRelevantComputed(el);

    // Semantic attributes
    node.attributes = getSemanticAttributes(el);

    // Scroll dimensions (for truncation detection)
    if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
      node.scroll = {
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      };
    }

    // Natural dimensions for images
    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
      node.natural = {
        width: el.naturalWidth,
        height: el.naturalHeight,
      };
    }

    // Recurse into children (respect depth limit)
    if (opts.depth === 0 || currentDepth < opts.depth) {
      for (const child of Array.from(el.children)) {
        const extracted = traverse(child, currentDepth + 1);
        if (extracted) {
          node.children.push(extracted);
        }
      }
    }

    return node;
  }

  const body = document.body;
  if (!body) {
    return {
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      children: [],
    };
  }

  return (
    traverse(body, 0) ?? {
      selector: 'body',
      tag: 'body',
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      children: [],
    }
  );
}

/**
 * Visibility probe script. Runs inside the browser via page.evaluate().
 * Must be self-contained — no closures, no imports.
 * Re-walks the DOM in the same DFS order as extractionScript using identical skip logic.
 */
function visibilityProbeScript(
  targets: Array<{ index: number; bounds: { x: number; y: number; w: number; h: number } }>,
  opts: { depth: number; includeHidden: boolean },
): Array<{ index: number; visibilityRatio: number; occludedBy: Array<{ index: number; samples: number }> }> {
  const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'br', 'wbr']);

  function isSrOnly(el: Element): boolean {
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' && cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    if (cs.position === 'absolute' && cs.width === '1px' && cs.height === '1px') return true;
    const rect = el.getBoundingClientRect();
    if (rect.right < -1000 || rect.bottom < -1000) return true;
    if (cs.position === 'absolute' && rect.bottom < -500) return true;
    return false;
  }

  // Build index→Element map by re-walking DOM in same DFS order as extraction
  const indexToElement = new Map<number, Element>();
  const elementToIndex = new Map<Element, number>();
  let dfsIndex = 0;

  function walk(el: Element, currentDepth: number): void {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.children.length === 0) return;

    if (!opts.includeHidden) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      if (isSrOnly(el)) return;
    }

    const idx = dfsIndex++;
    indexToElement.set(idx, el);
    elementToIndex.set(el, idx);

    if (opts.depth === 0 || currentDepth < opts.depth) {
      for (const child of Array.from(el.children)) {
        walk(child, currentDepth + 1);
      }
    }
  }

  const body = document.body;
  if (body) walk(body, 0);

  // For each target, sample points and determine visibility
  const results: Array<{ index: number; visibilityRatio: number; occludedBy: Array<{ index: number; samples: number }> }> = [];

  for (const target of targets) {
    const el = indexToElement.get(target.index);
    if (!el) continue;

    const b = target.bounds;
    if (b.w <= 0 || b.h <= 0) continue;

    // Generate coarse sample points: center + 4 corners inset 10%
    const insetX = b.w * 0.1;
    const insetY = b.h * 0.1;
    const coarsePoints = [
      { x: b.x + b.w / 2, y: b.y + b.h / 2 },  // center
      { x: b.x + insetX, y: b.y + insetY },       // top-left
      { x: b.x + b.w - insetX, y: b.y + insetY }, // top-right
      { x: b.x + insetX, y: b.y + b.h - insetY }, // bottom-left
      { x: b.x + b.w - insetX, y: b.y + b.h - insetY }, // bottom-right
    ];

    function classifyPoint(px: number, py: number): { status: 'visible' | 'outside' | 'occluded'; occluderElements: Element[] } {
      const stack = document.elementsFromPoint(px, py);
      const idx = stack.indexOf(el!);
      if (idx === -1) return { status: 'outside', occluderElements: [] };
      if (idx === 0) return { status: 'visible', occluderElements: [] };

      const covering = stack.slice(0, idx);
      // Filter out ancestors of the target (they're structural containers above)
      // AND descendants of the target (they're the target's own content)
      const nonRelatives = covering.filter(c => (!c.contains(el!) || c === el!) && !el!.contains(c));
      if (nonRelatives.length === 0) return { status: 'visible', occluderElements: [] };

      // Find all opaque (non-transparent) occluders
      const opaqueOccluders: Element[] = [];
      for (const c of nonRelatives) {
        const cs = getComputedStyle(c);
        if (parseFloat(cs.opacity) < 0.1) continue;
        const bg = cs.backgroundColor;
        const isTransBg = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)';
        if (isTransBg && cs.backgroundImage === 'none') continue;
        opaqueOccluders.push(c);
      }
      if (opaqueOccluders.length === 0) return { status: 'visible', occluderElements: [] };
      return { status: 'occluded', occluderElements: opaqueOccluders };
    }

    // Coarse pass
    let visibleCount = 0;
    let totalCount = 0;
    const occluderSamples = new Map<number, number>(); // occluder DFS index → sample count

    function processPoint(px: number, py: number): void {
      const result = classifyPoint(px, py);
      if (result.status === 'outside') return; // don't count
      totalCount++;
      if (result.status === 'visible') {
        visibleCount++;
      } else {
        for (const occEl of result.occluderElements) {
          const occIdx = elementToIndex.get(occEl);
          if (occIdx !== undefined) {
            occluderSamples.set(occIdx, (occluderSamples.get(occIdx) ?? 0) + 1);
          }
        }
      }
    }

    for (const p of coarsePoints) {
      processPoint(p.x, p.y);
    }

    // Determine if refinement needed
    const coarseRatio = totalCount > 0 ? visibleCount / totalCount : 1.0;
    if (coarseRatio > 0 && coarseRatio < 1) {
      // Refine with 4x4 grid (16 more points at 20/40/60/80%)
      const fracs = [0.2, 0.4, 0.6, 0.8];
      for (const fx of fracs) {
        for (const fy of fracs) {
          processPoint(b.x + b.w * fx, b.y + b.h * fy);
        }
      }
    }

    const finalRatio = totalCount > 0 ? visibleCount / totalCount : 1.0;
    // Round to 2 decimal places
    const roundedRatio = Math.round(finalRatio * 100) / 100;

    const occludedByArr: Array<{ index: number; samples: number }> = [];
    for (const [occIdx, count] of occluderSamples) {
      occludedByArr.push({ index: occIdx, samples: count });
    }
    occludedByArr.sort((a, b_) => b_.samples - a.samples);

    results.push({
      index: target.index,
      visibilityRatio: roundedRatio,
      occludedBy: occludedByArr,
    });
  }

  return results;
}

export async function extractDOM(
  page: PageHandle,
  options: ExtractionOptions = {},
): Promise<{ tree: ExtractedElement; viewport: Viewport; visibility?: VisibilityMap }> {
  const opts = {
    depth: options.depth ?? 0,
    includeHidden: options.includeHidden ?? false,
  };

  const tree = await page.evaluateWithArgs(extractionScript, opts);
  const viewport = page.viewport();

  // Visibility probe (default: enabled)
  if (options.probeVisibility === false) {
    return { tree, viewport };
  }

  const targets = collectProbeTargets(tree, viewport);
  if (targets.length === 0) {
    return { tree, viewport, visibility: new Map() };
  }

  const probeTargets = targets.map(t => ({ index: t.index, bounds: t.bounds }));
  const rawResults = await page.evaluateWithArgs(visibilityProbeScript, probeTargets, opts);

  // Convert to VisibilityMap
  const visibility: VisibilityMap = new Map();
  for (const r of rawResults) {
    const occludedSamples = r.occludedBy.reduce((sum, o) => sum + o.samples, 0);
    // total non-outside samples: visible + occluded
    // visibilityRatio = visible / total => total = occludedSamples / (1 - ratio)
    const totalNonOutside = r.visibilityRatio < 1
      ? occludedSamples / (1 - r.visibilityRatio)
      : 1; // fully visible, no occluders expected

    const occludedBy = r.occludedBy.map(o => ({
      index: o.index,
      coverage: totalNonOutside > 0 ? o.samples / totalNonOutside : 0,
    }));

    visibility.set(r.index, {
      ratio: r.visibilityRatio,
      occludedBy,
    });
  }

  return { tree, viewport, visibility };
}
