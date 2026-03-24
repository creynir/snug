# FOLLOWUP-001: Diagnostic Improvements After Real-World Testing

## Context

Snug v0.1 was tested against a real product mockup (`observatory/flow-spec/A1-first-time-setup/mockups/canvas-post-setup.html` — a 183-element canvas-based app shell with sidebar, topbar, canvas area, bottom panel, and status bar).

**Result:** 42 errors, 18 warnings. The report was dominated by noise and missed the actual layout failure — the bottom panel and status bar were squished because the CSS grid couldn't fit all rows in the viewport.

**Root cause analysis:**

| Problem | Category |
|---|---|
| Canvas nodes flagged for viewport overflow — but they're inside `overflow:hidden` parent | Missing context |
| SVG primitives (`circle`, `line`, `path`) flagged for spacing anomalies | Wrong scope |
| Bottom panel rendered at 22px instead of 36px, status bar displaced | **Missed signal** |

This spec defines 3 changes to address these issues. The priority order is: **never miss a signal > add context for triage > reduce noise on true non-issues.**

---

## Change 1: New Diagnostic — `viewport-fit`

### Problem

When a page declares `overflow: hidden` on `body` or the root element (common in dashboards, app shells, modals, full-screen editors), it's asserting "everything must fit in this viewport." If it doesn't, that's a structural layout failure — not a cosmetic issue.

Snug currently checks if individual elements overflow the viewport edges. But it doesn't check whether the **overall layout fits the viewport** on non-scrollable pages. This is a different class of problem: elements don't overflow sideways, they get *compressed* because there's not enough vertical space.

### Specification

**File:** `src/diagnostics/viewport-fit.ts`

**When to run:** Only when the page is non-scrollable. Detect this by checking:
```
body or <html> has:
  - overflow: hidden, OR
  - overflow-y: hidden, OR
  - height that resolves to viewport height (100vh, 100%, or matches viewport.height exactly)
```

If the page is scrollable (overflow: auto/scroll/visible with content taller than viewport), skip this diagnostic entirely — vertical overflow is normal on scrollable pages.

**What to check:**

**Check A — Children extending below viewport:**
```
For the body element (or the primary layout container if body has a single child):
  for each direct child:
    bottomEdge = child.bounds.y + child.bounds.h
    if bottomEdge > viewport.height:
      emit Issue {
        type: 'viewport-fit',
        severity: 'error',
        element: child.selector,
        detail: "Extends below viewport on non-scrollable page. Bottom edge at {bottomEdge}px, viewport ends at {viewport.height}px",
        computed: child.computed,
        data: { bottomEdge, viewportHeight: viewport.height, overflowY: bottomEdge - viewport.height }
      }
```

**Check B — Content compression (element can't fit its content):**
```
For each element in the tree (recursive):
  if element.scroll exists:
    if element.scroll.scrollHeight > element.scroll.clientHeight:
      // Content is taller than the rendered element
      // Check if this is on a non-scrollable page AND the element doesn't provide its own scrollbar
      if page is non-scrollable AND element.computed.overflow === 'hidden':
        compressionPx = element.scroll.scrollHeight - element.scroll.clientHeight
        emit Issue {
          type: 'viewport-fit',
          severity: 'warning',
          element: element.selector,
          detail: "Content compressed on non-scrollable page. Needs {scrollHeight}px, rendered at {clientHeight}px (missing {compressionPx}px)",
          computed: element.computed,
          data: { scrollHeight, clientHeight, compressionPx }
        }
```

Note: Check B is similar to the existing `truncation` diagnostic, but specifically for non-scrollable pages. The distinction matters because truncation with `text-overflow: ellipsis` is often intentional, while compression on a non-scrollable page usually means the layout is broken. Keep both diagnostics — they report different things. Truncation says "content is clipped." Viewport-fit says "the page doesn't fit its viewport."

**Severity:**
- Check A (child below viewport): `error` — content is unreachable
- Check B (content compressed): `warning` — element is rendering but undersized

**Add to the diagnostic barrel:**
```typescript
// src/diagnostics/index.ts
import { checkViewportFit } from './viewport-fit.js';

const DEFAULT_DIAGNOSTICS: DiagnosticFn[] = [
  checkViewportOverflow,
  checkContainment,
  checkSiblingOverlap,
  checkTruncation,
  checkSpacingAnomaly,
  checkAspectRatio,
  checkViewportFit,  // NEW
];
```

**Update types:**
```typescript
// src/types.ts — add to IssueType union
export type IssueType =
  | 'viewport-overflow'
  | 'containment'
  | 'sibling-overlap'
  | 'truncation'
  | 'spacing-anomaly'
  | 'aspect-ratio'
  | 'viewport-fit';  // NEW
```

### Test Cases

**Unit tests** (`test/unit/diagnostics/viewport-fit.test.ts`):

The diagnostic needs to know whether the page is non-scrollable. Since diagnostics are pure functions over `ExtractedElement` trees, the non-scrollable state must be detectable from the tree data. Check `tree.computed.overflow` (the body element's overflow) — if it's `hidden`, the page is non-scrollable.

```
1. Returns no issues when page is scrollable (body overflow: auto/visible)
2. Detects child extending below viewport on non-scrollable page
3. Detects content compression (scrollHeight > clientHeight + overflow:hidden) on non-scrollable page
4. Does not flag compression when element provides its own scrollbar (overflow: auto/scroll)
5. Reports error severity for children below viewport
6. Reports warning severity for content compression
7. Works with body having a single layout container child (common pattern: body > #app > children)
8. Includes bottomEdge, viewportHeight, overflowY in data for Check A
9. Includes scrollHeight, clientHeight, compressionPx in data for Check B
```

**HTML fixture** (`test/fixtures/viewport-fit.html`):
```html
<!-- Non-scrollable page with grid that doesn't fit -->
<body style="overflow: hidden; height: 100vh; margin: 0;">
  <div style="display: grid; grid-template-rows: 40px 1fr 36px 22px; height: 100vh;">
    <header style="background: #333;">Header</header>
    <main style="background: #eee;">Main content area</main>
    <!-- Bottom panel: should be 36px but will be compressed if viewport is too small -->
    <div class="bottom-panel" style="background: #ddd; overflow: hidden;">
      <div style="height: 36px;">Panel content that needs 36px</div>
    </div>
    <footer style="background: #333;">Status bar</footer>
  </div>
</body>
```

Run at viewport 1280x600 to trigger compression (total specified rows: 40 + 1fr + 36 + 22 = at 600px height, the `1fr` gets 502px, but if content pushes things around, compression happens).

**Integration test** additions to `test/integration/pipeline.test.ts`:
```
1. Detects viewport-fit issues on the viewport-fit.html fixture
2. Does NOT flag viewport-fit issues on clean.html (which is scrollable)
```

---

## Change 2: Clipping-Ancestor Context on `viewport-overflow`

### Problem

Elements inside an `overflow: hidden` parent are visually clipped — they cannot actually cause visible viewport overflow. Reporting them as viewport-overflow `error` is misleading because the user will never see the overflow.

However, suppressing these entirely would lose information. The element IS positioned outside the viewport bounds — that might be intentional (canvas panning) or accidental (miscalculated position).

### Specification

**File:** `src/diagnostics/viewport-overflow.ts`

**Change the walk function** to check for clipping ancestors before emitting:

```
function walk(el, viewport, issues, clippingAncestor?):
  // Existing overflow checks...

  if overflows viewport:
    if clippingAncestor exists:
      // Element is visually clipped — downgrade to warning, add context
      severity = 'warning'
      context = { clippedBy: clippingAncestor.selector }
    else:
      severity = 'error'
      context = undefined

    emit Issue {
      type: 'viewport-overflow',
      severity: severity,
      element: el.selector,
      detail: clippingAncestor
        ? "Overflows viewport right edge by {N}px (visually clipped by {ancestor})"
        : "Overflows viewport right edge by {N}px",
      computed: el.computed,
      context: context,    // NEW field
      data: { overflowX: N }
    }

  // Recurse — pass clipping ancestor down
  nextClipping = clippingAncestor
  if el.computed.overflow in ['hidden', 'scroll', 'auto']
     OR el.computed.overflowX in ['hidden', 'scroll', 'auto']:
    nextClipping = el

  for child in el.children:
    walk(child, viewport, issues, nextClipping)
```

**Update the `Issue` type** to support the optional `context` field:

```typescript
// src/types.ts — update Issue interface
export interface Issue {
  type: IssueType;
  severity: IssueSeverity;
  element: string;
  element2?: string;
  detail: string;
  computed?: Record<string, string | Record<string, string>>;
  data?: Record<string, number | boolean>;
  context?: Record<string, string>;  // NEW — triage context for the agent
}
```

### Test Cases

**Unit tests** — add to `test/unit/diagnostics/viewport-overflow.test.ts`:

```
1. Reports error for overflow with no clipping ancestor (existing behavior)
2. Reports warning (not error) for overflow inside overflow:hidden parent
3. Reports warning for overflow inside overflow:scroll parent
4. Reports warning for overflow inside overflow:auto parent
5. Includes context.clippedBy with the clipping ancestor's selector
6. Detail string mentions the clipping ancestor
7. Clipping context propagates through multiple nesting levels
   (grandchild overflows, grandparent has overflow:hidden → warning)
8. Element with its own overflow:hidden that also overflows viewport →
   still error (it's the clipping root, not clipped BY an ancestor)
9. Multiple clipping ancestors: uses the nearest one
```

No new fixture needed — extend the existing `overflow.html` fixture with an `overflow:hidden` wrapper:

```html
<!-- Add to test/fixtures/overflow.html -->
<!-- Clipped overflow — should be warning, not error -->
<div class="clipping-wrapper" style="overflow: hidden; width: 800px; height: 200px;">
  <div class="clipped-wide" style="width: 1500px; height: 200px; background: #9b59b6;">
    Wide but clipped by parent
  </div>
</div>
```

**Integration test** additions:
```
1. Overflow inside overflow:hidden parent reports warning with context.clippedBy
2. Overflow without clipping parent still reports error
```

---

## Change 3: Skip SVG Subtrees from Spacing + Overlap

### Problem

SVG elements (`<circle>`, `<line>`, `<path>`, `<rect>`, `<polygon>`, `<ellipse>`, `<polyline>`, `<text>`, `<g>`, `<use>`) are drawing primitives. They overlap by design — an icon is composed of overlapping shapes. Their spacing is meaningless for layout diagnostics.

On the test mockup, SVG children generated ~10 false positive spacing-anomaly warnings with negative gap modes (`-11px`), and overlap issues between `<path>` and `<polyline>` elements (89% overlap — normal for icon drawing).

### Specification

**Files:** `src/diagnostics/spacing-anomaly.ts`, `src/diagnostics/sibling-overlap.ts`

**In both diagnostics**, when recursing into children, skip elements whose tag is `svg`. Do NOT recurse into the SVG subtree for these two diagnostics. Other diagnostics (viewport-overflow, containment, truncation) should still process SVG elements normally — an SVG element can still overflow the viewport.

```
// In the walk function of both spacing-anomaly.ts and sibling-overlap.ts:

function walk(parent, issues):
  // Filter children: exclude SVG subtrees from THIS diagnostic
  const layoutChildren = parent.children.filter(c => c.tag !== 'svg')

  // Run diagnostic checks on layoutChildren only
  // (spacing gaps, overlap pairs)

  // Recurse into non-SVG children only
  for child in layoutChildren:
    walk(child, issues)
```

This means:
- An `<svg>` element itself is still included as a sibling for parent-level checks (e.g., spacing between an `<svg>` and a `<div>` IS checked)
- But the children OF `<svg>` (`<circle>`, `<path>`, etc.) are not checked for spacing or overlap
- The `<svg>` element's bounds are still in the tree and visible in the bird-view AST

### Test Cases

**Unit tests** — add to existing test files:

`test/unit/diagnostics/spacing-anomaly.test.ts`:
```
1. Does not check spacing between SVG children (circle, path, line)
2. Still checks spacing between an SVG element and its non-SVG siblings
3. Does not recurse into SVG subtrees
```

`test/unit/diagnostics/sibling-overlap.test.ts`:
```
1. Does not check overlap between SVG children (path, polyline)
2. Still checks overlap between an SVG element and its non-SVG siblings
3. Does not recurse into SVG subtrees
```

No new fixture needed. Add SVG elements to the `makeElement` helper in tests:

```typescript
makeElement({
  selector: 'svg',
  tag: 'svg',
  bounds: { x: 0, y: 0, w: 24, h: 24 },
  children: [
    makeElement({ selector: 'circle', tag: 'circle', bounds: { x: 2, y: 2, w: 10, h: 10 } }),
    makeElement({ selector: 'path', tag: 'path', bounds: { x: 5, y: 5, w: 14, h: 14 } }),
  ],
})
```

---

## Implementation Sequence

1. **Update `src/types.ts`** — add `'viewport-fit'` to `IssueType`, add `context?: Record<string, string>` to `Issue`
2. **Create `src/diagnostics/viewport-fit.ts`** — new diagnostic
3. **Update `src/diagnostics/viewport-overflow.ts`** — add clipping-ancestor context
4. **Update `src/diagnostics/spacing-anomaly.ts`** — skip SVG subtrees
5. **Update `src/diagnostics/sibling-overlap.ts`** — skip SVG subtrees
6. **Update `src/diagnostics/index.ts`** — add `checkViewportFit` to default diagnostics
7. **Update `src/index.ts`** — export `checkViewportFit`
8. **Add `test/fixtures/viewport-fit.html`** — new fixture
9. **Update `test/fixtures/overflow.html`** — add clipped overflow case
10. **Add `test/unit/diagnostics/viewport-fit.test.ts`** — unit tests
11. **Update existing unit tests** — add cases per spec above
12. **Update integration tests** — add viewport-fit and clipping-context cases
13. **Rebuild and verify** — `npm run build && npm run test`

## Validation

After implementation, re-run against the real mockup:

```bash
node dist/cli.js check /Users/nataly/Documents/github/observatory/flow-spec/A1-first-time-setup/mockups/canvas-post-setup.html
```

**Expected changes:**
- Viewport-overflow on canvas nodes: **downgraded to warning** with `context.clippedBy` referencing `.canvas-area`
- SVG spacing anomalies: **gone** (SVG subtrees skipped)
- SVG overlap issues: **gone** (SVG subtrees skipped)
- Bottom panel compression: **NEW viewport-fit warning** — "Content compressed on non-scrollable page. Needs 36px, rendered at 22px"
- Port/header overlaps, containment violations: **unchanged** (no changes to those diagnostics)

The report should drop from ~60 issues to ~35, with the real layout failure now explicitly surfaced as a `viewport-fit` issue.
