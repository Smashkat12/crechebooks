/**
 * SARS Compliance Commands
 *
 * cb sars vat201 generate     - Generate VAT201 return
 * cb sars vat201 download     - Download VAT201 CSV
 * cb sars vat201 submit       - Mark VAT201 as submitted
 * cb sars emp201 generate     - Generate EMP201 return
 * cb sars emp201 download     - Download EMP201 CSV
 * cb sars emp201 submit       - Mark EMP201 as submitted
 * cb sars emp501 generate     - Generate EMP501 reconciliation
 * cb sars emp501 download     - Download EMP501 CSV
 * cb sars submissions         - List all SARS submissions
 * cb sars deadlines           - Show upcoming deadlines
 *
 * IMPORTANT: L2 Autonomy - All operations generate DRAFTS only.
 * User must review and manually upload to SARS eFiling portal.
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import ora from 'ora';
import chalk from 'chalk';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  formatTable,
  formatZAR,
  formatDate,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  SarsSubmission,
  SarsDeadline,
  OutputFormat,
} from '../../types/index.js';

// L2 Autonomy Warning - shown for all SARS generation commands
const L2_WARNING = chalk.yellow(`
  ============================================================
  L2 AUTONOMY WARNING: DRAFT ONLY - REVIEW REQUIRED
  ============================================================
  This generates a DRAFT for your review. Before submission:
  1. Review all figures carefully
  2. Verify against your accounting records
  3. Download the CSV file
  4. Upload manually to SARS eFiling portal
  ============================================================
`);

export function registerSarsCommands(program: Command): void {
  const sars = program
    .command('sars')
    .description('SARS compliance and tax submissions');

  // ============================================
  // VAT201 Commands
  // ============================================
  const vat201 = sars
    .command('vat201')
    .description('VAT201 return management');

  // VAT201 Generate
  vat201
    .command('generate')
    .description('Generate VAT201 return for a period')
    .requiredOption('--period-start <date>', 'Period start date (YYYY-MM-DD)')
    .requiredOption('--period-end <date>', 'Period end date (YYYY-MM-DD)')
    .option('--dry-run', 'Preview calculation without creating record')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        console.log(L2_WARNING);

        const spinner = ora('Calculating VAT201 return...').start();

        const response = await client.generateVat201({
          periodStart: options.periodStart,
          periodEnd: options.periodEnd,
          dryRun: options.dryRun,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate VAT201');
          return;
        }

        const vat201Data = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(vat201Data));
          return;
        }

        printSummary(`VAT201 Return - ${options.periodStart} to ${options.periodEnd}`, {
          'Status': vat201Data.status,
          'Output VAT (Sales)': formatZAR(vat201Data.output_vat_cents),
          'Input VAT (Purchases)': formatZAR(vat201Data.input_vat_cents),
          'Net VAT': formatZAR(vat201Data.net_vat_cents),
          'Direction': vat201Data.is_payable ? 'PAYABLE to SARS' : 'REFUND from SARS',
          'Flagged Items': vat201Data.flagged_items_count,
        });

        if (vat201Data.flagged_items_count > 0) {
          printWarning(`${vat201Data.flagged_items_count} transactions need review before submission.`);
          console.log('\nFlagged items:');
          vat201Data.flagged_items.slice(0, 5).forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.description} - ${item.reason}`);
          });
          if (vat201Data.flagged_items.length > 5) {
            console.log(`  ... and ${vat201Data.flagged_items.length - 5} more`);
          }
        }

        if (options.dryRun) {
          printInfo('Dry run - no record created');
        } else {
          printSuccess(`VAT201 draft created: ${vat201Data.id}`);
          printInfo(`Download with: cb sars vat201 download --period ${options.periodStart.slice(0, 7)}`);
        }

        printWarning('Review required before submission to SARS eFiling portal.');
      });
    });

  // VAT201 Download
  vat201
    .command('download')
    .description('Download VAT201 CSV for SARS eFiling')
    .requiredOption('--period <YYYY-MM>', 'VAT period (e.g., 2025-01)')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Downloading VAT201 CSV...').start();

        try {
          const csvBuffer = await client.downloadVat201Csv(options.period);
          const outputPath = options.output || `vat201-${options.period}.csv`;

          fs.writeFileSync(outputPath, csvBuffer);
          spinner.succeed(`Downloaded to ${outputPath}`);

          printInfo('Upload this file to SARS eFiling portal.');
        } catch (error) {
          spinner.fail('Failed to download VAT201');
          throw error;
        }
      });
    });

  // VAT201 Submit (mark as submitted)
  vat201
    .command('submit <id>')
    .description('Mark VAT201 as submitted with SARS reference')
    .requiredOption('--reference <sars-ref>', 'SARS submission reference number')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Updating submission status...').start();

        const response = await client.markSarsSubmitted({
          submissionId: id,
          submissionType: 'VAT201',
          sarsReference: options.reference,
        });

        spinner.stop();

        if (!response.success) {
          printError('Failed to update submission status');
          return;
        }

        printSuccess(`VAT201 marked as submitted`);
        printSummary('Submission Details', {
          'ID': id,
          'SARS Reference': options.reference,
          'Status': 'SUBMITTED',
          'Submitted At': new Date().toISOString(),
        });
      });
    });

  // ============================================
  // EMP201 Commands
  // ============================================
  const emp201 = sars
    .command('emp201')
    .description('EMP201 monthly employer declaration');

  // EMP201 Generate
  emp201
    .command('generate')
    .description('Generate EMP201 for a month')
    .requiredOption('--month <YYYY-MM>', 'Tax month (e.g., 2025-01)')
    .option('--dry-run', 'Preview calculation without creating record')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        console.log(L2_WARNING);

        const spinner = ora('Calculating EMP201...').start();

        const response = await client.generateEmp201({
          month: options.month,
          dryRun: options.dryRun,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate EMP201');
          return;
        }

        const emp201Data = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(emp201Data));
          return;
        }

        printSummary(`EMP201 - ${options.month}`, {
          'Status': emp201Data.status,
          'Employee Count': emp201Data.employee_count,
          'Gross Remuneration': formatZAR(emp201Data.total_gross_remuneration_cents),
          'PAYE': formatZAR(emp201Data.total_paye_cents),
          'UIF': formatZAR(emp201Data.total_uif_cents),
          'SDL': formatZAR(emp201Data.total_sdl_cents),
          'Total Due': formatZAR(emp201Data.total_due_cents),
        });

        if (options.dryRun) {
          printInfo('Dry run - no record created');
        } else {
          printSuccess(`EMP201 draft created: ${emp201Data.id}`);
          printInfo(`Download with: cb sars emp201 download --tax-year ${options.month.slice(0, 4)} --period ${parseInt(options.month.slice(5, 7), 10)}`);
        }

        printWarning('Review required before submission to SARS eFiling portal.');
      });
    });

  // EMP201 Download
  emp201
    .command('download')
    .description('Download EMP201 CSV for SARS eFiling')
    .requiredOption('--tax-year <YYYY>', 'Tax year')
    .requiredOption('--period <1-12>', 'Period number (1-12)')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const period = parseInt(options.period, 10);
        if (period < 1 || period > 12) {
          printError('Period must be between 1 and 12');
          return;
        }

        const spinner = ora('Downloading EMP201 CSV...').start();

        try {
          const csvBuffer = await client.downloadEmp201Csv(options.taxYear, period);
          const outputPath = options.output || `emp201-${options.taxYear}-P${String(period).padStart(2, '0')}.csv`;

          fs.writeFileSync(outputPath, csvBuffer);
          spinner.succeed(`Downloaded to ${outputPath}`);

          printInfo('Upload this file to SARS eFiling portal.');
        } catch (error) {
          spinner.fail('Failed to download EMP201');
          throw error;
        }
      });
    });

  // EMP201 Submit
  emp201
    .command('submit <id>')
    .description('Mark EMP201 as submitted with SARS reference')
    .requiredOption('--reference <sars-ref>', 'SARS submission reference number')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Updating submission status...').start();

        const response = await client.markSarsSubmitted({
          submissionId: id,
          submissionType: 'EMP201',
          sarsReference: options.reference,
        });

        spinner.stop();

        if (!response.success) {
          printError('Failed to update submission status');
          return;
        }

        printSuccess(`EMP201 marked as submitted`);
        printSummary('Submission Details', {
          'ID': id,
          'SARS Reference': options.reference,
          'Status': 'SUBMITTED',
        });
      });
    });

  // ============================================
  // EMP501 Commands
  // ============================================
  const emp501 = sars
    .command('emp501')
    .description('EMP501 annual reconciliation');

  // EMP501 Generate
  emp501
    .command('generate')
    .description('Generate EMP501 annual reconciliation')
    .requiredOption('--tax-year-start <date>', 'Tax year start (YYYY-MM-DD, typically March 1)')
    .requiredOption('--tax-year-end <date>', 'Tax year end (YYYY-MM-DD, typically end of February)')
    .option('--dry-run', 'Preview calculation without creating record')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        console.log(L2_WARNING);

        const spinner = ora('Calculating EMP501 annual reconciliation...').start();

        const response = await client.generateEmp501({
          taxYearStart: options.taxYearStart,
          taxYearEnd: options.taxYearEnd,
          dryRun: options.dryRun,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate EMP501');
          return;
        }

        const emp501Data = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(emp501Data));
          return;
        }

        printSummary(`EMP501 Annual Reconciliation`, {
          'Tax Year': `${options.taxYearStart} to ${options.taxYearEnd}`,
          'Status': emp501Data.status,
          'Total Employees': emp501Data.total_employee_count,
          'Total Gross Remuneration': formatZAR(emp501Data.total_gross_remuneration_cents),
          'Total PAYE Declared': formatZAR(emp501Data.total_paye_declared_cents),
          'Total PAYE Paid': formatZAR(emp501Data.total_paye_paid_cents),
          'Variance': formatZAR(emp501Data.variance_cents),
          'IRP5 Certificates': emp501Data.irp5_count,
        });

        if (emp501Data.variance_cents !== 0) {
          const varianceType = emp501Data.variance_cents > 0 ? 'underpaid' : 'overpaid';
          printWarning(`PAYE ${varianceType} by ${formatZAR(Math.abs(emp501Data.variance_cents))}`);
        }

        if (options.dryRun) {
          printInfo('Dry run - no record created');
        } else {
          printSuccess(`EMP501 draft created: ${emp501Data.id}`);
        }

        printWarning('Review required before submission to SARS eFiling portal.');
      });
    });

  // EMP501 Download
  emp501
    .command('download')
    .description('Download EMP501 CSV for SARS eFiling')
    .requiredOption('--tax-year <YYYY>', 'Tax year (ending year, e.g., 2025 for Mar 2024 - Feb 2025)')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Downloading EMP501 CSV...').start();

        try {
          const csvBuffer = await client.downloadEmp501Csv(options.taxYear);
          const outputPath = options.output || `emp501-${options.taxYear}.csv`;

          fs.writeFileSync(outputPath, csvBuffer);
          spinner.succeed(`Downloaded to ${outputPath}`);

          printInfo('Upload this file to SARS eFiling portal.');
        } catch (error) {
          spinner.fail('Failed to download EMP501');
          throw error;
        }
      });
    });

  // ============================================
  // Submissions List
  // ============================================
  sars
    .command('submissions')
    .description('List all SARS submissions')
    .option('-t, --type <type>', 'Filter by type: VAT201, EMP201, EMP501')
    .option('-s, --status <status>', 'Filter by status: DRAFT, READY, SUBMITTED, FINALIZED')
    .option('--tax-year <YYYY>', 'Filter by tax year')
    .option('-l, --limit <n>', 'Limit results', '20')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching SARS submissions...').start();

        const response = await client.listSarsSubmissions({
          type: options.type,
          status: options.status,
          taxYear: options.taxYear,
          limit: parseInt(options.limit, 10),
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch submissions');
          return;
        }

        const submissions = response.data;
        const format = globalOpts?.format || 'table';

        if (submissions.length === 0) {
          printInfo('No submissions found');
          return;
        }

        if (format === 'json') {
          console.log(formatJson(submissions));
          return;
        }

        console.log(formatSarsSubmissions(submissions, format));

        // Summary by status
        const draftCount = submissions.filter(s => s.status === 'DRAFT').length;
        const submittedCount = submissions.filter(s => s.status === 'SUBMITTED').length;
        if (draftCount > 0) {
          printWarning(`${draftCount} submission(s) pending review`);
        }
        if (submittedCount > 0) {
          printInfo(`${submittedCount} submission(s) completed`);
        }
      });
    });

  // ============================================
  // Deadlines
  // ============================================
  sars
    .command('deadlines')
    .description('Show upcoming SARS deadlines')
    .option('--all', 'Show all deadlines including past')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching SARS deadlines...').start();

        const response = await client.getSarsDeadlines({
          includeAll: options.all,
        });

        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch deadlines');
          return;
        }

        const deadlines = response.data;
        const format = globalOpts?.format || 'table';

        if (deadlines.length === 0) {
          printInfo('No upcoming deadlines');
          return;
        }

        if (format === 'json') {
          console.log(formatJson(deadlines));
          return;
        }

        console.log(formatSarsDeadlines(deadlines));

        // Highlight urgent deadlines
        const now = new Date();
        const urgentDeadlines = deadlines.filter(d => {
          const deadline = new Date(d.deadline);
          const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntil <= 7 && daysUntil >= 0;
        });

        if (urgentDeadlines.length > 0) {
          console.log();
          printWarning(`${urgentDeadlines.length} deadline(s) within 7 days!`);
        }
      });
    });
}

// ============================================
// Formatting Helpers
// ============================================

function formatSarsSubmissions(submissions: SarsSubmission[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(submissions);
  }

  const headers = ['Type', 'Period', 'Status', 'Amount Due', 'SARS Ref', 'Created'];
  const rows = submissions.map((s) => [
    s.submission_type,
    s.period_display,
    formatSubmissionStatus(s.status),
    formatZAR(s.amount_due_cents),
    s.sars_reference || '-',
    formatDate(s.created_at),
  ]);

  return formatTable(headers, rows);
}

function formatSubmissionStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    DRAFT: chalk.yellow,
    READY: chalk.blue,
    SUBMITTED: chalk.green,
    FINALIZED: chalk.green,
    REJECTED: chalk.red,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}

function formatSarsDeadlines(deadlines: SarsDeadline[]): string {
  const headers = ['Type', 'Period', 'Deadline', 'Days Left', 'Status'];
  const now = new Date();

  const rows = deadlines.map((d) => {
    const deadline = new Date(d.deadline);
    const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let daysDisplay: string;
    let statusDisplay: string;

    if (daysUntil < 0) {
      daysDisplay = chalk.red(`${Math.abs(daysUntil)}d overdue`);
      statusDisplay = d.submitted ? chalk.green('SUBMITTED') : chalk.red('OVERDUE');
    } else if (daysUntil === 0) {
      daysDisplay = chalk.red('TODAY');
      statusDisplay = d.submitted ? chalk.green('SUBMITTED') : chalk.red('DUE TODAY');
    } else if (daysUntil <= 7) {
      daysDisplay = chalk.yellow(`${daysUntil}d`);
      statusDisplay = d.submitted ? chalk.green('SUBMITTED') : chalk.yellow('UPCOMING');
    } else {
      daysDisplay = chalk.dim(`${daysUntil}d`);
      statusDisplay = d.submitted ? chalk.green('SUBMITTED') : chalk.dim('PENDING');
    }

    return [
      d.submission_type,
      d.period_display,
      formatDate(d.deadline),
      daysDisplay,
      statusDisplay,
    ];
  });

  return formatTable(headers, rows);
}
