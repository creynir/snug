# FOLLOWUP-002: Noise Reduction from Real-World Testing (5 Pages)

## Context

Snug was tested against 5 real product mockups (canvas-post-setup, canvas-editor, unsaved-changes-dialog, dashboard, component-library) totaling ~1,770 elements. Across ~200 reported issues, only 4 were real bugs. The rest were false positives caused by a small number of repeating patterns.

| Page | Elements | Issues | Real bugs | Hit rate |
|---|---|---|---|---|
| canvas-post-setup | 183 | 52 | 1 | 2% |
| canvas-editor | 205 | 39 | 1 | 3% |
| unsaved-changes-dialog | 24 | 4 | 1 | 25% |
| dashboard | 221 | 11 | 1 | 9% |
| component-library | 1106 | 98 | 0 | 0% |

This spec addresses the systematic noise sources identified. Changes are ordered by impact and split into two tiers: bug fixes (broken behavior) and context enrichment (add information, don't suppress).

---

## Tier 1: Fix Broken Behavior

### 1a. Fix `auto` Value Stripping in Extraction

**Problem:**

The extraction script (`src/extractor/extract.ts`) filters out `auto` from all computed style values on line 54:

```javascript
if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
```

This is wrong for `overflow`, `overflowX`, `overflowY`. The default for these properties is `visible`, not `auto`. When an element has `overflow-y: auto` (scrollable), the extraction strips it, so the containment diagnostic never sees it and flags children of scrollable containers as containment violations.

**Confirmed:** `nav.lib-nav` on component-library.html has `overflow-y: auto` in the browser, but Snug's extracted computed styles don't include it. 11 nav items were flagged as overflowing a scrollable nav.

**Fix:**

In `src/extractor/extract.ts`, replace the global `auto` filter with a per-property approach. Define which properties treat `auto` as a non-informative default:

```javascript
// Properties where 'auto' is the default and should be filtered
const AUTO_IS_DEFAULT = new Set([
  'width', 'height',
  'top', 'right', 'bottom', 'left',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'zIndex',
]);

function getRelevantComputed(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  const result: Record<string, string> = {};
  for (const prop of SPATIAL_PROPS) {
    const val = cs.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
    );
    if (!val) continue;
    if (val === 'none' || val === 'normal' || val === '0px') continue;
    if (val === 'auto' && AUTO_IS_DEFAULT.has(prop)) continue;
    result[prop] = val;
  }
  return result;
}
```

This preserves `overflow: auto`, `overflowX: auto`, `overflowY: auto` (where `auto` means "show scrollbar when needed") while still filtering `auto` from properties like `width`, `height`, `top`, etc. where `auto` means "browser default / not explicitly set."

**Impact:** Fixes scrollable container false positives. Estimated 11+ containment issues eliminated on component-library alone.

**Tests to add** (`test/unit/diagnostics/containment.test.ts`):
```
1. Skips containment check on Y axis when parent has overflowY: 'auto'
2. Skips containment check on both axes when parent has overflow: 'auto'
3. Still flags containment when parent has overflow: 'visible' (the actual default)
```

**Integration test:** The component-library nav items should no longer be flagged as containment violations.

---

### 1b. Skip Inline Elements from Overlap + Spacing Checks

**Problem:**

Inline elements (`display: inline`) flow in text runs. Their bounding rects naturally intersect when text wraps across lines. Snug applies block-layout overlap detection to inline elements, producing false positives.

**Confirmed:** 13 code token overlaps on component-library.html — `<span>` elements with classes like `.token-key`, `.token-punct`, `.token-string` inside a code block. All have `display: inline`. Their bounding rects overlap because they're on the same text line or wrapping, which is normal inline flow.

**Fix:**

In both `src/diagnostics/sibling-overlap.ts` and `src/diagnostics/spacing-anomaly.ts`, filter out inline elements before checking. This is the same pattern as the SVG skip from FOLLOWUP-001 — different layout model, different rules.

```javascript
// In the walk function of both diagnostics:
const INLINE_DISPLAYS = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid']);

function walk(parent, issues) {
  // Filter: skip inline children for overlap/spacing (they flow in text, rects naturally overlap)
  // Also skip SVG children (already implemented in FOLLOWUP-001)
  const layoutChildren = parent.children.filter(c => {
    if (c.tag === 'svg') return false;
    if (c.computed?.display && INLINE_DISPLAYS.has(c.computed.display)) return false;
    return true;
  });

  // Run checks on layoutChildren...
  // Recurse into non-inline, non-SVG children...
}
```

**Important:** An inline element IS still included as a sibling for parent-level checks involving its non-inline neighbors (e.g., if a `<span>` sits next to a `<div>`, and both are children of the same parent, the `<div>` is still checked against other `<div>` siblings). The skip applies to elements whose `display` IS inline — we don't recurse into them or check them against each other.

**Wait — refinement:** Actually, we should still check inline elements against non-inline siblings. The issue is inline-vs-inline overlap, not inline-vs-block. Simplest approach: just don't check overlap between two elements that are BOTH inline.

```javascript
// In sibling-overlap walk:
for (let i = 0; i < siblings.length; i++) {
  for (let j = i + 1; j < siblings.length; j++) {
    const a = siblings[i];
    const b = siblings[j];

    // Skip overlap check if BOTH elements are inline
    const aInline = a.computed?.display && INLINE_DISPLAYS.has(a.computed.display);
    const bInline = b.computed?.display && INLINE_DISPLAYS.has(b.computed.display);
    if (aInline && bInline) continue;

    // ... existing AABB check ...
  }
}
```

For spacing-anomaly: skip the entire spacing check for a parent if all children are inline (spacing between inline elements is controlled by text flow, not margins/gaps).

**Impact:** Eliminates 13+ false positives on code blocks, and any page with inline text spans.

**Tests to add** (`test/unit/diagnostics/sibling-overlap.test.ts`):
```
1. Does not flag overlap between two display:inline siblings
2. Does not flag overlap between two display:inline-block siblings
3. Still flags overlap between inline and block sibling (mixed)
4. Still flags overlap between two block siblings (unchanged behavior)
```

(`test/unit/diagnostics/spacing-anomaly.test.ts`):
```
1. Skips spacing check when all children are display:inline
2. Still checks spacing when children are display:block/flex/grid
```

**Note:** This requires `display` to be in the extracted computed styles. It already is — `display` is in `SPATIAL_PROPS`. But after Fix 1a, we need to make sure `display: inline` is not filtered (it shouldn't be — `inline` is not in any filter list).

---

## Tier 2: Add Context, Don't Suppress

### 2a. Edge-Mounted Element Context on Containment

**Problem:**

Small elements intentionally positioned at parent edges — connection ports, drag handles, notification badges, expand buttons. They sit half-in, half-out of the parent, centered on the edge. This is a universal UI pattern.

**Confirmed:** ~38 port containment issues on component-library (10x10px ports at `left: -4px` or `right: -4px`), ~38 on canvas screens. Port is 10px, overflows by 5px = 50% of its size.

**Fix:**

In `src/diagnostics/containment.ts`, after detecting a containment violation, check if the element is "edge-mounted": the overflow is roughly half the element's own size on the overflow axis, AND the element is small.

```javascript
function isEdgeMounted(
  child: ExtractedElement,
  overflowLeft: number,
  overflowRight: number,
  overflowTop: number,
  overflowBottom: number,
): boolean {
  const MAX_EDGE_ELEMENT_SIZE = 30; // px — ports, badges, handles are small

  // Check each overflowing edge
  if (overflowLeft > 0 && child.bounds.w <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowLeft / child.bounds.w;
    if (ratio >= 0.3 && ratio <= 0.7) return true; // roughly centered on edge
  }
  if (overflowRight > 0 && child.bounds.w <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowRight / child.bounds.w;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  if (overflowTop > 0 && child.bounds.h <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowTop / child.bounds.h;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  if (overflowBottom > 0 && child.bounds.h <= MAX_EDGE_ELEMENT_SIZE) {
    const ratio = overflowBottom / child.bounds.h;
    if (ratio >= 0.3 && ratio <= 0.7) return true;
  }
  return false;
}
```

When edge-mounted:
- Downgrade severity to `warning`
- Add `context: { edgeMounted: 'true' }`
- Adjust detail: `"Exceeds parent bounds on left(5px) — edge-mounted element (50% protrusion)"`

**Impact:** ~38+ containment issues downgraded from error to warning with context on component-library, ~40+ on canvas screens.

**Tests to add** (`test/unit/diagnostics/containment.test.ts`):
```
1. Reports warning (not error) for 10px-wide element overflowing parent by 5px (50% = edge-mounted)
2. Reports warning with context.edgeMounted for edge-mounted element
3. Still reports error for 200px-wide element overflowing by 100px (too large to be edge-mounted)
4. Still reports error for 10px element overflowing by 9px (90% — not centered, fully escaped)
5. Detects edge-mounting on all four edges (left, right, top, bottom)
6. Element must be <= 30px on overflow axis to qualify
```

---

### 2b. Stacking Layer Context on Sibling Overlap

**Problem:**

Full-viewport `position: fixed` elements (backdrops, overlays, canvas backgrounds) overlap each other by design. They're stacking layers. No z-index analysis needed — the geometry + position mode tells us enough.

**Confirmed:** 3 overlap issues on unsaved-changes-dialog — canvas-bg (fixed, 1280x800) overlaps modal-backdrop (fixed, 1280x800) and demo-controls (fixed). All intentional layering.

**Fix:**

In `src/diagnostics/sibling-overlap.ts`, after detecting an overlap, check if both elements are stacking layers:

```javascript
function isStackingLayer(el: ExtractedElement, viewport: Viewport): boolean {
  if (el.computed?.position !== 'fixed') return false;
  const elArea = el.bounds.w * el.bounds.h;
  const vpArea = viewport.width * viewport.height;
  return elArea >= vpArea * 0.8; // covers 80%+ of viewport
}
```

When both elements in an overlap pair are stacking layers:
- Downgrade severity to `warning`
- Add `context: { stackingLayers: 'true' }`
- Adjust detail: `"Overlaps by 1280x800px (100% of smaller element) — stacking layers"`

**Impact:** 3 issues downgraded on unsaved-changes-dialog. Will affect any page with modal/overlay patterns.

**Tests to add** (`test/unit/diagnostics/sibling-overlap.test.ts`):
```
1. Reports warning (not error) when both siblings are position:fixed and cover >80% viewport
2. Includes context.stackingLayers in the issue
3. Still reports error when only ONE sibling is position:fixed (not both layers)
4. Still reports error for two position:fixed elements that are small (not full-viewport)
```

---

## Implementation Sequence

1. **Fix 1a** — Update `src/extractor/extract.ts`: replace global `auto` filter with per-property defaults
2. **Fix 1b** — Update `src/diagnostics/sibling-overlap.ts` and `src/diagnostics/spacing-anomaly.ts`: skip inline-vs-inline checks
3. **Fix 2a** — Update `src/diagnostics/containment.ts`: add edge-mounted detection and context
4. **Fix 2b** — Update `src/diagnostics/sibling-overlap.ts`: add stacking layer detection and context
5. **Update `src/reporter/annotate.ts`** — ensure `context` field from Issue is preserved in AnnotatedIssue (check if AnnotatedIssue type needs updating)
6. **Add all unit tests** per spec above
7. **Rebuild and validate** against all 5 test pages

## Validation

After implementation, re-run against all 5 pages and compare:

```bash
# Run all 5 and capture summaries
for f in \
  /Users/nataly/Documents/github/observatory/flow-spec/A1-first-time-setup/mockups/canvas-post-setup.html \
  /Users/nataly/Documents/github/observatory/flow-spec/A2-create-workflow/mockups/canvas-editor.html \
  /Users/nataly/Documents/github/observatory/flow-spec/A2-create-workflow/mockups/unsaved-changes-dialog.html \
  /Users/nataly/Documents/github/observatory/product-design-system/screens/dashboard.html \
  /Users/nataly/Documents/github/observatory/product-design-system/screens/component-library.html; do
  echo "=== $(basename $f) ==="
  node dist/cli.js check "$f" 2>&1 | head -7
  echo
done
```

**Expected results after all fixes:**

| Page | Before | After (est.) | Real bugs still caught? |
|---|---|---|---|
| canvas-post-setup | 52 issues | ~25 | Yes (viewport-fit) |
| canvas-editor | 39 issues | ~20 | Yes (viewport-fit) |
| unsaved-changes-dialog | 4 issues | 1 error + 3 warnings | Yes (cancel button containment) |
| dashboard | 11 issues | ~6 | Yes (recent-section overflow) |
| component-library | 98 issues | ~15-20 | N/A (no real bugs) |
| soul-picker | 0 issues | 0 | N/A (clean) |

Remaining issues after fixes will be: real containment violations on canvas nodes (expected on panning canvases — future: add clipping-ancestor context to containment like we did for viewport-overflow), tooltip overflows, and a11y patterns. These are candidates for FOLLOWUP-003.
