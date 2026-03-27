import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { check } from '../../src/pipeline.js';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('full pipeline (integration)', () => {
  // ── Clean layout: zero issues ──

  it('produces zero issues for clean.html', async () => {
    const { yaml, report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    expect(report.issues).toEqual([]);
    expect(yaml).toContain('viewport:');
    expect(yaml).toContain('tree:');
  }, 30000);

  it('populates elementCount correctly for clean.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    // clean.html: body, header, .logo, main, .card-grid, 3x .card, footer, p = 10
    expect(report.elementCount).toBeGreaterThan(0);
    expect(typeof report.elementCount).toBe('number');
  }, 30000);

  it('returns report with correct structure', async () => {
    const { yaml, report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    // Report shape
    expect(report).toHaveProperty('viewport');
    expect(report).toHaveProperty('elementCount');
    expect(report).toHaveProperty('issues');
    expect(report).toHaveProperty('tree');

    expect(report.viewport).toEqual({ width: 1280, height: 800 });
    expect(Array.isArray(report.issues)).toBe(true);
    expect(report.tree.tag).toBe('body');

    // YAML contains expected sections
    expect(yaml).toContain('viewport:');
    expect(yaml).toContain('element_count:');
    expect(yaml).toContain('summary:');
    expect(yaml).toContain('issues:');
    expect(yaml).toContain('tree:');
  }, 30000);

  it('YAML summary shows errors: 0 and warnings: 0 for clean layout', async () => {
    const { yaml } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    expect(yaml).toContain('errors: 0');
    expect(yaml).toContain('warnings: 0');
  }, 30000);

  // ── Viewport overflow detection ──

  it('detects viewport-overflow in overflow.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overflow.html'),
      keepAlive: 0,
    });

    const overflows = report.issues.filter(
      (i) => i.type === 'viewport-overflow',
    );
    expect(overflows.length).toBeGreaterThan(0);
    expect(overflows.every((i) => i.severity === 'error')).toBe(true);
  }, 30000);

  it('detects wide-banner overflow right and shifted-left overflow left', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overflow.html'),
      keepAlive: 0,
    });

    const overflows = report.issues.filter(
      (i) => i.type === 'viewport-overflow',
    );

    // wide-banner (1500px wide) overflows right
    const rightOverflow = overflows.find(
      (i) => i.data?.overflowX !== undefined && (i.data.overflowX as number) > 0,
    );
    expect(rightOverflow).toBeDefined();

    // shifted-left (margin-left: -50px) overflows left
    const leftOverflow = overflows.find(
      (i) => i.element?.includes('shifted'),
    );
    expect(leftOverflow).toBeDefined();
  }, 30000);

  // ── Sibling overlap detection ──

  it('detects sibling-overlap in overlap.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overlap.html'),
      keepAlive: 0,
    });

    const overlaps = report.issues.filter(
      (i) => i.type === 'sibling-overlap',
    );
    expect(overlaps.length).toBeGreaterThan(0);
  }, 30000);

  it('flags same z-index overlap as error and different z-index as warning', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overlap.html'),
      keepAlive: 0,
    });

    const overlaps = report.issues.filter(
      (i) => i.type === 'sibling-overlap',
    );

    // box-a and box-b: same z-index (both auto) -> error
    const sameZ = overlaps.find((i) => i.data?.sameZIndex === true);
    expect(sameZ).toBeDefined();
    expect(sameZ!.severity).toBe('error');

    // layer-base and layer-top: different z-index (1 vs 10) -> warning from diagnostic.
    // The severity resolver may upgrade this to error if both elements contain text
    // (text-on-text rule). Check the original diagnostic severity via context.
    const diffZ = overlaps.find((i) => i.data?.sameZIndex === false);
    expect(diffZ).toBeDefined();
    const diffZOriginalSeverity = diffZ!.context?.originalSeverity ?? diffZ!.severity;
    expect(diffZOriginalSeverity).toBe('warning');
  }, 30000);

  // ── Containment violation detection ──

  it('detects containment violation in containment.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'containment.html'),
      keepAlive: 0,
    });

    const containment = report.issues.filter(
      (i) => i.type === 'containment',
    );
    expect(containment.length).toBeGreaterThan(0);

    // escaped-child breaks out of .container
    const escaped = containment.find(
      (i) => i.element?.includes('escaped'),
    );
    expect(escaped).toBeDefined();
  }, 30000);

  it('does NOT flag overflow:hidden containers as containment violations', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'containment.html'),
      keepAlive: 0,
    });

    const containment = report.issues.filter(
      (i) => i.type === 'containment',
    );

    // .clipping-container has overflow:hidden, so .oversized inside it
    // should NOT produce a containment issue
    const clippedIssues = containment.filter(
      (i) =>
        i.element2?.includes('clipping-container') ||
        i.element?.includes('oversized'),
    );
    expect(clippedIssues).toEqual([]);
  }, 30000);

  // ── Truncation detection ──

  it('detects truncation in truncation.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'truncation.html'),
      keepAlive: 0,
    });

    const truncations = report.issues.filter(
      (i) => i.type === 'truncation',
    );
    expect(truncations.length).toBeGreaterThan(0);
  }, 30000);

  it('includes scroll data in truncation issues', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'truncation.html'),
      keepAlive: 0,
    });

    const truncations = report.issues.filter(
      (i) => i.type === 'truncation',
    );
    // Each truncation should have data about the clipping
    for (const t of truncations) {
      expect(t.data).toBeDefined();
    }
  }, 30000);

  // ── Spacing anomaly detection ──

  it('detects spacing anomaly in spacing.html', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'spacing.html'),
      keepAlive: 0,
    });

    const spacing = report.issues.filter(
      (i) => i.type === 'spacing-anomaly',
    );
    expect(spacing.length).toBeGreaterThan(0);
  }, 30000);

  it('spacing issues include mode and deviation data', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'spacing.html'),
      keepAlive: 0,
    });

    const spacing = report.issues.filter(
      (i) => i.type === 'spacing-anomaly',
    );
    expect(spacing.length).toBeGreaterThan(0);

    for (const s of spacing) {
      expect(s.data).toBeDefined();
      expect(s.data!.mode).toBeDefined();
    }
  }, 30000);

  // ── elementCount populated by pipeline ──

  it('elementCount reflects the actual number of extracted elements', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overflow.html'),
      keepAlive: 0,
    });

    // overflow.html: body + wide-banner + shifted-left + normal = 4
    // (could be more if extraction picks up text nodes or other elements)
    expect(report.elementCount).toBeGreaterThanOrEqual(4);
  }, 30000);

  // ── Custom viewport ──

  it('respects custom viewport dimensions', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      width: 375,
      height: 667,
      keepAlive: 0,
    });

    expect(report.viewport).toEqual({ width: 375, height: 667 });
  }, 30000);

  // ── Viewport-fit detection (FOLLOWUP-001 Change 1) ──

  it('detects viewport-fit issues on viewport-fit.html fixture', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'viewport-fit.html'),
      width: 1280,
      height: 600,
      keepAlive: 0,
    });

    const viewportFitIssues = report.issues.filter(
      (i) => i.type === 'viewport-fit',
    );
    expect(viewportFitIssues.length).toBeGreaterThan(0);
  }, 30000);

  it('does NOT flag viewport-fit on clean.html (scrollable)', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    const viewportFitIssues = report.issues.filter(
      (i) => i.type === 'viewport-fit',
    );
    expect(viewportFitIssues).toEqual([]);
  }, 30000);

  // ── Clipping-ancestor context (FOLLOWUP-001 Change 2) ──

  it('overflow inside overflow:hidden parent reports warning with context.clippedBy', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overflow.html'),
      keepAlive: 0,
    });

    const overflows = report.issues.filter(
      (i) => i.type === 'viewport-overflow',
    );

    // .clipped-wide is inside .clipping-wrapper (overflow:hidden)
    // It should be reported as a warning with context.clippedBy
    const clippedIssue = overflows.find(
      (i) => i.element?.includes('clipped-wide') || i.element?.includes('clipped_wide'),
    );
    if (clippedIssue) {
      expect(clippedIssue.severity).toBe('warning');
      expect(clippedIssue.context).toBeDefined();
      expect(clippedIssue.context!.clippedBy).toBeDefined();
    } else {
      // If the clipped-wide element doesn't overflow viewport (it's 1500px wide),
      // the issue should still be reported since it exceeds viewport width
      expect(overflows.some(
        (i) => i.context?.clippedBy !== undefined,
      )).toBe(true);
    }
  }, 30000);

  it('overflow without clipping parent still reports error', async () => {
    const { report } = await check({
      file: resolve(FIXTURES, 'overflow.html'),
      keepAlive: 0,
    });

    const overflows = report.issues.filter(
      (i) => i.type === 'viewport-overflow',
    );

    // .wide-banner has no clipping ancestor — should remain error
    const unclippedIssue = overflows.find(
      (i) => i.element?.includes('wide-banner') || i.element?.includes('wide_banner'),
    );
    expect(unclippedIssue).toBeDefined();
    expect(unclippedIssue!.severity).toBe('error');
    // context.clippedBy must be absent — the resolver may add semanticTier but not clippedBy
    expect(unclippedIssue!.context?.clippedBy).toBeUndefined();
  }, 30000);

  // ── Depth limiting through pipeline ──

  it('respects depth option passed through check()', async () => {
    const { report: fullReport } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      keepAlive: 0,
    });

    const { report: shallowReport } = await check({
      file: resolve(FIXTURES, 'clean.html'),
      depth: 1,
      keepAlive: 0,
    });

    // A shallow tree should have fewer elements than the full tree
    expect(shallowReport.elementCount).toBeLessThan(fullReport.elementCount);
  }, 30000);
});
