/**
 * Transaction Commands
 *
 * cb transactions list              - List transactions
 * cb transactions import <file>     - Import bank statement
 * cb transactions export            - Export to CSV
 * cb transactions categorize <id>   - Categorize single transaction
 * cb transactions categorize --batch - Batch AI categorization
 * cb transactions suggestions <id>  - Get AI suggestions
 * cb transactions split <id>        - Create split transaction
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatTransactions,
  formatCategorizationSuggestions,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
  formatZAR,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  TransactionStatus,
  ListTransactionsOptions,
} from '../../types/index.js';

export function registerTransactionCommands(program: Command): void {
  const transactions = program
    .command('transactions')
    .description('Transaction management and categorization');

  // List command
  transactions
    .command('list')
    .description('List transactions')
    .option('-s, --status <status>', 'Filter by status (PENDING, CATEGORIZED, RECONCILED)')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .option('--reconciled', 'Show only reconciled transactions')
    .option('--unreconciled', 'Show only unreconciled transactions')
    .option('--account <id>', 'Filter by bank account ID')
    .option('--category <code>', 'Filter by category code')
    .option('--min-amount <cents>', 'Minimum amount in cents')
    .option('--max-amount <cents>', 'Maximum amount in cents')
    .option('--credit', 'Show only credits (incoming)')
    .option('--debit', 'Show only debits (outgoing)')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching transactions...').start();

        const listOptions: ListTransactionsOptions = {
          status: options.status as TransactionStatus | undefined,
          from: options.from,
          to: options.to,
          isReconciled: options.reconciled ? true : options.unreconciled ? false : undefined,
          accountId: options.account,
          categoryCode: options.category,
          minAmountCents: options.minAmount ? parseInt(options.minAmount, 10) : undefined,
          maxAmountCents: options.maxAmount ? parseInt(options.maxAmount, 10) : undefined,
          isCredit: options.credit ? true : options.debit ? false : undefined,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listTransactions(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch transactions');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No transactions found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatTransactions(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} transactions (page ${response.meta.page}/${response.meta.totalPages})`
          );

          // Show uncategorized count
          const uncategorized = response.data.filter((t) => t.status === 'PENDING').length;
          if (uncategorized > 0) {
            printWarning(`${uncategorized} transaction(s) need categorization`);
          }
        }
      });
    });

  // Import command
  transactions
    .command('import <file>')
    .description('Import transactions from bank statement (CSV or PDF)')
    .option('--account <id>', 'Target bank account ID')
    .option('--format <type>', 'File format: csv, pdf, ofx, mt940', 'auto')
    .option('--dry-run', 'Preview import without saving')
    .option('--skip-duplicates', 'Skip transactions that already exist', true)
    .action(async (file, options) => {
      await executeAction(async () => {
        const filePath = path.resolve(file);

        if (!fs.existsSync(filePath)) {
          printError(`File not found: ${filePath}`);
          return;
        }

        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Reading file...').start();

        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const fileExtension = path.extname(filePath).toLowerCase().slice(1);
        const format = options.format === 'auto' ? fileExtension : options.format;

        spinner.text = 'Importing transactions...';

        const response = await client.importTransactions({
          file: fileBuffer.toString('base64'),
          fileName: path.basename(filePath),
          format,
          accountId: options.account,
          dryRun: options.dryRun,
          skipDuplicates: options.skipDuplicates,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to import transactions');
          return;
        }

        const { imported, duplicates, errors, transactions } = response.data;

        if (options.dryRun) {
          printInfo('Dry run - no transactions saved');
          console.log();
          console.log(chalk.bold('Would import:'));
        } else {
          printSuccess('Import completed');
        }

        printSummary('Import Results', {
          'Imported': imported,
          'Duplicates Skipped': duplicates,
          'Errors': errors,
          'Total in File': imported + duplicates + errors,
        });

        if (transactions.length > 0 && transactions.length <= 10) {
          console.log(chalk.bold('Imported Transactions:'));
          transactions.forEach((t) => {
            const sign = t.is_credit ? chalk.green('+') : chalk.red('-');
            console.log(`  ${sign} ${formatZAR(t.amount_cents)} - ${t.description.slice(0, 40)}`);
          });
          console.log();
        }

        if (errors > 0) {
          printWarning('Some transactions could not be imported. Check the file format.');
        }
      });
    });

  // Export command
  transactions
    .command('export')
    .description('Export transactions to CSV')
    .option('-o, --output <file>', 'Output file path', 'transactions.csv')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .option('-s, --status <status>', 'Filter by status')
    .option('--account <id>', 'Filter by bank account')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Exporting transactions...').start();

        const response = await client.exportTransactions({
          from: options.from,
          to: options.to,
          status: options.status as TransactionStatus | undefined,
          accountId: options.account,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to export transactions');
          return;
        }

        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, response.data.csv);

        printSuccess(`Exported ${response.data.count} transactions to ${outputPath}`);
      });
    });

  // Categorize single transaction
  transactions
    .command('categorize <id>')
    .description('Categorize a single transaction or run batch categorization')
    .option('--category <code>', 'Category code to assign')
    .option('--batch', 'Run batch AI categorization on all pending transactions')
    .option('--min-confidence <n>', 'Minimum confidence for auto-apply (0-1)', '0.85')
    .option('--dry-run', 'Preview categorizations without applying')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Batch mode
        if (options.batch) {
          const spinner = ora('Running batch AI categorization...').start();

          const response = await client.batchCategorize({
            minConfidence: parseFloat(options.minConfidence),
            dryRun: options.dryRun,
          });

          spinner.stop();

          if (!response.success || !response.data) {
            printError('Failed to run batch categorization');
            return;
          }

          const { total_processed, auto_categorized, needs_review, categories_used } = response.data;

          if (options.dryRun) {
            printInfo('Dry run - no changes applied');
          } else {
            printSuccess('Batch categorization completed');
          }

          printSummary('Categorization Results', {
            'Total Processed': total_processed,
            'Auto-categorized': auto_categorized,
            'Needs Review': needs_review,
            'Confidence Threshold': `${Math.round(parseFloat(options.minConfidence) * 100)}%`,
          });

          if (categories_used && Object.keys(categories_used).length > 0) {
            console.log(chalk.bold('Categories Applied:'));
            for (const [category, count] of Object.entries(categories_used)) {
              console.log(`  ${category}: ${count}`);
            }
            console.log();
          }

          return;
        }

        // Single transaction mode
        if (!options.category) {
          // Interactive category selection
          const suggestionsResponse = await client.getCategorizationSuggestions(id);

          if (!suggestionsResponse.success || !suggestionsResponse.data) {
            printError('Failed to get suggestions');
            return;
          }

          const suggestions = suggestionsResponse.data;

          if (suggestions.length === 0) {
            printInfo('No category suggestions available');

            // Prompt for manual entry
            const { category } = await inquirer.prompt([
              {
                type: 'input',
                name: 'category',
                message: 'Enter category code:',
              },
            ]);

            options.category = category;
          } else {
            console.log();
            console.log(formatCategorizationSuggestions(suggestions, 'table'));

            const choices = suggestions.map((s) => ({
              name: `${s.category_name} (${Math.round(s.confidence * 100)}% - ${s.reasoning})`,
              value: s.category_code,
              short: s.category_code,
            }));

            choices.push({ name: 'Enter manually', value: '__manual__', short: 'manual' });

            const { selected } = await inquirer.prompt([
              {
                type: 'list',
                name: 'selected',
                message: 'Select category:',
                choices,
              },
            ]);

            if (selected === '__manual__') {
              const { category } = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'category',
                  message: 'Enter category code:',
                },
              ]);
              options.category = category;
            } else {
              options.category = selected;
            }
          }
        }

        const spinner = ora('Categorizing transaction...').start();

        const response = await client.categorizeTransaction(id, {
          categoryCode: options.category,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to categorize transaction');
          return;
        }

        printSuccess(`Transaction categorized as ${options.category}`);
      });
    });

  // Suggestions command
  transactions
    .command('suggestions <id>')
    .description('Get AI categorization suggestions for a transaction')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Getting suggestions...').start();

        // First get the transaction details
        const txResponse = await client.getTransaction(id);

        if (!txResponse.success || !txResponse.data) {
          spinner.stop();
          printError('Transaction not found');
          return;
        }

        const transaction = txResponse.data;

        // Get suggestions
        const response = await client.getCategorizationSuggestions(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to get suggestions');
          return;
        }

        const suggestions = response.data;
        const format = globalOpts?.format || 'table';

        // Show transaction details
        console.log();
        printSummary('Transaction', {
          'Date': transaction.date,
          'Description': transaction.description,
          'Payee': transaction.payee_name || 'Unknown',
          'Amount': formatZAR(transaction.amount_cents),
          'Type': transaction.is_credit ? 'Credit' : 'Debit',
          'Reference': transaction.reference || '-',
        });

        if (suggestions.length === 0) {
          printInfo('No suggestions available for this transaction');
          return;
        }

        if (format === 'json') {
          console.log(formatJson(suggestions));
          return;
        }

        console.log(chalk.bold('AI Suggestions:'));
        console.log(formatCategorizationSuggestions(suggestions, format));

        // Show best match
        const bestMatch = suggestions[0];
        if (bestMatch.confidence >= 0.9) {
          printInfo(`High confidence match: ${bestMatch.category_name} (${Math.round(bestMatch.confidence * 100)}%)`);
          printInfo(`Apply with: cb transactions categorize ${id} --category ${bestMatch.category_code}`);
        }
      });
    });

  // Split command
  transactions
    .command('split <id>')
    .description('Split a transaction into multiple categorized parts')
    .option('--parts <json>', 'JSON array of split parts')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Get transaction first
        const txResponse = await client.getTransaction(id);

        if (!txResponse.success || !txResponse.data) {
          printError('Transaction not found');
          return;
        }

        const transaction = txResponse.data;

        printSummary('Transaction to Split', {
          'Description': transaction.description,
          'Amount': formatZAR(transaction.amount_cents),
          'Date': transaction.date,
        });

        let parts: Array<{ amount_cents: number; category_code: string; description?: string }>;

        if (options.parts) {
          try {
            parts = JSON.parse(options.parts);
          } catch {
            printError('Invalid JSON for --parts');
            return;
          }
        } else {
          // Interactive split
          parts = [];
          let remaining = transaction.amount_cents;

          while (remaining > 0) {
            console.log(chalk.dim(`Remaining: ${formatZAR(remaining)}`));

            const { amount, category, description, addMore } = await inquirer.prompt([
              {
                type: 'input',
                name: 'amount',
                message: 'Amount in cents:',
                validate: (v) => {
                  const n = parseInt(v, 10);
                  if (isNaN(n) || n <= 0) return 'Enter a positive number';
                  if (n > remaining) return `Amount cannot exceed ${formatZAR(remaining)}`;
                  return true;
                },
              },
              {
                type: 'input',
                name: 'category',
                message: 'Category code:',
                validate: (v) => v.length > 0 || 'Category required',
              },
              {
                type: 'input',
                name: 'description',
                message: 'Description (optional):',
              },
              {
                type: 'confirm',
                name: 'addMore',
                message: 'Add another split?',
                default: true,
                when: (answers) => {
                  const amt = parseInt(answers.amount, 10);
                  return amt < remaining;
                },
              },
            ]);

            const amountCents = parseInt(amount, 10);
            parts.push({
              amount_cents: amountCents,
              category_code: category,
              description: description || undefined,
            });

            remaining -= amountCents;

            if (!addMore) break;
          }

          // If remaining, create last part
          if (remaining > 0) {
            const { category, description } = await inquirer.prompt([
              {
                type: 'input',
                name: 'category',
                message: `Category for remaining ${formatZAR(remaining)}:`,
                validate: (v) => v.length > 0 || 'Category required',
              },
              {
                type: 'input',
                name: 'description',
                message: 'Description (optional):',
              },
            ]);

            parts.push({
              amount_cents: remaining,
              category_code: category,
              description: description || undefined,
            });
          }
        }

        // Validate total
        const total = parts.reduce((sum, p) => sum + p.amount_cents, 0);
        if (total !== transaction.amount_cents) {
          printError(`Split total (${formatZAR(total)}) does not match transaction amount (${formatZAR(transaction.amount_cents)})`);
          return;
        }

        const spinner = ora('Creating split transaction...').start();

        const response = await client.splitTransaction(id, { parts });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to split transaction');
          return;
        }

        printSuccess('Transaction split successfully');

        console.log(chalk.bold('Split Parts:'));
        response.data.parts.forEach((part, i) => {
          console.log(`  ${i + 1}. ${formatZAR(part.amount_cents)} - ${part.category_code}`);
        });
        console.log();
      });
    });
}
