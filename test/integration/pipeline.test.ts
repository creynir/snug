import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { check } from '../../src/pipeline.js';

describe('full pipeline (integration)', () => {
  it('produces clean report for clean.html', async () => {
    const { yaml, report } = await check({
      file: resolve(__dirname, '../fixtures/clean.html'),
      keepAlive: 0,
    });

    expect(report.issues).toEqual([]);
    expect(report.elementCount).toBeGreaterThan(0);
    expect(yaml).toContain('viewport:');
    expect(yaml).toContain('tree:');
  }, 15000); // allow time for cold browser launch

  it('detects overflow in overflow.html', async () => {
    const { report } = await check({
      file: resolve(__dirname, '../fixtures/overflow.html'),
      keepAlive: 0,
    });

    const overflows = report.issues.filter((i) => i.type === 'viewport-overflow');
    expect(overflows.length).toBeGreaterThan(0);
  }, 15000);

  it('detects overlap in overlap.html', async () => {
    const { report } = await check({
      file: resolve(__dirname, '../fixtures/overlap.html'),
      keepAlive: 0,
    });

    const overlaps = report.issues.filter((i) => i.type === 'sibling-overlap');
    expect(overlaps.length).toBeGreaterThan(0);

    // Same z-index overlap should be error
    const sameZ = overlaps.find((i) => i.data?.sameZIndex === true);
    expect(sameZ?.severity).toBe('error');

    // Different z-index overlap should be warning
    const diffZ = overlaps.find((i) => i.data?.sameZIndex === false);
    expect(diffZ?.severity).toBe('warning');
  }, 15000);

  it('detects containment violation in containment.html', async () => {
    const { report } = await check({
      file: resolve(__dirname, '../fixtures/containment.html'),
      keepAlive: 0,
    });

    const containment = report.issues.filter((i) => i.type === 'containment');
    expect(containment.length).toBeGreaterThan(0);

    // Should NOT flag the overflow:hidden container
    const clippedIssues = containment.filter((i) =>
      i.element2 === '.clipping-container' || i.element === '.oversized',
    );
    expect(clippedIssues).toEqual([]);
  }, 15000);

  it('detects truncation in truncation.html', async () => {
    const { report } = await check({
      file: resolve(__dirname, '../fixtures/truncation.html'),
      keepAlive: 0,
    });

    const truncations = report.issues.filter((i) => i.type === 'truncation');
    expect(truncations.length).toBeGreaterThan(0);
  }, 15000);

  it('detects spacing anomaly in spacing.html', async () => {
    const { report } = await check({
      file: resolve(__dirname, '../fixtures/spacing.html'),
      keepAlive: 0,
    });

    const spacing = report.issues.filter((i) => i.type === 'spacing-anomaly');
    expect(spacing.length).toBeGreaterThan(0);
    expect(spacing[0].data?.mode).toBeDefined();
  }, 15000);
});
