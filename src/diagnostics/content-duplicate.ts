import type { ExtractedElement, Issue, Viewport } from '../types.js';

/**
 * Detect duplicate content: images, links, landmarks, headings.
 *
 * See FOLLOWUP-003 for full specification.
 */
export function checkContentDuplicate(tree: ExtractedElement, _viewport: Viewport): Issue[] {
  const issues: Issue[] = [];

  const images: ExtractedElement[] = [];
  const links: ExtractedElement[] = [];
  const landmarks: ExtractedElement[] = [];
  const headings: ExtractedElement[] = [];

  collect(tree, images, links, landmarks, headings);

  checkDuplicateImages(images, issues);
  checkDuplicateLinks(links, issues);
  checkDuplicateLandmarks(landmarks, issues);
  checkDuplicateHeadings(headings, issues);

  return issues;
}

const IMPLICIT_ROLES: Record<string, string> = {
  header: 'banner',
  main: 'main',
  footer: 'contentinfo',
};

const UNIQUE_ROLES = new Set(['banner', 'main', 'contentinfo']);

function collect(
  el: ExtractedElement,
  images: ExtractedElement[],
  links: ExtractedElement[],
  landmarks: ExtractedElement[],
  headings: ExtractedElement[],
): void {
  if (el.tag === 'img' && el.attributes?.src) {
    images.push(el);
  }

  if (el.tag === 'a' && el.attributes?.href && el.text) {
    links.push(el);
  }

  // Landmarks: explicit role or implicit from tag
  const role = el.attributes?.role ?? IMPLICIT_ROLES[el.tag];
  if (role && UNIQUE_ROLES.has(role)) {
    landmarks.push(el);
  }

  // Headings h1-h6
  if (/^h[1-6]$/.test(el.tag) && el.text) {
    headings.push(el);
  }

  for (const child of el.children) {
    collect(child, images, links, landmarks, headings);
  }
}

function normalizeSrc(src: string): string {
  // Strip query params and fragment identifiers
  return src.split('?')[0].split('#')[0];
}

function checkDuplicateImages(images: ExtractedElement[], issues: Issue[]): void {
  // Filter out tiny images (tracking pixels)
  const filtered = images.filter(
    (el) => el.bounds.w >= 4 && el.bounds.h >= 4,
  );

  // Filter out icons/sprites
  const meaningful = filtered.filter((el) => {
    const src = el.attributes!.src.toLowerCase();
    return !src.includes('icon') && !src.includes('sprite');
  });

  // Group by normalized src
  const groups = new Map<string, ExtractedElement[]>();
  for (const el of meaningful) {
    const key = normalizeSrc(el.attributes!.src);
    const group = groups.get(key);
    if (group) {
      group.push(el);
    } else {
      groups.set(key, [el]);
    }
  }

  for (const [, group] of groups) {
    if (group.length > 1) {
      const others = group.slice(1).map((el) => el.selector);
      issues.push({
        type: 'content-duplicate',
        severity: 'warning',
        element: group[0].selector,
        detail: `Duplicate image: same src appears ${group.length} times (also at: ${others.join(', ')})`,
      });
    }
  }
}

function checkDuplicateLinks(links: ExtractedElement[], issues: Issue[]): void {
  // Filter out placeholder hrefs
  const filtered = links.filter((el) => {
    const href = el.attributes!.href;
    return href !== '#' && !href.startsWith('javascript:');
  });

  // Group by (href, text) tuple
  const groups = new Map<string, ExtractedElement[]>();
  for (const el of filtered) {
    const key = `${el.attributes!.href}\0${el.text}`;
    const group = groups.get(key);
    if (group) {
      group.push(el);
    } else {
      groups.set(key, [el]);
    }
  }

  for (const [, group] of groups) {
    if (group.length > 1) {
      const others = group.slice(1).map((el) => el.selector);
      issues.push({
        type: 'content-duplicate',
        severity: 'warning',
        element: group[0].selector,
        detail: `Duplicate link: '${group[0].text}' → ${group[0].attributes!.href} appears ${group.length} times (also at: ${others.join(', ')})`,
      });
    }
  }
}

function checkDuplicateLandmarks(landmarks: ExtractedElement[], issues: Issue[]): void {
  // Group by role
  const groups = new Map<string, ExtractedElement[]>();
  for (const el of landmarks) {
    const role = el.attributes?.role ?? IMPLICIT_ROLES[el.tag];
    if (!role) continue;
    const group = groups.get(role);
    if (group) {
      group.push(el);
    } else {
      groups.set(role, [el]);
    }
  }

  for (const [role, group] of groups) {
    if (group.length > 1) {
      const others = group.slice(1).map((el) => el.selector);
      issues.push({
        type: 'content-duplicate',
        severity: 'warning',
        element: group[0].selector,
        detail: `Duplicate landmark: role='${role}' appears ${group.length} times (also at: ${others.join(', ')})`,
      });
    }
  }
}

function checkDuplicateHeadings(headings: ExtractedElement[], issues: Issue[]): void {
  // Group by (tag, text)
  const groups = new Map<string, ExtractedElement[]>();
  for (const el of headings) {
    const key = `${el.tag}\0${el.text}`;
    const group = groups.get(key);
    if (group) {
      group.push(el);
    } else {
      groups.set(key, [el]);
    }
  }

  for (const [, group] of groups) {
    if (group.length > 1) {
      const others = group.slice(1).map((el) => el.selector);
      issues.push({
        type: 'content-duplicate',
        severity: 'warning',
        element: group[0].selector,
        detail: `Duplicate heading: <${group[0].tag}> '${group[0].text}' appears ${group.length} times (also at: ${others.join(', ')})`,
      });
    }
  }
}
