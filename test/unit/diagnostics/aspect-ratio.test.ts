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
  it('returns no issues for elements without natural dimensions', () => {
    const tree = makeElement({
      children: [makeElement({ selector: '.div' })],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('detects significant aspect ratio distortion (> 15% → error)', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.distorted',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 200 }, // square
          natural: { width: 800, height: 400 },      // 2:1 natural
          computed: { objectFit: 'fill', width: '200px', height: '200px' },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('aspect-ratio');
    expect(issues[0].severity).toBe('error'); // 50% distortion
  });

  it('detects mild distortion (5-15% → warning)', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.mild',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 200, h: 110 }, // ratio ~1.82
          natural: { width: 400, height: 200 },     // ratio 2.0 → ~9% distortion
          computed: { width: '200px', height: '110px' },
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('passes images with preserved aspect ratio', () => {
    const tree = makeElement({
      children: [
        makeElement({
          selector: '.ok',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 200 }, // 2:1
          natural: { width: 800, height: 400 },     // 2:1
        }),
      ],
    });
    const issues = checkAspectRatio(tree, viewport);
    expect(issues).toEqual([]);
  });

  it('skips images with zero dimensions', () => {
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
});
