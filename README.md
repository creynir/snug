# Snug

**Layout diagnostics for AI agents.** Math instead of pixels.

Snug renders your HTML in a headless browser, extracts every element's bounding box, and runs pure geometry checks to find layout problems — overlaps, overflows, truncation, spacing anomalies, broken containment. It returns a structured YAML report that AI agents (or humans) can read and act on. No screenshots, no vision models.

## Why?

AI coding agents can write CSS, but they can't *see* the result. Snug gives them eyes — a spatial report they can parse, reason about, and use to fix layout bugs in a loop.

## Install

```bash
npm install -g snug-cli
```

Or use it locally:

```bash
npm install snug-cli
```

## Quick start

```bash
# Check a local HTML file
snug check page.html

# Check a live URL (local dev server, staging, any URL)
snug check --url http://localhost:5173/settings

# Pipe HTML from stdin
cat page.html | snug check --stdin

# Custom viewport
snug check page.html --width 1440 --height 900
```

## What it checks

| Diagnostic | What it catches |
|---|---|
| **viewport-overflow** | Elements extending beyond the viewport edges |
| **viewport-fit** | Content compressed in non-scrollable pages |
| **containment** | Children escaping their parent bounds |
| **sibling-overlap** | Sibling elements overlapping each other |
| **spacing-anomaly** | Inconsistent gaps between siblings |
| **truncation** | Text or content clipped by overflow:hidden |
| **aspect-ratio** | Images rendered at wrong proportions |
| **stacking** | Z-index bugs — ineffective z-index, stacking context traps, broken position:fixed/sticky |
| **occlusion** | Cross-level element coverage — content hidden by elements in different DOM subtrees |
| **semantic** | Missing alt, duplicate IDs, empty buttons, heading hierarchy, aria-hidden traps, broken label-for |
| **content-duplicate** | Duplicate images, links, landmarks, headings |
| **broken-image** | Images that failed to load |

## Output

Snug outputs YAML with two sections: a flat list of issues, and an annotated DOM tree showing where each issue lives.

```yaml
viewport: { width: 1280, height: 800 }
element_count: 183
issues:
  - type: containment
    severity: error
    element: ".card"
    detail: "Exceeds parent bounds on right(12px)"
  - type: viewport-fit
    severity: warning
    element: ".bottom-panel"
    detail: "Content compressed on non-scrollable page. Needs 36px, rendered at 22px"
tree:
  # Annotated DOM tree with inline issues...
```

## CLI options

```
snug check [file]

Options:
  --url         URL to check (http://localhost:5173/page)
  --stdin       Read HTML from stdin
  --base-url    Base URL for resolving relative resources
  --depth       Max DOM depth (0 = unlimited)         [default: 0]
  --width       Viewport width                        [default: 1280]
  --height      Viewport height                       [default: 800]
  --keep-alive  Keep browser alive for N seconds       [default: 180]
```

The browser stays warm between runs (`--keep-alive`), so the first invocation takes ~1s and subsequent ones are nearly instant.

## Programmatic API

```typescript
import { check } from 'snug-cli';

const report = await check({ file: 'page.html', width: 1280, height: 800 });

console.log(report.issues);       // Issue[]
console.log(report.elementCount); // number
```

You can also run individual diagnostics or bring your own:

```typescript
import { extractDOM, runDiagnostics, checkContainment, checkSiblingOverlap } from 'snug-cli';

// Run only the checks you care about
const issues = runDiagnostics(tree, viewport, [checkContainment, checkSiblingOverlap]);
```

## How it works

1. **Render** — Opens your HTML in headless Chromium (via Puppeteer)
2. **Extract** — Single `page.evaluate()` call walks the DOM and collects bounding boxes, computed styles, scroll dimensions
3. **Diagnose** — Pure functions run geometry math over the extracted tree. No network, no browser needed at this step
4. **Report** — Annotates the DOM tree with issues and outputs structured YAML

All diagnostics are pure arithmetic over rectangles. They're fast, deterministic, and easy to extend.

## Smart about noise

Snug reduces false positives through generic heuristics, not pattern-specific rules:

- Elements inside `overflow: hidden` containers are downgraded to warnings (visually clipped)
- SVG drawing primitives skip overlap/spacing checks (overlap by design)
- Inline text spans skip overlap checks (normal text flow)
- Edge-mounted elements (ports, badges) are suppressed — intentional protrusion
- Negative CSS margins matching the overlap direction are recognized as intentional
- `pointer-events: none` layers are recognized as visual-only (no interactive conflict)
- CSS `gap` property used as ground truth instead of statistical inference when available
- `justify-content: space-between/around/evenly` layouts skip spacing checks (variable by design)
- Occlusion uses `elementsFromPoint()` sampling for ground truth + intentionality scoring (viewport coverage, z-index gap, position, DOM distance) to distinguish accidental occlusion from intentional overlays
- Sub-pixel truncation (≤2px) filtered to avoid browser font rounding noise

## Benchmark

Tested against 99 production mockups (~30,000 DOM elements) spanning dashboards, canvas editors, modals, settings pages, component libraries, and landing pages. Results validated independently by two AI models (Claude Sonnet + OpenAI Codex).

| Metric | Value |
|---|---|
| Pages tested | 99 |
| Diagnostics | 12 categories |
| Total errors | 106 |
| Total warnings | 2,073 |
| Pages with zero errors | 55 (57%) |
| Recall (bugs caught / bugs present) | **95%** |

### What Snug catches

| Category | Findings | Example |
|---|---|---|
| Sibling overlap | 969 | Avatar stacks, canvas node collisions, form control overlaps |
| Spacing anomaly | 440 | Palette search margin inconsistency, nav item gap deviation |
| Containment | 231 | Form sections overflowing container, node card edge protrusion |
| Stacking | 155 | `z-index` on `position: static`, stacking context traps, broken sticky |
| Accessibility (semantic) | 114 | `aria-hidden` on focusable elements, broken label-for, empty buttons |
| Viewport overflow | 109 | Inspector tabs clipped at panel edge, pipeline nodes off-screen |
| Truncation | 84 | YAML editor line numbers overflowing, text clipped by container |
| Occlusion | 63 | Cross-level element coverage via `elementsFromPoint()` sampling |
| Content duplication | — | Duplicate nav links, repeated images, landmark conflicts |
| Aspect ratio | — | Images stretched/squished vs natural dimensions |

### Noise reduction journey

| Version | Errors | Warnings | Pages with 0 errors |
|---|---|---|---|
| v0.1 (initial) | 800+ | 2,500 | 13 |
| v0.2 (noise reduction + severity resolver) | 113 | 1,818 | 59 |
| **v0.3 (heuristics + semantic + occlusion)** | **106** | **2,073** | **55** |

Errors reduced 87% from v0.1 through generic heuristics (negative margin detection, pointer-events:none layers, CSS gap as ground truth, intentionality scoring), not pattern-specific rules. Warning count increased in v0.3 because new diagnostics (semantic a11y checks, occlusion) add real findings.

### Precision by page type

| Page type | Notes |
|---|---|
| Settings, forms, tables | Highest signal — the pages agents build and iterate on |
| Modals, dialogs | Intentionality scoring filters modal backdrop noise |
| Canvas / node-graph editors | Real bugs (truncation, stacking) caught within canvas architecture noise |
| Component libraries | Edge-mounted ports suppressed, semantic checks add value |

### Clean page detection

55 of 99 tested pages had zero errors. Pages with no issues correctly report clean — Snug doesn't cry wolf on well-built layouts.

## Contributing

Issues and PRs welcome! This project is MIT licensed.

```bash
git clone https://github.com/creynir/snug.git
cd snug
npm install
npm run build
npm test
```

## License

MIT
