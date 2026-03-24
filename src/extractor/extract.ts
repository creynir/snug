import type { ExtractedElement, ExtractionOptions, PageHandle, Viewport } from '../types.js';

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
  ]);

  function getRelevantComputed(el: Element): Record<string, string> {
    const cs = getComputedStyle(el);
    const result: Record<string, string> = {};
    for (const prop of SPATIAL_PROPS) {
      const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      if (!val) continue;
      if (val === 'none' || val === 'normal' || val === '0px') continue;
      if (val === 'auto' && AUTO_IS_DEFAULT.has(prop)) continue;
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

export async function extractDOM(
  page: PageHandle,
  options: ExtractionOptions = {},
): Promise<{ tree: ExtractedElement; viewport: Viewport }> {
  const opts = {
    depth: options.depth ?? 0,
    includeHidden: options.includeHidden ?? false,
  };

  const tree = await page.evaluateWithArgs(extractionScript, opts);
  const viewport = page.viewport();

  return { tree, viewport };
}
