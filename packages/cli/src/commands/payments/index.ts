/**
 * Payment Commands
 *
 * cb payments list        - List payments
 * cb payments get <id>    - Get payment details
 * cb payments match       - Run AI payment matching
 * cb payments allocate    - Allocate payment to invoice
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatPayments,
  formatPaymentMatches,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatZAR,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  ListPaymentsOptions,
  MatchPaymentsOptions,
  AllocatePaymentOptions,
} from '../../types/index.js';

export function registerPaymentCommands(program: Command): void {
  const payments = program
    .command('payments')
    .description('Payment processing');

  // List command
  payments
    .command('list')
    .description('List payments')
    .option('-u, --unallocated', 'Show only unallocated payments')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching payments...').start();

        const listOptions: ListPaymentsOptions = {
          unallocated: options.unallocated,
          from: options.from,
          to: options.to,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listPayments(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch payments');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No payments found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatPayments(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} payments (page ${response.meta.page}/${response.meta.totalPages})`,
          );
        }

        // Show unallocated summary
        if (!options.unallocated && format === 'table') {
          const unallocatedTotal = response.data.reduce(
            (sum, p) => sum + p.unallocated_cents,
            0,
          );
          if (unallocatedTotal > 0) {
            printInfo(
              `Total unallocated: ${chalk.yellow(formatZAR(unallocatedTotal))}`,
            );
          }
        }
      });
    });

  // Get command
  payments
    .command('get <id>')
    .description('Get payment details')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching payment...').start();
        const response = await client.getPayment(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Payment not found');
          return;
        }

        const payment = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(payment));
          return;
        }

        // Pretty print payment details
        printSummary(`Payment ${payment.id.slice(0, 8)}...`, {
          'Amount': formatZAR(payment.amount_cents),
          'Date': payment.payment_date,
          'Reference': payment.reference,
          'Source': payment.source,
          'Allocated': formatZAR(payment.allocated_cents),
          'Unallocated': formatZAR(payment.unallocated_cents),
        });

        if (payment.allocations.length > 0) {
          console.log('Allocations:');
          payment.allocations.forEach((alloc, i) => {
            console.log(
              `  ${i + 1}. ${alloc.invoice_number}: ${formatZAR(alloc.amount_cents)} (${alloc.allocated_at})`,
            );
          });
          console.log();
        }
      });
    });

  // Match command
  payments
    .command('match')
    .description('Run AI payment matching')
    .option('--dry-run', 'Preview matches without applying')
    .option('--min-confidence <n>', 'Minimum confidence threshold (0-1)', '0.8')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const matchOptions: MatchPaymentsOptions = {
          dryRun: options.dryRun,
          minConfidence: parseFloat(options.minConfidence),
        };

        const spinner = ora('Running AI payment matching...').start();
        const response = await client.matchPayments(matchOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to run payment matching');
          return;
        }

        const { matches, auto_applied, pending_review } = response.data;

        if (matches.length === 0) {
          printInfo('No payment matches found');
          return;
        }

        // Show matches
        console.log();
        console.log(chalk.bold('Payment Matches'));
        console.log(formatPaymentMatches(matches, 'table'));

        printSummary('Match Summary', {
          'Total Matches': matches.length,
          'Auto-applied': auto_applied,
          'Pending Review': pending_review,
          'Min Confidence': `${Math.round(matchOptions.minConfidence! * 100)}%`,
        });

        if (options.dryRun) {
          printInfo('Dry run - no changes applied');
        } else if (auto_applied > 0) {
          printSuccess(`Applied ${auto_applied} high-confidence matches`);
        }

        // Prompt for pending review matches
        if (!options.dryRun && pending_review > 0 && !options.yes) {
          const pendingMatches = matches.filter((m) => m.confidence < 0.9);

          for (const match of pendingMatches) {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: `Apply match: Payment ${match.payment_id.slice(0, 8)}... -> ${match.invoice_number} (${Math.round(match.confidence * 100)}% confidence)?`,
                default: false,
              },
            ]);

            if (confirm) {
              const allocateSpinner = ora('Allocating...').start();
              await client.allocatePayment({
                paymentId: match.payment_id,
                invoiceId: match.invoice_id,
                amountCents: match.amount_cents,
              });
              allocateSpinner.succeed(`Allocated to ${match.invoice_number}`);
            }
          }
        }
      });
    });

  // Allocate command
  payments
    .command('allocate')
    .description('Allocate payment to an invoice')
    .requiredOption('--payment <id>', 'Payment ID')
    .requiredOption('--invoice <id>', 'Invoice ID')
    .option('--amount <cents>', 'Amount in cents (defaults to full unallocated)')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const allocateOptions: AllocatePaymentOptions = {
          paymentId: options.payment,
          invoiceId: options.invoice,
          amountCents: options.amount ? parseInt(options.amount, 10) : undefined,
        };

        const spinner = ora('Allocating payment...').start();
        const response = await client.allocatePayment(allocateOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to allocate payment');
          return;
        }

        const payment = response.data;
        printSuccess('Payment allocated successfully');

        printSummary('Updated Payment', {
          'Payment ID': payment.id.slice(0, 8) + '...',
          'Total Amount': formatZAR(payment.amount_cents),
          'Now Allocated': formatZAR(payment.allocated_cents),
          'Remaining': formatZAR(payment.unallocated_cents),
        });
      });
    });
}
