# Snug

**Layout diagnostics for AI agents.** Math instead of pixels.

Snug renders your HTML in a headless browser, extracts every element's bounding box, and runs pure geometry checks to find layout problems — overlaps, overflows, truncation, spacing anomalies, broken containment. It returns a structured YAML report that AI agents (or humans) can read and act on. No screenshots, no vision models.

## Why?

AI coding agents can write CSS, but they can't *see* the result. Snug gives them eyes — a spatial report they can parse, reason about, and use to fix layout bugs in a loop.

## Install

```bash
npm install -g snug
```

Or use it locally:

```bash
npm install snug
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
| **viewport-fit** | Content that doesn't fit in non-scrollable pages (compressed rows, clipped panels) |
| **containment** | Children escaping their parent bounds |
| **sibling-overlap** | Sibling elements overlapping each other |
| **spacing-anomaly** | Inconsistent gaps between siblings (e.g., 3 cards spaced 16px, 16px, 4px) |
| **truncation** | Text or content clipped by its container |
| **aspect-ratio** | Images/video rendered at wrong proportions |

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
import { check } from 'snug';

const report = await check({ file: 'page.html', width: 1280, height: 800 });

console.log(report.issues);       // Issue[]
console.log(report.elementCount); // number
```

You can also run individual diagnostics or bring your own:

```typescript
import { extractDOM, runDiagnostics, checkContainment, checkSiblingOverlap } from 'snug';

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

## Contributing

Issues and PRs welcome! This project is MIT licensed.

```bash
git clone https://github.com/user/snug.git
cd snug
npm install
npm run build
npm test
```

## License

MIT
