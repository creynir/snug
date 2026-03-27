// ── Geometry ──

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// ── DOM Extraction ──

export interface ExtractedElement {
  /** Minimal CSS selector for this element */
  selector: string;
  /** HTML tag name (lowercase) */
  tag: string;
  /** Bounding rectangle in CSS pixels */
  bounds: Bounds;
  /** Text content (truncated, first 60 chars) */
  text?: string;
  /** Relevant computed styles — always extracted, but only included in report for elements with issues */
  computed?: Record<string, string>;
  /** Scroll vs client dimensions for overflow detection */
  scroll?: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  /** Natural dimensions for images/video */
  natural?: {
    width: number;
    height: number;
  };
  /** Semantic attributes for content analysis (src, href, role, alt, aria-label) */
  attributes?: Record<string, string>;
  /** Child elements */
  children: ExtractedElement[];
}

export interface ExtractionOptions {
  /** Max depth to traverse (0 = unlimited) */
  depth?: number;
  /** Include invisible elements (display:none, visibility:hidden) */
  includeHidden?: boolean;
}

// ── Diagnostics ──

export type IssueSeverity = 'error' | 'warning';

export type IssueType =
  | 'viewport-overflow'
  | 'containment'
  | 'sibling-overlap'
  | 'truncation'
  | 'spacing-anomaly'
  | 'aspect-ratio'
  | 'viewport-fit'
  | 'content-duplicate'
  | 'stacking'
  | 'semantic'
  | 'occlusion';

export interface Issue {
  type: IssueType;
  severity: IssueSeverity;
  /** Primary element selector */
  element: string;
  /** Second element selector (for overlap, containment, spacing) */
  element2?: string;
  /** Human/agent-readable description */
  detail: string;
  /** Relevant computed styles that explain the "why" */
  computed?: Record<string, string | Record<string, string>>;
  /** Additional numeric/boolean data for the agent */
  data?: Record<string, number | boolean>;
  /** Triage context for the agent */
  context?: Record<string, string>;
}

/** Signature for all diagnostic functions — pure functions over geometry data */
export type DiagnosticFn = (tree: ExtractedElement, viewport: Viewport) => Issue[];

// ── Report ──

export interface SnugReport {
  viewport: Viewport;
  elementCount: number;
  issues: Issue[];
  tree: ExtractedElement;
}

// ── Annotated Tree (for YAML output) ──

export interface AnnotatedNode {
  /** Compact display: "selector [x,y wxh]" */
  label: string;
  /** Text content if present */
  text?: string;
  /** Issues at this node */
  issues?: AnnotatedIssue[];
  /** Computed styles (only when issues reference them) */
  computed?: Record<string, string | Record<string, string>>;
  /** Children */
  children?: AnnotatedNode[];
}

export interface AnnotatedIssue {
  type: IssueType;
  severity: IssueSeverity;
  detail: string;
  data?: Record<string, number | boolean>;
}

// ── Browser Adapter ──

export interface BrowserAdapter {
  /** Initialize the browser (launch or connect to warm instance) */
  init(): Promise<void>;
  /** Render HTML and return an extraction-ready page handle */
  render(input: RenderInput): Promise<PageHandle>;
  /** Shutdown the browser */
  dispose(): Promise<void>;
}

export interface RenderInput {
  /** Path to an HTML file */
  filePath?: string;
  /** Raw HTML string */
  html?: string;
  /** Base URL for resolving relative resources (used with html input) */
  baseUrl?: string;
  /** Viewport dimensions (default: 1280x800) */
  viewport?: Viewport;
}

export interface PageHandle {
  /** Run a function in the browser page context */
  evaluate<T>(fn: string | (() => T)): Promise<T>;
  /** Run a function with serializable args in the page context */
  evaluateWithArgs<T, A extends unknown[]>(
    fn: string | ((...args: A) => T),
    ...args: A
  ): Promise<T>;
  /** Current viewport dimensions */
  viewport(): Viewport;
  /** Close this page (but keep browser alive) */
  close(): Promise<void>;
}

// ── CLI Options ──

export interface CheckOptions {
  /** Input file path */
  file?: string;
  /** Read HTML from stdin */
  stdin?: boolean;
  /** Base URL for relative resource resolution */
  baseUrl?: string;
  /** Max DOM depth (0 = unlimited) */
  depth?: number;
  /** Viewport width */
  width?: number;
  /** Viewport height */
  height?: number;
  /** Keep browser alive for N seconds after check */
  keepAlive?: number;
}
