import { describe, it, expect } from 'vitest';
import { checkStacking } from '../../../src/diagnostics/stacking.js';
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

// ──────────────────────────────────────────
// 2a. No-Position
// ──────────────────────────────────────────

describe('checkStacking — no-position (2a)', () => {
  it('1. flags z-index: 5 on position: static element — severity error', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.static-z',
          computed: { zIndex: '5', position: 'static' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos.length).toBe(1);
    expect(noPos[0].severity).toBe('error');
    expect(noPos[0].element).toBe('.static-z');
    expect(noPos[0].type).toBe('stacking');
  });

  it('2. does not flag z-index: 5 on position: relative element', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.relative-z',
          computed: { zIndex: '5', position: 'relative' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos).toEqual([]);
  });

  it('3. does not flag z-index: 5 on position: absolute element', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.absolute-z',
          computed: { zIndex: '5', position: 'absolute' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos).toEqual([]);
  });

  it('4. does not flag z-index: 5 on flex child (parent display: flex)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.flex-parent',
          computed: { display: 'flex' },
          children: [
            makeElement({
              selector: '.flex-child',
              computed: { zIndex: '5', position: 'static' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos).toEqual([]);
  });

  it('5. does not flag z-index: 5 on grid child (parent display: grid)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.grid-parent',
          computed: { display: 'grid' },
          children: [
            makeElement({
              selector: '.grid-child',
              computed: { zIndex: '5', position: 'static' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos).toEqual([]);
  });

  it('6. does not flag element without z-index', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.no-z',
          computed: { position: 'static' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const noPos = issues.filter(i => i.context?.check === 'no-position');
    expect(noPos).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2b. Context Trap
// ──────────────────────────────────────────

describe('checkStacking — context-trap (2b)', () => {
  it('7. flags z-index: 999 child inside parent with opacity: 0.95', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.opacity-parent',
          computed: { opacity: '0.95' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '999', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
    expect(traps[0].element).toBe('.trapped-child');
    expect(traps[0].type).toBe('stacking');
  });

  it('8. flags z-index: 50 child inside parent with transform: translateZ(0)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.transform-parent',
          computed: { transform: 'translateZ(0)' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
    expect(traps[0].element).toBe('.trapped-child');
  });

  it('9. flags z-index: 100 child inside parent with filter: blur(0)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.filter-parent',
          computed: { filter: 'blur(0)' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '100', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
  });

  it('10. flags child inside parent with will-change: transform', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.willchange-parent',
          computed: { willChange: 'transform' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
  });

  it('11. flags child inside parent with backdrop-filter: blur(10px)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.backdrop-parent',
          computed: { backdropFilter: 'blur(10px)' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
  });

  it('12. flags child inside parent with container-type: inline-size', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.container-parent',
          computed: { containerType: 'inline-size' },
          children: [
            makeElement({
              selector: '.trapped-child',
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].severity).toBe('warning');
  });

  it('13. does not flag z-index: 999 when nearest stacking context is root', () => {
    const tree = makeElement({
      selector: 'html',
      tag: 'html',
      children: [
        makeElement({
          selector: 'body',
          tag: 'body',
          children: [
            makeElement({
              selector: '.high-z',
              computed: { zIndex: '999', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps).toEqual([]);
  });

  it('14. does not flag z-index: 999 inside parent with position: relative + z-index: 1 (intentional)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.intentional-parent',
          computed: { position: 'relative', zIndex: '1' },
          children: [
            makeElement({
              selector: '.child',
              computed: { zIndex: '999', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps).toEqual([]);
  });

  it('15. does not flag z-index: 5 (below threshold 10)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.opacity-parent',
          computed: { opacity: '0.95' },
          children: [
            makeElement({
              selector: '.low-z',
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps).toEqual([]);
  });

  it('16. detail includes trapping property and ancestor selector', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.opacity-parent',
          computed: { opacity: '0.95' },
          children: [
            makeElement({
              selector: '.trapped',
              computed: { zIndex: '999', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const traps = issues.filter(i => i.context?.check === 'context-trap');
    expect(traps.length).toBe(1);
    expect(traps[0].detail).toContain('opacity');
    expect(traps[0].detail).toContain('.opacity-parent');
  });
});

// ──────────────────────────────────────────
// 2c. Escalation
// ──────────────────────────────────────────

describe('checkStacking — escalation (2c)', () => {
  it('17. flags z-index: 999', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.high-z',
          computed: { zIndex: '999', position: 'relative' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const esc = issues.filter(i => i.context?.check === 'escalation');
    expect(esc.length).toBe(1);
    expect(esc[0].severity).toBe('warning');
    expect(esc[0].type).toBe('stacking');
    expect(esc[0].data?.zIndex).toBe(999);
  });

  it('18. flags z-index: 9999', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.extreme-z',
          computed: { zIndex: '9999', position: 'relative' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const esc = issues.filter(i => i.context?.check === 'escalation');
    expect(esc.length).toBe(1);
    expect(esc[0].data?.zIndex).toBe(9999);
  });

  it('19. does not flag z-index: 10', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.low-z',
          computed: { zIndex: '10', position: 'relative' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const esc = issues.filter(i => i.context?.check === 'escalation');
    expect(esc).toEqual([]);
  });

  it('20. does not flag z-index: 100 (threshold boundary)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.boundary-z',
          computed: { zIndex: '100', position: 'relative' },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const esc = issues.filter(i => i.context?.check === 'escalation');
    expect(esc).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2d. Fixed Broken
// ──────────────────────────────────────────

describe('checkStacking — fixed-broken (2d)', () => {
  it('21. flags position:fixed child inside ancestor with transform', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.transform-ancestor',
          bounds: { x: 0, y: 0, w: 500, h: 500 },
          computed: { transform: 'translateZ(0)' },
          children: [
            makeElement({
              selector: '.fixed-el',
              bounds: { x: 10, y: 10, w: 80, h: 80 },
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb.length).toBe(1);
    expect(fb[0].element).toBe('.fixed-el');
    expect(fb[0].type).toBe('stacking');
  });

  it('22. flags position:fixed child inside ancestor with filter', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.filter-ancestor',
          bounds: { x: 0, y: 0, w: 500, h: 500 },
          computed: { filter: 'blur(1px)' },
          children: [
            makeElement({
              selector: '.fixed-el',
              bounds: { x: 10, y: 10, w: 80, h: 80 },
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb.length).toBe(1);
    expect(fb[0].element).toBe('.fixed-el');
  });

  it('23. flags position:fixed child inside ancestor with perspective', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.perspective-ancestor',
          bounds: { x: 0, y: 0, w: 500, h: 500 },
          computed: { perspective: '500px' },
          children: [
            makeElement({
              selector: '.fixed-el',
              bounds: { x: 10, y: 10, w: 80, h: 80 },
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb.length).toBe(1);
    expect(fb[0].element).toBe('.fixed-el');
  });

  it('24. flags position:fixed child inside ancestor with will-change: transform', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.willchange-ancestor',
          bounds: { x: 0, y: 0, w: 500, h: 500 },
          computed: { willChange: 'transform' },
          children: [
            makeElement({
              selector: '.fixed-el',
              bounds: { x: 10, y: 10, w: 80, h: 80 },
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb.length).toBe(1);
    expect(fb[0].element).toBe('.fixed-el');
  });

  it('25. does not flag position:fixed with no transform/filter ancestors', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.clean-parent',
          children: [
            makeElement({
              selector: '.fixed-el',
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb).toEqual([]);
  });

  it('26. does not flag position:fixed where ancestor is body/html', () => {
    const tree = makeElement({
      selector: 'html',
      tag: 'html',
      computed: { transform: 'translateZ(0)' },
      children: [
        makeElement({
          selector: 'body',
          tag: 'body',
          children: [
            makeElement({
              selector: '.fixed-el',
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb).toEqual([]);
  });

  it('27. severity is error when bounds confirm containment in ancestor', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.transform-ancestor',
          bounds: { x: 50, y: 50, w: 400, h: 400 },
          computed: { transform: 'translateZ(0)' },
          children: [
            makeElement({
              selector: '.fixed-el',
              bounds: { x: 60, y: 60, w: 100, h: 100 },
              computed: { position: 'fixed' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const fb = issues.filter(i => i.context?.check === 'fixed-broken');
    expect(fb.length).toBe(1);
    expect(fb[0].severity).toBe('error');
  });
});

// ──────────────────────────────────────────
// 2e. Auto vs Zero
// ──────────────────────────────────────────

describe('checkStacking — auto-vs-zero (2e)', () => {
  it('28. flags z-index:0 on positioned element with descendants using z-index', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.zero-ctx',
          computed: { zIndex: '0', position: 'relative' },
          children: [
            makeElement({
              selector: '.descendant',
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const avz = issues.filter(i => i.context?.check === 'auto-vs-zero');
    expect(avz.length).toBe(1);
    expect(avz[0].severity).toBe('warning');
    expect(avz[0].element).toBe('.zero-ctx');
    expect(avz[0].type).toBe('stacking');
  });

  it('29. does not flag z-index:0 with no z-indexed descendants', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.zero-ctx',
          computed: { zIndex: '0', position: 'relative' },
          children: [
            makeElement({
              selector: '.descendant',
              computed: { position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const avz = issues.filter(i => i.context?.check === 'auto-vs-zero');
    expect(avz).toEqual([]);
  });

  it('30. does not flag z-index:0 on position: static', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.static-zero',
          computed: { zIndex: '0', position: 'static' },
          children: [
            makeElement({
              selector: '.descendant',
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const avz = issues.filter(i => i.context?.check === 'auto-vs-zero');
    expect(avz).toEqual([]);
  });

  it('31. does not flag z-index: auto (not 0)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.auto-z',
          computed: { zIndex: 'auto', position: 'relative' },
          children: [
            makeElement({
              selector: '.descendant',
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const avz = issues.filter(i => i.context?.check === 'auto-vs-zero');
    expect(avz).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2f. Negative Z-Index
// ──────────────────────────────────────────

describe('checkStacking — negative-z (2f)', () => {
  it('32. flags z-index: -1 when parent does NOT create stacking context', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.parent',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'static' },
          children: [
            makeElement({
              selector: '.neg-z',
              bounds: { x: 10, y: 10, w: 50, h: 50 },
              computed: { zIndex: '-1', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const negZ = issues.filter(i => i.context?.check === 'negative-z');
    expect(negZ.length).toBe(1);
    expect(negZ[0].severity).toBe('warning');
    expect(negZ[0].element).toBe('.neg-z');
    expect(negZ[0].type).toBe('stacking');
  });

  it('33. does not flag z-index: -1 when parent creates stacking context (has position + z-index)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.parent',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { position: 'relative', zIndex: '1' },
          children: [
            makeElement({
              selector: '.neg-z',
              bounds: { x: 10, y: 10, w: 50, h: 50 },
              computed: { zIndex: '-1', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const negZ = issues.filter(i => i.context?.check === 'negative-z');
    expect(negZ).toEqual([]);
  });

  it('34. does not flag z-index: -1 when element extends beyond parent bounds', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.parent',
          bounds: { x: 0, y: 0, w: 100, h: 100 },
          computed: { position: 'static' },
          children: [
            makeElement({
              selector: '.neg-z',
              bounds: { x: 50, y: 50, w: 100, h: 100 },
              computed: { zIndex: '-1', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const negZ = issues.filter(i => i.context?.check === 'negative-z');
    expect(negZ).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2g. Overflow Clip
// ──────────────────────────────────────────

describe('checkStacking — overflow-clip (2g)', () => {
  it('35. flags z-index: 50 child extending beyond overflow:hidden ancestor', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.clip-ancestor',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { overflow: 'hidden' },
          children: [
            makeElement({
              selector: '.escaping-child',
              bounds: { x: 50, y: 50, w: 200, h: 200 },
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const oc = issues.filter(i => i.context?.check === 'overflow-clip');
    expect(oc.length).toBe(1);
    expect(oc[0].severity).toBe('warning');
    expect(oc[0].element).toBe('.escaping-child');
    expect(oc[0].type).toBe('stacking');
  });

  it('36. flags z-index: 50 child extending beyond overflow:auto ancestor', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.clip-ancestor',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { overflow: 'auto' },
          children: [
            makeElement({
              selector: '.escaping-child',
              bounds: { x: 50, y: 50, w: 200, h: 200 },
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const oc = issues.filter(i => i.context?.check === 'overflow-clip');
    expect(oc.length).toBe(1);
    expect(oc[0].severity).toBe('warning');
    expect(oc[0].element).toBe('.escaping-child');
  });

  it('37. does not flag when child is fully within clipping ancestor', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.clip-ancestor',
          bounds: { x: 0, y: 0, w: 400, h: 400 },
          computed: { overflow: 'hidden' },
          children: [
            makeElement({
              selector: '.contained-child',
              bounds: { x: 10, y: 10, w: 80, h: 80 },
              computed: { zIndex: '50', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const oc = issues.filter(i => i.context?.check === 'overflow-clip');
    expect(oc).toEqual([]);
  });

  it('38. does not flag z-index: 5 (below threshold)', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.clip-ancestor',
          bounds: { x: 0, y: 0, w: 200, h: 200 },
          computed: { overflow: 'hidden' },
          children: [
            makeElement({
              selector: '.low-z-child',
              bounds: { x: 50, y: 50, w: 200, h: 200 },
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const oc = issues.filter(i => i.context?.check === 'overflow-clip');
    expect(oc).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2h. Missing Isolation
// ──────────────────────────────────────────

describe('checkStacking — missing-isolation (2h)', () => {
  it('39. flags container whose z-indexed children overlap with outside elements', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.container',
          bounds: { x: 0, y: 0, w: 300, h: 300 },
          children: [
            makeElement({
              selector: '.z-child',
              bounds: { x: 0, y: 0, w: 150, h: 150 },
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
        makeElement({
          selector: '.sibling-outside',
          bounds: { x: 100, y: 100, w: 150, h: 150 },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const mi = issues.filter(i => i.context?.check === 'missing-isolation');
    expect(mi.length).toBe(1);
    expect(mi[0].severity).toBe('warning');
    expect(mi[0].element).toBe('.container');
    expect(mi[0].type).toBe('stacking');
  });

  it('40. does not flag container that already creates stacking context', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.container',
          bounds: { x: 0, y: 0, w: 300, h: 300 },
          computed: { isolation: 'isolate' },
          children: [
            makeElement({
              selector: '.z-child',
              bounds: { x: 0, y: 0, w: 150, h: 150 },
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
        makeElement({
          selector: '.sibling-outside',
          bounds: { x: 100, y: 100, w: 150, h: 150 },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const mi = issues.filter(i => i.context?.check === 'missing-isolation');
    expect(mi).toEqual([]);
  });

  it('41. does not flag container whose children do not overlap outside elements', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.container',
          bounds: { x: 0, y: 0, w: 300, h: 300 },
          children: [
            makeElement({
              selector: '.z-child',
              bounds: { x: 0, y: 0, w: 50, h: 50 },
              computed: { zIndex: '5', position: 'relative' },
            }),
          ],
        }),
        makeElement({
          selector: '.sibling-outside',
          bounds: { x: 500, y: 500, w: 100, h: 100 },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const mi = issues.filter(i => i.context?.check === 'missing-isolation');
    expect(mi).toEqual([]);
  });

  it('42. does not flag container with no z-indexed children', () => {
    const tree = makeElement({
      selector: 'body',
      tag: 'body',
      children: [
        makeElement({
          selector: '.container',
          bounds: { x: 0, y: 0, w: 300, h: 300 },
          children: [
            makeElement({
              selector: '.plain-child',
              bounds: { x: 0, y: 0, w: 150, h: 150 },
            }),
          ],
        }),
        makeElement({
          selector: '.sibling-outside',
          bounds: { x: 100, y: 100, w: 150, h: 150 },
        }),
      ],
    });
    const issues = checkStacking(tree, viewport);
    const mi = issues.filter(i => i.context?.check === 'missing-isolation');
    expect(mi).toEqual([]);
  });
});
