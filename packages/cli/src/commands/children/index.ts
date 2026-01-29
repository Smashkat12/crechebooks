/**
 * Children Commands
 *
 * cb children list         - List children
 * cb children get <id>     - Get child details with enrollment
 * cb children create       - Create child
 * cb children enroll <id>  - Create enrollment with fee structure
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
  formatZAR,
  printSuccess,
  printError,
  printInfo,
  printSummary,
} from '../../lib/output.js';
import type { GlobalOptions, Child, ListChildrenOptions } from '../../types/index.js';

export function registerChildCommands(program: Command): void {
  const children = program
    .command('children')
    .description('Child management');

  // List command
  children
    .command('list')
    .description('List children')
    .option('--parent <id>', 'Filter by parent ID')
    .option('--enrolled', 'Show only enrolled children')
    .option('--not-enrolled', 'Show only children without active enrollment')
    .option('--active', 'Show only active children')
    .option('--inactive', 'Show only inactive children')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching children...').start();

        const listOptions: ListChildrenOptions = {
          parentId: options.parent,
          enrolled: options.enrolled ? true : options.notEnrolled ? false : undefined,
          isActive: options.inactive ? false : options.active ? true : undefined,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        };

        const response = await client.listChildren(listOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch children');
          return;
        }

        if (response.data.length === 0) {
          printInfo('No children found matching your criteria');
          return;
        }

        const format = globalOpts?.format || 'table';
        console.log(formatChildren(response.data, format));

        if (response.meta && format === 'table') {
          printInfo(
            `Showing ${response.data.length} of ${response.meta.total} children (page ${response.meta.page}/${response.meta.totalPages})`,
          );
        }
      });
    });

  // Get command
  children
    .command('get <id>')
    .description('Get child details with enrollment information')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching child...').start();
        const response = await client.getChild(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Child not found');
          return;
        }

        const child = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(child));
          return;
        }

        // Pretty print child details
        printSummary(`${child.firstName} ${child.lastName}`, {
          'ID': child.id,
          'Date of Birth': formatDate(child.dateOfBirth),
          'Age': calculateAge(child.dateOfBirth),
          'Gender': child.gender || '-',
          'Status': child.isActive ? chalk.green('Active') : chalk.red('Inactive'),
        });

        if (child.parent) {
          printSummary('Parent/Guardian', {
            'Name': `${child.parent.firstName} ${child.parent.lastName}`,
            'Email': child.parent.email || '-',
            'Phone': child.parent.phone || '-',
          });
        }

        if (child.enrollment) {
          const enrollment = child.enrollment;
          const statusColor = getEnrollmentStatusColor(enrollment.status);

          printSummary('Current Enrollment', {
            'Status': statusColor(enrollment.status),
            'Fee Structure': enrollment.feeStructureName,
            'Monthly Fee': formatZAR(enrollment.feeAmountCents),
            'Start Date': formatDate(enrollment.startDate),
            'End Date': enrollment.endDate ? formatDate(enrollment.endDate) : '-',
            'Sibling Discount': enrollment.siblingDiscountApplied ? 'Yes' : 'No',
          });

          if (enrollment.customFeeOverrideCents) {
            printInfo(`Custom fee override: ${formatZAR(enrollment.customFeeOverrideCents)}`);
          }
        } else {
          printInfo('Not currently enrolled');
          printInfo("Use 'cb children enroll " + child.id + "' to create an enrollment");
        }

        if (child.medicalNotes) {
          console.log(chalk.bold('Medical Notes'));
          console.log(chalk.dim('-'.repeat(40)));
          console.log(`  ${chalk.yellow('!')} ${child.medicalNotes}`);
          console.log();
        }

        if (child.emergencyContact) {
          printSummary('Emergency Contact', {
            'Name': child.emergencyContact,
            'Phone': child.emergencyPhone || '-',
          });
        }
      });
    });

  // Create command
  children
    .command('create')
    .description('Create a new child')
    .requiredOption('--parent <id>', 'Parent ID (required)')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--dob <date>', 'Date of birth (YYYY-MM-DD)')
    .option('--gender <gender>', 'Gender: MALE, FEMALE, OTHER')
    .option('--medical-notes <notes>', 'Medical notes')
    .option('--emergency-contact <name>', 'Emergency contact name')
    .option('--emergency-phone <phone>', 'Emergency contact phone')
    .option('--json <data>', 'Create from JSON data')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let createData: Record<string, unknown> = {
          parentId: options.parent,
        };

        if (options.json) {
          try {
            const jsonData = JSON.parse(options.json);
            createData = { ...createData, ...jsonData };
          } catch {
            printError('Invalid JSON data');
            return;
          }
        } else if (options.interactive) {
          // Verify parent exists
          const parentSpinner = ora('Verifying parent...').start();
          const parentResponse = await client.getParent(options.parent);
          parentSpinner.stop();

          if (!parentResponse.success || !parentResponse.data) {
            printError('Parent not found');
            return;
          }

          const parent = parentResponse.data;
          printInfo(`Creating child for: ${parent.firstName} ${parent.lastName}`);
          console.log();

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
              default: parent.lastName,
              validate: (input: string) => input.length > 0 || 'Last name is required',
            },
            {
              type: 'input',
              name: 'dateOfBirth',
              message: 'Date of birth (YYYY-MM-DD):',
              validate: (input: string) => {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(input)) return 'Use YYYY-MM-DD format';
                const date = new Date(input);
                if (isNaN(date.getTime())) return 'Invalid date';
                if (date > new Date()) return 'Date cannot be in the future';
                return true;
              },
            },
            {
              type: 'list',
              name: 'gender',
              message: 'Gender:',
              choices: [
                { name: 'Male', value: 'MALE' },
                { name: 'Female', value: 'FEMALE' },
                { name: 'Other', value: 'OTHER' },
                { name: 'Prefer not to say', value: null },
              ],
            },
            {
              type: 'input',
              name: 'medicalNotes',
              message: 'Medical notes (allergies, conditions, etc.):',
            },
            {
              type: 'input',
              name: 'emergencyContact',
              message: 'Emergency contact name:',
            },
            {
              type: 'input',
              name: 'emergencyPhone',
              message: 'Emergency contact phone:',
              when: (a) => a.emergencyContact,
            },
          ]);

          createData = {
            ...createData,
            ...Object.fromEntries(
              Object.entries(answers).filter(([, v]) => v !== '' && v !== null),
            ),
          };
        } else {
          // Build from flags
          if (!options.firstName || !options.lastName || !options.dob) {
            printError('First name, last name, and DOB are required', 'Use -i for interactive mode');
            return;
          }

          createData = {
            ...createData,
            firstName: options.firstName,
            lastName: options.lastName,
            dateOfBirth: options.dob,
            gender: options.gender,
            medicalNotes: options.medicalNotes,
            emergencyContact: options.emergencyContact,
            emergencyPhone: options.emergencyPhone,
          };

          // Remove undefined values
          createData = Object.fromEntries(
            Object.entries(createData).filter(([, v]) => v !== undefined),
          );
        }

        const spinner = ora('Creating child...').start();
        const response = await client.createChild(createData);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create child');
          return;
        }

        const child = response.data;
        printSuccess(`Child created: ${child.firstName} ${child.lastName}`);

        printSummary('New Child', {
          'ID': child.id,
          'Name': `${child.firstName} ${child.lastName}`,
          'DOB': formatDate(child.dateOfBirth),
          'Age': calculateAge(child.dateOfBirth),
        });

        printInfo("Use 'cb children enroll " + child.id + "' to set up enrollment");
      });
    });

  // Enroll command
  children
    .command('enroll <id>')
    .description('Create enrollment for a child')
    .option('--fee-structure <id>', 'Fee structure ID')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--end-date <date>', 'End date (YYYY-MM-DD, optional)')
    .option('--custom-fee <cents>', 'Custom fee override in cents', parseInt)
    .option('--sibling-discount', 'Apply sibling discount')
    .option('--notes <notes>', 'Enrollment notes')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // First verify the child exists and get current enrollment status
        const childSpinner = ora('Verifying child...').start();
        const childResponse = await client.getChild(id);
        childSpinner.stop();

        if (!childResponse.success || !childResponse.data) {
          printError('Child not found');
          return;
        }

        const child = childResponse.data;

        if (child.enrollment?.status === 'ACTIVE') {
          printError(
            `${child.firstName} already has an active enrollment`,
            'End the current enrollment first or update it.',
          );
          return;
        }

        let enrollData: Record<string, unknown> = {
          childId: id,
        };

        if (options.interactive) {
          // Fetch available fee structures
          const feeSpinner = ora('Loading fee structures...').start();
          const feeResponse = await client.listFeeStructures({ active: true });
          feeSpinner.stop();

          if (!feeResponse.success || !feeResponse.data || feeResponse.data.length === 0) {
            printError('No active fee structures found', "Create fee structures in the web dashboard first");
            return;
          }

          const feeStructures = feeResponse.data;

          printInfo(`Enrolling: ${child.firstName} ${child.lastName}`);
          console.log();

          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'feeStructureId',
              message: 'Select fee structure:',
              choices: feeStructures.map((fs) => ({
                name: `${fs.name} - ${formatZAR(fs.amount_cents)} (${fs.fee_type})`,
                value: fs.id,
              })),
            },
            {
              type: 'input',
              name: 'startDate',
              message: 'Start date (YYYY-MM-DD):',
              default: new Date().toISOString().split('T')[0],
              validate: (input: string) => {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(input)) return 'Use YYYY-MM-DD format';
                return true;
              },
            },
            {
              type: 'confirm',
              name: 'siblingDiscountApplied',
              message: 'Apply sibling discount?',
              default: false,
            },
            {
              type: 'confirm',
              name: 'hasCustomFee',
              message: 'Override with custom fee?',
              default: false,
            },
            {
              type: 'number',
              name: 'customFeeOverrideCents',
              message: 'Custom fee amount (in cents):',
              when: (a) => a.hasCustomFee,
              validate: (input: number) => input > 0 || 'Amount must be positive',
            },
            {
              type: 'input',
              name: 'notes',
              message: 'Enrollment notes (optional):',
            },
          ]);

          enrollData = {
            ...enrollData,
            feeStructureId: answers.feeStructureId,
            startDate: answers.startDate,
            siblingDiscountApplied: answers.siblingDiscountApplied,
            customFeeOverrideCents: answers.customFeeOverrideCents,
            notes: answers.notes || undefined,
          };
        } else {
          if (!options.feeStructure || !options.startDate) {
            printError('Fee structure and start date are required', 'Use -i for interactive mode');
            return;
          }

          enrollData = {
            ...enrollData,
            feeStructureId: options.feeStructure,
            startDate: options.startDate,
            endDate: options.endDate,
            siblingDiscountApplied: options.siblingDiscount || false,
            customFeeOverrideCents: options.customFee,
            notes: options.notes,
          };

          // Remove undefined values
          enrollData = Object.fromEntries(
            Object.entries(enrollData).filter(([, v]) => v !== undefined),
          );
        }

        const spinner = ora('Creating enrollment...').start();
        const response = await client.createEnrollment(enrollData);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create enrollment');
          return;
        }

        const enrollment = response.data;
        printSuccess(`Enrollment created for ${child.firstName} ${child.lastName}`);

        printSummary('Enrollment Details', {
          'ID': enrollment.id,
          'Fee Structure': enrollment.feeStructureName,
          'Monthly Fee': formatZAR(enrollment.feeAmountCents),
          'Start Date': formatDate(enrollment.startDate),
          'Status': chalk.green(enrollment.status),
        });

        if (enrollment.siblingDiscountApplied) {
          printInfo('Sibling discount applied');
        }
      });
    });
}

// Formatting helpers

function formatChildren(children: Child[], format: string): string {
  if (format === 'json') {
    return formatJson(children);
  }

  if (format === 'csv') {
    const rows = children.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: c.dateOfBirth,
      parentName: c.parentName || '',
      enrollmentStatus: c.enrollmentStatus || '',
      isActive: c.isActive,
    }));
    return formatCsv(rows);
  }

  // Table format
  const headers = ['ID', 'Name', 'Age', 'Parent', 'Enrollment', 'Status'];
  const rows = children.map((c) => [
    c.id.slice(0, 8) + '...',
    `${c.firstName} ${c.lastName}`.slice(0, 20),
    calculateAge(c.dateOfBirth),
    (c.parentName || '-').slice(0, 18),
    formatEnrollmentStatus(c.enrollmentStatus),
    c.isActive ? chalk.green('Active') : chalk.dim('Inactive'),
  ]);

  return formatTable(headers, rows);
}

function calculateAge(dob: string): string {
  const birthDate = new Date(dob);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0) {
    return `${months}m`;
  }

  return `${years}y ${months}m`;
}

function formatEnrollmentStatus(status?: string): string {
  if (!status) return chalk.dim('Not enrolled');
  return getEnrollmentStatusColor(status)(status);
}

function getEnrollmentStatusColor(status: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    ACTIVE: chalk.green,
    PENDING: chalk.yellow,
    WITHDRAWN: chalk.red,
    GRADUATED: chalk.blue,
  };
  return colors[status] || chalk.white;
}
