# Snug — Architecture Decision Records

---

## ADR-001: YAML over JSON/XML for Output Format

**Status:** Accepted

**Context:**

Snug's output is consumed by AI agents (LLMs) that read structured text and generate CSS fixes. The output format must be:
1. Easily parseable by LLMs (natural reading flow, minimal syntactic noise).
2. Compact enough to fit in context windows without waste.
3. Able to represent hierarchical tree structures readably.
4. Human-debuggable (developers will read reports during development).

The candidates considered were JSON, XML, YAML, and plain text with custom formatting.

**Decision:**

Use YAML as the output format, with compact custom notation for bounds (`[x,y wxh]`).

**Consequences:**

*Positive:*
- YAML's indentation-based hierarchy maps naturally to the DOM tree structure. The bird-view AST tree is immediately readable without brace-matching or tag-closing noise.
- YAML is ~30-40% more compact than equivalent JSON (no quotes on keys, no braces, no commas) and ~50-60% more compact than XML. This matters for context window efficiency.
- LLMs are well-trained on YAML from Kubernetes manifests, CI configs, and OpenAPI specs. Parsing accuracy is high.
- The `yaml` npm package provides robust serialization with control over formatting (line width, flow vs block).

*Negative:*
- YAML has well-known parsing pitfalls (the "Norway problem" with bare `NO` being parsed as boolean). Mitigated: Snug outputs strings for all values that could be ambiguous; bounds are pre-formatted as strings.
- Programmatic consumers (non-LLM tools) may prefer JSON. Mitigated: A `--format json` flag can be trivially added since the internal data model is format-agnostic. Deferred to post-MVP.
- YAML indentation sensitivity means the reporter must be careful about formatting. Mitigated: the `yaml` library handles this.

*Alternatives rejected:*
- **JSON**: Too noisy for tree visualization. Deeply nested braces and mandatory quotes on keys make large trees hard to scan.
- **XML**: Verbose, poor LLM training signal (less common in modern configs), closing tags add noise.
- **Custom plain text**: Maximum flexibility but requires custom parsing on both ends. No schema validation. Fragile.

---

## ADR-002: Puppeteer as Default Browser Engine

**Status:** Accepted

**Context:**

Snug needs a headless browser to render HTML and extract bounding-box geometry via `getBoundingClientRect()`. The leading options in the Node.js ecosystem are:
1. **Puppeteer** — Google-maintained, Chromium-only, ships its own Chromium binary.
2. **Playwright** — Microsoft-maintained, multi-browser (Chromium, Firefox, WebKit).
3. **Chrome DevTools Protocol (CDP) directly** — Raw WebSocket to Chrome, no abstraction.

**Decision:**

Use Puppeteer as the default browser engine, behind a pluggable `BrowserAdapter` interface that permits future alternatives.

**Consequences:**

*Positive:*
- Puppeteer bundles a tested Chromium binary. Zero-config setup: `npm install` gives you a working browser. Critical for AI agent workflows where setup friction must be minimal.
- `page.evaluate()` API is mature and maps directly to Snug's single-pass extraction pattern.
- Warm browser pattern (`puppeteer.connect()`) is a first-class feature.
- Largest mindshare in the Node.js headless browser space.

*Negative:*
- Chromium-only. Layout may differ slightly in Firefox/WebKit. For Snug's use case, Chromium's rendering is the de facto standard for AI-generated HTML.
- Bundled Chromium is ~170MB. Mitigated: downloaded once and cached.
- API surface can be unstable across major versions. Mitigated: thin adapter wrapper isolates the codebase.

*Alternatives rejected:*
- **Playwright**: Downloads 3 browsers (~500MB). Snug only needs one. Can be added as a second adapter.
- **Raw CDP**: Low-level, error-prone, requires reimplementing page lifecycle management.

---

## ADR-003: Warm Browser Pattern for Iterative Agent Workflows

**Status:** Accepted

**Context:**

AI agents iterate: generate HTML, check layout, fix issues, re-check. Each `snug check` invocation is a separate CLI process. Launching a new Chromium instance per invocation costs ~1s, which dominates the total check time (~1.5s cold vs ~300ms warm). In a typical agent loop of 5-10 iterations, this adds 5-10 seconds of unnecessary latency.

**Decision:**

Implement a "warm browser" pattern where the first invocation launches Chromium and writes its WebSocket endpoint to a temp file (`$TMPDIR/snug-browser.json`). Subsequent invocations within the idle timeout window connect to the existing instance. The browser auto-closes after N seconds of inactivity (default: 180s, configurable via `--keep-alive`).

**Consequences:**

*Positive:*
- Reduces repeat-check latency from ~1s to ~50ms. 20x improvement that directly benefits agent iteration speed.
- Zero configuration required. Transparent — it just works.
- Idle timeout ensures the browser does not leak. `.unref()` on the timer ensures clean process exit.
- PID-based liveness check detects crashed browsers and cleans up stale handles automatically.

*Negative:*
- Browser process lingers after CLI exits (~50-100MB RAM for up to 3 minutes). Acceptable for dev workstation.
- Race conditions possible if two processes simultaneously launch. Tolerated: last writer wins, orphaned browser self-closes on timeout.
- Temp file path is platform-dependent. Mitigated: `os.tmpdir()` abstracts this.

*Alternatives rejected:*
- **Always cold start**: 1s penalty per check is unacceptable for iterative workflows.
- **Long-running daemon**: Adds operational complexity (systemd/launchd, PID files, log rotation). Overkill for a CLI tool.
- **Unix domain socket**: Puppeteer's `connect()` uses WebSocket natively — no reason to fight it.

---

## ADR-004: Statistical Outlier Detection for Spacing Diagnostics

**Status:** Accepted

**Context:**

Spacing anomalies are a common layout bug: one item in a list has different margins, or a grid gap is inconsistent. Unlike overflow or overlap, spacing issues cannot be detected by comparing against a fixed threshold — the "correct" spacing varies per design.

The key insight is that in well-formed layouts, sibling elements at the same nesting level share a consistent spacing pattern. Deviations from that pattern are likely bugs.

**Decision:**

Use statistical mode detection to identify the dominant spacing pattern among siblings, then flag deviations that exceed both an absolute threshold (4px) and a relative threshold (20% of the mode).

**Consequences:**

*Positive:*
- No hard-coded spacing values. Adapts to any design — a 4px-gap grid and a 32px-gap card layout are both handled correctly.
- Mode-based detection (vs mean or median) is robust to single outliers.
- Dual threshold (absolute AND relative) prevents false positives.
- Requires minimum 3 siblings to establish a pattern — prevents false positives on pairs.

*Negative:*
- Cannot detect "uniformly wrong" spacing (all gaps are 20px, but designer intended 16px). Acceptable: Snug detects *inconsistency*, not *incorrectness*.
- Axis detection heuristic may fail for diagonal or wrapped flex layouts. Gracefully skips when no clear axis is detected.

*Alternatives rejected:*
- **Fixed thresholds**: Useless. A 50px gap is normal in some designs and a bug in others.
- **Mean-based detection**: A single large outlier shifts the mean. Mode is more robust.
- **Design token comparison**: Requires the agent to pass expected spacing values. Defeats "zero-config" principle.

---

## ADR-005: Computed Styles as Level 1 "Why" Traceback

**Status:** Accepted

**Context:**

When Snug reports a layout issue, agents need to know *why* it occurred so they can write a targeted fix. There are two levels of "why":

1. **Level 1 — Computed styles**: What is the final computed value of the relevant CSS properties? (e.g., `margin-left: -20px`, `width: 1400px`)
2. **Level 2 — CSS rule traceback**: Which CSS rule set that value? (e.g., `.hero-image { width: 1400px }` from `styles.css:42`)

**Decision:**

For MVP, provide Level 1 (computed styles) only. Defer Level 2 (CDP rule traceback) to Phase 2.

**Consequences:**

*Positive:*
- Computed styles are available via `getComputedStyle()` inside `page.evaluate()`, requiring no additional browser API calls. They come "for free" as part of single-pass extraction.
- For most agent workflows, computed styles are sufficient. The agent knows *what* to change.
- Keeps the extraction self-contained: one `page.evaluate()` call, no CDP protocol dependency.
- Reduces adapter interface complexity. Level 2 would require CDP-specific methods, breaking browser-agnostic abstraction.

*Negative:*
- Agents operating on large stylesheets with complex cascade may struggle to find the right rule.
- Shorthand properties are expanded in computed styles, which may confuse agents expecting the shorthand.

*Alternatives rejected:*
- **Level 2 via CDP for MVP**: Significant complexity for marginal agent benefit in MVP scenarios.
- **No style information**: Agents would only know *that* there is overlap, not *why*. Defeats diagnostic purpose.

---

## ADR-006: Bird-View AST Tree as Primary Output

**Status:** Accepted

**Context:**

Snug's output could be structured as:
1. **Issues-only**: A flat list of detected problems with element selectors.
2. **Tree + issues**: A hierarchical view of the entire DOM with issues annotated inline.

**Decision:**

Use a bird-view AST tree as the primary output, with issues annotated inline. Include a flat issues list as a secondary section for programmatic access.

**Consequences:**

*Positive:*
- The tree gives agents **spatial context**. Seeing that `.card:2` is a child of `.card-grid`, which is inside `main`, helps the agent understand hierarchy and write more precise fixes.
- Inline annotations connect issues to their location in the tree, eliminating mental joins.
- Compact bounds notation (`selector [x,y wxh]`) gives agents a text-based wireframe at a glance.
- Even with zero issues, the tree output confirms layout structure — useful as "layout passed" verification.

*Negative:*
- Tree output is larger than issues-only. Mitigated: `--depth` flag limits tree depth.
- Programmatic consumers may prefer flat list. Mitigated: both are present in the output.

*Alternatives rejected:*
- **Issues-only**: Loses spatial context. Agent can't determine where an element sits in layout hierarchy.
- **Tree-only (no flat list)**: Extracting all issues from tree requires traversal. Flat list provides O(1) "are there issues?" checking.

---

## ADR-007: TypeScript for MVP

**Status:** Accepted

**Context:**

Snug needs a language that:
1. Integrates natively with Puppeteer (Node.js library).
2. Allows the extraction script to be written in the same language as the host.
3. Has strong type safety for complex data structures.
4. Enables rapid iteration for MVP development.

**Decision:**

Use TypeScript with Node.js, compiled via tsup to ESM.

**Consequences:**

*Positive:*
- **Same language, both sides**: Extraction script (`page.evaluate()` callback) is JavaScript, host code is TypeScript. No FFI boundary.
- **Puppeteer is native**: Direct API access, no bindings.
- **Type safety**: `ExtractedElement`, `Issue`, `SnugReport` interfaces catch structural bugs at compile time.
- **Ecosystem**: `yargs`, `yaml`, `vitest` — all mature TypeScript-native libraries.

*Negative:*
- Node.js startup time (~30-50ms) adds to cold-start. Negligible vs browser launch (~1s).
- JavaScript floating-point can cause sub-pixel rounding issues. Mitigated: all bounds are `Math.round()`'d, diagnostics use 1-2px tolerance.
- No true parallelism. Mitigated: diagnostic math is fast (< 5ms for typical pages).

*Alternatives rejected:*
- **Rust**: Maximum performance, but extraction script is still JavaScript (language boundary). Development velocity 3-5x slower for MVP.
- **Python**: `pyppeteer` unmaintained. Extraction script still JavaScript. Lack of static typing makes complex pipeline error-prone.

---

## ADR-008: File Path + Stdin Input Contract

**Status:** Accepted

**Context:**

Snug needs to accept HTML input. The possible input methods are:
1. **File path**: `snug check layout.html`
2. **Stdin**: `cat layout.html | snug check --stdin`
3. **URL**: `snug check https://example.com`
4. **Raw HTML as CLI argument**: `snug check --html '<div>...</div>'`

**Decision:**

Support file path (primary) and stdin (secondary). Do not support URLs or raw HTML arguments.

**Consequences:**

*Positive:*
- **File path** is the natural agent workflow: generate HTML to a file, then check it. Supports relative resource resolution via `file://` protocol. No size limits.
- **Stdin** enables piping workflows. The `--base-url` flag handles relative resource resolution.
- **No URL support** keeps Snug focused on locally generated HTML. Avoids HTTP client dependencies, CORS, auth, redirects, timeouts.
- **No raw HTML args** avoids shell injection vectors and argument length limits.

*Negative:*
- Cannot check live websites directly. Agents must `curl` first. This is a deliberate scope boundary.
- Stdin requires explicit `--stdin` flag (not auto-detected). Intentional: auto-detecting stdin is unreliable across platforms.

*Alternatives rejected:*
- **URL support**: HTTP client, SSL, cookies, auth, redirects, proxy — each a rabbit hole. Out of scope.
- **Raw HTML arg**: Shell escaping nightmare. `ARG_MAX` limits make it impractical for real HTML.
