import { describe, it, expect } from 'vitest';
import { runDiagnostics } from '../../../src/diagnostics/index.js';
import type { DiagnosticFn, ExtractedElement, Issue, Viewport } from '../../../src/types.js';

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

describe('runDiagnostics', () => {
  // ── Custom diagnostics ──

  it('runs a single custom diagnostic and returns its issues', () => {
    const mockIssue: Issue = {
      type: 'viewport-overflow',
      severity: 'error',
      element: '.foo',
      detail: 'Test issue',
    };
    const customDiagnostic: DiagnosticFn = () => [mockIssue];
    const tree = makeElement();
    const issues = runDiagnostics(tree, viewport, [customDiagnostic]);
    expect(issues).toContainEqual(mockIssue);
  });

  it('runs multiple custom diagnostics and concatenates results', () => {
    const issueA: Issue = {
      type: 'viewport-overflow',
      severity: 'error',
      element: '.a',
      detail: 'Overflow A',
    };
    const issueB: Issue = {
      type: 'containment',
      severity: 'warning',
      element: '.b',
      detail: 'Containment B',
    };
    const diagA: DiagnosticFn = () => [issueA];
    const diagB: DiagnosticFn = () => [issueB];
    const tree = makeElement();
    const issues = runDiagnostics(tree, viewport, [diagA, diagB]);
    expect(issues.length).toBe(2);
    expect(issues).toContainEqual(issueA);
    expect(issues).toContainEqual(issueB);
  });

  it('returns empty array when all custom diagnostics return no issues', () => {
    const emptyDiag: DiagnosticFn = () => [];
    const tree = makeElement();
    const issues = runDiagnostics(tree, viewport, [emptyDiag, emptyDiag]);
    expect(issues).toEqual([]);
  });

  it('returns empty array when custom diagnostics array is empty', () => {
    const tree = makeElement();
    const issues = runDiagnostics(tree, viewport, []);
    expect(issues).toEqual([]);
  });

  it('passes tree and viewport to each diagnostic function', () => {
    const tree = makeElement({ selector: '.root' });
    const customViewport: Viewport = { width: 375, height: 667 };
    let receivedTree: ExtractedElement | undefined;
    let receivedViewport: Viewport | undefined;
    const spy: DiagnosticFn = (t, v) => {
      receivedTree = t;
      receivedViewport = v;
      return [];
    };
    runDiagnostics(tree, customViewport, [spy]);
    expect(receivedTree).toBe(tree);
    expect(receivedViewport).toBe(customViewport);
  });

  // ── Default diagnostics (all 6) ──

  it('runs default diagnostics when no custom array is provided', () => {
    // When called without the 3rd argument, it should use the default 6 diagnostics.
    // All stubs throw 'Not implemented', so this will throw.
    // But that's what we expect in the red phase — just verify it attempts to run.
    const tree = makeElement();
    // The stubs throw, so calling with defaults should throw "Not implemented"
    expect(() => runDiagnostics(tree, viewport)).toThrow();
  });

  // ── Return type ──

  it('returns a flat Issue[] array, not nested arrays', () => {
    const issues: Issue[] = [
      { type: 'viewport-overflow', severity: 'error', element: '.a', detail: 'd1' },
      { type: 'containment', severity: 'warning', element: '.b', detail: 'd2' },
    ];
    const diag1: DiagnosticFn = () => [issues[0]];
    const diag2: DiagnosticFn = () => [issues[1]];
    const tree = makeElement();
    const result = runDiagnostics(tree, viewport, [diag1, diag2]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    // Verify it's flat — no nested arrays
    result.forEach(item => {
      expect(typeof item).toBe('object');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('severity');
    });
  });

  it('aggregates issues from diagnostics that return multiple issues each', () => {
    const diag: DiagnosticFn = () => [
      { type: 'truncation', severity: 'warning', element: '.x', detail: 'd1' },
      { type: 'truncation', severity: 'warning', element: '.y', detail: 'd2' },
      { type: 'truncation', severity: 'warning', element: '.z', detail: 'd3' },
    ];
    const tree = makeElement();
    const result = runDiagnostics(tree, viewport, [diag]);
    expect(result.length).toBe(3);
  });
});
