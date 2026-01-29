/**
 * Output Formatting Module
 *
 * Handles formatting CLI output in different formats.
 */

import chalk from 'chalk';
import { table, getBorderCharacters } from 'table';
import type {
  OutputFormat,
  Invoice,
  Payment,
  PaymentMatch,
  Staff,
  EmploymentType,
  BankAccount,
  Transaction,
  CategorizationSuggestion,
} from '../types/index.js';

/**
 * Format ZAR amount from cents
 */
export function formatZAR(cents: number): string {
  const rands = cents / 100;
  return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format date for display
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Format invoice status with color
 */
export function formatInvoiceStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    DRAFT: chalk.gray,
    SENT: chalk.blue,
    VIEWED: chalk.cyan,
    PARTIALLY_PAID: chalk.yellow,
    PAID: chalk.green,
    OVERDUE: chalk.red,
    VOID: chalk.dim,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}

/**
 * Format data as JSON
 */
export function formatJson<T>(data: T): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format data as CSV
 */
export function formatCsv<T extends object>(data: T[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]) as (keyof T)[];
  const headerRow = headers.map(String).join(',');

  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header] as unknown;
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(','),
  );

  return [headerRow, ...rows].join('\n');
}

/**
 * Format data as table
 */
export function formatTable(headers: string[], rows: string[][]): string {
  const data = [headers.map((h) => chalk.bold(h)), ...rows];

  return table(data, {
    border: getBorderCharacters('norc'),
    columnDefault: {
      paddingLeft: 1,
      paddingRight: 1,
    },
    drawHorizontalLine: (lineIndex, rowCount) => {
      return lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount;
    },
  });
}

/**
 * Format invoices for output
 */
export function formatInvoices(invoices: Invoice[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(invoices);
  }

  if (format === 'csv') {
    const rows = invoices.map((inv) => ({
      invoice_number: inv.invoice_number,
      parent_name: inv.parent_name,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_cents: inv.total_cents,
      outstanding_cents: inv.outstanding_cents,
      status: inv.status,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['Invoice #', 'Parent', 'Amount', 'Outstanding', 'Status', 'Due Date'];
  const rows = invoices.map((inv) => [
    inv.invoice_number,
    inv.parent_name.length > 20 ? inv.parent_name.slice(0, 17) + '...' : inv.parent_name,
    formatZAR(inv.total_cents),
    formatZAR(inv.outstanding_cents),
    formatInvoiceStatus(inv.status),
    formatDate(inv.due_date),
  ]);

  return formatTable(headers, rows);
}

/**
 * Format payments for output
 */
export function formatPayments(payments: Payment[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(payments);
  }

  if (format === 'csv') {
    const rows = payments.map((p) => ({
      id: p.id,
      amount_cents: p.amount_cents,
      allocated_cents: p.allocated_cents,
      unallocated_cents: p.unallocated_cents,
      payment_date: p.payment_date,
      reference: p.reference,
      source: p.source,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['ID', 'Amount', 'Allocated', 'Unallocated', 'Date', 'Reference'];
  const rows = payments.map((p) => [
    p.id.slice(0, 8) + '...',
    formatZAR(p.amount_cents),
    formatZAR(p.allocated_cents),
    p.unallocated_cents > 0 ? chalk.yellow(formatZAR(p.unallocated_cents)) : formatZAR(0),
    formatDate(p.payment_date),
    p.reference.length > 15 ? p.reference.slice(0, 12) + '...' : p.reference,
  ]);

  return formatTable(headers, rows);
}

/**
 * Format payment matches for output
 */
export function formatPaymentMatches(matches: PaymentMatch[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(matches);
  }

  if (format === 'csv') {
    return formatCsv(matches);
  }

  // Table format
  const headers = ['Payment ID', 'Invoice', 'Amount', 'Confidence', 'Reason'];
  const rows = matches.map((m) => [
    m.payment_id.slice(0, 8) + '...',
    m.invoice_number,
    formatZAR(m.amount_cents),
    formatConfidence(m.confidence),
    m.match_reason.length > 25 ? m.match_reason.slice(0, 22) + '...' : m.match_reason,
  ]);

  return formatTable(headers, rows);
}

/**
 * Format confidence score with color
 */
function formatConfidence(confidence: number): string {
  const percent = `${Math.round(confidence * 100)}%`;
  if (confidence >= 0.9) return chalk.green(percent);
  if (confidence >= 0.8) return chalk.yellow(percent);
  return chalk.red(percent);
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✔') + ' ' + message);
}

/**
 * Print error message
 */
export function printError(message: string, suggestion?: string): void {
  console.error(chalk.red('✖') + ' ' + chalk.bold('Error:') + ' ' + message);
  if (suggestion) {
    console.error('  ' + chalk.dim(suggestion));
  }
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Print summary box
 */
export function printSummary(title: string, items: Record<string, string | number>): void {
  console.log();
  console.log(chalk.bold(title));
  console.log(chalk.dim('─'.repeat(40)));
  for (const [key, value] of Object.entries(items)) {
    console.log(`  ${key}: ${chalk.cyan(String(value))}`);
  }
  console.log();
}

/**
 * Format staff for output
 */
export function formatStaff(staffList: Staff[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(staffList);
  }

  if (format === 'csv') {
    const rows = staffList.map((s) => ({
      employee_number: s.employee_number,
      first_name: s.first_name,
      last_name: s.last_name,
      email: s.email,
      employment_type: s.employment_type,
      basic_salary_cents: s.basic_salary_cents,
      is_active: s.is_active,
      onboarding_status: s.onboarding_status,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['Emp #', 'Name', 'Email', 'Type', 'Salary', 'Status'];
  const rows = staffList.map((s) => [
    s.employee_number,
    `${s.first_name} ${s.last_name}`.length > 20
      ? `${s.first_name} ${s.last_name}`.slice(0, 17) + '...'
      : `${s.first_name} ${s.last_name}`,
    s.email.length > 25 ? s.email.slice(0, 22) + '...' : s.email,
    formatEmploymentType(s.employment_type),
    formatZAR(s.basic_salary_cents),
    s.is_active ? chalk.green('Active') : chalk.red('Inactive'),
  ]);

  return formatTable(headers, rows);
}

/**
 * Format employment type with color
 */
export function formatEmploymentType(type: EmploymentType): string {
  const colors: Record<EmploymentType, (s: string) => string> = {
    PERMANENT: chalk.green,
    CONTRACT: chalk.yellow,
    CASUAL: chalk.cyan,
  };
  const colorFn = colors[type] || chalk.white;
  return colorFn(type);
}

/**
 * Format bank accounts for output
 */
export function formatBankAccounts(accounts: BankAccount[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(accounts);
  }

  if (format === 'csv') {
    const rows = accounts.map((a) => ({
      id: a.id,
      bank_name: a.bank_name,
      account_name: a.account_name,
      account_number: a.account_number_masked,
      balance_cents: a.current_balance_cents,
      is_active: a.is_active,
      consent_expires: a.consent_expires_at,
      last_synced: a.last_synced_at,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['Bank', 'Account', 'Number', 'Balance', 'Status', 'Last Sync'];
  const rows = accounts.map((a) => [
    a.bank_name,
    a.account_name.length > 15 ? a.account_name.slice(0, 12) + '...' : a.account_name,
    a.account_number_masked,
    formatZAR(a.current_balance_cents),
    a.is_active ? chalk.green('Active') : chalk.red('Inactive'),
    a.last_synced_at ? formatDate(a.last_synced_at) : chalk.dim('Never'),
  ]);

  return formatTable(headers, rows);
}

/**
 * Format transactions for output
 */
export function formatTransactions(transactions: Transaction[], format: OutputFormat): string {
  if (format === 'json') {
    return formatJson(transactions);
  }

  if (format === 'csv') {
    const rows = transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      payee: t.payee_name,
      amount_cents: t.amount_cents,
      is_credit: t.is_credit,
      status: t.status,
      category: t.category_code,
      is_reconciled: t.is_reconciled,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['Date', 'Description', 'Amount', 'Type', 'Category', 'Status'];
  const rows = transactions.map((t) => [
    formatDate(t.date),
    t.description.length > 25 ? t.description.slice(0, 22) + '...' : t.description,
    t.is_credit
      ? chalk.green('+' + formatZAR(t.amount_cents))
      : chalk.red('-' + formatZAR(t.amount_cents)),
    t.is_credit ? 'Credit' : 'Debit',
    t.category_code || chalk.dim('Uncategorized'),
    formatTransactionStatus(t.status),
  ]);

  return formatTable(headers, rows);
}

/**
 * Format transaction status with color
 */
export function formatTransactionStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    PENDING: chalk.yellow,
    CATEGORIZED: chalk.blue,
    RECONCILED: chalk.green,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}

/**
 * Format categorization suggestions for output
 */
export function formatCategorizationSuggestions(
  suggestions: CategorizationSuggestion[],
  format: OutputFormat,
): string {
  if (format === 'json') {
    return formatJson(suggestions);
  }

  if (format === 'csv') {
    return formatCsv(suggestions);
  }

  // Table format
  const headers = ['Category', 'Confidence', 'Reasoning'];
  const rows = suggestions.map((s) => [
    `${s.category_code} - ${s.category_name}`,
    formatConfidenceScore(s.confidence),
    s.reasoning.length > 35 ? s.reasoning.slice(0, 32) + '...' : s.reasoning,
  ]);

  return formatTable(headers, rows);
}

/**
 * Format confidence score with color (exported version)
 */
export function formatConfidenceScore(confidence: number): string {
  const percent = `${Math.round(confidence * 100)}%`;
  if (confidence >= 0.9) return chalk.green(percent);
  if (confidence >= 0.8) return chalk.yellow(percent);
  return chalk.red(percent);
}
