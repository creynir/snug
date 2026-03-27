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
| **stacking** | Z-index bugs — ineffective z-index, stacking context traps, broken position:fixed |
| **semantic** | Missing alt text, duplicate IDs, empty buttons, heading hierarchy, positive tabindex |
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

Snug tries not to waste your time with false positives:

- Elements inside `overflow: hidden` containers get downgraded to warnings (they're visually clipped)
- SVG drawing primitives are skipped for overlap/spacing checks (they overlap by design)
- Inline text spans skip overlap checks (normal text flow)
- Small edge-mounted elements (ports, badges, handles) are recognized as intentional
- Full-viewport fixed overlays (modals, backdrops) are recognized as stacking layers

## Benchmark

Tested against 99 production mockups (~30,000 DOM elements) spanning dashboards, canvas editors, modals, settings pages, component libraries, and landing pages. Results validated independently by two AI models (Claude Sonnet + OpenAI Codex).

| Metric | Value |
|---|---|
| Pages tested | 99 |
| Real layout bugs found | ~130 |
| Recall (bugs caught / bugs present) | **95%** |
| False negatives | 8 across 99 pages |
| Diagnostics | 11 categories |

### What Snug catches

| Category | Bugs found | Example |
|---|---|---|
| Accessibility gaps | ~40 | Icon buttons without `aria-label` |
| Content truncation | ~15 | YAML editor line numbers overflowing container |
| Viewport overflow | ~12 | Inspector tabs clipped at panel edge |
| Z-index / stacking bugs | ~8 | `z-index` on `position: static` (silently ignored) |
| Spacing inconsistencies | ~10 | Palette search input with extra margin |
| Text-on-text overlap | ~3 | Textarea badge covering input content |
| Content duplication | ~7 | Duplicate nav links across mobile/desktop |
| Containment violations | ~5 | Form sections overflowing form container |
| Heading hierarchy | ~2 | `h3` followed by `h5` (skipped `h4`) |

### Precision by page type

| Page type | Precision | Notes |
|---|---|---|
| Settings, forms, tables | ~50% | Highest signal — the pages agents build and iterate on |
| Modals, dialogs | ~30% | Modal backdrop overlaps are filtered |
| Canvas / node-graph editors | ~5% | Layered absolute positioning is architecturally noisy |
| Component libraries | ~3% | Edge-mounted ports and badges dominate |

Snug is most valuable on the pages AI agents actually generate — forms, tables, dashboards, and settings screens. Canvas editors with hundreds of absolutely-positioned layers produce more noise, though real bugs (truncation, stacking violations) are still caught within the noise.

### Clean page detection

55 of 99 tested pages had zero layout errors. Pages with no issues correctly report `0 errors, 0 warnings` — Snug doesn't cry wolf on well-built layouts.

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
