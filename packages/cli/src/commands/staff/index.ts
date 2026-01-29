/**
 * Staff Commands
 *
 * cb staff list              - List staff members
 * cb staff get <id>          - Get staff details
 * cb staff create            - Create staff member (interactive)
 * cb staff update <id>       - Update staff details
 * cb staff delete <id>       - Deactivate staff (soft delete)
 * cb staff resend-invite <id> - Resend onboarding email
 */

import { Command } from 'commander';
import ora from 'ora';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatStaff,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatZAR,
  formatDate,
} from '../../lib/output.js';
import type {
  GlobalOptions,
  ListStaffOptions,
  CreateStaffOptions,
  UpdateStaffOptions,
  EmploymentType,
  PayFrequency,
} from '../../types/index.js';
import { registerOnboardingCommands } from './onboarding.js';
import { registerLeaveCommands } from './leave.js';
import { registerDocumentsCommands } from './documents.js';

export function registerStaffCommands(program: Command): void {
  const staff = program
    .command('staff')
    .description('Staff management');

  // Register subcommand groups
  registerOnboardingCommands(staff);
  registerLeaveCommands(staff);
  registerDocumentsCommands(staff);

  // List command
  staff
    .command('list')
    .description('List staff members')
    .option('-s, --search <term>', 'Search by name, email, or employee number')
    .option('-t, --employment-type <type>', 'Filter by type: PERMANENT, CONTRACT, CASUAL')
    .option('-a, --active <bool>', 'Filter by active status (true/false)')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching staff...').start();

        const listOptions: ListStaffOptions = {
          search: options.search,
          employmentType: options.employmentType as EmploymentType | undefined,
          active: options.active !== undefined ? options.active === 'true' : undefined,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listStaff(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch staff');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No staff members found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatStaff(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} staff members (page ${response.meta.page}/${response.meta.totalPages})`,
          );
        }
      });
    });

  // Get command
  staff
    .command('get <id>')
    .description('Get staff member details')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching staff member...').start();
        const response = await client.getStaff(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Staff member not found');
          return;
        }

        const staffMember = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(staffMember));
          return;
        }

        // Pretty print staff details
        printSummary(`Staff: ${staffMember.first_name} ${staffMember.last_name}`, {
          'Employee #': staffMember.employee_number,
          'Email': staffMember.email,
          'Phone': staffMember.phone || 'N/A',
          'ID Number': staffMember.id_number ? `***${staffMember.id_number.slice(-4)}` : 'N/A',
          'Date of Birth': staffMember.date_of_birth ? formatDate(staffMember.date_of_birth) : 'N/A',
          'Employment Type': staffMember.employment_type,
          'Pay Frequency': staffMember.pay_frequency,
          'Basic Salary': formatZAR(staffMember.basic_salary_cents),
          'Active': staffMember.is_active ? 'Yes' : 'No',
          'Onboarding Status': staffMember.onboarding_status,
        });

        if (staffMember.bank_name) {
          console.log('Bank Details:');
          console.log(`  Bank: ${staffMember.bank_name}`);
          console.log(`  Account: ***${staffMember.bank_account_number?.slice(-4) || 'N/A'}`);
          console.log(`  Branch: ${staffMember.bank_branch_code || 'N/A'}`);
          console.log();
        }
      });
    });

  // Create command (interactive)
  staff
    .command('create')
    .description('Create a new staff member')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--id-number <id>', 'South African ID number')
    .option('--employment-type <type>', 'Employment type: PERMANENT, CONTRACT, CASUAL')
    .option('--salary <cents>', 'Basic salary in cents')
    .option('--skip-prompts', 'Skip interactive prompts (requires all options)')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let createOptions: CreateStaffOptions;

        if (options.skipPrompts) {
          // Non-interactive mode
          if (!options.firstName || !options.lastName || !options.email || !options.employmentType || !options.salary) {
            printError('Missing required options. Use --first-name, --last-name, --email, --employment-type, and --salary');
            return;
          }
          createOptions = {
            firstName: options.firstName,
            lastName: options.lastName,
            email: options.email,
            idNumber: options.idNumber,
            employmentType: options.employmentType as EmploymentType,
            basicSalaryCents: parseInt(options.salary, 10),
          };
        } else {
          // Interactive mode
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'firstName',
              message: 'First name:',
              default: options.firstName,
              validate: (input: string) => input.length > 0 || 'First name is required',
            },
            {
              type: 'input',
              name: 'lastName',
              message: 'Last name:',
              default: options.lastName,
              validate: (input: string) => input.length > 0 || 'Last name is required',
            },
            {
              type: 'input',
              name: 'email',
              message: 'Email address:',
              default: options.email,
              validate: (input: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Invalid email address',
            },
            {
              type: 'input',
              name: 'phone',
              message: 'Phone number (optional):',
            },
            {
              type: 'input',
              name: 'idNumber',
              message: 'SA ID number (13 digits, optional):',
              default: options.idNumber,
              validate: (input: string) => !input || /^\d{13}$/.test(input) || 'ID must be 13 digits',
            },
            {
              type: 'input',
              name: 'dateOfBirth',
              message: 'Date of birth (YYYY-MM-DD, optional):',
              validate: (input: string) => !input || /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Use YYYY-MM-DD format',
            },
            {
              type: 'list',
              name: 'employmentType',
              message: 'Employment type:',
              choices: ['PERMANENT', 'CONTRACT', 'CASUAL'],
              default: options.employmentType || 'PERMANENT',
            },
            {
              type: 'list',
              name: 'payFrequency',
              message: 'Pay frequency:',
              choices: ['MONTHLY', 'BIWEEKLY', 'WEEKLY'],
              default: 'MONTHLY',
            },
            {
              type: 'input',
              name: 'basicSalaryRands',
              message: 'Basic salary (ZAR):',
              default: options.salary ? (parseInt(options.salary, 10) / 100).toString() : undefined,
              validate: (input: string) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Enter a valid amount',
            },
          ]);

          createOptions = {
            firstName: answers.firstName,
            lastName: answers.lastName,
            email: answers.email,
            phone: answers.phone || undefined,
            idNumber: answers.idNumber || undefined,
            dateOfBirth: answers.dateOfBirth || undefined,
            employmentType: answers.employmentType as EmploymentType,
            payFrequency: answers.payFrequency as PayFrequency,
            basicSalaryCents: Math.round(parseFloat(answers.basicSalaryRands) * 100),
          };
        }

        const spinner = ora('Creating staff member...').start();
        const response = await client.createStaff(createOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create staff member');
          return;
        }

        printSuccess(`Created staff member: ${response.data.employee_number}`);

        printSummary('New Staff Member', {
          'Employee #': response.data.employee_number,
          'Name': `${response.data.first_name} ${response.data.last_name}`,
          'Email': response.data.email,
          'Employment Type': response.data.employment_type,
          'Salary': formatZAR(response.data.basic_salary_cents),
        });
      });
    });

  // Update command
  staff
    .command('update <id>')
    .description('Update staff member details')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--phone <phone>', 'Phone number')
    .option('--employment-type <type>', 'Employment type')
    .option('--salary <cents>', 'Basic salary in cents')
    .option('--bank-name <name>', 'Bank name')
    .option('--bank-account <number>', 'Bank account number')
    .option('--bank-branch <code>', 'Bank branch code')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const updateOptions: UpdateStaffOptions = {
          firstName: options.firstName,
          lastName: options.lastName,
          email: options.email,
          phone: options.phone,
          employmentType: options.employmentType as EmploymentType | undefined,
          basicSalaryCents: options.salary ? parseInt(options.salary, 10) : undefined,
          bankName: options.bankName,
          bankAccountNumber: options.bankAccount,
          bankBranchCode: options.bankBranch,
        };

        // Remove undefined values
        const cleanOptions = Object.fromEntries(
          Object.entries(updateOptions).filter(([, v]) => v !== undefined),
        ) as UpdateStaffOptions;

        if (Object.keys(cleanOptions).length === 0) {
          printError('No update options provided. Use --help to see available options.');
          return;
        }

        const spinner = ora('Updating staff member...').start();
        const response = await client.updateStaff(id, cleanOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to update staff member');
          return;
        }

        printSuccess(`Updated staff member: ${response.data.employee_number}`);
      });
    });

  // Delete (deactivate) command
  staff
    .command('delete <id>')
    .description('Deactivate a staff member (soft delete)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Fetch staff details first
        const spinner = ora('Fetching staff details...').start();
        const getResponse = await client.getStaff(id);
        spinner.stop();

        if (!getResponse.success || !getResponse.data) {
          printError('Staff member not found');
          return;
        }

        const staffMember = getResponse.data;

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Deactivate ${staffMember.first_name} ${staffMember.last_name} (${staffMember.employee_number})?`,
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Operation cancelled');
            return;
          }
        }

        const deactivateSpinner = ora('Deactivating staff member...').start();
        const response = await client.deactivateStaff(id);
        deactivateSpinner.stop();

        if (!response.success) {
          printError('Failed to deactivate staff member');
          return;
        }

        printSuccess(`Deactivated staff member: ${staffMember.employee_number}`);
      });
    });

  // Resend invite command
  staff
    .command('resend-invite <id>')
    .description('Resend onboarding email to staff member')
    .action(async (id) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Sending onboarding email...').start();
        const response = await client.resendStaffInvite(id);
        spinner.stop();

        if (!response.success) {
          printError('Failed to send onboarding email');
          return;
        }

        printSuccess('Onboarding email sent successfully');
      });
    });
}
