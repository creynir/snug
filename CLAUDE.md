# Snug — Layout Diagnostics for AI Agents

## What This Is

Snug renders HTML in a headless browser, extracts bounding boxes of DOM elements, and reports spatial issues (overlaps, overflows, containment violations, truncation, spacing anomalies, aspect ratio distortion) as structured YAML. Math instead of pixels.

## Architecture

Read `specs/HLD.md` for the full design. Here's what you need to know:

```
Input (file path / stdin)
  → Browser Adapter (Puppeteer, pluggable)
    → DOM Extraction (single page.evaluate() — bounds, styles, scroll, tree)
      → Diagnostic Engine (pure math functions, no browser dependency)
        → Reporter (YAML to stdout)
```

## Tech Stack

- TypeScript + Node.js (ESM)
- Puppeteer (headless Chromium)
- yargs (CLI parsing)
- yaml (output serialization)
- vitest (testing)
- tsup (build)

## Commands

```bash
npm run build     # Build with tsup
npm run dev       # Build with watch
npm run test      # Run vitest
npm run check     # TypeScript type checking
```

## Project Structure

```
src/
├── types.ts                     # All shared interfaces — START HERE
├── cli.ts                       # CLI entry point (yargs)
├── index.ts                     # Library API exports
├── pipeline.ts                  # Orchestrates: render → extract → diagnose → report
├── browser/
│   ├── adapter.ts               # Re-exports BrowserAdapter types
│   ├── puppeteer.ts             # PuppeteerAdapter (warm start, page lifecycle)
│   └── warm.ts                  # Warm browser handle (temp file + PID liveness)
├── extractor/
│   └── extract.ts               # DOM extraction via page.evaluate()
├── diagnostics/
│   ├── index.ts                 # runDiagnostics() — runs all checks, returns Issue[]
│   ├── viewport-overflow.ts     # Elements beyond viewport edges
│   ├── containment.ts           # Children escaping parent bounds
│   ├── sibling-overlap.ts       # Overlapping siblings with z-index severity
│   ├── truncation.ts            # Text/content clipped by overflow:hidden
│   ├── spacing-anomaly.ts       # Statistical outlier detection in sibling gaps
│   └── aspect-ratio.ts          # Image aspect ratio distortion
└── reporter/
    ├── annotate.ts              # Attach issues inline to tree nodes
    └── format.ts                # Serialize SnugReport → YAML string
```

## How to Implement

Every file has a scaffold with `throw new Error('Not implemented')` stubs. Each stub has:
- A docstring explaining what the function does
- `// TODO:` comments with step-by-step implementation notes
- References to HLD sections (`§3.5.1`, etc.) for detailed algorithm pseudocode

### Key Patterns

**Diagnostics are pure functions.** Signature: `(tree: ExtractedElement, viewport: Viewport) => Issue[]`. No browser, no side effects. Test with synthetic `ExtractedElement` data — no Puppeteer needed.

**The extraction script runs inside the browser.** `src/extractor/extract.ts` contains a function that is serialized and sent to `page.evaluate()`. It must be self-contained — no closures, no imports, no Node.js APIs. Only browser DOM APIs.

**Computed styles explain the "why".** When a diagnostic creates an Issue, include the relevant computed CSS properties so the agent knows what caused the problem (e.g., `margin-left: -20px` for an overlap).

### Sibling Overlap — Z-Index Heuristic

**Critical:** Check ALL siblings for overlap regardless of position (absolute/fixed/etc). AI agents use `position: absolute` as their default strategy — filtering would miss most issues.

Use z-index to determine severity:
- Same z-index (or both auto) + overlap → `error`
- Different z-index + overlap → `warning`
- Treat `auto` as `0` for comparison

### Spacing Anomaly — Statistical Detection

Requires ≥ 3 siblings. Detect dominant axis, compute gaps between consecutive siblings, find the mode (2px tolerance grouping), flag deviations > max(4px, 20% of mode).

### Tree Annotation

The bird-view AST tree uses compact notation: `selector [x,y wxh]`. Issues are attached inline. Computed styles only appear on nodes that have issues.

## Testing

**Unit tests** (no browser): `test/unit/diagnostics/` — test each diagnostic with synthetic `ExtractedElement` trees. These should all pass without Puppeteer.

**Integration tests** (need browser): `test/integration/` — test extraction and full pipeline against HTML fixtures in `test/fixtures/`.

Fixtures are designed to trigger specific diagnostics:
- `clean.html` — no issues (baseline)
- `overflow.html` — viewport overflow (wide element, negative margin)
- `containment.html` — child escaping parent + overflow:hidden (should NOT flag)
- `overlap.html` — same z-index overlap (error) + different z-index (warning)
- `truncation.html` — horizontal ellipsis + vertical clamp
- `spacing.html` — consistent spacing + one outlier gap
- `aspect-ratio.html` — distorted img + preserved img

## Exit Codes

- `0` — no issues
- `1` — issues found
- `2` — runtime error

## What NOT to Do

- Don't add features beyond what's specified in the HLD
- Don't add new dependencies without checking if existing ones cover the need
- Don't write new test fixtures — use the existing ones
- Don't modify `types.ts` interfaces — they're the contract
- Don't add comments or docstrings beyond what the stubs already have
