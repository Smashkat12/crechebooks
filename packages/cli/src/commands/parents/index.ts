/**
 * Parent Commands
 *
 * cb parents list          - List parents
 * cb parents get <id>      - Get parent details with children
 * cb parents create        - Create parent
 * cb parents update <id>   - Update parent details
 * cb parents invite <id>   - Send onboarding invite email
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
  formatTable,
  formatCsv,
  formatDate,
  printSuccess,
  printError,
  printInfo,
  printSummary,
} from '../../lib/output.js';
import type { GlobalOptions, Parent, ListParentsOptions } from '../../types/index.js';

export function registerParentCommands(program: Command): void {
  const parents = program
    .command('parents')
    .description('Parent/guardian management');

  // List command
  parents
    .command('list')
    .description('List parents')
    .option('-s, --search <query>', 'Search by name, email, or phone')
    .option('--active', 'Show only active parents')
    .option('--inactive', 'Show only inactive parents')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching parents...').start();

        const listOptions: ListParentsOptions = {
          search: options.search,
          isActive: options.inactive ? false : options.active ? true : undefined,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listParents(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch parents');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No parents found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatParents(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} parents (page ${response.meta.page}/${response.meta.totalPages})`,
          );
        }
      });
    });

  // Get command
  parents
    .command('get <id>')
    .description('Get parent details with children')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching parent...').start();
        const response = await client.getParent(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Parent not found');
          return;
        }

        const parent = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(parent));
          return;
        }

        // Pretty print parent details
        printSummary(`${parent.firstName} ${parent.lastName}`, {
          'ID': parent.id,
          'Email': parent.email || '-',
          'Phone': parent.phone || '-',
          'WhatsApp': parent.whatsapp || '-',
          'Preferred Contact': parent.preferredContact,
          'Status': parent.isActive ? chalk.green('Active') : chalk.red('Inactive'),
        });

        if (parent.address) {
          printSummary('Address', {
            'Address': parent.address,
          });
        }

        if (parent.children && parent.children.length > 0) {
          console.log(chalk.bold('Children'));
          console.log(chalk.dim('-'.repeat(40)));
          parent.children.forEach((child, i) => {
            const status = child.isActive ? chalk.green('Active') : chalk.dim('Inactive');
            const enrollment = child.enrollmentStatus
              ? ` (${child.enrollmentStatus})`
              : '';
            console.log(
              `  ${i + 1}. ${child.firstName} ${child.lastName} - ${status}${enrollment}`,
            );
            console.log(`     DOB: ${formatDate(child.dateOfBirth)}`);
          });
          console.log();
        }

        if (parent.notes) {
          console.log(chalk.bold('Notes'));
          console.log(chalk.dim('-'.repeat(40)));
          console.log(`  ${parent.notes}`);
          console.log();
        }
      });
    });

  // Create command
  parents
    .command('create')
    .description('Create a new parent')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--phone <phone>', 'Phone number')
    .option('--whatsapp <whatsapp>', 'WhatsApp number')
    .option('--preferred-contact <method>', 'Preferred contact: EMAIL, WHATSAPP, BOTH', 'EMAIL')
    .option('--id-number <id>', 'SA ID number')
    .option('--address <address>', 'Physical address')
    .option('--json <data>', 'Create from JSON data')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let createData: Record<string, unknown> = {};

        if (options.json) {
          try {
            createData = JSON.parse(options.json);
          } catch {
            printError('Invalid JSON data');
            return;
          }
        } else if (options.interactive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'firstName',
              message: 'First name:',
              validate: (input: string) => input.length > 0 || 'First name is required',
            },
            {
              type: 'input',
              name: 'lastName',
              message: 'Last name:',
              validate: (input: string) => input.length > 0 || 'Last name is required',
            },
            {
              type: 'input',
              name: 'email',
              message: 'Email address:',
              validate: (input: string) => {
                if (!input) return true; // Optional
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(input) || 'Invalid email format';
              },
            },
            {
              type: 'input',
              name: 'phone',
              message: 'Phone number:',
            },
            {
              type: 'input',
              name: 'whatsapp',
              message: 'WhatsApp number (leave blank if same as phone):',
            },
            {
              type: 'list',
              name: 'preferredContact',
              message: 'Preferred contact method:',
              choices: ['EMAIL', 'WHATSAPP', 'BOTH'],
              default: 'EMAIL',
            },
            {
              type: 'input',
              name: 'idNumber',
              message: 'SA ID number (optional):',
            },
            {
              type: 'input',
              name: 'address',
              message: 'Physical address (optional):',
            },
          ]);

          createData = Object.fromEntries(
            Object.entries(answers).filter(([, v]) => v !== ''),
          );
        } else {
          // Build from flags
          if (!options.firstName || !options.lastName) {
            printError('First name and last name are required', 'Use --first-name and --last-name options or -i for interactive mode');
            return;
          }

          createData = {
            firstName: options.firstName,
            lastName: options.lastName,
            email: options.email,
            phone: options.phone,
            whatsapp: options.whatsapp,
            preferredContact: options.preferredContact,
            idNumber: options.idNumber,
            address: options.address,
          };

          // Remove undefined values
          createData = Object.fromEntries(
            Object.entries(createData).filter(([, v]) => v !== undefined),
          );
        }

        const spinner = ora('Creating parent...').start();
        const response = await client.createParent(createData);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create parent');
          return;
        }

        const parent = response.data;
        printSuccess(`Parent created: ${parent.firstName} ${parent.lastName}`);

        printSummary('New Parent', {
          'ID': parent.id,
          'Name': `${parent.firstName} ${parent.lastName}`,
          'Email': parent.email || '-',
          'Phone': parent.phone || '-',
        });

        printInfo("Use 'cb children create --parent " + parent.id + "' to add children");
      });
    });

  // Update command
  parents
    .command('update <id>')
    .description('Update parent details')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--phone <phone>', 'Phone number')
    .option('--whatsapp <whatsapp>', 'WhatsApp number')
    .option('--preferred-contact <method>', 'Preferred contact: EMAIL, WHATSAPP, BOTH')
    .option('--address <address>', 'Physical address')
    .option('--active', 'Mark as active')
    .option('--inactive', 'Mark as inactive')
    .option('--json <data>', 'Update from JSON data')
    .action(async (id, options) => {
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
        } else {
          if (options.firstName) updateData.firstName = options.firstName;
          if (options.lastName) updateData.lastName = options.lastName;
          if (options.email) updateData.email = options.email;
          if (options.phone) updateData.phone = options.phone;
          if (options.whatsapp) updateData.whatsapp = options.whatsapp;
          if (options.preferredContact) updateData.preferredContact = options.preferredContact;
          if (options.address) updateData.address = options.address;
          if (options.active) updateData.isActive = true;
          if (options.inactive) updateData.isActive = false;

          if (Object.keys(updateData).length === 0) {
            printError('No fields to update', 'Provide at least one option like --email or --phone');
            return;
          }
        }

        const spinner = ora('Updating parent...').start();
        const response = await client.updateParent(id, updateData);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to update parent');
          return;
        }

        const parent = response.data;
        printSuccess(`Parent updated: ${parent.firstName} ${parent.lastName}`);
      });
    });

  // Invite command
  parents
    .command('invite <id>')
    .description('Send onboarding invite email to parent')
    .option('--resend', 'Resend even if previously sent')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Sending onboarding invite...').start();
        const response = await client.sendParentInvite(id, { resend: options.resend });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to send invite');
          return;
        }

        const result = response.data;

        if (result.sent) {
          printSuccess(`Invite sent to ${result.email}`);
          if (result.invite_link) {
            printInfo(`Invite link: ${result.invite_link}`);
          }
        } else if (result.already_sent && !options.resend) {
          printInfo('Invite was already sent previously. Use --resend to send again.');
        } else {
          printError('Failed to send invite', result.error);
        }
      });
    });
}

// Formatting helpers

function formatParents(parents: Parent[], format: string): string {
  if (format === 'json') {
    return formatJson(parents);
  }

  if (format === 'csv') {
    const rows = parents.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email || '',
      phone: p.phone || '',
      isActive: p.isActive,
      childrenCount: p.childrenCount || 0,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['ID', 'Name', 'Email', 'Phone', 'Children', 'Status'];
  const rows = parents.map((p) => [
    p.id.slice(0, 8) + '...',
    `${p.firstName} ${p.lastName}`.slice(0, 25),
    p.email?.slice(0, 25) || '-',
    p.phone || '-',
    String(p.childrenCount || 0),
    p.isActive ? chalk.green('Active') : chalk.dim('Inactive'),
  ]);

  return formatTable(headers, rows);
}
