/**
 * Invoice Commands
 *
 * cb invoices list        - List invoices
 * cb invoices get <id>    - Get invoice details
 * cb invoices generate    - Generate monthly invoices
 * cb invoices send        - Send invoices
 * cb invoices download    - Download invoice PDF
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import ora from 'ora';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatInvoices,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatZAR,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  ListInvoicesOptions,
  GenerateInvoicesOptions,
  SendInvoicesOptions,
  InvoiceStatus,
} from '../../types/index.js';

export function registerInvoiceCommands(program: Command): void {
  const invoices = program
    .command('invoices')
    .description('Invoice management');

  // List command
  invoices
    .command('list')
    .description('List invoices')
    .option('-s, --status <status>', 'Filter by status (DRAFT, SENT, PAID, OVERDUE, etc.)')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .option('--parent <id>', 'Filter by parent ID')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching invoices...').start();

        const listOptions: ListInvoicesOptions = {
          status: options.status as InvoiceStatus | undefined,
          from: options.from,
          to: options.to,
          parentId: options.parent,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listInvoices(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch invoices');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No invoices found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatInvoices(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} invoices (page ${response.meta.page}/${response.meta.totalPages})`,
          );
        }
      });
    });

  // Get command
  invoices
    .command('get <id>')
    .description('Get invoice details')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching invoice...').start();
        const response = await client.getInvoice(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Invoice not found');
          return;
        }

        const invoice = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(invoice));
          return;
        }

        // Pretty print invoice details
        printSummary(`Invoice ${invoice.invoice_number}`, {
          'Parent': invoice.parent_name,
          'Email': invoice.parent_email,
          'Issue Date': invoice.issue_date,
          'Due Date': invoice.due_date,
          'Status': invoice.status,
          'Subtotal': formatZAR(invoice.subtotal_cents),
          'VAT': formatZAR(invoice.vat_cents),
          'Total': formatZAR(invoice.total_cents),
          'Paid': formatZAR(invoice.amount_paid_cents),
          'Outstanding': formatZAR(invoice.outstanding_cents),
        });

        if (invoice.lines.length > 0) {
          console.log('Line Items:');
          invoice.lines.forEach((line, i) => {
            console.log(`  ${i + 1}. ${line.description}`);
            console.log(`     ${line.quantity} x ${formatZAR(line.unit_price_cents)} = ${formatZAR(line.total_cents)}`);
          });
          console.log();
        }
      });
    });

  // Generate command
  invoices
    .command('generate')
    .description('Generate monthly invoices for enrolled children')
    .requiredOption('-m, --month <YYYY-MM>', 'Billing month')
    .option('--child-ids <ids>', 'Comma-separated child IDs (generates for all if omitted)')
    .option('--dry-run', 'Preview without creating invoices')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const genOptions: GenerateInvoicesOptions = {
          month: options.month,
          childIds: options.childIds?.split(',').map((id: string) => id.trim()),
          dryRun: options.dryRun,
        };

        const mode = options.dryRun ? 'Preview' : 'Generating';
        const spinner = ora(`${mode} invoices for ${options.month}...`).start();

        const response = await client.generateInvoices(genOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate invoices');
          return;
        }

        const { invoices_created, invoices } = response.data;

        if (options.dryRun) {
          printInfo(`Would create ${invoices_created} invoices`);
        } else {
          printSuccess(`Created ${invoices_created} invoices`);
        }

        if (invoices.length > 0) {
          const totalCents = invoices.reduce((sum, inv) => sum + inv.total_cents, 0);
          printSummary('Generation Summary', {
            'Invoices Created': invoices_created,
            'Total Value': formatZAR(totalCents),
            'Billing Month': options.month,
          });
        }
      });
    });

  // Send command
  invoices
    .command('send')
    .description('Send invoices to parents')
    .option('--ids <ids>', 'Comma-separated invoice IDs')
    .option('--all', 'Send all unsent invoices')
    .option('--status <status>', 'Filter by status (used with --all)', 'DRAFT')
    .option('--method <method>', 'Delivery method: email, whatsapp, both', 'email')
    .action(async (options) => {
      await executeAction(async () => {
        if (!options.ids && !options.all) {
          printError('Specify --ids or --all');
          return;
        }

        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const sendOptions: SendInvoicesOptions = {
          ids: options.ids?.split(',').map((id: string) => id.trim()),
          all: options.all,
          status: options.status as InvoiceStatus,
          method: options.method,
        };

        const spinner = ora('Sending invoices...').start();
        const response = await client.sendInvoices(sendOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to send invoices');
          return;
        }

        const { sent_count, failed_count } = response.data;

        if (sent_count > 0) {
          printSuccess(`Sent ${sent_count} invoices via ${options.method}`);
        }

        if (failed_count > 0) {
          printError(`Failed to send ${failed_count} invoices`);
        }

        if (sent_count === 0 && failed_count === 0) {
          printInfo('No invoices to send');
        }
      });
    });

  // Catch-up command
  invoices
    .command('catch-up')
    .description('Generate missing invoices for historic enrollments')
    .option('--child-id <id>', 'Specific child ID (catches up all if omitted)')
    .option('--from <YYYY-MM>', 'Start from this month (defaults to enrollment start)')
    .option('--dry-run', 'Preview without creating invoices')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const childLabel = options.childId ? `child ${options.childId}` : 'all children';
        const mode = options.dryRun ? 'Previewing' : 'Generating';
        const spinner = ora(`${mode} catch-up invoices for ${childLabel}...`).start();

        if (options.dryRun) {
          spinner.info('Dry run mode — showing what would be generated');
          printInfo('Dry run is not yet supported for catch-up. Remove --dry-run to generate.');
          return;
        }

        const response = await client.catchUpInvoices({
          childId: options.childId,
          fromMonth: options.from,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate catch-up invoices');
          return;
        }

        const { total_generated, total_skipped, total_errors, children } = response.data;

        printSummary('Catch-Up Summary', {
          'Invoices Generated': total_generated,
          'Months Skipped (already invoiced)': total_skipped,
          'Errors': total_errors,
          'Children Processed': children.length,
        });

        if (children.length > 0) {
          console.log('\nPer-child breakdown:');
          for (const child of children) {
            const status = child.errors.length > 0 ? '⚠' : '✓';
            console.log(`  ${status} ${child.child_name} (${child.child_id})`);
            console.log(`    Generated: ${child.generated}, Skipped: ${child.skipped}`);
            if (child.errors.length > 0) {
              for (const err of child.errors) {
                console.log(`    Error: ${err}`);
              }
            }
          }
          console.log();
        }

        if (total_generated > 0) {
          printSuccess(`Generated ${total_generated} catch-up invoices`);
        } else if (total_errors === 0) {
          printInfo('All months already invoiced — nothing to catch up');
        }
      });
    });

  // Download command
  invoices
    .command('download <id>')
    .description('Download invoice PDF')
    .option('-o, --output <path>', 'Output file path')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Downloading invoice PDF...').start();

        try {
          const pdfBuffer = await client.downloadInvoicePdf(id);
          const outputPath = options.output || `invoice-${id}.pdf`;

          fs.writeFileSync(outputPath, pdfBuffer);
          spinner.succeed(`Downloaded to ${outputPath}`);
        } catch (error) {
          spinner.fail('Failed to download invoice');
          throw error;
        }
      });
    });
}
