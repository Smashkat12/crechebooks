/**
 * Banking Commands
 *
 * cb banking accounts         - List linked bank accounts
 * cb banking accounts summary - Account summary stats
 * cb banking link             - Start OAuth flow
 * cb banking unlink <id>      - Unlink bank account
 * cb banking sync <id>        - Manual sync
 * cb banking balance <id>     - Get account balance
 * cb banking consent-status   - Check consent renewal status
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatBankAccounts,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
  formatZAR,
} from '../../lib/output.js';
import type { GlobalOptions } from '../../types/index.js';

export function registerBankingCommands(program: Command): void {
  const banking = program
    .command('banking')
    .description('Bank account management and Open Banking integration');

  // Accounts subcommand group
  const accounts = banking
    .command('accounts')
    .description('List linked bank accounts')
    .action(async (command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching bank accounts...').start();
        const response = await client.listBankAccounts();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch bank accounts');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No bank accounts linked. Use "cb banking link" to connect an account.');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatBankAccounts(response.data, format));

        // Show accounts needing attention
        const needsAttention = response.data.filter(
          (acc) => acc.consent_expires_at && new Date(acc.consent_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        );

        if (needsAttention.length > 0 && format === 'table') {
          printWarning(`${needsAttention.length} account(s) need consent renewal soon`);
        }
      });
    });

  // Accounts summary subcommand
  accounts
    .command('summary')
    .description('Get bank account summary statistics')
    .action(async (command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching account summary...').start();
        const response = await client.getAccountsSummary();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch account summary');
          return;
        }

        const summary = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(summary));
          return;
        }

        printSummary('Bank Accounts Summary', {
          'Total Accounts': summary.total_accounts,
          'Active Accounts': summary.active_accounts,
          'Combined Balance': formatZAR(summary.total_balance_cents),
          'Pending Transactions': summary.pending_transactions,
          'Last Sync': summary.last_sync_at ? new Date(summary.last_sync_at).toLocaleString('en-ZA') : 'Never',
        });

        if (summary.accounts_by_bank) {
          console.log(chalk.bold('Accounts by Bank:'));
          for (const [bank, count] of Object.entries(summary.accounts_by_bank)) {
            console.log(`  ${bank}: ${count}`);
          }
          console.log();
        }
      });
    });

  // Link command
  banking
    .command('link')
    .description('Start OAuth flow to link a new bank account')
    .option('--bank <code>', 'Bank code (e.g., FNB, ABSA, STANDARD, NEDBANK, CAPITEC)')
    .option('--redirect <url>', 'Custom redirect URL')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Initiating bank link...').start();
        const response = await client.initiateBankLink({
          bankCode: options.bank,
          redirectUrl: options.redirect,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to initiate bank link');
          return;
        }

        const { authorization_url, state, expires_at } = response.data;

        printSuccess('Bank link initiated');
        console.log();
        console.log(chalk.bold('Open this URL in your browser to authorize:'));
        console.log(chalk.cyan(authorization_url));
        console.log();
        printInfo(`Link expires: ${new Date(expires_at).toLocaleString('en-ZA')}`);
        printInfo(`State token: ${state.slice(0, 8)}...`);
      });
    });

  // Unlink command
  banking
    .command('unlink <accountId>')
    .description('Unlink a bank account')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (accountId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        if (!options.yes) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to unlink account ${accountId.slice(0, 8)}...? This will remove all synced transactions.`,
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Operation cancelled');
            return;
          }
        }

        const spinner = ora('Unlinking bank account...').start();
        const response = await client.unlinkBankAccount(accountId);
        spinner.stop();

        if (!response.success) {
          printError('Failed to unlink bank account');
          return;
        }

        printSuccess(`Bank account ${accountId.slice(0, 8)}... unlinked successfully`);
      });
    });

  // Sync command
  banking
    .command('sync <accountId>')
    .description('Manually sync transactions from a bank account')
    .option('--from <date>', 'Sync from date (YYYY-MM-DD)')
    .option('--to <date>', 'Sync to date (YYYY-MM-DD)')
    .action(async (accountId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Syncing bank transactions...').start();
        const response = await client.syncBankAccount(accountId, {
          fromDate: options.from,
          toDate: options.to,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to sync bank account');
          return;
        }

        const { transactions_imported, transactions_updated, sync_duration_ms } = response.data;

        printSuccess('Bank sync completed');
        printSummary('Sync Results', {
          'New Transactions': transactions_imported,
          'Updated Transactions': transactions_updated,
          'Duration': `${(sync_duration_ms / 1000).toFixed(2)}s`,
        });
      });
    });

  // Balance command
  banking
    .command('balance <accountId>')
    .description('Get current balance for a bank account')
    .action(async (accountId, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching balance...').start();
        const response = await client.getBankAccountBalance(accountId);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch balance');
          return;
        }

        const balance = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(balance));
          return;
        }

        printSummary(`Account Balance - ${balance.account_name}`, {
          'Current Balance': formatZAR(balance.current_balance_cents),
          'Available Balance': formatZAR(balance.available_balance_cents),
          'Pending': formatZAR(balance.pending_balance_cents),
          'Last Updated': new Date(balance.balance_at).toLocaleString('en-ZA'),
          'Currency': balance.currency,
        });
      });
    });

  // Consent status command
  banking
    .command('consent-status')
    .description('Check accounts needing consent renewal')
    .option('--days <n>', 'Show accounts expiring within N days', '14')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Checking consent status...').start();
        const response = await client.getConsentStatus({
          expiringWithinDays: parseInt(options.days, 10),
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch consent status');
          return;
        }

        const { accounts, total_expiring, total_expired } = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        if (total_expired > 0) {
          printError(`${total_expired} account(s) have expired consent and cannot sync`);
        }

        if (total_expiring > 0) {
          printWarning(`${total_expiring} account(s) will expire within ${options.days} days`);
        }

        if (total_expired === 0 && total_expiring === 0) {
          printSuccess('All accounts have valid consent');
          return;
        }

        console.log();
        accounts.forEach((acc) => {
          const status = acc.is_expired ? chalk.red('EXPIRED') : chalk.yellow('EXPIRING');
          const expiryDate = new Date(acc.consent_expires_at).toLocaleDateString('en-ZA');
          console.log(`  ${status} ${acc.bank_name} - ${acc.account_name} (expires ${expiryDate})`);
          console.log(`    Reauthorize: cb banking link --bank ${acc.bank_code}`);
        });
        console.log();
      });
    });
}
