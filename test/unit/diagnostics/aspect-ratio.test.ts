import { describe, it, expect } from 'vitest';
import { checkAspectRatio } from '../../../src/diagnostics/aspect-ratio.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

describe('checkAspectRatio', () => {
  // ── Happy path ──

  it('returns no issues for elements without natural dimensions', () => {
    const tree = makeElement({
      children: [
        makeElement({ selector: '.div' }),
        makeElement({ selector: '.span', tag: 'span' }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for images with preserved aspect ratio', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.ok-img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 200 }, // 2:1
          natural: { width: 800, height: 400 },     // 2:1
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for image with less than 5% distortion', () => {
    // naturalRatio = 800/400 = 2.0
    // renderedRatio = 400/204 ≈ 1.9608
    // distortion = |2.0 - 1.9608| / 2.0 ≈ 0.0196 ≈ 1.96% < 5%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.slight',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 204 },
          natural: { width: 800, height: 400 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('returns no issues for empty tree', () => {
    const tree = makeElement({ selector: '.empty', children: [] });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Warning severity (5% < distortion <= 15%) ──

  it('reports warning for distortion between 5% and 15%', () => {
    // naturalRatio = 400/200 = 2.0
    // renderedRatio = 200/110 ≈ 1.818
    // distortion = |2.0 - 1.818| / 2.0 ≈ 0.0909 ≈ 9.1%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.mild',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 110 },
          natural: { width: 400, height: 200 },
          computed: { width: '200px', height: '110px' },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('aspect-ratio');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].element).toBe('.mild');
  });

  it('reports warning for distortion just above 5%', () => {
    // naturalRatio = 2.0
    // We need renderedRatio such that |2 - r| / 2 > 0.05
    // r < 1.9 or r > 2.1
    // renderedRatio = 200/106 ≈ 1.8868
    // distortion = |2.0 - 1.8868| / 2.0 ≈ 0.0566 ≈ 5.66%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.just-over',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 106 },
          natural: { width: 400, height: 200 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  // ── Error severity (> 15%) ──

  it('reports error for distortion greater than 15%', () => {
    // naturalRatio = 800/400 = 2.0
    // renderedRatio = 200/200 = 1.0
    // distortion = |2.0 - 1.0| / 2.0 = 0.5 = 50%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.distorted',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 800, height: 400 },
          computed: { objectFit: 'fill', width: '200px', height: '200px' },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('aspect-ratio');
    expect(issues[0].severity).toBe('error');
  });

  it('reports error for distortion just above 15%', () => {
    // naturalRatio = 2.0
    // Need |2 - r| / 2 > 0.15 => |2 - r| > 0.3 => r < 1.7 or r > 2.3
    // renderedRatio = 200/120 ≈ 1.6667
    // distortion = |2.0 - 1.6667| / 2.0 ≈ 0.1667 ≈ 16.67%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.over-threshold',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 120 },
          natural: { width: 400, height: 200 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  // ── Boundary at exactly 5% and 15% ──

  it('does not flag distortion of exactly 5%', () => {
    // distortion = |2.0 - r| / 2.0 = 0.05 => |2.0 - r| = 0.1 => r = 1.9
    // renderedRatio = 190/100 = 1.9
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.boundary-5',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 190, h: 100 },
          natural: { width: 200, height: 100 },
          // naturalRatio = 2.0, renderedRatio = 1.9
          // distortion = |2.0-1.9|/2.0 = 0.05 = exactly 5%
          // Spec says > 5% is flagged, so exactly 5% should NOT be flagged
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('reports warning at exactly 15% distortion (not error)', () => {
    // distortion = |2.0 - r| / 2.0 = 0.15 => |2.0 - r| = 0.3 => r = 1.7
    // renderedRatio = 170/100 = 1.7
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.boundary-15',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 170, h: 100 },
          natural: { width: 200, height: 100 },
          // naturalRatio = 2.0, renderedRatio = 1.7
          // distortion = |2.0-1.7|/2.0 = 0.15 = exactly 15%
          // Spec says > 15% => error, so exactly 15% => warning
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  // ── Guard: zero dimensions ──

  it('skips images with zero rendered height', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.zero-h',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 0 },
          natural: { width: 800, height: 400 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips images with zero natural height', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.zero-nat-h',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 100 },
          natural: { width: 800, height: 0 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips images with zero rendered width and height', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.broken',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 0, h: 0 },
          natural: { width: 0, height: 0 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips images with zero natural width and height', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.unloaded',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 100 },
          natural: { width: 0, height: 0 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  // ── Recursive detection ──

  it('detects distortion in deeply nested images', () => {
    const tree = makeElement({
      selector: '.root',
      children: [
        makeElement({
          selector: '.card',
          children: [
            makeElement({
              selector: '.deep-img',
              tag: 'img',
              bounds: { x: 0, y: 0, w: 200, h: 200 },
              natural: { width: 800, height: 400 },
            }),
          ],
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].element).toBe('.deep-img');
  });

  it('checks the root element for natural dimensions too', () => {
    const tree = makeElement({
      selector: '.root-img',
      tag: 'img',
      bounds: { x: 0, y: 0, w: 200, h: 200 },
      natural: { width: 800, height: 400 },
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.some(i => i.element === '.root-img')).toBe(true);
  });

  it('detects distortion in multiple images across the tree', () => {
    const tree = makeElement({
      selector: '.gallery',
      children: [
        makeElement({
          selector: '.img-1',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 600, height: 300 },
        }),
        makeElement({
          selector: '.img-2',
          tag: 'img',
          bounds: { x: 250, y: 0, w: 100, h: 100 },
          natural: { width: 500, height: 200 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(2);
    expect(issues.some(i => i.element === '.img-1')).toBe(true);
    expect(issues.some(i => i.element === '.img-2')).toBe(true);
  });

  // ── Issue data fields ──

  it('includes naturalRatio, renderedRatio, distortionPercent in data', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 800, height: 400 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].data?.naturalRatio).toBe(2);       // 800/400
    expect(issues[0].data?.renderedRatio).toBe(1);       // 200/200
    expect(issues[0].data?.distortionPercent).toBe(50);   // (|2-1|/2)*100
  });

  it('includes objectFit, width, height in computed', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.styled-img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 800, height: 400 },
          computed: { objectFit: 'fill', width: '200px', height: '200px' },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].computed).toBeDefined();
  });

  it('includes a non-empty detail string', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 800, height: 400 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(typeof issues[0].detail).toBe('string');
    expect(issues[0].detail.length).toBeGreaterThan(0);
  });

  // ── Distortion in both directions (stretched wider or taller) ──

  it('detects distortion when image is stretched wider than natural', () => {
    // naturalRatio = 100/200 = 0.5
    // renderedRatio = 200/200 = 1.0
    // distortion = |0.5 - 1.0| / 0.5 = 1.0 = 100%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.stretched-wide',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          natural: { width: 100, height: 200 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('detects distortion when image is stretched taller than natural', () => {
    // naturalRatio = 400/200 = 2.0
    // renderedRatio = 200/400 = 0.5
    // distortion = |2.0 - 0.5| / 2.0 = 0.75 = 75%
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.stretched-tall',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 400 },
          natural: { width: 400, height: 200 },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });
});
