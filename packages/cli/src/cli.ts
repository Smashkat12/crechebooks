/**
 * CrecheBooks CLI Setup
 *
 * Configures Commander.js with all commands.
 */

import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth/index.js';
import { registerInvoiceCommands } from './commands/invoices/index.js';
import { registerPaymentCommands } from './commands/payments/index.js';
import { registerBankingCommands } from './commands/banking/index.js';
import { registerTransactionCommands } from './commands/transactions/index.js';
import { registerReconciliationCommands } from './commands/reconciliation/index.js';
import { registerTenantCommands } from './commands/tenant/index.js';
import { registerParentCommands } from './commands/parents/index.js';
import { registerChildCommands } from './commands/children/index.js';
import { registerDashboardCommands } from './commands/dashboard/index.js';
import { registerReportCommands } from './commands/reports/index.js';
import { registerFeeStructureCommands } from './commands/fee-structures/index.js';
import { registerSarsCommands } from './commands/sars/index.js';
import { registerStaffCommands } from './commands/staff/index.js';
import { registerCommunicationsCommands } from './commands/communications/index.js';
import { printError } from './lib/output.js';
import { CLIError } from './types/index.js';

const VERSION = '1.0.0';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('cb')
    .description('CrecheBooks CLI - Terminal-based bookkeeping for South African creches')
    .version(VERSION)
    .option('--tenant <id>', 'Override tenant ID')
    .option('-f, --format <type>', 'Output format: json, table, csv', 'table')
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('-v, --verbose', 'Include debug information');

  // Register command groups
  registerAuthCommands(program);
  registerTenantCommands(program);
  registerParentCommands(program);
  registerChildCommands(program);
  registerInvoiceCommands(program);
  registerPaymentCommands(program);
  registerBankingCommands(program);
  registerTransactionCommands(program);
  registerReconciliationCommands(program);
  registerDashboardCommands(program);
  registerReportCommands(program);
  registerFeeStructureCommands(program);
  registerSarsCommands(program);
  registerStaffCommands(program);
  registerCommunicationsCommands(program);

  // Global error handler
  program.hook('preAction', () => {
    // Could add global setup here
  });

  // Handle errors gracefully
  program.exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    throw err;
  });

  // Custom error handling
  program.configureOutput({
    writeErr: (str) => {
      // Remove Commander's default "error: " prefix
      const cleanStr = str.replace(/^error: /i, '');
      if (cleanStr.trim()) {
        printError(cleanStr.trim());
      }
    },
  });

  return program;
}

/**
 * Execute a command action with error handling
 */
export async function executeAction<T>(
  action: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CLIError) {
      printError(error.message, error.suggestion);
    } else if (error instanceof Error) {
      printError(error.message);
    } else {
      printError('An unexpected error occurred');
    }
    process.exit(1);
  }
}
