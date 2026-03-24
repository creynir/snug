import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from './pipeline.js';
import type { CheckOptions } from './types.js';

/**
 * Read HTML from stdin (blocking).
 * Used when --stdin flag is set.
 *
 * Writes stdin content to a temp file and returns the path.
 * Puppeteer's setContent with networkidle0 hangs after reading fd 0,
 * so we use a temp file + goto instead.
 */
function readStdin(): string {
  return readFileSync(0, 'utf8');
}

/**
 * CLI entry point.
 *
 * Usage:
 *   snug check layout.html
 *   snug check --depth 3 layout.html
 *   snug check --stdin
 *   snug check --stdin --base-url ./assets/
 *   snug check --width 375 --height 812 layout.html
 *   snug check --keep-alive 300 layout.html
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — issues found (warnings or errors)
 *   2 — runtime error (file not found, browser crash, etc.)
 */
async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .command('check [file]', 'Check a layout for issues', (yargs) => {
      return yargs
        .positional('file', {
          describe: 'Path to HTML file',
          type: 'string',
        })
        .option('stdin', {
          describe: 'Read HTML from stdin',
          type: 'boolean',
          default: false,
        })
        .option('base-url', {
          describe: 'Base URL for resolving relative resources',
          type: 'string',
        })
        .option('depth', {
          describe: 'Max DOM depth (0 = unlimited)',
          type: 'number',
          default: 0,
        })
        .option('width', {
          describe: 'Viewport width',
          type: 'number',
          default: 1280,
        })
        .option('height', {
          describe: 'Viewport height',
          type: 'number',
          default: 800,
        })
        .option('keep-alive', {
          describe: 'Keep browser alive for N seconds after check',
          type: 'number',
          default: 180,
        });
    })
    .demandCommand(1)
    .strict()
    .parse();

  const args = argv as any;

  if (args.depth < 0) {
    console.error('Error: --depth must be non-negative');
    process.exit(2);
  }
  if (args.width <= 0) {
    console.error('Error: --width must be a positive number');
    process.exit(2);
  }
  if (args.height <= 0) {
    console.error('Error: --height must be a positive number');
    process.exit(2);
  }

  const options: CheckOptions = {
    file: args.file,
    stdin: args.stdin,
    baseUrl: args.baseUrl,
    depth: args.depth,
    width: args.width,
    height: args.height,
    keepAlive: args.keepAlive,
  };

  let tmpFile: string | undefined;
  try {
    if (options.stdin) {
      const html = readStdin();
      // Write to temp file to avoid Puppeteer setContent + networkidle0
      // hanging after reading from fd 0.
      tmpFile = join(tmpdir(), `snug-stdin-${Date.now()}.html`);
      writeFileSync(tmpFile, html);
      options.file = tmpFile;
    }

    const { yaml, report } = await check(options);

    process.stdout.write(yaml);

    if (report.issues.length > 0) {
      process.exit(1);
    }

    process.exit(0);
  } finally {
    if (tmpFile) {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(2);
});
