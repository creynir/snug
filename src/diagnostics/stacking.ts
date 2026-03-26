import type { Bounds, ExtractedElement, Issue, Viewport } from '../types.js';
import { parseZIndex } from './sibling-overlap.js';

export function checkStacking(tree: ExtractedElement, viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  walk(tree, [], viewport, issues);
  return issues;
}

function walk(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  viewport: Viewport,
  issues: Issue[],
): void {
  checkNoPosition(el, ancestors, issues);
  checkContextTrap(el, ancestors, issues);
  checkEscalation(el, issues);
  checkFixedBrokenByAncestor(el, ancestors, issues);
  checkAutoVsZero(el, issues);
  checkNegativeZIndex(el, ancestors, issues);
  checkOverflowClipping(el, ancestors, issues);
  checkMissingIsolation(el, ancestors, viewport, issues);

  ancestors.push(el);
  for (const child of el.children) {
    walk(child, ancestors, viewport, issues);
  }
  ancestors.pop();
}

function createsStackingContext(el: ExtractedElement): boolean {
  const c = el.computed;
  if (!c) return false;
  if (c.position === 'fixed' || c.position === 'sticky') return true;
  if ((c.position === 'relative' || c.position === 'absolute') && c.zIndex) return true;
  if (c.opacity && parseFloat(c.opacity) < 1) return true;
  if (c.transform) return true;
  if (c.filter) return true;
  if (c.isolation === 'isolate') return true;
  if (c.willChange && /transform|opacity|filter/.test(c.willChange)) return true;
  if (c.mixBlendMode) return true;
  if (c.perspective) return true;
  if (c.backdropFilter) return true;
  if (c.containerType && c.containerType !== 'normal') return true;
  return false;
}

function getStackingReason(el: ExtractedElement): {
  property: string;
  value: string;
  intentional: boolean;
} {
  const c = el.computed!;
  if ((c.position === 'relative' || c.position === 'absolute') && c.zIndex) {
    return { property: 'z-index', value: c.zIndex, intentional: true };
  }
  if (c.position === 'fixed') return { property: 'position', value: 'fixed', intentional: true };
  if (c.position === 'sticky')
    return { property: 'position', value: 'sticky', intentional: true };
  if (c.opacity && parseFloat(c.opacity) < 1)
    return { property: 'opacity', value: c.opacity, intentional: false };
  if (c.transform)
    return { property: 'transform', value: c.transform, intentional: false };
  if (c.filter) return { property: 'filter', value: c.filter, intentional: false };
  if (c.willChange && /transform|opacity|filter/.test(c.willChange))
    return { property: 'will-change', value: c.willChange, intentional: false };
  if (c.backdropFilter)
    return { property: 'backdrop-filter', value: c.backdropFilter, intentional: false };
  if (c.mixBlendMode)
    return { property: 'mix-blend-mode', value: c.mixBlendMode, intentional: false };
  if (c.isolation === 'isolate')
    return { property: 'isolation', value: 'isolate', intentional: false };
  if (c.containerType && c.containerType !== 'normal')
    return { property: 'container-type', value: c.containerType, intentional: false };
  if (c.perspective)
    return { property: 'perspective', value: c.perspective, intentional: false };
  return { property: 'unknown', value: 'unknown', intentional: false };
}

function checkNoPosition(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  issues: Issue[],
): void {
  const z = el.computed?.zIndex;
  if (!z || z === 'auto') return;
  const pos = el.computed?.position;
  if (pos && pos !== 'static') return;

  const parent = ancestors[ancestors.length - 1];
  if (parent?.computed?.display) {
    const d = parent.computed.display;
    if (d === 'flex' || d === 'grid' || d === 'inline-flex' || d === 'inline-grid') return;
  }

  issues.push({
    type: 'stacking',
    severity: 'error',
    element: el.selector,
    detail: `z-index: ${z} has no effect — element is position: static and not a flex/grid child. Add position: relative.`,
    computed: { [el.selector]: { zIndex: z, position: pos ?? 'static' } },
    context: { check: 'no-position' },
  });
}

function checkContextTrap(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  issues: Issue[],
): void {
  const z = parseZIndex(el.computed?.zIndex);
  if (z < 10) return;

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor.tag === 'html' || ancestor.tag === 'body') break;

    if (createsStackingContext(ancestor)) {
      const reason = getStackingReason(ancestor);
      if (reason.intentional) return;

      issues.push({
        type: 'stacking',
        severity: 'warning',
        element: el.selector,
        element2: ancestor.selector,
        detail: `z-index: ${z} is trapped inside stacking context created by ${ancestor.selector} (${reason.property}: ${reason.value}). Cannot render above elements outside this ancestor.`,
        computed: {
          [el.selector]: { zIndex: String(z), position: el.computed?.position ?? 'static' },
          [ancestor.selector]: { [reason.property]: reason.value },
        },
        context: { check: 'context-trap', trappedBy: reason.property },
      });
      return;
    }
  }
}

const Z_ESCALATION_THRESHOLD = 100;

function checkEscalation(el: ExtractedElement, issues: Issue[]): void {
  const z = parseZIndex(el.computed?.zIndex);
  if (z <= Z_ESCALATION_THRESHOLD) return;

  issues.push({
    type: 'stacking',
    severity: 'warning',
    element: el.selector,
    detail: `z-index: ${z} is unusually high. Consider restructuring stacking contexts instead of escalating values.`,
    data: { zIndex: z },
    context: { check: 'escalation' },
  });
}

function checkFixedBrokenByAncestor(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  issues: Issue[],
): void {
  if (el.computed?.position !== 'fixed') return;

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor.tag === 'html' || ancestor.tag === 'body') continue;

    const c = ancestor.computed;
    if (!c) continue;

    const breakingProp = c.transform
      ? { prop: 'transform', val: c.transform }
      : c.filter
        ? { prop: 'filter', val: c.filter }
        : c.perspective
          ? { prop: 'perspective', val: c.perspective }
          : c.willChange && /transform|filter|perspective/.test(c.willChange)
            ? { prop: 'will-change', val: c.willChange }
            : c.backdropFilter
              ? { prop: 'backdrop-filter', val: c.backdropFilter }
              : null;

    if (breakingProp) {
      const inAncestor =
        el.bounds.x >= ancestor.bounds.x &&
        el.bounds.y >= ancestor.bounds.y &&
        el.bounds.x + el.bounds.w <= ancestor.bounds.x + ancestor.bounds.w + 1 &&
        el.bounds.y + el.bounds.h <= ancestor.bounds.y + ancestor.bounds.h + 1;

      issues.push({
        type: 'stacking',
        severity: inAncestor ? 'error' : 'warning',
        element: el.selector,
        element2: ancestor.selector,
        detail: `position: fixed is broken — ancestor ${ancestor.selector} has ${breakingProp.prop}: ${breakingProp.val}. Element is positioned relative to ancestor instead of viewport.`,
        computed: {
          [el.selector]: { position: 'fixed' },
          [ancestor.selector]: { [breakingProp.prop]: breakingProp.val },
        },
        context: { check: 'fixed-broken', brokenBy: breakingProp.prop },
      });
      return;
    }
  }
}

function checkAutoVsZero(el: ExtractedElement, issues: Issue[]): void {
  const z = el.computed?.zIndex;
  if (z !== '0') return;
  const pos = el.computed?.position;
  if (!pos || pos === 'static') return;

  let hasDescendantWithZ = false;
  function scan(node: ExtractedElement): void {
    for (const child of node.children) {
      if (child.computed?.zIndex && child.computed.zIndex !== 'auto') {
        hasDescendantWithZ = true;
        return;
      }
      scan(child);
    }
  }
  scan(el);

  if (!hasDescendantWithZ) return;

  issues.push({
    type: 'stacking',
    severity: 'warning',
    element: el.selector,
    detail: `z-index: 0 creates a stacking context (unlike auto). Descendants with z-index are trapped inside and cannot interleave with outside elements. Use z-index: auto if isolation is not intended.`,
    computed: { [el.selector]: { zIndex: '0', position: pos } },
    context: { check: 'auto-vs-zero' },
  });
}

function checkNegativeZIndex(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  issues: Issue[],
): void {
  const z = parseZIndex(el.computed?.zIndex);
  if (z >= 0) return;

  const parent = ancestors[ancestors.length - 1];
  if (!parent) return;

  if (!createsStackingContext(parent)) {
    const contained =
      el.bounds.x >= parent.bounds.x &&
      el.bounds.y >= parent.bounds.y &&
      el.bounds.x + el.bounds.w <= parent.bounds.x + parent.bounds.w + 1 &&
      el.bounds.y + el.bounds.h <= parent.bounds.y + parent.bounds.h + 1;

    if (contained) {
      issues.push({
        type: 'stacking',
        severity: 'warning',
        element: el.selector,
        element2: parent.selector,
        detail: `z-index: ${z} may be hidden behind parent ${parent.selector} background. Parent does not create a stacking context — add position: relative + z-index: 0 (or isolation: isolate) to parent.`,
        computed: { [el.selector]: { zIndex: String(z) } },
        context: { check: 'negative-z' },
      });
    }
  }
}

function checkOverflowClipping(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  issues: Issue[],
): void {
  const z = parseZIndex(el.computed?.zIndex);
  if (z < 10) return;

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor.tag === 'html' || ancestor.tag === 'body') break;

    const overflow =
      ancestor.computed?.overflow ?? ancestor.computed?.overflowX ?? ancestor.computed?.overflowY;
    const clips = overflow === 'hidden' || overflow === 'scroll' || overflow === 'auto';

    if (clips) {
      const extendsX =
        el.bounds.x < ancestor.bounds.x ||
        el.bounds.x + el.bounds.w > ancestor.bounds.x + ancestor.bounds.w;
      const extendsY =
        el.bounds.y < ancestor.bounds.y ||
        el.bounds.y + el.bounds.h > ancestor.bounds.y + ancestor.bounds.h;

      if (extendsX || extendsY) {
        issues.push({
          type: 'stacking',
          severity: 'warning',
          element: el.selector,
          element2: ancestor.selector,
          detail: `z-index: ${z} cannot escape overflow: ${overflow} on ${ancestor.selector}. Content is clipped regardless of z-index. Move element outside the clipping ancestor or remove overflow constraint.`,
          computed: {
            [el.selector]: { zIndex: String(z) },
            [ancestor.selector]: { overflow: overflow! },
          },
          context: { check: 'overflow-clip' },
        });
        return;
      }
    }
  }
}

function checkMissingIsolation(
  el: ExtractedElement,
  ancestors: ExtractedElement[],
  _viewport: Viewport,
  issues: Issue[],
): void {
  if (createsStackingContext(el)) return;
  if (el.children.length === 0) return;

  const childrenWithZ = el.children.filter(
    (c) => c.computed?.zIndex && c.computed.zIndex !== 'auto',
  );
  if (childrenWithZ.length === 0) return;

  const parent = ancestors[ancestors.length - 1];
  if (!parent) return;

  const siblings = parent.children.filter((c) => c !== el);
  let leaks = false;
  for (const child of childrenWithZ) {
    for (const sibling of siblings) {
      if (boundsOverlap(child.bounds, sibling.bounds)) {
        leaks = true;
        break;
      }
    }
    if (leaks) break;
  }

  if (!leaks) return;

  const maxZ = Math.max(...childrenWithZ.map((c) => parseZIndex(c.computed?.zIndex)));

  issues.push({
    type: 'stacking',
    severity: 'warning',
    element: el.selector,
    detail: `Children use z-index (up to ${maxZ}) but ${el.selector} does not create a stacking context. Z-index values leak into parent context and may interfere with sibling components. Add isolation: isolate.`,
    computed: { [el.selector]: { isolation: 'auto' } },
    context: { check: 'missing-isolation' },
  });
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}
