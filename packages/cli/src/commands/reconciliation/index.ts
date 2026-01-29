/**
 * Reconciliation Commands
 *
 * cb reconciliation status       - Bank reconciliation status
 * cb reconciliation run          - Run reconciliation
 * cb reconciliation discrepancies - List discrepancies
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  formatTable,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
  formatZAR,
  formatDate,
} from '../../lib/output.js';
import type { GlobalOptions, Discrepancy } from '../../types/index.js';

export function registerReconciliationCommands(program: Command): void {
  const reconciliation = program
    .command('reconciliation')
    .alias('recon')
    .description('Bank reconciliation management');

  // Status command
  reconciliation
    .command('status')
    .description('Show bank reconciliation status')
    .option('--account <id>', 'Filter by bank account ID')
    .option('--month <YYYY-MM>', 'Show status for specific month')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching reconciliation status...').start();

        const response = await client.getReconciliationStatus({
          accountId: options.account,
          month: options.month,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch reconciliation status');
          return;
        }

        const status = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(status));
          return;
        }

        // Overall status
        const statusColor = status.is_reconciled
          ? chalk.green
          : status.has_discrepancies
            ? chalk.red
            : chalk.yellow;

        printSummary(`Reconciliation Status - ${status.period || 'Current Month'}`, {
          'Status': statusColor(status.is_reconciled ? 'RECONCILED' : status.has_discrepancies ? 'DISCREPANCIES' : 'PENDING'),
          'Bank Balance': formatZAR(status.bank_balance_cents),
          'Book Balance': formatZAR(status.book_balance_cents),
          'Difference': formatZAR(status.difference_cents),
          'Unreconciled Items': status.unreconciled_count,
          'Last Reconciled': status.last_reconciled_at
            ? new Date(status.last_reconciled_at).toLocaleDateString('en-ZA')
            : 'Never',
        });

        // Breakdown
        if (status.breakdown) {
          console.log(chalk.bold('Breakdown:'));
          console.log(`  Deposits (Bank):     ${formatZAR(status.breakdown.bank_deposits_cents)}`);
          console.log(`  Deposits (Books):    ${formatZAR(status.breakdown.book_deposits_cents)}`);
          console.log(`  Withdrawals (Bank):  ${formatZAR(status.breakdown.bank_withdrawals_cents)}`);
          console.log(`  Withdrawals (Books): ${formatZAR(status.breakdown.book_withdrawals_cents)}`);
          console.log();
        }

        // Outstanding items summary
        if (status.outstanding_items && status.outstanding_items.length > 0) {
          console.log(chalk.bold('Outstanding Items:'));
          const headers = ['Type', 'Count', 'Total'];
          const rows = status.outstanding_items.map((item) => [
            item.type,
            String(item.count),
            formatZAR(item.total_cents),
          ]);
          console.log(formatTable(headers, rows));
        }

        // Recommendations
        if (!status.is_reconciled) {
          console.log(chalk.bold('Recommendations:'));
          if (status.unreconciled_count > 0) {
            console.log(`  - Review ${status.unreconciled_count} unreconciled transactions`);
          }
          if (status.has_discrepancies) {
            console.log('  - Run "cb reconciliation discrepancies" to investigate');
          }
          console.log('  - Run "cb reconciliation run" when ready to reconcile');
          console.log();
        }
      });
    });

  // Run command
  reconciliation
    .command('run')
    .description('Run bank reconciliation')
    .option('--account <id>', 'Bank account to reconcile')
    .option('--month <YYYY-MM>', 'Month to reconcile (defaults to previous month)')
    .option('--statement-balance <cents>', 'Bank statement ending balance in cents')
    .option('--dry-run', 'Preview reconciliation without saving')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // If no statement balance provided, prompt for it
        let statementBalance = options.statementBalance
          ? parseInt(options.statementBalance, 10)
          : undefined;

        if (!statementBalance && !options.dryRun) {
          const { balance } = await inquirer.prompt([
            {
              type: 'input',
              name: 'balance',
              message: 'Enter bank statement ending balance (in cents):',
              validate: (v) => {
                const n = parseInt(v, 10);
                return !isNaN(n) || 'Enter a valid number';
              },
            },
          ]);
          statementBalance = parseInt(balance, 10);
        }

        const spinner = ora('Running reconciliation...').start();

        const response = await client.runReconciliation({
          accountId: options.account,
          month: options.month,
          statementBalanceCents: statementBalance,
          dryRun: options.dryRun,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to run reconciliation');
          return;
        }

        const result = response.data;

        if (options.dryRun) {
          printInfo('Dry run - no changes saved');
          console.log();
        }

        // Show reconciliation results
        const isBalanced = result.difference_cents === 0;

        printSummary('Reconciliation Results', {
          'Period': result.period,
          'Statement Balance': formatZAR(result.statement_balance_cents),
          'Calculated Balance': formatZAR(result.calculated_balance_cents),
          'Difference': isBalanced
            ? chalk.green(formatZAR(0))
            : chalk.red(formatZAR(result.difference_cents)),
          'Items Reconciled': result.items_reconciled,
          'Items Outstanding': result.items_outstanding,
        });

        if (isBalanced) {
          if (options.dryRun) {
            printSuccess('Reconciliation would be successful');
          } else {
            printSuccess('Bank account reconciled successfully!');
          }
        } else {
          printWarning(`Reconciliation has a difference of ${formatZAR(result.difference_cents)}`);
          console.log();
          console.log(chalk.bold('Possible causes:'));
          console.log('  - Unrecorded bank fees or interest');
          console.log('  - Deposits in transit');
          console.log('  - Outstanding checks');
          console.log('  - Data entry errors');
          console.log();
          printInfo('Run "cb reconciliation discrepancies" for detailed analysis');
        }

        // Show adjustments made
        if (result.adjustments && result.adjustments.length > 0) {
          console.log(chalk.bold('Adjustments Made:'));
          result.adjustments.forEach((adj) => {
            console.log(`  ${adj.type}: ${formatZAR(adj.amount_cents)} - ${adj.description}`);
          });
          console.log();
        }
      });
    });

  // Discrepancies command
  reconciliation
    .command('discrepancies')
    .description('List reconciliation discrepancies')
    .option('--account <id>', 'Filter by bank account ID')
    .option('--month <YYYY-MM>', 'Show discrepancies for specific month')
    .option('--resolved', 'Include resolved discrepancies')
    .option('-l, --limit <n>', 'Limit results', '50')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching discrepancies...').start();

        const response = await client.getDiscrepancies({
          accountId: options.account,
          month: options.month,
          includeResolved: options.resolved,
          limit: parseInt(options.limit, 10),
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch discrepancies');
          return;
        }

        const { discrepancies, summary } = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        if (discrepancies.length === 0) {
          printSuccess('No discrepancies found');
          return;
        }

        // Summary
        printSummary('Discrepancy Summary', {
          'Total Discrepancies': summary.total_count,
          'Total Amount': formatZAR(summary.total_amount_cents),
          'Unresolved': summary.unresolved_count,
          'By Category': Object.entries(summary.by_type || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(', '),
        });

        // Discrepancy table
        const headers = ['ID', 'Type', 'Amount', 'Description', 'Status', 'Date'];
        const rows = discrepancies.map((d: Discrepancy) => [
          d.id.slice(0, 8) + '...',
          d.discrepancy_type,
          formatZAR(d.amount_cents),
          d.description.length > 30 ? d.description.slice(0, 27) + '...' : d.description,
          d.is_resolved ? chalk.green('Resolved') : chalk.yellow('Open'),
          formatDate(d.created_at),
        ]);

        console.log(formatTable(headers, rows));

        // Show common causes
        if (summary.common_causes && summary.common_causes.length > 0) {
          console.log(chalk.bold('Common Causes:'));
          summary.common_causes.forEach((cause: string, i: number) => {
            console.log(`  ${i + 1}. ${cause}`);
          });
          console.log();
        }

        // Action recommendations
        if (summary.unresolved_count > 0) {
          console.log(chalk.bold('Recommended Actions:'));
          console.log('  - Review bank statements for missing entries');
          console.log('  - Check for duplicate transactions');
          console.log('  - Verify all deposits have been recorded');
          console.log('  - Review timing differences (month-end cutoff)');
          console.log();
        }
      });
    });

  // Resolve discrepancy subcommand
  reconciliation
    .command('resolve <discrepancyId>')
    .description('Resolve a discrepancy')
    .option('--action <type>', 'Resolution action: adjust, write_off, void, match')
    .option('--note <text>', 'Resolution note')
    .option('--match-to <id>', 'Transaction ID to match (for match action)')
    .action(async (discrepancyId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Get discrepancy details
        const discResponse = await client.getDiscrepancy(discrepancyId);

        if (!discResponse.success || !discResponse.data) {
          printError('Discrepancy not found');
          return;
        }

        const discrepancy = discResponse.data;

        printSummary('Discrepancy Details', {
          'Type': discrepancy.discrepancy_type,
          'Amount': formatZAR(discrepancy.amount_cents),
          'Description': discrepancy.description,
          'Created': formatDate(discrepancy.created_at),
        });

        let action = options.action;
        let note = options.note;

        if (!action) {
          const { selectedAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedAction',
              message: 'Select resolution action:',
              choices: [
                { name: 'Adjust - Create adjustment entry', value: 'adjust' },
                { name: 'Write Off - Write off the difference', value: 'write_off' },
                { name: 'Void - Mark as void/invalid', value: 'void' },
                { name: 'Match - Match to existing transaction', value: 'match' },
              ],
            },
          ]);
          action = selectedAction;
        }

        if (!note) {
          const { resolutionNote } = await inquirer.prompt([
            {
              type: 'input',
              name: 'resolutionNote',
              message: 'Resolution note:',
              validate: (v) => v.length > 0 || 'Note required',
            },
          ]);
          note = resolutionNote;
        }

        const spinner = ora('Resolving discrepancy...').start();

        const response = await client.resolveDiscrepancy(discrepancyId, {
          action,
          note,
          matchToTransactionId: options.matchTo,
        });

        spinner.stop();

        if (!response.success) {
          printError('Failed to resolve discrepancy');
          return;
        }

        printSuccess('Discrepancy resolved successfully');
      });
    });
}
