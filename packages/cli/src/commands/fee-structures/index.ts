/**
 * Fee Structure Commands
 *
 * cb fee-structures list           - List fee structures
 * cb fee-structures get <id>       - Get fee structure details
 * cb fee-structures create         - Create fee structure (interactive)
 * cb fee-structures update <id>    - Update fee structure
 * cb fee-structures deactivate <id> - Deactivate fee structure
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  formatZAR,
  formatTable,
  printSummary,
  printError,
  printInfo,
  printSuccess,
  printWarning,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  FeeStructure,
  ListFeeStructuresOptions,
} from '../../types/index.js';

type FeeType = 'MONTHLY' | 'ONE_TIME' | 'REGISTRATION';

interface CreateFeeStructureInput {
  name: string;
  description?: string;
  fee_type: FeeType;
  amount_cents: number;
  registration_fee_cents?: number;
  vat_inclusive?: boolean;
  sibling_discount_percent?: number;
  effective_from?: string;
  effective_to?: string;
}

interface UpdateFeeStructureInput {
  name?: string;
  description?: string;
  amount_cents?: number;
  registration_fee_cents?: number;
  vat_inclusive?: boolean;
  sibling_discount_percent?: number;
  effective_to?: string;
}

export function registerFeeStructureCommands(program: Command): void {
  const feeStructures = program
    .command('fee-structures')
    .alias('fees')
    .description('Fee structure management');

  // List command
  feeStructures
    .command('list')
    .description('List all fee structures')
    .option('--active-only', 'Show only active fee structures')
    .option('--type <type>', 'Filter by fee type (MONTHLY, ONE_TIME, REGISTRATION)')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching fee structures...').start();
        const listOpts: ListFeeStructuresOptions = {
          active: options.activeOnly,
        };
        const response = await client.listFeeStructures(listOpts);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch fee structures');
          return;
        }

        let structures = response.data;

        // Filter by type if specified
        if (options.type) {
          structures = structures.filter(
            (s) => s.fee_type.toUpperCase() === options.type.toUpperCase(),
          );
        }

        const format = globalOpts?.format || 'table';

        if (structures.length === 0) {
          printInfo('No fee structures found');
          return;
        }

        if (format === 'json') {
          console.log(formatJson(structures));
          return;
        }

        displayFeeStructureList(structures);
      });
    });

  // Get command
  feeStructures
    .command('get <id>')
    .description('Get fee structure details')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching fee structure...').start();
        const response = await client.getFeeStructure(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Fee structure not found');
          return;
        }

        const structure = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(structure));
          return;
        }

        displayFeeStructureDetails(structure);
      });
    });

  // Create command (interactive)
  feeStructures
    .command('create')
    .description('Create a new fee structure (interactive)')
    .option('--non-interactive', 'Use command line options instead of prompts')
    .option('--name <name>', 'Fee structure name')
    .option('--description <desc>', 'Description')
    .option('--fee-type <type>', 'Fee type: MONTHLY, ONE_TIME, REGISTRATION')
    .option('--amount <cents>', 'Amount in cents')
    .option('--registration-fee <cents>', 'Registration fee in cents')
    .option('--vat-inclusive', 'Amount includes VAT')
    .option('--sibling-discount <percent>', 'Sibling discount percentage')
    .option('--effective-from <date>', 'Effective from date (YYYY-MM-DD)')
    .option('--effective-to <date>', 'Effective to date (YYYY-MM-DD)')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let input: CreateFeeStructureInput;

        if (options.nonInteractive) {
          // Validate required fields
          if (!options.name || !options.feeType || !options.amount) {
            printError('Missing required options: --name, --fee-type, --amount');
            return;
          }

          input = {
            name: options.name,
            description: options.description,
            fee_type: options.feeType as FeeType,
            amount_cents: parseInt(options.amount, 10),
            registration_fee_cents: options.registrationFee
              ? parseInt(options.registrationFee, 10)
              : undefined,
            vat_inclusive: options.vatInclusive || false,
            sibling_discount_percent: options.siblingDiscount
              ? parseFloat(options.siblingDiscount)
              : undefined,
            effective_from: options.effectiveFrom,
            effective_to: options.effectiveTo,
          };
        } else {
          // Interactive mode
          input = await promptForFeeStructure();
        }

        const spinner = ora('Creating fee structure...').start();
        const response = await client.createFeeStructure(
          input as unknown as Record<string, unknown>,
        );
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create fee structure');
          return;
        }

        printSuccess(`Created fee structure: ${response.data.name}`);
        displayFeeStructureDetails(response.data);
      });
    });

  // Update command
  feeStructures
    .command('update <id>')
    .description('Update a fee structure')
    .option('--name <name>', 'Update name')
    .option('--description <desc>', 'Update description')
    .option('--amount <cents>', 'Update amount in cents')
    .option('--registration-fee <cents>', 'Update registration fee')
    .option('--vat-inclusive', 'Set VAT inclusive to true')
    .option('--no-vat-inclusive', 'Set VAT inclusive to false')
    .option('--sibling-discount <percent>', 'Update sibling discount percentage')
    .option('--effective-to <date>', 'Update effective to date (YYYY-MM-DD)')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Build update input from options
        const input: UpdateFeeStructureInput = {};
        if (options.name) input.name = options.name;
        if (options.description) input.description = options.description;
        if (options.amount) input.amount_cents = parseInt(options.amount, 10);
        if (options.registrationFee) {
          input.registration_fee_cents = parseInt(options.registrationFee, 10);
        }
        if (options.vatInclusive !== undefined) {
          input.vat_inclusive = options.vatInclusive;
        }
        if (options.siblingDiscount) {
          input.sibling_discount_percent = parseFloat(options.siblingDiscount);
        }
        if (options.effectiveTo) input.effective_to = options.effectiveTo;

        if (Object.keys(input).length === 0) {
          printError('No update options specified. Use --help to see available options.');
          return;
        }

        const spinner = ora('Updating fee structure...').start();
        const response = await client.updateFeeStructure(
          id,
          input as unknown as Record<string, unknown>,
        );
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to update fee structure');
          return;
        }

        printSuccess(`Updated fee structure: ${response.data.name}`);
        displayFeeStructureDetails(response.data);
      });
    });

  // Deactivate command
  feeStructures
    .command('deactivate <id>')
    .description('Deactivate a fee structure')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // First, fetch the structure to show what we're deactivating
        const getSpinner = ora('Fetching fee structure...').start();
        const getResponse = await client.getFeeStructure(id);
        getSpinner.stop();

        if (!getResponse.success || !getResponse.data) {
          printError('Fee structure not found');
          return;
        }

        const structure = getResponse.data;

        if (!structure.is_active) {
          printWarning(`Fee structure "${structure.name}" is already inactive`);
          return;
        }

        // Confirm deactivation
        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Deactivate fee structure "${structure.name}"? This cannot be undone.`,
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Deactivation cancelled');
            return;
          }
        }

        const spinner = ora('Deactivating fee structure...').start();
        const response = await client.deactivateFeeStructure(id);
        spinner.stop();

        if (!response.success) {
          printError('Failed to deactivate fee structure');
          return;
        }

        printSuccess(`Deactivated fee structure: ${structure.name}`);
      });
    });
}

/**
 * Prompt for fee structure creation (interactive mode)
 */
async function promptForFeeStructure(): Promise<CreateFeeStructureInput> {
  console.log();
  console.log(chalk.bold('Create New Fee Structure'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Fee structure name:',
      validate: (input: string) => input.trim().length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
    },
    {
      type: 'list',
      name: 'fee_type',
      message: 'Fee type:',
      choices: [
        { name: 'Monthly Fee', value: 'MONTHLY' },
        { name: 'One-Time Fee', value: 'ONE_TIME' },
        { name: 'Registration Fee', value: 'REGISTRATION' },
      ],
    },
    {
      type: 'number',
      name: 'amount_rands',
      message: 'Monthly/fee amount (in Rands):',
      validate: (input: number) => input > 0 || 'Amount must be greater than 0',
    },
    {
      type: 'confirm',
      name: 'has_registration_fee',
      message: 'Include a separate registration fee?',
      default: false,
      when: (answers) => answers.fee_type === 'MONTHLY',
    },
    {
      type: 'number',
      name: 'registration_fee_rands',
      message: 'Registration fee (in Rands):',
      when: (answers) => answers.has_registration_fee,
      validate: (input: number) => input > 0 || 'Amount must be greater than 0',
    },
    {
      type: 'confirm',
      name: 'vat_inclusive',
      message: 'Is the amount VAT inclusive?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'has_sibling_discount',
      message: 'Offer sibling discount?',
      default: false,
    },
    {
      type: 'number',
      name: 'sibling_discount_percent',
      message: 'Sibling discount percentage:',
      when: (answers) => answers.has_sibling_discount,
      default: 10,
      validate: (input: number) =>
        (input > 0 && input <= 100) || 'Percentage must be between 1 and 100',
    },
    {
      type: 'input',
      name: 'effective_from',
      message: 'Effective from date (YYYY-MM-DD, leave empty for immediate):',
      validate: (input: string) => {
        if (!input) return true;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return dateRegex.test(input) || 'Invalid date format. Use YYYY-MM-DD';
      },
    },
    {
      type: 'input',
      name: 'effective_to',
      message: 'Effective to date (YYYY-MM-DD, leave empty for no end date):',
      validate: (input: string) => {
        if (!input) return true;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return dateRegex.test(input) || 'Invalid date format. Use YYYY-MM-DD';
      },
    },
  ]);

  // Convert Rands to cents
  return {
    name: answers.name,
    description: answers.description || undefined,
    fee_type: answers.fee_type as FeeType,
    amount_cents: Math.round(answers.amount_rands * 100),
    registration_fee_cents: answers.registration_fee_rands
      ? Math.round(answers.registration_fee_rands * 100)
      : undefined,
    vat_inclusive: answers.vat_inclusive,
    sibling_discount_percent: answers.sibling_discount_percent,
    effective_from: answers.effective_from || undefined,
    effective_to: answers.effective_to || undefined,
  };
}

/**
 * Display fee structure list
 */
function displayFeeStructureList(structures: FeeStructure[]): void {
  console.log();
  console.log(chalk.bold('Fee Structures'));
  console.log(chalk.dim('─'.repeat(80)));
  console.log();

  const headers = ['Name', 'Type', 'Amount', 'Reg. Fee', 'VAT Incl.', 'Discount', 'Status'];
  const rows = structures.map((s) => [
    truncate(s.name, 25),
    formatFeeType(s.fee_type),
    formatZAR(s.amount_cents),
    s.registration_fee_cents ? formatZAR(s.registration_fee_cents) : '-',
    s.vat_inclusive ? chalk.green('Yes') : chalk.yellow('No'),
    s.sibling_discount_percent ? `${s.sibling_discount_percent}%` : '-',
    s.is_active ? chalk.green('Active') : chalk.dim('Inactive'),
  ]);

  console.log(formatTable(headers, rows));
  printInfo(`Total: ${structures.length} fee structures`);
}

/**
 * Display fee structure details
 */
function displayFeeStructureDetails(structure: FeeStructure): void {
  const statusColor = structure.is_active ? chalk.green : chalk.dim;

  printSummary(`Fee Structure: ${structure.name}`, {
    ID: structure.id,
    Type: formatFeeType(structure.fee_type),
    Status: statusColor(structure.is_active ? 'Active' : 'Inactive'),
  });

  if (structure.description) {
    console.log(`  ${chalk.dim('Description:')} ${structure.description}`);
    console.log();
  }

  printSummary('Pricing', {
    Amount: formatZAR(structure.amount_cents),
    'Registration Fee': structure.registration_fee_cents
      ? formatZAR(structure.registration_fee_cents)
      : 'N/A',
    'VAT Inclusive': structure.vat_inclusive ? 'Yes' : 'No',
    'Sibling Discount': structure.sibling_discount_percent
      ? `${structure.sibling_discount_percent}%`
      : 'None',
  });
}

/**
 * Format fee type for display
 */
function formatFeeType(type: string): string {
  const labels: Record<string, string> = {
    MONTHLY: 'Monthly',
    ONE_TIME: 'One-Time',
    REGISTRATION: 'Registration',
  };
  return labels[type.toUpperCase()] || type;
}

/**
 * Truncate string
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
