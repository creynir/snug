import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { formatReport } from '../../../src/reporter/format.js';
import type { SnugReport, ExtractedElement, Issue } from '../../../src/types.js';

// ── Helpers ──

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: 'body',
    tag: 'body',
    bounds: { x: 0, y: 0, w: 1280, h: 800 },
    children: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    type: 'viewport-overflow',
    severity: 'error',
    element: '.test',
    detail: 'Test issue',
    ...overrides,
  };
}

function makeReport(overrides: Partial<SnugReport> = {}): SnugReport {
  return {
    viewport: { width: 1280, height: 800 },
    elementCount: 1,
    issues: [],
    tree: makeElement(),
    ...overrides,
  };
}

/** Parse the YAML output and return the JS object */
function parseOutput(report: SnugReport): Record<string, unknown> {
  const yaml = formatReport(report);
  return parse(yaml) as Record<string, unknown>;
}

// ── Tests ──

describe('formatReport', () => {
  // ── Valid YAML output ──

  describe('YAML validity', () => {
    it('returns a string that can be parsed as valid YAML', () => {
      const report = makeReport();
      const yamlStr = formatReport(report);
      expect(typeof yamlStr).toBe('string');
      expect(yamlStr.length).toBeGreaterThan(0);
      // Should not throw when parsed
      const parsed = parse(yamlStr);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('returns a string (not an object or undefined)', () => {
      const report = makeReport();
      const result = formatReport(report);
      expect(typeof result).toBe('string');
    });
  });

  // ── Viewport section ──

  describe('viewport', () => {
    it('contains viewport with width and height from the report', () => {
      const report = makeReport({ viewport: { width: 1920, height: 1080 } });
      const parsed = parseOutput(report);
      expect(parsed.viewport).toEqual({ width: 1920, height: 1080 });
    });

    it('preserves default viewport dimensions', () => {
      const report = makeReport({ viewport: { width: 1280, height: 800 } });
      const parsed = parseOutput(report);
      expect(parsed.viewport).toEqual({ width: 1280, height: 800 });
    });
  });

  // ── Element count ──

  describe('element_count', () => {
    it('contains element_count matching report.elementCount', () => {
      const report = makeReport({ elementCount: 47 });
      const parsed = parseOutput(report);
      expect(parsed.element_count).toBe(47);
    });

    it('reflects zero elements', () => {
      const report = makeReport({ elementCount: 0 });
      const parsed = parseOutput(report);
      expect(parsed.element_count).toBe(0);
    });

    it('reflects a large element count', () => {
      const report = makeReport({ elementCount: 512 });
      const parsed = parseOutput(report);
      expect(parsed.element_count).toBe(512);
    });
  });

  // ── Summary section ──

  describe('summary', () => {
    it('contains summary with errors and warnings counts', () => {
      const report = makeReport({
        issues: [
          makeIssue({ severity: 'error', element: '.a' }),
          makeIssue({ severity: 'warning', element: '.b', type: 'truncation' }),
          makeIssue({ severity: 'warning', element: '.c', type: 'spacing-anomaly' }),
        ],
      });
      const parsed = parseOutput(report);
      const summary = parsed.summary as Record<string, number>;
      expect(summary.errors).toBe(1);
      expect(summary.warnings).toBe(2);
    });

    it('produces { errors: 0, warnings: 0 } for zero-issue report', () => {
      const report = makeReport({ issues: [] });
      const parsed = parseOutput(report);
      const summary = parsed.summary as Record<string, number>;
      expect(summary.errors).toBe(0);
      expect(summary.warnings).toBe(0);
    });

    it('counts multiple errors correctly', () => {
      const report = makeReport({
        issues: [
          makeIssue({ severity: 'error', element: '.a', type: 'viewport-overflow' }),
          makeIssue({ severity: 'error', element: '.b', type: 'containment' }),
          makeIssue({ severity: 'error', element: '.c', type: 'sibling-overlap' }),
        ],
      });
      const parsed = parseOutput(report);
      const summary = parsed.summary as Record<string, number>;
      expect(summary.errors).toBe(3);
      expect(summary.warnings).toBe(0);
    });

    it('counts mixed severity issues correctly', () => {
      const report = makeReport({
        issues: [
          makeIssue({ severity: 'error', element: '.a' }),
          makeIssue({ severity: 'error', element: '.b', type: 'containment' }),
          makeIssue({ severity: 'warning', element: '.c', type: 'truncation' }),
          makeIssue({ severity: 'warning', element: '.d', type: 'spacing-anomaly' }),
          makeIssue({ severity: 'warning', element: '.e', type: 'aspect-ratio' }),
        ],
      });
      const parsed = parseOutput(report);
      const summary = parsed.summary as Record<string, number>;
      expect(summary.errors).toBe(2);
      expect(summary.warnings).toBe(3);
    });
  });

  // ── Issues section (flat list) ──

  describe('issues', () => {
    it('contains issues as a flat list in the YAML', () => {
      const issues: Issue[] = [
        {
          type: 'viewport-overflow',
          severity: 'error',
          element: '.hero-image',
          detail: 'Overflows viewport right edge by 120px',
          data: { overflowX: 120 },
        },
      ];
      const report = makeReport({ issues });
      const parsed = parseOutput(report);
      const parsedIssues = parsed.issues as Record<string, unknown>[];
      expect(parsedIssues).toHaveLength(1);
      expect(parsedIssues[0].type).toBe('viewport-overflow');
      expect(parsedIssues[0].severity).toBe('error');
      expect(parsedIssues[0].element).toBe('.hero-image');
      expect(parsedIssues[0].detail).toBe('Overflows viewport right edge by 120px');
    });

    it('includes element2 in issues that have it', () => {
      const issues: Issue[] = [
        {
          type: 'sibling-overlap',
          severity: 'error',
          element: '.card:nth-of-type(2)',
          element2: '.card:nth-of-type(1)',
          detail: 'Overlaps by 20x400px',
          data: { overlapX: 20, overlapY: 400, overlapArea: 8000 },
        },
      ];
      const report = makeReport({ issues });
      const parsed = parseOutput(report);
      const parsedIssues = parsed.issues as Record<string, unknown>[];
      expect(parsedIssues[0].element2).toBe('.card:nth-of-type(1)');
    });

    it('includes data and computed fields in flat issues', () => {
      const issues: Issue[] = [
        {
          type: 'truncation',
          severity: 'warning',
          element: '.product-title',
          detail: 'Content truncated',
          computed: { overflow: 'hidden', textOverflow: 'ellipsis' },
          data: { scrollWidth: 340, clientWidth: 200, clippedPx: 140 },
        },
      ];
      const report = makeReport({ issues });
      const parsed = parseOutput(report);
      const parsedIssues = parsed.issues as Record<string, unknown>[];
      expect(parsedIssues[0].data).toEqual({ scrollWidth: 340, clientWidth: 200, clippedPx: 140 });
      expect(parsedIssues[0].computed).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis' });
    });

    it('produces an empty issues list for zero-issue report', () => {
      const report = makeReport({ issues: [] });
      const parsed = parseOutput(report);
      // issues should be an empty array (or could be absent, but per spec it should be listed)
      const parsedIssues = parsed.issues as unknown[] | undefined;
      expect(parsedIssues ?? []).toHaveLength(0);
    });

    it('lists multiple issues in order', () => {
      const issues: Issue[] = [
        makeIssue({ type: 'viewport-overflow', element: '.first', detail: 'First issue' }),
        makeIssue({ type: 'truncation', severity: 'warning', element: '.second', detail: 'Second issue' }),
        makeIssue({ type: 'containment', element: '.third', detail: 'Third issue' }),
      ];
      const report = makeReport({ issues });
      const parsed = parseOutput(report);
      const parsedIssues = parsed.issues as Record<string, unknown>[];
      expect(parsedIssues).toHaveLength(3);
      expect(parsedIssues[0].element).toBe('.first');
      expect(parsedIssues[1].element).toBe('.second');
      expect(parsedIssues[2].element).toBe('.third');
    });
  });

  // ── Tree section ──

  describe('tree', () => {
    it('contains a tree section with annotated labels, not raw selectors', () => {
      const report = makeReport({
        tree: makeElement({
          selector: 'body',
          bounds: { x: 0, y: 0, w: 1280, h: 2400 },
        }),
      });
      const parsed = parseOutput(report);
      const tree = parsed.tree as Record<string, unknown>;
      // The tree should have a label field with the annotated format
      expect(tree.label).toBe('body [0,0 1280x2400]');
    });

    it('includes children in the tree section', () => {
      const report = makeReport({
        tree: makeElement({
          selector: 'body',
          children: [
            makeElement({
              selector: 'header',
              bounds: { x: 0, y: 0, w: 1280, h: 64 },
            }),
            makeElement({
              selector: 'main',
              bounds: { x: 0, y: 64, w: 1280, h: 2000 },
            }),
          ],
        }),
      });
      const parsed = parseOutput(report);
      const tree = parsed.tree as Record<string, unknown>;
      const children = tree.children as Record<string, unknown>[];
      expect(children).toHaveLength(2);
      expect(children[0].label).toBe('header [0,0 1280x64]');
      expect(children[1].label).toBe('main [0,64 1280x2000]');
    });

    it('attaches inline issues in the tree via annotateTree', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.wide',
            bounds: { x: 0, y: 0, w: 1500, h: 200 },
            computed: { width: '1500px' },
          }),
        ],
      });
      const issues: Issue[] = [
        makeIssue({
          element: '.wide',
          detail: 'Overflows right by 220px',
          data: { overflowX: 220 },
        }),
      ];
      const report = makeReport({ tree, issues });
      const parsed = parseOutput(report);
      const parsedTree = parsed.tree as Record<string, unknown>;
      const children = parsedTree.children as Record<string, unknown>[];
      const wideNode = children[0];
      const nodeIssues = wideNode.issues as Record<string, unknown>[];
      expect(nodeIssues).toHaveLength(1);
      expect(nodeIssues[0].type).toBe('viewport-overflow');
    });

    it('preserves text in the tree section', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.title',
            text: 'Hello World',
          }),
        ],
      });
      const report = makeReport({ tree });
      const parsed = parseOutput(report);
      const parsedTree = parsed.tree as Record<string, unknown>;
      const children = parsedTree.children as Record<string, unknown>[];
      expect(children[0].text).toBe('Hello World');
    });
  });

  // ── Full integration-like scenario ──

  describe('full report', () => {
    it('produces a complete report matching the HLD example structure', () => {
      const tree = makeElement({
        selector: 'body',
        tag: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 2400 },
        children: [
          makeElement({
            selector: '.hero-image',
            tag: 'img',
            bounds: { x: 0, y: 64, w: 1400, h: 500 },
            computed: { width: '1400px', position: 'relative', marginLeft: '-60px' },
          }),
          makeElement({
            selector: '.product-title',
            tag: 'h2',
            bounds: { x: 40, y: 1200, w: 200, h: 24 },
            text: 'Premium Wireless Noise-Cancelling Hea...',
            computed: { overflow: 'hidden', textOverflow: 'ellipsis', width: '200px' },
          }),
        ],
      });

      const issues: Issue[] = [
        {
          type: 'viewport-overflow',
          severity: 'error',
          element: '.hero-image',
          detail: 'Overflows viewport right edge by 120px',
          computed: { width: '1400px', position: 'relative', marginLeft: '-60px' },
          data: { overflowX: 120 },
        },
        {
          type: 'truncation',
          severity: 'warning',
          element: '.product-title',
          detail: 'Content truncated horizontally, clipped by 140px',
          computed: { overflow: 'hidden', textOverflow: 'ellipsis', width: '200px' },
          data: { scrollWidth: 340, clientWidth: 200, clippedPx: 140 },
        },
      ];

      const report: SnugReport = {
        viewport: { width: 1280, height: 800 },
        elementCount: 47,
        issues,
        tree,
      };

      const yamlStr = formatReport(report);
      const parsed = parse(yamlStr) as Record<string, unknown>;

      // Viewport
      expect(parsed.viewport).toEqual({ width: 1280, height: 800 });

      // Element count
      expect(parsed.element_count).toBe(47);

      // Summary
      const summary = parsed.summary as Record<string, number>;
      expect(summary.errors).toBe(1);
      expect(summary.warnings).toBe(1);

      // Issues
      const parsedIssues = parsed.issues as Record<string, unknown>[];
      expect(parsedIssues).toHaveLength(2);
      expect(parsedIssues[0].type).toBe('viewport-overflow');
      expect(parsedIssues[1].type).toBe('truncation');

      // Tree — annotated with labels
      const parsedTree = parsed.tree as Record<string, unknown>;
      expect(parsedTree.label).toBe('body [0,0 1280x2400]');
      const treeChildren = parsedTree.children as Record<string, unknown>[];
      expect(treeChildren).toHaveLength(2);
      expect(treeChildren[0].label).toBe('.hero-image [0,64 1400x500]');
      expect(treeChildren[1].label).toBe('.product-title [40,1200 200x24]');
      expect(treeChildren[1].text).toBe('Premium Wireless Noise-Cancelling Hea...');
    });
  });

  // ── Report sections ordering — all expected keys present ──

  describe('report structure', () => {
    it('output contains all required top-level keys', () => {
      const report = makeReport({
        elementCount: 10,
        issues: [makeIssue()],
      });
      const parsed = parseOutput(report);
      expect(parsed).toHaveProperty('viewport');
      expect(parsed).toHaveProperty('element_count');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('issues');
      expect(parsed).toHaveProperty('tree');
    });

    it('output contains all required top-level keys even with zero issues', () => {
      const report = makeReport({ issues: [] });
      const parsed = parseOutput(report);
      expect(parsed).toHaveProperty('viewport');
      expect(parsed).toHaveProperty('element_count');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('issues');
      expect(parsed).toHaveProperty('tree');
    });
  });
});
