/**
 * Dashboard Commands
 *
 * cb dashboard              - Quick summary (revenue, outstanding, enrollments)
 * cb dashboard metrics      - Detailed metrics for a period
 * cb dashboard trends       - Revenue/expense trends
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  formatZAR,
  printSummary,
  printError,
  printInfo,
  formatTable,
} from '../../lib/output.js';
import type { GlobalOptions } from '../../types/index.js';
import type {
  DashboardMetrics,
  DashboardTrends,
  MetricsPeriod,
} from '../../types/dashboard.js';

export function registerDashboardCommands(program: Command): void {
  const dashboard = program
    .command('dashboard')
    .description('Dashboard and metrics overview')
    .action(async (_, command) => {
      // Default action: show quick summary
      await executeAction(async () => {
        const globalOpts = command.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching dashboard summary...').start();
        const response = await client.getDashboardMetrics({ period: 'current_month' });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch dashboard metrics');
          return;
        }

        const metrics = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(metrics));
          return;
        }

        displayQuickSummary(metrics);
      });
    });

  // Detailed metrics command
  dashboard
    .command('metrics')
    .description('Get detailed metrics for a period')
    .option(
      '--period <period>',
      'Time period: current_month, last_quarter, ytd',
      'current_month',
    )
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const period = options.period as MetricsPeriod;
        const spinner = ora(`Fetching metrics for ${period}...`).start();
        const response = await client.getDashboardMetrics({ period });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch dashboard metrics');
          return;
        }

        const metrics = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(metrics));
          return;
        }

        displayDetailedMetrics(metrics, period);
      });
    });

  // Trends command
  dashboard
    .command('trends')
    .description('View revenue and expense trends')
    .option('--period <year>', 'Year for trends (YYYY)', new Date().getFullYear().toString())
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const year = parseInt(options.period, 10);
        const spinner = ora(`Fetching trends for ${year}...`).start();
        const response = await client.getDashboardTrends({ year });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch dashboard trends');
          return;
        }

        const trends = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(trends));
          return;
        }

        displayTrends(trends, year);
      });
    });
}

/**
 * Display quick dashboard summary
 */
function displayQuickSummary(metrics: DashboardMetrics): void {
  console.log();
  console.log(chalk.bold.cyan('CrecheBooks Dashboard'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log();

  // Revenue section
  console.log(chalk.bold('Revenue'));
  console.log(`  Invoiced:   ${chalk.green(formatZAR(metrics.total_revenue_cents))}`);
  console.log(`  Collected:  ${chalk.green(formatZAR(metrics.total_collected_cents))}`);
  console.log(`  Collection Rate: ${chalk.cyan(formatPercentage(metrics.total_collected_cents, metrics.total_revenue_cents))}`);
  console.log();

  // Arrears section
  console.log(chalk.bold('Arrears'));
  if (metrics.outstanding_arrears_cents > 0) {
    console.log(`  Outstanding: ${chalk.red(formatZAR(metrics.outstanding_arrears_cents))}`);
  } else {
    console.log(`  Outstanding: ${chalk.green(formatZAR(0))} (All accounts up to date)`);
  }
  console.log();

  // Enrollment section
  console.log(chalk.bold('Enrollments'));
  console.log(`  Active Children:  ${chalk.cyan(metrics.active_enrollments)}`);
  console.log(`  Parents:          ${chalk.cyan(metrics.parent_count)}`);
  console.log(`  Staff:            ${chalk.cyan(metrics.staff_count)}`);
  console.log();

  // AI metrics
  if (metrics.categorization_accuracy !== undefined) {
    console.log(chalk.bold('AI Performance'));
    console.log(`  Categorization Accuracy: ${chalk.cyan(formatPercent(metrics.categorization_accuracy))}`);
    console.log();
  }

  printInfo('Use "cb dashboard metrics --period <period>" for detailed breakdowns');
}

/**
 * Display detailed metrics
 */
function displayDetailedMetrics(metrics: DashboardMetrics, period: MetricsPeriod): void {
  const periodLabel = {
    current_month: 'Current Month',
    last_quarter: 'Last Quarter',
    ytd: 'Year to Date',
  }[period];

  printSummary(`Detailed Metrics - ${periodLabel}`, {
    'Total Invoiced': formatZAR(metrics.total_revenue_cents),
    'Total Collected': formatZAR(metrics.total_collected_cents),
    'Outstanding Arrears': formatZAR(metrics.outstanding_arrears_cents),
    'Collection Rate': formatPercentage(metrics.total_collected_cents, metrics.total_revenue_cents),
  });

  printSummary('Enrollment Counts', {
    'Active Enrollments': metrics.active_enrollments,
    'Total Parents': metrics.parent_count,
    'Total Staff': metrics.staff_count,
  });

  if (metrics.categorization_accuracy !== undefined) {
    printSummary('AI Performance', {
      'Categorization Accuracy': formatPercent(metrics.categorization_accuracy),
    });
  }
}

/**
 * Display trends
 */
function displayTrends(trends: DashboardTrends, year: number): void {
  console.log();
  console.log(chalk.bold.cyan(`Revenue & Expense Trends - ${year}`));
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  const headers = ['Month', 'Revenue', 'Expenses', 'Net'];
  const rows = trends.monthly_data.map((month) => [
    month.month,
    formatZAR(month.revenue_cents),
    formatZAR(month.expenses_cents),
    formatNetAmount(month.revenue_cents - month.expenses_cents),
  ]);

  console.log(formatTable(headers, rows));

  // Summary
  const totalRevenue = trends.monthly_data.reduce((sum, m) => sum + m.revenue_cents, 0);
  const totalExpenses = trends.monthly_data.reduce((sum, m) => sum + m.expenses_cents, 0);
  const netTotal = totalRevenue - totalExpenses;

  printSummary('Annual Summary', {
    'Total Revenue': formatZAR(totalRevenue),
    'Total Expenses': formatZAR(totalExpenses),
    'Net Profit/Loss': formatNetAmount(netTotal),
  });
}

/**
 * Format percentage from two values
 */
function formatPercentage(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  const percent = (numerator / denominator) * 100;
  return `${percent.toFixed(1)}%`;
}

/**
 * Format percentage from decimal
 */
function formatPercent(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`;
}

/**
 * Format net amount with color
 */
function formatNetAmount(cents: number): string {
  const formatted = formatZAR(Math.abs(cents));
  if (cents >= 0) {
    return chalk.green(`+${formatted}`);
  }
  return chalk.red(`-${formatted}`);
}
