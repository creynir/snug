import { describe, it, expect } from 'vitest';
import { formatReport } from '../../../src/reporter/format.js';
import type { SnugReport, ExtractedElement } from '../../../src/types.js';

function makeElement(overrides: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    selector: 'body',
    tag: 'body',
    bounds: { x: 0, y: 0, w: 1280, h: 800 },
    children: [],
    ...overrides,
  };
}

describe('formatReport', () => {
  it('produces valid YAML output', () => {
    const report: SnugReport = {
      viewport: { width: 1280, height: 800 },
      elementCount: 1,
      issues: [],
      tree: makeElement(),
    };
    const yaml = formatReport(report);
    expect(yaml).toContain('viewport:');
    expect(yaml).toContain('element_count:');
    expect(yaml).toContain('tree:');
  });

  it('includes summary with error and warning counts', () => {
    const report: SnugReport = {
      viewport: { width: 1280, height: 800 },
      elementCount: 5,
      issues: [
        { type: 'viewport-overflow', severity: 'error', element: '.a', detail: 'test' },
        { type: 'truncation', severity: 'warning', element: '.b', detail: 'test' },
        { type: 'truncation', severity: 'warning', element: '.c', detail: 'test' },
      ],
      tree: makeElement(),
    };
    const yaml = formatReport(report);
    expect(yaml).toContain('errors:');
    expect(yaml).toContain('warnings:');
  });

  it('includes issues list', () => {
    const report: SnugReport = {
      viewport: { width: 1280, height: 800 },
      elementCount: 3,
      issues: [
        { type: 'viewport-overflow', severity: 'error', element: '.wide', detail: 'Overflows right by 220px' },
      ],
      tree: makeElement(),
    };
    const yaml = formatReport(report);
    expect(yaml).toContain('viewport-overflow');
    expect(yaml).toContain('.wide');
  });
});
