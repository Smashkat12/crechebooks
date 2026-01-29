/**
 * Authentication Commands
 *
 * cb auth login    - Interactive API key setup
 * cb auth status   - Show current authentication status
 * cb auth logout   - Remove credentials
 * cb auth switch   - Switch between profiles
 * cb auth api-keys - API key management (create, list, revoke, rotate)
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { executeAction } from '../../cli.js';
import {
  login,
  logout,
  getAuthStatus,
  useProfile,
  isValidApiKeyFormat,
  isValidTenantIdFormat,
  maskApiKey,
  requireAuth,
} from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import { getEnvironmentUrl, ENVIRONMENT_URLS } from '../../lib/config.js';
import {
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatDate,
  formatJson,
} from '../../lib/output.js';
import type { ApiKeyScope, ApiKeyInfo } from '../../types/index.js';

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Authentication management');

  // Login command
  auth
    .command('login')
    .description('Authenticate with CrecheBooks API')
    .option('-k, --api-key <key>', 'API key')
    .option('-t, --tenant <id>', 'Tenant ID')
    .option('-u, --base-url <url>', 'API base URL')
    .option('-e, --env <environment>', 'Environment preset (local, staging, production, railway)')
    .option('-p, --profile <name>', 'Profile name (default: default)')
    .action(async (options) => {
      await executeAction(async () => {
        let apiKey = options.apiKey;
        let tenantId = options.tenant;
        let baseUrl = options.baseUrl;

        // If environment is specified, use its URL as base
        if (options.env && !baseUrl) {
          baseUrl = getEnvironmentUrl(options.env);
        }

        // Default profile name based on environment if not specified
        const profile = options.profile || (options.env === 'production' || options.env === 'railway' ? 'production' : options.env || 'default');

        // Interactive prompts if not provided
        if (!apiKey || !tenantId || (!options.env && !baseUrl)) {
          printInfo('Enter your CrecheBooks API credentials:');
          console.log();

          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'environment',
              message: 'Select environment:',
              choices: [
                { name: 'Local Development (localhost:3000)', value: 'local' },
                { name: 'Staging (Railway)', value: 'staging' },
                { name: 'Production (Railway)', value: 'production' },
                { name: 'Custom URL', value: 'custom' },
              ],
              when: !options.env && !baseUrl,
            },
            {
              type: 'input',
              name: 'customUrl',
              message: 'Enter custom API URL:',
              when: (ans: Record<string, unknown>) => ans.environment === 'custom',
              validate: (input: string) => {
                try {
                  new URL(input);
                  return true;
                } catch {
                  return 'Please enter a valid URL';
                }
              },
            },
            {
              type: 'password',
              name: 'apiKey',
              message: 'API Key:',
              when: !apiKey,
              validate: (input: string) => {
                if (!input) return 'API key is required';
                if (!isValidApiKeyFormat(input)) {
                  return 'Invalid API key format. Use API key (cb_...) or JWT token (eyJ...).';
                }
                return true;
              },
            },
            {
              type: 'input',
              name: 'tenantId',
              message: 'Tenant ID:',
              when: !tenantId,
              validate: (input: string) => {
                if (!input) return 'Tenant ID is required';
                if (!isValidTenantIdFormat(input)) {
                  return 'Invalid tenant ID format. Expected UUID or CUID.';
                }
                return true;
              },
            },
          ]);

          apiKey = apiKey || answers.apiKey;
          tenantId = tenantId || answers.tenantId;

          // Set base URL from environment selection
          if (answers.environment && !baseUrl) {
            if (answers.environment === 'custom') {
              baseUrl = answers.customUrl;
            } else {
              baseUrl = getEnvironmentUrl(answers.environment);
            }
          }
        }

        // Validate credentials
        const spinner = ora('Validating credentials...').start();

        try {
          const client = createApiClient({
            apiKey,
            tenantId,
            baseUrl,
          });

          const healthy = await client.healthCheck();
          if (!healthy) {
            spinner.fail('Could not connect to CrecheBooks API');
            return;
          }

          // Save credentials
          login(apiKey, tenantId, baseUrl, profile);
          spinner.succeed('Credentials validated');

          printSuccess(`Logged in successfully to profile "${profile}"`);
          printSummary('Authentication Details', {
            Profile: profile,
            'Tenant ID': tenantId,
            'API Key': maskApiKey(apiKey),
            'Base URL': baseUrl || 'http://localhost:3000',
          });
        } catch (error) {
          spinner.fail('Authentication failed');
          throw error;
        }
      });
    });

  // Status command
  auth
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      await executeAction(async () => {
        const status = getAuthStatus();

        if (!status.authenticated) {
          printError(
            'Not authenticated',
            "Run 'cb auth login' to authenticate.",
          );
          return;
        }

        console.log();
        console.log(chalk.bold('Authentication Status'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(`  Status: ${chalk.green('✓ Authenticated')}`);
        console.log(`  Profile: ${chalk.cyan(status.profile)}`);
        console.log(`  Tenant ID: ${chalk.cyan(status.tenantId)}`);
        console.log(`  Base URL: ${chalk.cyan(status.baseUrl)}`);

        if (status.profiles.length > 1) {
          console.log();
          console.log(chalk.bold('Available Profiles'));
          console.log(chalk.dim('─'.repeat(40)));
          status.profiles.forEach((p) => {
            const marker = p === status.profile ? chalk.green('●') : chalk.dim('○');
            console.log(`  ${marker} ${p}`);
          });
        }
        console.log();
      });
    });

  // Logout command
  auth
    .command('logout')
    .description('Remove stored credentials')
    .option('-p, --profile <name>', 'Profile to logout from')
    .option('-a, --all', 'Logout from all profiles')
    .action(async (options) => {
      await executeAction(async () => {
        if (options.all) {
          const status = getAuthStatus();
          status.profiles.forEach((p) => logout(p));
          printSuccess('Logged out from all profiles');
        } else {
          const profile = options.profile;
          if (logout(profile)) {
            printSuccess(`Logged out from profile "${profile || 'default'}"`);
          } else {
            printError('No credentials found for this profile');
          }
        }
      });
    });

  // Switch command
  auth
    .command('switch <profile>')
    .description('Switch to a different profile')
    .action(async (profile) => {
      await executeAction(async () => {
        if (useProfile(profile)) {
          printSuccess(`Switched to profile "${profile}"`);
        } else {
          printError(
            `Profile "${profile}" not found`,
            "Run 'cb auth status' to see available profiles.",
          );
        }
      });
    });

  // Profiles command (alias for status with profile focus)
  auth
    .command('profiles')
    .description('List all configured profiles')
    .action(async () => {
      await executeAction(async () => {
        const status = getAuthStatus();

        if (status.profiles.length === 0) {
          printInfo('No profiles configured');
          printInfo("Run 'cb auth login' to create a profile");
          return;
        }

        console.log();
        console.log(chalk.bold('Configured Profiles'));
        console.log(chalk.dim('─'.repeat(40)));
        status.profiles.forEach((p) => {
          const isActive = p === status.profile;
          const marker = isActive ? chalk.green('●') : chalk.dim('○');
          const label = isActive ? chalk.bold(p) + chalk.dim(' (active)') : p;
          console.log(`  ${marker} ${label}`);
        });
        console.log();
      });
    });

  // Environments command
  auth
    .command('environments')
    .alias('envs')
    .description('Show available environment presets')
    .action(async () => {
      await executeAction(async () => {
        console.log();
        console.log(chalk.bold('Available Environments'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log();

        const envEntries = Object.entries(ENVIRONMENT_URLS);
        envEntries.forEach(([name, url]) => {
          const isProd = name === 'production' || name === 'railway';
          const marker = isProd ? chalk.green('●') : chalk.dim('○');
          console.log(`  ${marker} ${chalk.bold(name.padEnd(12))} ${chalk.cyan(url)}`);
        });

        console.log();
        console.log(chalk.dim('Usage:'));
        console.log(chalk.dim('  cb auth login --env production    # Quick production login'));
        console.log(chalk.dim('  cb auth login --env staging       # Quick staging login'));
        console.log(chalk.dim('  cb auth login                     # Interactive environment selection'));
        console.log();
        console.log(chalk.dim('Environment variables:'));
        console.log(chalk.dim('  CB_PRODUCTION_URL - Override production URL'));
        console.log(chalk.dim('  CB_STAGING_URL    - Override staging URL'));
        console.log();
      });
    });

  // API Keys subcommand group
  const apiKeys = auth
    .command('api-keys')
    .description('Manage API keys for production CLI/MCP access');

  // Create API key
  apiKeys
    .command('create')
    .description('Create a new API key')
    .option('-n, --name <name>', 'Name for the API key')
    .option('-s, --scopes <scopes>', 'Comma-separated scopes (default: FULL_ACCESS)')
    .option('-d, --description <desc>', 'Description')
    .option('-e, --environment <env>', 'Environment (production, staging)', 'production')
    .option('--expires-in-days <days>', 'Expiry in days (0 = never)', '0')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let name = options.name;
        let scopes: ApiKeyScope[] = [];

        // Parse scopes if provided
        if (options.scopes) {
          scopes = options.scopes.split(',').map((s: string) => s.trim().toUpperCase()) as ApiKeyScope[];
        }

        // Interactive prompts if name not provided
        if (!name) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'API key name:',
              validate: (input: string) => input.length > 0 || 'Name is required',
            },
            {
              type: 'checkbox',
              name: 'scopes',
              message: 'Select scopes:',
              choices: [
                { name: 'Full Access (all permissions)', value: 'FULL_ACCESS', checked: true },
                new inquirer.Separator('--- Read Permissions ---'),
                { name: 'Read Tenants', value: 'READ_TENANTS' },
                { name: 'Read Parents', value: 'READ_PARENTS' },
                { name: 'Read Children', value: 'READ_CHILDREN' },
                { name: 'Read Staff', value: 'READ_STAFF' },
                { name: 'Read Invoices', value: 'READ_INVOICES' },
                { name: 'Read Payments', value: 'READ_PAYMENTS' },
                { name: 'Read Transactions', value: 'READ_TRANSACTIONS' },
                { name: 'Read Reports', value: 'READ_REPORTS' },
                new inquirer.Separator('--- Write Permissions ---'),
                { name: 'Write Parents', value: 'WRITE_PARENTS' },
                { name: 'Write Children', value: 'WRITE_CHILDREN' },
                { name: 'Write Staff', value: 'WRITE_STAFF' },
                { name: 'Write Invoices', value: 'WRITE_INVOICES' },
                { name: 'Write Payments', value: 'WRITE_PAYMENTS' },
                { name: 'Write Transactions', value: 'WRITE_TRANSACTIONS' },
                new inquirer.Separator('--- Management ---'),
                { name: 'Manage Users', value: 'MANAGE_USERS' },
                { name: 'Manage API Keys', value: 'MANAGE_API_KEYS' },
                { name: 'Manage Integrations', value: 'MANAGE_INTEGRATIONS' },
              ],
              when: scopes.length === 0,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description (optional):',
              when: !options.description,
            },
          ]);

          name = answers.name;
          if (answers.scopes && answers.scopes.length > 0) {
            scopes = answers.scopes;
          }
          if (answers.description) {
            options.description = answers.description;
          }
        }

        // Default to FULL_ACCESS if no scopes selected
        if (scopes.length === 0) {
          scopes = ['FULL_ACCESS'];
        }

        const spinner = ora('Creating API key...').start();

        const response = await client.createApiKey({
          name,
          scopes,
          description: options.description,
          environment: options.environment,
          expiresInDays: parseInt(options.expiresInDays) || undefined,
        });

        spinner.succeed('API key created');

        if (response.data) {
          console.log();
          console.log(chalk.bold.yellow('⚠️  IMPORTANT: Save this key now! It will not be shown again.'));
          console.log();
          console.log(chalk.bold('Your API Key:'));
          console.log(chalk.green.bold(`  ${response.data.secretKey}`));
          console.log();

          printSummary('API Key Details', {
            'ID': response.data.id,
            'Name': response.data.name,
            'Prefix': response.data.keyPrefix,
            'Environment': response.data.environment,
            'Scopes': response.data.scopes.join(', '),
            'Expires': response.data.expiresAt ? formatDate(response.data.expiresAt) : 'Never',
          });

          console.log();
          console.log(chalk.dim('To use this key:'));
          console.log(chalk.dim(`  cb auth login --api-key ${response.data.secretKey} --tenant <tenant-id>`));
          console.log(chalk.dim('  or set X-API-Key header in API requests'));
        }
      });
    });

  // List API keys
  apiKeys
    .command('list')
    .description('List all API keys')
    .option('--include-revoked', 'Include revoked keys')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching API keys...').start();

        const response = await client.listApiKeys({
          includeRevoked: options.includeRevoked,
        });

        spinner.stop();

        if (!response.data || response.data.length === 0) {
          printInfo('No API keys found');
          printInfo("Run 'cb auth api-keys create' to create one");
          return;
        }

        if (options.format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        // Table output
        console.log();
        console.log(chalk.bold('API Keys'));
        console.log(chalk.dim('─'.repeat(100)));
        console.log(
          chalk.dim('ID'.padEnd(12)) +
          chalk.dim('Name'.padEnd(20)) +
          chalk.dim('Prefix'.padEnd(15)) +
          chalk.dim('Environment'.padEnd(12)) +
          chalk.dim('Last Used'.padEnd(20)) +
          chalk.dim('Status'),
        );
        console.log(chalk.dim('─'.repeat(100)));

        response.data.forEach((key: ApiKeyInfo) => {
          const status = key.revokedAt
            ? chalk.red('Revoked')
            : key.expiresAt && new Date(key.expiresAt) < new Date()
              ? chalk.yellow('Expired')
              : chalk.green('Active');

          console.log(
            (key.id.slice(0, 10) + '..').padEnd(12) +
            key.name.slice(0, 18).padEnd(20) +
            (key.keyPrefix + '..').padEnd(15) +
            key.environment.padEnd(12) +
            (key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never').padEnd(20) +
            status,
          );
        });
        console.log();
      });
    });

  // Get API key details
  apiKeys
    .command('get <id>')
    .description('Get API key details')
    .action(async (id) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching API key...').start();
        const response = await client.getApiKey(id);
        spinner.stop();

        if (!response.data) {
          printError('API key not found');
          return;
        }

        const key = response.data;

        printSummary('API Key Details', {
          'ID': key.id,
          'Name': key.name,
          'Prefix': key.keyPrefix + '...',
          'Environment': key.environment,
          'Description': key.description || '-',
          'Scopes': key.scopes.join(', '),
          'Created': formatDate(key.createdAt),
          'Expires': key.expiresAt ? formatDate(key.expiresAt) : 'Never',
          'Last Used': key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never',
          'Last Used IP': key.lastUsedIp || '-',
          'Status': key.revokedAt ? chalk.red('Revoked') : chalk.green('Active'),
        });
      });
    });

  // Revoke API key
  apiKeys
    .command('revoke <id>')
    .description('Revoke an API key')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Get key details first
        const spinner = ora('Fetching API key...').start();
        const keyResponse = await client.getApiKey(id);
        spinner.stop();

        if (!keyResponse.data) {
          printError('API key not found');
          return;
        }

        const key = keyResponse.data;

        if (key.revokedAt) {
          printError('This API key is already revoked');
          return;
        }

        // Confirm revocation
        if (!options.yes) {
          console.log();
          console.log(chalk.yellow('You are about to revoke this API key:'));
          console.log(`  Name: ${key.name}`);
          console.log(`  Prefix: ${key.keyPrefix}...`);
          console.log(`  Environment: ${key.environment}`);
          console.log();

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to revoke this key?',
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Revocation cancelled');
            return;
          }
        }

        const revokeSpinner = ora('Revoking API key...').start();
        await client.revokeApiKey(id);
        revokeSpinner.succeed('API key revoked');

        printSuccess(`API key "${key.name}" has been revoked`);
        printInfo('Any applications using this key will no longer be able to authenticate');
      });
    });

  // Rotate API key
  apiKeys
    .command('rotate <id>')
    .description('Rotate an API key (revokes old, creates new with same settings)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Get key details first
        const spinner = ora('Fetching API key...').start();
        const keyResponse = await client.getApiKey(id);
        spinner.stop();

        if (!keyResponse.data) {
          printError('API key not found');
          return;
        }

        const key = keyResponse.data;

        if (key.revokedAt) {
          printError('Cannot rotate a revoked API key');
          return;
        }

        // Confirm rotation
        if (!options.yes) {
          console.log();
          console.log(chalk.yellow('You are about to rotate this API key:'));
          console.log(`  Name: ${key.name}`);
          console.log(`  Prefix: ${key.keyPrefix}...`);
          console.log();
          console.log(chalk.dim('This will:'));
          console.log(chalk.dim('  1. Create a new key with the same settings'));
          console.log(chalk.dim('  2. Revoke the old key immediately'));
          console.log();

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Continue with rotation?',
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Rotation cancelled');
            return;
          }
        }

        const rotateSpinner = ora('Rotating API key...').start();
        const response = await client.rotateApiKey(id);
        rotateSpinner.succeed('API key rotated');

        if (response.data) {
          console.log();
          console.log(chalk.bold.yellow('⚠️  IMPORTANT: Save this new key now! It will not be shown again.'));
          console.log();
          console.log(chalk.bold('Your New API Key:'));
          console.log(chalk.green.bold(`  ${response.data.secretKey}`));
          console.log();

          printSummary('New API Key Details', {
            'ID': response.data.id,
            'Name': response.data.name,
            'Prefix': response.data.keyPrefix,
            'Environment': response.data.environment,
          });

          printInfo('The old key has been revoked and will no longer work');
        }
      });
    });
}
