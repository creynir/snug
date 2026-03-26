import { describe, it, expect } from 'vitest';
import { checkContentDuplicate } from '../../../src/diagnostics/content-duplicate.js';
import type { ExtractedElement, Viewport } from '../../../src/types.js';

const viewport: Viewport = { width: 1280, height: 800 };

type ElementWithAttrs = ExtractedElement & { attributes?: Record<string, string> };

function makeElement(
  overrides: Partial<ElementWithAttrs> = {},
): ElementWithAttrs {
  return {
    selector: '.test',
    tag: 'div',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────
// 2a. Duplicate images — same src
// ──────────────────────────────────────────

describe('checkContentDuplicate — images', () => {
  it('flags two <img> with same src', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.logo-header img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 120, h: 40 },
          attributes: { src: 'https://example.com/logo.png' },
        }),
        makeElement({
          selector: '.logo-footer img',
          tag: 'img',
          bounds: { x: 0, y: 700, w: 120, h: 40 },
          attributes: { src: 'https://example.com/logo.png' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const imgIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate image'),
    );
    expect(imgIssues.length).toBe(1);
    expect(imgIssues[0].severity).toBe('warning');
  });

  it('does not flag two <img> with different src', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hero img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 400, h: 300 },
          attributes: { src: 'https://example.com/hero.png' },
        }),
        makeElement({
          selector: '.about img',
          tag: 'img',
          bounds: { x: 0, y: 400, w: 400, h: 300 },
          attributes: { src: 'https://example.com/about.png' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const imgIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate image'),
    );
    expect(imgIssues).toEqual([]);
  });

  it('does not flag tiny images (tracking pixels) with same src', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.pixel-1',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 1, h: 1 },
          attributes: { src: 'https://analytics.example.com/pixel.gif' },
        }),
        makeElement({
          selector: '.pixel-2',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 1, h: 1 },
          attributes: { src: 'https://analytics.example.com/pixel.gif' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const imgIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate image'),
    );
    expect(imgIssues).toEqual([]);
  });

  it('does not flag images with "icon" or "sprite" in src', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.nav-item-1 img',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 24, h: 24 },
          attributes: { src: 'https://example.com/assets/icon-chevron.svg' },
        }),
        makeElement({
          selector: '.nav-item-2 img',
          tag: 'img',
          bounds: { x: 100, y: 0, w: 24, h: 24 },
          attributes: { src: 'https://example.com/assets/icon-chevron.svg' },
        }),
        makeElement({
          selector: '.feature-1 img',
          tag: 'img',
          bounds: { x: 0, y: 100, w: 32, h: 32 },
          attributes: { src: 'https://example.com/sprite-sheet.png' },
        }),
        makeElement({
          selector: '.feature-2 img',
          tag: 'img',
          bounds: { x: 200, y: 100, w: 32, h: 32 },
          attributes: { src: 'https://example.com/sprite-sheet.png' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const imgIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate image'),
    );
    expect(imgIssues).toEqual([]);
  });

  it('lists all duplicate locations in detail string', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.logo-header',
          tag: 'img',
          bounds: { x: 0, y: 0, w: 120, h: 40 },
          attributes: { src: 'https://example.com/logo.png' },
        }),
        makeElement({
          selector: '.logo-footer',
          tag: 'img',
          bounds: { x: 0, y: 600, w: 120, h: 40 },
          attributes: { src: 'https://example.com/logo.png' },
        }),
        makeElement({
          selector: '.logo-mobile',
          tag: 'img',
          bounds: { x: 0, y: 300, w: 80, h: 30 },
          attributes: { src: 'https://example.com/logo.png' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const imgIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate image'),
    );
    expect(imgIssues.length).toBe(1);
    expect(imgIssues[0].detail).toContain('3 times');
    // The detail should list the other locations (all except the first)
    expect(imgIssues[0].detail).toContain('.logo-footer');
    expect(imgIssues[0].detail).toContain('.logo-mobile');
  });
});

// ──────────────────────────────────────────
// 2b. Duplicate links — same href + same text
// ──────────────────────────────────────────

describe('checkContentDuplicate — links', () => {
  it('flags two <a> with same href AND same text', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.desktop-nav a',
          tag: 'a',
          bounds: { x: 0, y: 0, w: 100, h: 30 },
          text: 'Dashboard',
          attributes: { href: '/dashboard' },
        }),
        makeElement({
          selector: '.mobile-nav a',
          tag: 'a',
          bounds: { x: 0, y: 700, w: 100, h: 30 },
          text: 'Dashboard',
          attributes: { href: '/dashboard' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const linkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate link'),
    );
    expect(linkIssues.length).toBe(1);
    expect(linkIssues[0].severity).toBe('warning');
  });

  it('does not flag two <a> with same href but different text', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.nav a',
          tag: 'a',
          bounds: { x: 0, y: 0, w: 100, h: 30 },
          text: 'Learn more',
          attributes: { href: '/pricing' },
        }),
        makeElement({
          selector: '.footer a',
          tag: 'a',
          bounds: { x: 0, y: 700, w: 100, h: 30 },
          text: 'Pricing',
          attributes: { href: '/pricing' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const linkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate link'),
    );
    expect(linkIssues).toEqual([]);
  });

  it('does not flag href="#" duplicates', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.tab-1 a',
          tag: 'a',
          bounds: { x: 0, y: 0, w: 80, h: 30 },
          text: 'Tab',
          attributes: { href: '#' },
        }),
        makeElement({
          selector: '.tab-2 a',
          tag: 'a',
          bounds: { x: 100, y: 0, w: 80, h: 30 },
          text: 'Tab',
          attributes: { href: '#' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const linkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate link'),
    );
    expect(linkIssues).toEqual([]);
  });

  it('does not flag single occurrence', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.nav a',
          tag: 'a',
          bounds: { x: 0, y: 0, w: 100, h: 30 },
          text: 'Home',
          attributes: { href: '/' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const linkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate link'),
    );
    expect(linkIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2c. Duplicate landmarks — multiple unique-by-spec roles
// ──────────────────────────────────────────

describe('checkContentDuplicate — landmarks', () => {
  it('flags two role="banner" elements', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'header.desktop-header',
          tag: 'header',
          bounds: { x: 0, y: 0, w: 1280, h: 64 },
          attributes: { role: 'banner' },
        }),
        makeElement({
          selector: 'header.mobile-header',
          tag: 'header',
          bounds: { x: 0, y: 0, w: 1280, h: 48 },
          attributes: { role: 'banner' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const landmarkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate landmark'),
    );
    expect(landmarkIssues.length).toBe(1);
    expect(landmarkIssues[0].severity).toBe('warning');
  });

  it('flags two <main> elements (implicit role)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'main.primary',
          tag: 'main',
          bounds: { x: 0, y: 64, w: 1280, h: 600 },
          // No explicit role attribute — implicit role="main" from <main> tag
        }),
        makeElement({
          selector: 'main.secondary',
          tag: 'main',
          bounds: { x: 0, y: 700, w: 1280, h: 400 },
        }),
      ],
    });

    // The diagnostic should detect implicit roles from tag names
    const issues = checkContentDuplicate(tree, viewport);
    const landmarkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate landmark'),
    );
    expect(landmarkIssues.length).toBe(1);
    expect(landmarkIssues[0].detail).toContain('main');
  });

  it('does not flag two role="navigation" (multiple navs is fine)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'nav.primary-nav',
          tag: 'nav',
          bounds: { x: 0, y: 0, w: 1280, h: 50 },
          attributes: { role: 'navigation' },
        }),
        makeElement({
          selector: 'nav.footer-nav',
          tag: 'nav',
          bounds: { x: 0, y: 700, w: 1280, h: 50 },
          attributes: { role: 'navigation' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const landmarkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate landmark'),
    );
    expect(landmarkIssues).toEqual([]);
  });

  it('does not flag single landmark', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'header',
          tag: 'header',
          bounds: { x: 0, y: 0, w: 1280, h: 64 },
          attributes: { role: 'banner' },
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const landmarkIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate landmark'),
    );
    expect(landmarkIssues).toEqual([]);
  });
});

// ──────────────────────────────────────────
// 2d. Duplicate headings — same level + same text
// ──────────────────────────────────────────

describe('checkContentDuplicate — headings', () => {
  it('flags two <h1> with same text', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: 'section.hero h1',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          text: 'Welcome',
        }),
        makeElement({
          selector: 'section.content h1',
          tag: 'h1',
          bounds: { x: 0, y: 400, w: 600, h: 48 },
          text: 'Welcome',
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const headingIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate heading'),
    );
    expect(headingIssues.length).toBe(1);
    expect(headingIssues[0].severity).toBe('warning');
    expect(headingIssues[0].detail).toContain('<h1>');
    expect(headingIssues[0].detail).toContain('Welcome');
  });

  it('flags two <h2> with same text', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.features',
          children: [
            makeElement({
              selector: '.features h2',
              tag: 'h2',
              bounds: { x: 0, y: 100, w: 400, h: 36 },
              text: 'Features',
            }),
          ],
        }),
        makeElement({
          selector: '.sidebar',
          children: [
            makeElement({
              selector: '.sidebar h2',
              tag: 'h2',
              bounds: { x: 900, y: 100, w: 300, h: 36 },
              text: 'Features',
            }),
          ],
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const headingIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate heading'),
    );
    expect(headingIssues.length).toBe(1);
    expect(headingIssues[0].detail).toContain('<h2>');
  });

  it('does not flag <h1> and <h2> with same text (different levels)', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.hero h1',
          tag: 'h1',
          bounds: { x: 0, y: 0, w: 600, h: 48 },
          text: 'Welcome',
        }),
        makeElement({
          selector: '.sidebar h2',
          tag: 'h2',
          bounds: { x: 900, y: 100, w: 300, h: 36 },
          text: 'Welcome',
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const headingIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate heading'),
    );
    expect(headingIssues).toEqual([]);
  });

  it('does not flag two <h2> with different text', () => {
    const tree = makeElement({
      selector: 'body',
      children: [
        makeElement({
          selector: '.section-1 h2',
          tag: 'h2',
          bounds: { x: 0, y: 100, w: 400, h: 36 },
          text: 'Features',
        }),
        makeElement({
          selector: '.section-2 h2',
          tag: 'h2',
          bounds: { x: 0, y: 500, w: 400, h: 36 },
          text: 'Pricing',
        }),
      ],
    });

    const issues = checkContentDuplicate(tree, viewport);
    const headingIssues = issues.filter(
      (i) => i.type === 'content-duplicate' && i.detail.includes('Duplicate heading'),
    );
    expect(headingIssues).toEqual([]);
  });
});
