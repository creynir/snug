import type { ExtractedElement, Issue, Viewport } from '../types.js';

export function checkSemantic(tree: ExtractedElement, viewport: Viewport): Issue[] {
  const issues: Issue[] = [];
  const allElements: ExtractedElement[] = [];
  collectAll(tree, allElements);

  checkMissingAlt(allElements, issues);
  checkDuplicateId(allElements, issues);
  checkEmptyInteractive(allElements, issues);
  checkHeadingHierarchy(allElements, issues);
  checkTabindexPositive(allElements, issues);
  checkInvisibleInteractive(allElements, issues);
  checkZeroSizeControl(allElements, issues);
  checkModalOverflow(allElements, viewport, issues);
  checkTableMisalignment(allElements, issues);
  checkAriaHiddenFocus(tree, issues);
  checkBrokenLabelFor(tree, issues);
  checkRoleWithoutTabindex(allElements, issues);
  checkAriaRequiredAttrs(allElements, issues);

  return issues;
}

function collectAll(el: ExtractedElement, out: ExtractedElement[]): void {
  out.push(el);
  for (const child of el.children) {
    collectAll(child, out);
  }
}

function hasTextInSubtree(el: ExtractedElement): boolean {
  if (el.text && el.text.trim().length > 0) return true;
  for (const child of el.children) {
    if (hasTextInSubtree(child)) return true;
  }
  return false;
}

// B1. missing-alt
function checkMissingAlt(elements: ExtractedElement[], issues: Issue[]): void {
  for (const el of elements) {
    if (el.tag !== 'img') continue;
    if (el.bounds.w === 0 && el.bounds.h === 0) continue;
    if (el.attributes && 'alt' in el.attributes) continue;
    issues.push({
      type: 'semantic',
      severity: 'warning',
      element: el.selector,
      detail: `<img> missing alt attribute`,
      context: { check: 'missing-alt' },
    });
  }
}

// B2. duplicate-id
function checkDuplicateId(elements: ExtractedElement[], issues: Issue[]): void {
  const idMap = new Map<string, ExtractedElement[]>();
  for (const el of elements) {
    const id = el.attributes?.id;
    if (id === undefined) continue;
    const list = idMap.get(id);
    if (list) {
      list.push(el);
    } else {
      idMap.set(id, [el]);
    }
  }
  for (const [id, els] of idMap) {
    if (els.length < 2) continue;
    issues.push({
      type: 'semantic',
      severity: 'error',
      element: els[0].selector,
      element2: els[1].selector,
      detail: `Duplicate id="${id}" found on ${els.length} elements`,
      context: { check: 'duplicate-id' },
    });
  }
}

// B3. empty-interactive
function checkEmptyInteractive(elements: ExtractedElement[], issues: Issue[]): void {
  const interactiveTags = new Set(['button', 'a']);
  for (const el of elements) {
    if (!interactiveTags.has(el.tag)) continue;
    if (hasTextInSubtree(el)) continue;
    if (el.attributes?.['aria-label']) continue;
    if (el.attributes?.['aria-labelledby']) continue;
    if (el.attributes?.title) continue;
    issues.push({
      type: 'semantic',
      severity: 'warning',
      element: el.selector,
      detail: `<${el.tag}> has no accessible text, aria-label, aria-labelledby, or title`,
      context: { check: 'empty-interactive' },
    });
  }
}

// B4. heading-hierarchy
function checkHeadingHierarchy(elements: ExtractedElement[], issues: Issue[]): void {
  const headingRegex = /^h([1-6])$/;
  const headings: { el: ExtractedElement; level: number }[] = [];
  for (const el of elements) {
    const match = headingRegex.exec(el.tag);
    if (match) {
      headings.push({ el, level: parseInt(match[1], 10) });
    }
  }

  // Check for multiple h1
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length > 1) {
    issues.push({
      type: 'semantic',
      severity: 'warning',
      element: h1s[1].el.selector,
      detail: `Multiple <h1> elements found (${h1s.length}). Use a single <h1> per page.`,
      context: { check: 'heading-hierarchy' },
    });
  }

  // Check for level skips
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr > prev + 1) {
      issues.push({
        type: 'semantic',
        severity: 'warning',
        element: headings[i].el.selector,
        detail: `Heading level skipped: <h${prev}> to <h${curr}>. Expected <h${prev + 1}>.`,
        context: { check: 'heading-hierarchy' },
      });
    }
  }
}

// B5. tabindex-positive
function checkTabindexPositive(elements: ExtractedElement[], issues: Issue[]): void {
  for (const el of elements) {
    const tabindex = el.attributes?.tabindex;
    if (tabindex === undefined) continue;
    const val = parseInt(tabindex, 10);
    if (val > 0) {
      issues.push({
        type: 'semantic',
        severity: 'warning',
        element: el.selector,
        detail: `tabindex="${tabindex}" creates a non-standard tab order. Use tabindex="0" or "-1" instead.`,
        context: { check: 'tabindex-positive' },
      });
    }
  }
}

// D1. invisible-interactive
function checkInvisibleInteractive(elements: ExtractedElement[], issues: Issue[]): void {
  const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
  for (const el of elements) {
    if (!interactiveTags.has(el.tag)) continue;
    if (el.bounds.w <= 0 || el.bounds.h <= 0) continue;
    const invisible =
      el.computed?.opacity === '0' || el.computed?.visibility === 'hidden';
    if (!invisible) continue;
    issues.push({
      type: 'semantic',
      severity: 'warning',
      element: el.selector,
      detail: `Interactive <${el.tag}> is invisible (${el.computed?.opacity === '0' ? 'opacity: 0' : 'visibility: hidden'}) but takes up space`,
      context: { check: 'invisible-interactive' },
    });
  }
}

// D2. zero-size-control
function checkZeroSizeControl(elements: ExtractedElement[], issues: Issue[]): void {
  const controlTags = new Set(['input', 'select', 'textarea']);
  for (const el of elements) {
    if (!controlTags.has(el.tag)) continue;
    if (el.attributes?.type === 'hidden') continue;
    if (el.bounds.w < 2 || el.bounds.h < 2) {
      issues.push({
        type: 'semantic',
        severity: 'error',
        element: el.selector,
        detail: `Form control <${el.tag}> has near-zero size (${el.bounds.w}x${el.bounds.h})`,
        context: { check: 'zero-size-control' },
      });
    }
  }
}

// D3. modal-overflow
function checkModalOverflow(
  elements: ExtractedElement[],
  viewport: Viewport,
  issues: Issue[],
): void {
  for (const el of elements) {
    const isDialog = el.tag === 'dialog' || el.attributes?.role === 'dialog';
    if (!isDialog) continue;
    if (el.bounds.h <= viewport.height) continue;
    const overflow = el.computed?.overflow ?? el.computed?.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') continue;
    issues.push({
      type: 'semantic',
      severity: 'error',
      element: el.selector,
      detail: `Dialog is taller than viewport (${el.bounds.h}px > ${viewport.height}px) without scroll mechanism`,
      context: { check: 'modal-overflow' },
    });
  }
}

// D4. table-misalignment
function checkTableMisalignment(elements: ExtractedElement[], issues: Issue[]): void {
  for (const el of elements) {
    if (el.tag !== 'table') continue;

    const thead = el.children.find((c) => c.tag === 'thead');
    const tbody = el.children.find((c) => c.tag === 'tbody');
    if (!thead || !tbody) continue;

    const headerRow = thead.children.find((c) => c.tag === 'tr');
    const bodyRow = tbody.children.find((c) => c.tag === 'tr');
    if (!headerRow || !bodyRow) continue;

    const ths = headerRow.children.filter((c) => c.tag === 'th');
    const tds = bodyRow.children.filter((c) => c.tag === 'td');

    const colCount = Math.min(ths.length, tds.length);
    for (let i = 0; i < colCount; i++) {
      const th = ths[i];
      const td = tds[i];
      const xDiff = Math.abs(th.bounds.x - td.bounds.x);
      const wDiff = Math.abs(th.bounds.w - td.bounds.w);
      if (xDiff > 2 || wDiff > 2) {
        issues.push({
          type: 'semantic',
          severity: 'error',
          element: th.selector,
          element2: td.selector,
          detail: `Table column ${i + 1} misaligned: header and body differ by ${xDiff > 2 ? `x:${xDiff}px` : ''}${xDiff > 2 && wDiff > 2 ? ', ' : ''}${wDiff > 2 ? `width:${wDiff}px` : ''}`,
          context: { check: 'table-misalignment' },
        });
      }
    }
  }
}

// FOLLOWUP-011 D1. aria-hidden-focus
function checkAriaHiddenFocus(tree: ExtractedElement, issues: Issue[]): void {
  function walkAriaHidden(el: ExtractedElement): void {
    if (el.attributes?.['aria-hidden'] === 'true') {
      const FOCUSABLE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);
      const isFocusable = FOCUSABLE_TAGS.has(el.tag);
      const hasTabindex = el.attributes?.tabindex !== undefined && el.attributes.tabindex !== '-1';

      if (isFocusable || hasTabindex) {
        issues.push({
          type: 'semantic',
          severity: 'error',
          element: el.selector,
          detail: `Element has aria-hidden="true" but is focusable (${el.tag}). Keyboard users can reach it but screen readers cannot — creates an accessibility trap.`,
          context: { check: 'aria-hidden-focus' },
        });
      }

      // Check descendants for focusable elements
      for (const child of el.children) {
        checkAriaHiddenFocusDescendant(child, el.selector, issues);
      }
    } else {
      // Not aria-hidden — recurse normally
      for (const child of el.children) {
        walkAriaHidden(child);
      }
    }
  }
  walkAriaHidden(tree);
}

function checkAriaHiddenFocusDescendant(
  el: ExtractedElement,
  hiddenAncestorSelector: string,
  issues: Issue[],
): void {
  const FOCUSABLE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);
  const isFocusable = FOCUSABLE_TAGS.has(el.tag);
  const hasTabindex = el.attributes?.tabindex !== undefined && el.attributes.tabindex !== '-1';

  if (isFocusable || hasTabindex) {
    issues.push({
      type: 'semantic',
      severity: 'error',
      element: el.selector,
      detail: `Focusable element inside aria-hidden="true" ancestor (${hiddenAncestorSelector}). Keyboard users can reach it but screen readers cannot.`,
      context: { check: 'aria-hidden-focus' },
    });
  }

  for (const child of el.children) {
    checkAriaHiddenFocusDescendant(child, hiddenAncestorSelector, issues);
  }
}

// FOLLOWUP-011 D2. broken-label-for
function checkBrokenLabelFor(tree: ExtractedElement, issues: Issue[]): void {
  const allIds = new Set<string>();
  const labels: { selector: string; forId: string }[] = [];

  function collect(el: ExtractedElement): void {
    if (el.attributes?.id) allIds.add(el.attributes.id);
    if (el.tag === 'label' && el.attributes?.for) {
      labels.push({ selector: el.selector, forId: el.attributes.for });
    }
    for (const child of el.children) collect(child);
  }
  collect(tree);

  for (const label of labels) {
    if (!allIds.has(label.forId)) {
      issues.push({
        type: 'semantic',
        severity: 'error',
        element: label.selector,
        detail: `Label for="${label.forId}" references nonexistent ID. No element has id="${label.forId}" — label association is broken.`,
        context: { check: 'broken-label-for' },
      });
    }
  }
}

// FOLLOWUP-011 D3. role-without-tabindex
const INTERACTIVE_ROLES_NEED_TABINDEX = new Set([
  'button', 'link', 'checkbox', 'radio', 'tab',
  'switch', 'slider', 'spinbutton', 'combobox',
]);

function checkRoleWithoutTabindex(elements: ExtractedElement[], issues: Issue[]): void {
  const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea']);
  for (const el of elements) {
    const role = el.attributes?.role;
    if (!role || !INTERACTIVE_ROLES_NEED_TABINDEX.has(role)) continue;
    if (NATIVE_INTERACTIVE.has(el.tag)) continue;
    const tabindex = el.attributes?.tabindex;
    if (tabindex !== undefined) continue;
    issues.push({
      type: 'semantic',
      severity: 'warning',
      element: el.selector,
      detail: `Element has role="${role}" but no tabindex — not keyboard accessible. Add tabindex="0" for keyboard focus.`,
      context: { check: 'role-without-tabindex' },
    });
  }
}

// FOLLOWUP-011 D4. aria-required-attr
const REQUIRED_ARIA_ATTRS: Record<string, string[]> = {
  checkbox: ['aria-checked'],
  radio: ['aria-checked'],
  slider: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
  spinbutton: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
  combobox: ['aria-expanded'],
  scrollbar: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-orientation'],
  separator: ['aria-valuenow'],
};

function checkAriaRequiredAttrs(elements: ExtractedElement[], issues: Issue[]): void {
  for (const el of elements) {
    const role = el.attributes?.role;
    if (!role || !REQUIRED_ARIA_ATTRS[role]) continue;
    if (el.tag === 'input' && ['checkbox', 'radio', 'range'].includes(el.attributes?.type ?? '')) continue;
    const required = REQUIRED_ARIA_ATTRS[role];
    const missing = required.filter(attr => !el.attributes?.[attr]);
    if (missing.length > 0) {
      issues.push({
        type: 'semantic',
        severity: 'warning',
        element: el.selector,
        detail: `Element has role="${role}" but is missing required ARIA attribute(s): ${missing.join(', ')}.`,
        context: { check: 'aria-required-attr', missingAttrs: missing.join(',') },
      });
    }
  }
}
