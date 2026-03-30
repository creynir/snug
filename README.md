# <img src="assets/logo.svg" alt="" height="32" /> snug

**Layout diagnostics for AI agents.** Math instead of pixels.

[![npm version](https://img.shields.io/npm/v/snug-cli)](https://www.npmjs.com/package/snug-cli) [![npm downloads](https://img.shields.io/npm/dw/snug-cli)](https://www.npmjs.com/package/snug-cli) [![license](https://img.shields.io/npm/l/snug-cli)](https://github.com/creynir/snug/blob/main/LICENSE)

<p align="center">
  <img src="assets/demo.gif" alt="snug check running against an HTML file" width="800" />
</p>

Snug renders HTML in a headless browser, extracts every element's bounding box, and runs geometry checks to find layout problems — overlaps, overflows, truncation, spacing anomalies, stacking bugs, accessibility gaps. It returns structured YAML that AI agents can parse, reason about, and use to fix layouts in a loop. No screenshots, no vision models. Tested against 99 production mockups with 95% recall.

## Install

```bash
npm install -g snug-cli
```

## Quick start

```bash
# Check a local HTML file
snug check page.html

# Check a live URL (local dev server, staging, any URL)
snug check --url http://localhost:5173/settings

# Custom viewport
snug check page.html --width 1440 --height 900
```

## What it checks

| Diagnostic | What it catches |
|---|---|
| **viewport-overflow** | Elements extending beyond viewport — inspector tabs clipped at panel edge, pipeline nodes off-screen |
| **viewport-fit** | Content compressed in non-scrollable pages — bottom panel squeezed, rows collapsed |
| **containment** | Children escaping parent bounds — form sections overflowing container, tooltips escaping trigger |
| **sibling-overlap** | Sibling elements overlapping — cards colliding, avatar stacks, text-on-text |
| **spacing-anomaly** | Inconsistent gaps between siblings — 16px, 16px, 4px in a card grid |
| **truncation** | Text clipped by overflow:hidden — YAML editor line numbers overflowing, labels cut off |
| **aspect-ratio** | Images stretched/squished vs natural dimensions |
| **stacking** | Z-index bugs — ineffective z-index on static elements, stacking context traps, broken position:fixed/sticky |
| **occlusion** | Cross-level coverage — content hidden by elements in different DOM subtrees, via `elementsFromPoint()` sampling |
| **semantic** | Missing alt text, duplicate IDs, empty buttons, heading hierarchy, `aria-hidden` on focusable elements, broken `label[for]` |
| **content-duplicate** | Duplicate images, links, landmarks, headings |
| **broken-image** | Images that failed to load (naturalWidth: 0) |

## Output

Snug outputs YAML with a flat issue list and an annotated DOM tree showing where each issue lives.

```yaml
viewport: { width: 1280, height: 800 }
element_count: 183
summary:
  errors: 3
  warnings: 6
issues:
  - type: viewport-overflow
    severity: error
    element: div.wide-banner
    detail: Overflows viewport right edge by 220px
  - type: containment
    severity: warning
    element: div.node-card__port
    detail: Exceeds parent bounds on left(4px)
    context:
      edgeMounted: "true"
tree:
  body [0,0 1280x800]:
    div.container [0,0 1280x800]:
      div.wide-banner [0,100 1500x200]:
        issues:
          - type: viewport-overflow
            severity: error
            detail: Overflows viewport right edge by 220px
```

## How it works

1. **Render** — Opens HTML in headless Chromium (via Puppeteer). Supports files, URLs, and stdin.
2. **Extract** — Single `page.evaluate()` call walks the DOM, collects bounding boxes, computed styles, scroll dimensions, and semantic attributes. A second pass samples `elementsFromPoint()` for occlusion ground truth.
3. **Diagnose** — Pure functions run geometry math over the extracted tree. No network, no browser needed at this step.
4. **Report** — Annotates the DOM tree with issues and outputs structured YAML.

All spatial diagnostics are pure arithmetic over rectangles — fast, deterministic, and easy to extend.

## False positive reduction

Snug reduces noise through generic heuristics, not pattern-specific rules:

- Elements inside `overflow: hidden` containers are downgraded to warnings (visually clipped)
- SVG drawing primitives skip overlap/spacing checks (overlap by design)
- Edge-mounted elements (ports, badges) are suppressed — intentional protrusion
- Negative CSS margins matching the overlap direction are recognized as intentional
- `pointer-events: none` layers are recognized as visual-only (no interactive conflict)
- CSS `gap` property used as ground truth instead of statistical inference when available
- `justify-content: space-between/around/evenly` layouts skip spacing checks (variable by design)
- Occlusion uses intentionality scoring (viewport coverage, z-index gap, position, DOM distance) to suppress intentional overlays
- Sub-pixel truncation (≤2px) filtered to avoid browser font rounding noise

## Benchmark

Tested against 99 production mockups (~30,000 DOM elements) — dashboards, canvas editors, modals, settings pages, component libraries, landing pages. Validated independently by Claude Sonnet and OpenAI Codex.

| Metric | Value |
|---|---|
| Pages tested | 99 |
| Diagnostics | 12 categories |
| Total errors | 106 |
| Total warnings | 2,073 |
| Pages with zero errors | 55 (57%) |
| Recall | **95%** |

55 of 99 tested pages had zero errors. Pages with no issues correctly report clean — Snug doesn't cry wolf on well-built layouts.

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

Run individual diagnostics:

```typescript
import { extractDOM, runDiagnostics, checkContainment, checkSiblingOverlap } from 'snug-cli';

const issues = runDiagnostics(tree, viewport, [checkContainment, checkSiblingOverlap]);
```

## Contributing

Issues and PRs welcome. This project is MIT licensed.

```bash
git clone https://github.com/creynir/snug.git
cd snug
npm install
npm run build
npm test
```

## License

MIT
