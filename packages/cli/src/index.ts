#!/usr/bin/env node
/**
 * CrecheBooks CLI Entry Point
 *
 * @crechebooks/cli - Terminal-based bookkeeping operations
 */

import { createCLI } from './cli.js';

async function main(): Promise<void> {
  const program = createCLI();
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
