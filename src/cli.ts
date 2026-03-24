import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'node:fs';
import { check } from './pipeline.js';
import type { CheckOptions } from './types.js';

/**
 * Read HTML from stdin (blocking).
 * Used when --stdin flag is set.
 */
function readStdin(): string {
  // TODO: implement stdin reading with timeout
  // Use: readFileSync('/dev/stdin', 'utf8') or process.stdin
  throw new Error('Not implemented');
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
  // TODO: implement yargs command parsing
  // - 'check' command with positional [file] argument
  // - --stdin flag
  // - --base-url <url>
  // - --depth <number> (default: 0 = unlimited)
  // - --width <number> (default: 1280)
  // - --height <number> (default: 800)
  // - --keep-alive <seconds> (default: 180)
  //
  // Flow:
  // 1. Parse args → CheckOptions
  // 2. If --stdin, read HTML from stdin
  // 3. Call check(options, html?)
  // 4. Write YAML to stdout
  // 5. Exit with code 0 (clean) or 1 (issues found)
  // 6. On error: print to stderr, exit 2
  throw new Error('Not implemented');
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(2);
});
