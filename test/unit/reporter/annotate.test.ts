import { describe, it, expect } from 'vitest';
import { annotateTree } from '../../../src/reporter/annotate.js';
import type {
  ExtractedElement,
  Issue,
  AnnotatedNode,
  AnnotatedIssue,
} from '../../../src/types.js';

// ── Helpers ──

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    type: 'viewport-overflow',
    severity: 'error',
    element: '.test',
    detail: 'Test issue detail',
    ...overrides,
  };
}

// ── Tests ──

describe('annotateTree', () => {
  // ── Label format ──

  describe('label format', () => {
    it('formats label as "selector [x,y wxh]"', () => {
      const tree = makeElement({
        selector: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 2400 },
      });
      const result = annotateTree(tree, []);
      expect(result.label).toBe('body [0,0 1280x2400]');
    });

    it('includes non-zero x,y coordinates in label', () => {
      const tree = makeElement({
        selector: '.hero-image',
        bounds: { x: 40, y: 64, w: 1400, h: 500 },
      });
      const result = annotateTree(tree, []);
      expect(result.label).toBe('.hero-image [40,64 1400x500]');
    });

    it('uses the node selector verbatim in the label', () => {
      const tree = makeElement({
        selector: '.card:nth-of-type(2)',
        bounds: { x: 400, y: 700, w: 380, h: 400 },
      });
      const result = annotateTree(tree, []);
      expect(result.label).toBe('.card:nth-of-type(2) [400,700 380x400]');
    });

    it('handles ID selectors in label', () => {
      const tree = makeElement({
        selector: '#main-header',
        bounds: { x: 0, y: 0, w: 1280, h: 64 },
      });
      const result = annotateTree(tree, []);
      expect(result.label).toBe('#main-header [0,0 1280x64]');
    });
  });

  // ── Issue mapping ──

  describe('issue mapping', () => {
    it('attaches issues to the correct node by selector', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({ selector: '.ok', bounds: { x: 0, y: 0, w: 100, h: 50 } }),
          makeElement({ selector: '.wide', bounds: { x: 0, y: 50, w: 1500, h: 200 } }),
        ],
      });
      const issues: Issue[] = [
        makeIssue({ element: '.wide', detail: 'Overflows right by 220px' }),
      ];
      const result = annotateTree(tree, issues);

      // .ok node should have no issues
      expect(result.children![0].issues).toBeUndefined();
      // .wide node should have the issue
      expect(result.children![1].issues).toHaveLength(1);
      expect(result.children![1].issues![0].type).toBe('viewport-overflow');
    });

    it('attaches multiple issues to the same element', () => {
      const tree = makeElement({
        selector: '.problematic',
        bounds: { x: 0, y: 0, w: 1500, h: 200 },
        computed: { position: 'absolute', width: '1500px' },
      });
      const issues: Issue[] = [
        makeIssue({
          type: 'viewport-overflow',
          element: '.problematic',
          detail: 'Overflows right',
          data: { overflowX: 220 },
        }),
        makeIssue({
          type: 'containment',
          severity: 'error',
          element: '.problematic',
          detail: 'Overflows parent',
        }),
      ];
      const result = annotateTree(tree, issues);

      expect(result.issues).toHaveLength(2);
      expect(result.issues![0].type).toBe('viewport-overflow');
      expect(result.issues![1].type).toBe('containment');
    });

    it('does not crash when issues reference non-existent selectors (orphaned issues)', () => {
      const tree = makeElement({ selector: 'body' });
      const issues: Issue[] = [
        makeIssue({ element: '.does-not-exist', detail: 'Orphaned issue' }),
      ];
      // Should not throw — orphaned issues are silently ignored
      const result = annotateTree(tree, issues);
      expect(result.issues).toBeUndefined();
    });

    it('handles empty issues array', () => {
      const tree = makeElement({ selector: 'body' });
      const result = annotateTree(tree, []);
      expect(result.issues).toBeUndefined();
      expect(result.label).toBe('body [0,0 100x100]');
    });
  });

  // ── AnnotatedIssue shape ──

  describe('AnnotatedIssue structure', () => {
    it('strips to type, severity, detail, data — excludes element/element2/computed', () => {
      const tree = makeElement({
        selector: '.target',
        computed: { position: 'absolute' },
      });
      const issues: Issue[] = [
        {
          type: 'sibling-overlap',
          severity: 'error',
          element: '.target',
          element2: '.sibling',
          detail: 'Overlaps sibling by 20px',
          computed: { position: 'absolute', zIndex: 'auto' },
          data: { overlapX: 20, overlapY: 400, overlapArea: 8000 },
        },
      ];
      const result = annotateTree(tree, issues);
      const annotatedIssue = result.issues![0];

      // Should have these fields
      expect(annotatedIssue.type).toBe('sibling-overlap');
      expect(annotatedIssue.severity).toBe('error');
      expect(annotatedIssue.detail).toBe('Overlaps sibling by 20px');
      expect(annotatedIssue.data).toEqual({ overlapX: 20, overlapY: 400, overlapArea: 8000 });

      // Should NOT have these fields (from Issue but not AnnotatedIssue)
      expect(annotatedIssue).not.toHaveProperty('element');
      expect(annotatedIssue).not.toHaveProperty('element2');
      expect(annotatedIssue).not.toHaveProperty('computed');
    });

    it('omits data field from AnnotatedIssue when original issue has no data', () => {
      const tree = makeElement({ selector: '.item' });
      const issues: Issue[] = [
        makeIssue({ element: '.item', detail: 'No data' }),
      ];
      const result = annotateTree(tree, issues);
      const annotatedIssue = result.issues![0];

      expect(annotatedIssue.data).toBeUndefined();
    });

    it('preserves data with boolean values from the original issue', () => {
      const tree = makeElement({ selector: '.card' });
      const issues: Issue[] = [
        makeIssue({
          element: '.card',
          type: 'sibling-overlap',
          detail: 'Overlap detected',
          data: { overlapArea: 8000, sameZIndex: true },
        }),
      ];
      const result = annotateTree(tree, issues);

      expect(result.issues![0].data).toEqual({ overlapArea: 8000, sameZIndex: true });
    });
  });

  // ── Computed styles ──

  describe('computed styles', () => {
    it('includes computed styles only on nodes that have issues', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.clean',
            computed: { display: 'flex', position: 'relative' },
          }),
          makeElement({
            selector: '.broken',
            computed: { position: 'absolute', left: '-30px' },
          }),
        ],
      });
      const issues: Issue[] = [
        makeIssue({ element: '.broken', detail: 'Overflows parent' }),
      ];
      const result = annotateTree(tree, issues);

      // .clean has no issues — computed should be absent
      expect(result.children![0].computed).toBeUndefined();
      // .broken has issues — computed should be present
      expect(result.children![1].computed).toBeDefined();
      expect(result.children![1].computed).toEqual({ position: 'absolute', left: '-30px' });
    });

    it('does not include computed on the root node when it has no issues', () => {
      const tree = makeElement({
        selector: 'body',
        computed: { display: 'block' },
      });
      const result = annotateTree(tree, []);
      expect(result.computed).toBeUndefined();
    });

    it('includes computed on the root node when it has issues', () => {
      const tree = makeElement({
        selector: 'body',
        computed: { overflow: 'hidden' },
      });
      const issues: Issue[] = [
        makeIssue({ element: 'body', detail: 'Body overflow issue' }),
      ];
      const result = annotateTree(tree, issues);
      expect(result.computed).toEqual({ overflow: 'hidden' });
    });

    it('omits computed when the element has no computed property even if it has issues', () => {
      const tree = makeElement({
        selector: '.no-styles',
        // no computed property set
      });
      const issues: Issue[] = [
        makeIssue({ element: '.no-styles', detail: 'Some issue' }),
      ];
      const result = annotateTree(tree, issues);
      // Should still have issues
      expect(result.issues).toHaveLength(1);
      // computed not set on the ExtractedElement, so AnnotatedNode shouldn't have it
      expect(result.computed).toBeUndefined();
    });
  });

  // ── Text content ──

  describe('text content', () => {
    it('preserves text from ExtractedElement', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.title',
            tag: 'h1',
            text: 'Hello World',
          }),
        ],
      });
      const result = annotateTree(tree, []);
      expect(result.children![0].text).toBe('Hello World');
    });

    it('does not include text field when ExtractedElement has no text', () => {
      const tree = makeElement({ selector: '.container' });
      const result = annotateTree(tree, []);
      expect(result.text).toBeUndefined();
    });

    it('preserves truncated text content', () => {
      const tree = makeElement({
        selector: '.product-title',
        text: 'Premium Wireless Noise-Cancelling Hea...',
      });
      const result = annotateTree(tree, []);
      expect(result.text).toBe('Premium Wireless Noise-Cancelling Hea...');
    });
  });

  // ── Children recursion ──

  describe('children recursion', () => {
    it('recurses into children, producing AnnotatedNode children', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: 'header',
            bounds: { x: 0, y: 0, w: 1280, h: 64 },
            children: [
              makeElement({
                selector: 'nav',
                bounds: { x: 0, y: 0, w: 1280, h: 64 },
                children: [
                  makeElement({ selector: '.logo', bounds: { x: 16, y: 12, w: 120, h: 40 } }),
                ],
              }),
            ],
          }),
        ],
      });
      const result = annotateTree(tree, []);

      expect(result.label).toBe('body [0,0 100x100]');
      expect(result.children).toHaveLength(1);
      expect(result.children![0].label).toBe('header [0,0 1280x64]');
      expect(result.children![0].children).toHaveLength(1);
      expect(result.children![0].children![0].label).toBe('nav [0,0 1280x64]');
      expect(result.children![0].children![0].children).toHaveLength(1);
      expect(result.children![0].children![0].children![0].label).toBe('.logo [16,12 120x40]');
    });

    it('handles empty children array (leaf node)', () => {
      const tree = makeElement({
        selector: '.leaf',
        bounds: { x: 10, y: 20, w: 50, h: 30 },
        children: [],
      });
      const result = annotateTree(tree, []);
      expect(result.label).toBe('.leaf [10,20 50x30]');
      // Leaf nodes may have undefined or empty children
      expect(result.children ?? []).toHaveLength(0);
    });

    it('attaches issues at the correct depth in a deep tree', () => {
      const tree = makeElement({
        selector: 'body',
        children: [
          makeElement({
            selector: '.parent',
            children: [
              makeElement({
                selector: '.deeply-nested',
                bounds: { x: 100, y: 200, w: 300, h: 50 },
                computed: { overflow: 'hidden' },
              }),
            ],
          }),
        ],
      });
      const issues: Issue[] = [
        makeIssue({
          type: 'truncation',
          severity: 'warning',
          element: '.deeply-nested',
          detail: 'Content truncated',
          data: { scrollWidth: 500, clientWidth: 300, clippedPx: 200 },
        }),
      ];
      const result = annotateTree(tree, issues);

      // Body and .parent should have no issues
      expect(result.issues).toBeUndefined();
      expect(result.children![0].issues).toBeUndefined();
      // .deeply-nested should have the issue
      const deepNode = result.children![0].children![0];
      expect(deepNode.issues).toHaveLength(1);
      expect(deepNode.issues![0].type).toBe('truncation');
      expect(deepNode.issues![0].data).toEqual({
        scrollWidth: 500,
        clientWidth: 300,
        clippedPx: 200,
      });
      // computed should be present since this node has issues
      expect(deepNode.computed).toEqual({ overflow: 'hidden' });
    });
  });

  // ── Integration-like: realistic tree ──

  describe('realistic tree', () => {
    it('annotates a multi-level tree matching the HLD example', () => {
      const tree = makeElement({
        selector: 'body',
        tag: 'body',
        bounds: { x: 0, y: 0, w: 1280, h: 2400 },
        children: [
          makeElement({
            selector: 'header#main',
            tag: 'header',
            bounds: { x: 0, y: 0, w: 1280, h: 64 },
            children: [
              makeElement({
                selector: 'nav',
                tag: 'nav',
                bounds: { x: 0, y: 0, w: 1280, h: 64 },
                children: [
                  makeElement({ selector: '.logo', bounds: { x: 16, y: 12, w: 120, h: 40 } }),
                  makeElement({ selector: '.nav-item:nth-of-type(4)', bounds: { x: 444, y: 20, w: 68, h: 24 } }),
                ],
              }),
            ],
          }),
          makeElement({
            selector: 'main',
            tag: 'main',
            bounds: { x: 0, y: 64, w: 1280, h: 2000 },
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
          type: 'spacing-anomaly',
          severity: 'warning',
          element: '.nav-item:nth-of-type(4)',
          element2: '.nav-item:nth-of-type(3)',
          detail: 'Gap 40px deviates from sibling pattern (16px). Delta: 24px',
          data: { gap: 40, mode: 16, deviation: 24 },
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

      const result = annotateTree(tree, issues);

      // Root
      expect(result.label).toBe('body [0,0 1280x2400]');
      expect(result.issues).toBeUndefined();

      // header#main > nav > .nav-item:nth-of-type(4)
      const navItem = result.children![0].children![0].children![1];
      expect(navItem.label).toBe('.nav-item:nth-of-type(4) [444,20 68x24]');
      expect(navItem.issues).toHaveLength(1);
      expect(navItem.issues![0].type).toBe('spacing-anomaly');
      expect(navItem.issues![0].severity).toBe('warning');
      // element2 should NOT be on the annotated issue
      expect(navItem.issues![0]).not.toHaveProperty('element2');

      // main > .hero-image
      const heroImage = result.children![1].children![0];
      expect(heroImage.label).toBe('.hero-image [0,64 1400x500]');
      expect(heroImage.issues).toHaveLength(1);
      expect(heroImage.issues![0].data).toEqual({ overflowX: 120 });
      expect(heroImage.computed).toEqual({
        width: '1400px',
        position: 'relative',
        marginLeft: '-60px',
      });

      // main > .product-title
      const productTitle = result.children![1].children![1];
      expect(productTitle.label).toBe('.product-title [40,1200 200x24]');
      expect(productTitle.text).toBe('Premium Wireless Noise-Cancelling Hea...');
      expect(productTitle.issues).toHaveLength(1);
      expect(productTitle.issues![0].type).toBe('truncation');
      expect(productTitle.computed).toEqual({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: '200px',
      });

      // .logo — no issues, no computed
      const logo = result.children![0].children![0].children![0];
      expect(logo.label).toBe('.logo [16,12 120x40]');
      expect(logo.issues).toBeUndefined();
      expect(logo.computed).toBeUndefined();
    });
  });
});
