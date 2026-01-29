/**
 * Tenant Commands
 *
 * cb tenant info        - Get current tenant details
 * cb tenant configure   - Update tenant settings
 * cb tenant onboarding  - Show onboarding progress
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
} from '../../lib/output.js';
import type { GlobalOptions } from '../../types/index.js';

export function registerTenantCommands(program: Command): void {
  const tenant = program
    .command('tenant')
    .description('Tenant management');

  // Info command
  tenant
    .command('info')
    .description('Get current tenant details')
    .action(async (_options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching tenant information...').start();
        const response = await client.getTenant();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch tenant information');
          return;
        }

        const tenant = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(tenant));
          return;
        }

        // Pretty print tenant details
        printSummary('Tenant Information', {
          'Name': tenant.name,
          'Trading Name': tenant.trading_name || '-',
          'Registration #': tenant.registration_number || '-',
          'VAT Number': tenant.vat_number || '-',
          'Tax Status': tenant.tax_status,
        });

        printSummary('Contact Details', {
          'Email': tenant.email,
          'Phone': tenant.phone,
          'Address': formatAddress(tenant),
        });

        printSummary('Billing Settings', {
          'Invoice Day': `${tenant.invoice_day_of_month}${getOrdinalSuffix(tenant.invoice_day_of_month)} of month`,
          'Payment Terms': `${tenant.invoice_due_days} days`,
          'Subscription': tenant.subscription_plan,
          'Status': formatSubscriptionStatus(tenant.subscription_status),
        });

        if (tenant.bank_name) {
          printSummary('Bank Details', {
            'Bank': tenant.bank_name,
            'Account Holder': tenant.bank_account_holder || '-',
            'Account Number': maskBankAccount(tenant.bank_account_number),
            'Branch Code': tenant.bank_branch_code || '-',
          });
        }

        if (tenant.xero_connected_at) {
          printSummary('Xero Integration', {
            'Connected': 'Yes',
            'Xero Tenant': tenant.xero_tenant_name || '-',
            'Connected At': new Date(tenant.xero_connected_at).toLocaleDateString('en-ZA'),
          });
        }
      });
    });

  // Configure command
  tenant
    .command('configure')
    .description('Update tenant settings')
    .option('--name <name>', 'Business name')
    .option('--trading-name <name>', 'Trading name')
    .option('--vat-number <number>', 'VAT number')
    .option('--phone <phone>', 'Contact phone')
    .option('--address-line1 <address>', 'Address line 1')
    .option('--address-line2 <address>', 'Address line 2')
    .option('--city <city>', 'City')
    .option('--province <province>', 'Province')
    .option('--postal-code <code>', 'Postal code')
    .option('--invoice-day <day>', 'Invoice day of month (1-28)', parseInt)
    .option('--payment-terms <days>', 'Payment terms in days', parseInt)
    .option('--json <data>', 'Update from JSON data')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let updateData: Record<string, unknown> = {};

        if (options.json) {
          try {
            updateData = JSON.parse(options.json);
          } catch {
            printError('Invalid JSON data');
            return;
          }
        } else if (options.interactive) {
          // Interactive mode - fetch current values first
          const spinner = ora('Loading current settings...').start();
          const currentResponse = await client.getTenant();
          spinner.stop();

          if (!currentResponse.success || !currentResponse.data) {
            printError('Failed to load current settings');
            return;
          }

          const current = currentResponse.data;

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Business name:',
              default: current.name,
            },
            {
              type: 'input',
              name: 'trading_name',
              message: 'Trading name:',
              default: current.trading_name || '',
            },
            {
              type: 'input',
              name: 'vat_number',
              message: 'VAT number:',
              default: current.vat_number || '',
            },
            {
              type: 'input',
              name: 'phone',
              message: 'Phone:',
              default: current.phone,
            },
            {
              type: 'number',
              name: 'invoice_day_of_month',
              message: 'Invoice day of month (1-28):',
              default: current.invoice_day_of_month,
              validate: (input: number) => {
                if (input < 1 || input > 28) return 'Must be between 1 and 28';
                return true;
              },
            },
            {
              type: 'number',
              name: 'invoice_due_days',
              message: 'Payment terms (days):',
              default: current.invoice_due_days,
              validate: (input: number) => {
                if (input < 1 || input > 90) return 'Must be between 1 and 90';
                return true;
              },
            },
          ]);

          // Only include changed values
          for (const [key, value] of Object.entries(answers)) {
            const currentValue = current[key as keyof typeof current];
            if (value !== currentValue && value !== '') {
              updateData[key] = value;
            }
          }

          if (Object.keys(updateData).length === 0) {
            printInfo('No changes to save');
            return;
          }
        } else {
          // Build update from flags
          if (options.name) updateData.name = options.name;
          if (options.tradingName) updateData.trading_name = options.tradingName;
          if (options.vatNumber) updateData.vat_number = options.vatNumber;
          if (options.phone) updateData.phone = options.phone;
          if (options.addressLine1) updateData.address_line1 = options.addressLine1;
          if (options.addressLine2) updateData.address_line2 = options.addressLine2;
          if (options.city) updateData.city = options.city;
          if (options.province) updateData.province = options.province;
          if (options.postalCode) updateData.postal_code = options.postalCode;
          if (options.invoiceDay) updateData.invoice_day_of_month = options.invoiceDay;
          if (options.paymentTerms) updateData.invoice_due_days = options.paymentTerms;

          if (Object.keys(updateData).length === 0) {
            printError('No settings to update', 'Use --interactive or provide options like --name');
            return;
          }
        }

        const spinner = ora('Updating tenant settings...').start();
        const response = await client.updateTenant(updateData);
        spinner.stop();

        if (!response.success) {
          printError('Failed to update tenant settings');
          return;
        }

        printSuccess('Tenant settings updated');

        // Show updated values
        const changes = Object.entries(updateData).map(([key, value]) => {
          return `  ${formatFieldName(key)}: ${chalk.cyan(String(value))}`;
        });
        console.log();
        console.log(chalk.bold('Updated Settings'));
        console.log(chalk.dim('-'.repeat(40)));
        console.log(changes.join('\n'));
        console.log();
      });
    });

  // Onboarding command
  tenant
    .command('onboarding')
    .description('Show onboarding progress and next steps')
    .action(async (_options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Checking onboarding status...').start();
        const response = await client.getOnboardingStatus();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch onboarding status');
          return;
        }

        const status = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(status));
          return;
        }

        console.log();
        console.log(chalk.bold('Onboarding Progress'));
        console.log(chalk.dim('='.repeat(50)));
        console.log();

        // Progress bar
        const completedTasks = status.tasks.filter((t) => t.completed).length;
        const totalTasks = status.tasks.length;
        const progressPercent = Math.round((completedTasks / totalTasks) * 100);
        const progressBar = createProgressBar(progressPercent, 30);
        console.log(`${progressBar} ${progressPercent}% complete`);
        console.log();

        // Tasks list
        status.tasks.forEach((task) => {
          const icon = task.completed ? chalk.green('✔') : chalk.dim('○');
          const label = task.completed ? chalk.dim(task.name) : task.name;
          console.log(`  ${icon} ${label}`);
          if (!task.completed && task.action) {
            console.log(`    ${chalk.blue('→')} ${chalk.dim(task.action)}`);
          }
        });

        console.log();

        if (status.next_step) {
          printInfo(`Next step: ${status.next_step}`);
        }

        if (progressPercent === 100) {
          printSuccess('Onboarding complete! Your creche is ready to go.');
        }
      });
    });
}

// Helper functions

function formatAddress(tenant: {
  address_line1: string;
  address_line2?: string;
  city: string;
  province: string;
  postal_code: string;
}): string {
  const parts = [tenant.address_line1];
  if (tenant.address_line2) parts.push(tenant.address_line2);
  parts.push(`${tenant.city}, ${tenant.province} ${tenant.postal_code}`);
  return parts.join(', ');
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatSubscriptionStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    ACTIVE: chalk.green,
    TRIAL: chalk.yellow,
    EXPIRED: chalk.red,
    CANCELLED: chalk.dim,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}

function maskBankAccount(accountNumber?: string): string {
  if (!accountNumber) return '-';
  if (accountNumber.length <= 4) return accountNumber;
  return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}
