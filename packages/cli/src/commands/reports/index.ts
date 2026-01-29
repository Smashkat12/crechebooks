/**
 * Report Commands
 *
 * cb reports arrears         - Arrears dashboard
 * cb reports arrears --export - Export arrears to CSV
 * cb reports financial       - Financial reports (income/expense/pnl)
 * cb reports audit-log       - Audit log export
 * cb reports aging           - Accounts receivable aging report
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
  formatCsv,
  formatZAR,
  formatDate,
  formatTable,
  printSummary,
  printError,
  printInfo,
  printSuccess,
  printWarning,
} from '../../lib/output.js';
import type { GlobalOptions } from '../../types/index.js';
import type {
  ArrearsReport,
  FinancialReport,
  FinancialReportType,
  AuditLogEntry,
  AgingReport,
} from '../../types/reports.js';

export function registerReportCommands(program: Command): void {
  const reports = program
    .command('reports')
    .description('Financial and operational reports');

  // Arrears report
  reports
    .command('arrears')
    .description('View arrears dashboard')
    .option('--export', 'Export to CSV')
    .option('-o, --output <path>', 'Output file path (for export)')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Generating arrears report...').start();
        const response = await client.getArrearsReport();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate arrears report');
          return;
        }

        const report = response.data;
        const format = globalOpts?.format || 'table';

        if (options.export) {
          const csvData = formatArrearsCsv(report);
          const outputPath = options.output || `arrears-report-${new Date().toISOString().slice(0, 10)}.csv`;
          fs.writeFileSync(outputPath, csvData);
          printSuccess(`Exported arrears report to ${outputPath}`);
          return;
        }

        if (format === 'json') {
          console.log(formatJson(report));
          return;
        }

        displayArrearsReport(report);
      });
    });

  // Financial report
  reports
    .command('financial')
    .description('Generate financial reports')
    .requiredOption(
      '--type <type>',
      'Report type: income, expense, pnl',
    )
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--export', 'Export to CSV')
    .option('-o, --output <path>', 'Output file path (for export)')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const reportType = options.type as FinancialReportType;
        if (!['income', 'expense', 'pnl'].includes(reportType)) {
          printError('Invalid report type. Use: income, expense, or pnl');
          return;
        }

        const spinner = ora(`Generating ${reportType} report...`).start();
        const response = await client.getFinancialReport({
          type: reportType,
          from: options.from,
          to: options.to,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate financial report');
          return;
        }

        const report = response.data;
        const format = globalOpts?.format || 'table';

        if (options.export) {
          const csvData = formatFinancialCsv(report);
          const outputPath = options.output || `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
          fs.writeFileSync(outputPath, csvData);
          printSuccess(`Exported ${reportType} report to ${outputPath}`);
          return;
        }

        if (format === 'json') {
          console.log(formatJson(report));
          return;
        }

        displayFinancialReport(report, reportType);
      });
    });

  // Audit log export
  reports
    .command('audit-log')
    .description('Export audit log entries')
    .option('--from <date>', 'Start date (YYYY-MM-DD)', getDefaultFromDate())
    .option('--to <date>', 'End date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    .option('--entity <type>', 'Filter by entity type (invoice, payment, enrollment, etc.)')
    .option('--action <action>', 'Filter by action (create, update, delete)')
    .option('--export', 'Export to CSV')
    .option('-o, --output <path>', 'Output file path (for export)')
    .option('-l, --limit <n>', 'Limit results', '100')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching audit log...').start();
        const response = await client.getAuditLog({
          from: options.from,
          to: options.to,
          entityType: options.entity,
          action: options.action,
          limit: parseInt(options.limit, 10),
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch audit log');
          return;
        }

        const entries = response.data;
        const format = globalOpts?.format || 'table';

        if (entries.length === 0) {
          printInfo('No audit log entries found for the specified criteria');
          return;
        }

        if (options.export) {
          const csvData = formatAuditLogCsv(entries);
          const outputPath = options.output || `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
          fs.writeFileSync(outputPath, csvData);
          printSuccess(`Exported ${entries.length} audit log entries to ${outputPath}`);
          return;
        }

        if (format === 'json') {
          console.log(formatJson(entries));
          return;
        }

        displayAuditLog(entries);
      });
    });

  // Aging report
  reports
    .command('aging')
    .description('Accounts receivable aging report')
    .option('--export', 'Export to CSV')
    .option('-o, --output <path>', 'Output file path (for export)')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Generating aging report...').start();
        const response = await client.getAgingReport();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to generate aging report');
          return;
        }

        const report = response.data;
        const format = globalOpts?.format || 'table';

        if (options.export) {
          const csvData = formatAgingCsv(report);
          const outputPath = options.output || `aging-report-${new Date().toISOString().slice(0, 10)}.csv`;
          fs.writeFileSync(outputPath, csvData);
          printSuccess(`Exported aging report to ${outputPath}`);
          return;
        }

        if (format === 'json') {
          console.log(formatJson(report));
          return;
        }

        displayAgingReport(report);
      });
    });
}

/**
 * Get default from date (30 days ago)
 */
function getDefaultFromDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

/**
 * Display arrears report
 */
function displayArrearsReport(report: ArrearsReport): void {
  console.log();
  console.log(chalk.bold.red('Arrears Report'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Summary
  printSummary('Total Outstanding', {
    'Total Arrears': formatZAR(report.total_outstanding_cents),
    'Accounts in Arrears': report.top_debtors.length,
  });

  // Aging buckets
  console.log(chalk.bold('Aging Breakdown'));
  const agingHeaders = ['Period', 'Amount', 'Percentage'];
  const agingRows = [
    ['Current (0-30 days)', formatZAR(report.aging_buckets.current_cents), formatBucketPercent(report.aging_buckets.current_cents, report.total_outstanding_cents)],
    ['31-60 days', formatZAR(report.aging_buckets.days_30_cents), formatBucketPercent(report.aging_buckets.days_30_cents, report.total_outstanding_cents)],
    ['61-90 days', formatZAR(report.aging_buckets.days_60_cents), formatBucketPercent(report.aging_buckets.days_60_cents, report.total_outstanding_cents)],
    ['90+ days', formatZAR(report.aging_buckets.days_90_cents), formatBucketPercent(report.aging_buckets.days_90_cents, report.total_outstanding_cents)],
  ];
  console.log(formatTable(agingHeaders, agingRows));

  // Top debtors
  if (report.top_debtors.length > 0) {
    console.log(chalk.bold('Top Debtors'));
    const debtorHeaders = ['Name', 'Email', 'Outstanding', 'Oldest Invoice', 'Days Overdue'];
    const debtorRows = report.top_debtors.slice(0, 10).map((debtor) => [
      truncate(debtor.name, 20),
      truncate(debtor.email, 25),
      formatZAR(debtor.outstanding_cents),
      debtor.oldest_invoice_date ? formatDate(debtor.oldest_invoice_date) : '-',
      formatDaysOverdue(debtor.max_days_overdue),
    ]);
    console.log(formatTable(debtorHeaders, debtorRows));

    if (report.top_debtors.length > 10) {
      printInfo(`Showing 10 of ${report.top_debtors.length} accounts in arrears`);
    }
  } else {
    printSuccess('No accounts in arrears');
  }
}

/**
 * Display financial report
 */
function displayFinancialReport(report: FinancialReport, type: FinancialReportType): void {
  const title = {
    income: 'Income Statement',
    expense: 'Expense Report',
    pnl: 'Profit & Loss Statement',
  }[type];

  console.log();
  console.log(chalk.bold.cyan(title));
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  printSummary('Period', {
    'From': formatDate(report.period_from),
    'To': formatDate(report.period_to),
  });

  if (type === 'income' || type === 'pnl') {
    console.log(chalk.bold('Income'));
    const incomeHeaders = ['Category', 'Amount'];
    const incomeRows = report.income_categories.map((cat) => [
      cat.category,
      formatZAR(cat.amount_cents),
    ]);
    console.log(formatTable(incomeHeaders, incomeRows));
    console.log(`  ${chalk.bold('Total Income:')} ${chalk.green(formatZAR(report.total_income_cents))}`);
    console.log();
  }

  if (type === 'expense' || type === 'pnl') {
    console.log(chalk.bold('Expenses'));
    const expenseHeaders = ['Category', 'Amount'];
    const expenseRows = report.expense_categories.map((cat) => [
      cat.category,
      formatZAR(cat.amount_cents),
    ]);
    console.log(formatTable(expenseHeaders, expenseRows));
    console.log(`  ${chalk.bold('Total Expenses:')} ${chalk.red(formatZAR(report.total_expenses_cents))}`);
    console.log();
  }

  if (type === 'pnl') {
    const netProfit = report.total_income_cents - report.total_expenses_cents;
    const netLabel = netProfit >= 0 ? 'Net Profit' : 'Net Loss';
    const netColor = netProfit >= 0 ? chalk.green : chalk.red;
    console.log(chalk.bold(`${netLabel}: ${netColor(formatZAR(Math.abs(netProfit)))}`));
    console.log();
  }
}

/**
 * Display audit log
 */
function displayAuditLog(entries: AuditLogEntry[]): void {
  console.log();
  console.log(chalk.bold('Audit Log'));
  console.log(chalk.dim('─'.repeat(80)));
  console.log();

  const headers = ['Timestamp', 'User', 'Action', 'Entity', 'Entity ID'];
  const rows = entries.map((entry) => [
    formatDate(entry.timestamp),
    truncate(entry.user_email || entry.user_id, 20),
    formatAction(entry.action),
    entry.entity_type,
    truncate(entry.entity_id, 15),
  ]);

  console.log(formatTable(headers, rows));
  printInfo(`Showing ${entries.length} entries`);
}

/**
 * Display aging report
 */
function displayAgingReport(report: AgingReport): void {
  console.log();
  console.log(chalk.bold.yellow('Accounts Receivable Aging'));
  console.log(chalk.dim('─'.repeat(70)));
  console.log();

  printSummary('Summary', {
    'Total Outstanding': formatZAR(report.total_outstanding_cents),
    'Total Accounts': report.accounts.length,
    'Average Days Outstanding': Math.round(report.average_days_outstanding),
  });

  // Aging summary by bucket
  console.log(chalk.bold('Aging Summary'));
  const summaryHeaders = ['Bucket', 'Amount', 'Accounts', '% of Total'];
  const summaryRows = [
    ['Current', formatZAR(report.buckets.current.amount_cents), String(report.buckets.current.count), formatBucketPercent(report.buckets.current.amount_cents, report.total_outstanding_cents)],
    ['1-30 Days', formatZAR(report.buckets.days_1_30.amount_cents), String(report.buckets.days_1_30.count), formatBucketPercent(report.buckets.days_1_30.amount_cents, report.total_outstanding_cents)],
    ['31-60 Days', formatZAR(report.buckets.days_31_60.amount_cents), String(report.buckets.days_31_60.count), formatBucketPercent(report.buckets.days_31_60.amount_cents, report.total_outstanding_cents)],
    ['61-90 Days', formatZAR(report.buckets.days_61_90.amount_cents), String(report.buckets.days_61_90.count), formatBucketPercent(report.buckets.days_61_90.amount_cents, report.total_outstanding_cents)],
    ['90+ Days', formatZAR(report.buckets.days_over_90.amount_cents), String(report.buckets.days_over_90.count), formatBucketPercent(report.buckets.days_over_90.amount_cents, report.total_outstanding_cents)],
  ];
  console.log(formatTable(summaryHeaders, summaryRows));

  // Detailed accounts
  if (report.accounts.length > 0) {
    console.log(chalk.bold('Account Details'));
    const accountHeaders = ['Parent', 'Current', '1-30', '31-60', '61-90', '90+', 'Total'];
    const accountRows = report.accounts.slice(0, 15).map((acc) => [
      truncate(acc.parent_name, 18),
      formatZAR(acc.current_cents),
      formatZAR(acc.days_1_30_cents),
      formatZAR(acc.days_31_60_cents),
      formatZAR(acc.days_61_90_cents),
      formatZAR(acc.days_over_90_cents),
      formatZAR(acc.total_cents),
    ]);
    console.log(formatTable(accountHeaders, accountRows));

    if (report.accounts.length > 15) {
      printInfo(`Showing 15 of ${report.accounts.length} accounts. Use --export for full data.`);
    }
  }

  // Warnings for severely overdue accounts
  const severelyOverdue = report.accounts.filter((a) => a.days_over_90_cents > 0);
  if (severelyOverdue.length > 0) {
    console.log();
    printWarning(`${severelyOverdue.length} accounts have balances over 90 days overdue`);
  }
}

/**
 * Format arrears report as CSV
 */
function formatArrearsCsv(report: ArrearsReport): string {
  const rows = report.top_debtors.map((debtor) => ({
    name: debtor.name,
    email: debtor.email,
    phone: debtor.phone || '',
    outstanding_cents: debtor.outstanding_cents,
    oldest_invoice_date: debtor.oldest_invoice_date || '',
    max_days_overdue: debtor.max_days_overdue,
  }));
  return formatCsv(rows);
}

/**
 * Format financial report as CSV
 */
function formatFinancialCsv(report: FinancialReport): string {
  const rows: Array<{ type: string; category: string; amount_cents: number }> = [];

  for (const cat of report.income_categories) {
    rows.push({ type: 'income', category: cat.category, amount_cents: cat.amount_cents });
  }

  for (const cat of report.expense_categories) {
    rows.push({ type: 'expense', category: cat.category, amount_cents: cat.amount_cents });
  }

  return formatCsv(rows);
}

/**
 * Format audit log as CSV
 */
function formatAuditLogCsv(entries: AuditLogEntry[]): string {
  const rows = entries.map((entry) => ({
    timestamp: entry.timestamp,
    user_id: entry.user_id,
    user_email: entry.user_email || '',
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    changes: JSON.stringify(entry.changes || {}),
  }));
  return formatCsv(rows);
}

/**
 * Format aging report as CSV
 */
function formatAgingCsv(report: AgingReport): string {
  const rows = report.accounts.map((acc) => ({
    parent_id: acc.parent_id,
    parent_name: acc.parent_name,
    parent_email: acc.parent_email,
    current_cents: acc.current_cents,
    days_1_30_cents: acc.days_1_30_cents,
    days_31_60_cents: acc.days_31_60_cents,
    days_61_90_cents: acc.days_61_90_cents,
    days_over_90_cents: acc.days_over_90_cents,
    total_cents: acc.total_cents,
  }));
  return formatCsv(rows);
}

/**
 * Format bucket percentage
 */
function formatBucketPercent(amount: number, total: number): string {
  if (total === 0) return '0%';
  return `${((amount / total) * 100).toFixed(1)}%`;
}

/**
 * Format days overdue with color
 */
function formatDaysOverdue(days: number): string {
  if (days <= 0) return chalk.green('Current');
  if (days <= 30) return chalk.yellow(`${days} days`);
  if (days <= 60) return chalk.hex('#FFA500')(`${days} days`);
  return chalk.red(`${days} days`);
}

/**
 * Format action with color
 */
function formatAction(action: string): string {
  const colors: Record<string, (s: string) => string> = {
    create: chalk.green,
    update: chalk.yellow,
    delete: chalk.red,
  };
  const colorFn = colors[action.toLowerCase()] || chalk.white;
  return colorFn(action.toUpperCase());
}

/**
 * Truncate string
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
