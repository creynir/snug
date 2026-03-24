import type { BrowserAdapter, CheckOptions, SnugReport, Viewport } from './types.js';
import { PuppeteerAdapter } from './browser/puppeteer.js';
import { extractDOM } from './extractor/extract.js';
import { runDiagnostics } from './diagnostics/index.js';
import { formatReport } from './reporter/format.js';

/**
 * Create a browser adapter based on options.
 * Phase 1: always Puppeteer. Future: --adapter flag for Playwright, etc.
 */
export function createAdapter(options: CheckOptions): BrowserAdapter {
  return new PuppeteerAdapter({
    keepAliveMs: (options.keepAlive ?? 180) * 1000,
  });
}

/**
 * Count all elements in the tree recursively.
 */
export function countElements(tree: { children: { children: any }[] }): number {
  return 1 + tree.children.reduce((sum, child) => sum + countElements(child), 0);
}

/**
 * Run the full Snug pipeline: render → extract → diagnose → report.
 *
 * Returns the YAML report string and the structured report object.
 */
export async function check(
  options: CheckOptions,
  html?: string,
): Promise<{ yaml: string; report: SnugReport }> {
  const adapter = createAdapter(options);

  try {
    await adapter.init();

    const viewport: Viewport = {
      width: options.width ?? 1280,
      height: options.height ?? 800,
    };

    const page = await adapter.render({
      filePath: options.file,
      html,
      baseUrl: options.baseUrl,
      viewport,
    });

    try {
      const { tree, viewport: actualViewport } = await extractDOM(page, {
        depth: options.depth,
      });

      const issues = runDiagnostics(tree, actualViewport);

      const report: SnugReport = {
        viewport: actualViewport,
        elementCount: countElements(tree),
        issues,
        tree,
      };

      const yaml = formatReport(report);

      return { yaml, report };
    } finally {
      await page.close();
    }
  } finally {
    await adapter.dispose();
  }
}
