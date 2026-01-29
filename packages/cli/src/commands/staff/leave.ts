/**
 * Staff Leave Commands
 *
 * cb staff leave types              - List leave types
 * cb staff leave balance <staffId>  - Show leave balance
 * cb staff leave history <staffId>  - Leave request history
 * cb staff leave request <staffId>  - Create leave request
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatTable,
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatDate,
} from '../../lib/output.js';
import type { GlobalOptions, LeaveRequestStatus } from '../../types/index.js';

export function registerLeaveCommands(staffCommand: Command): void {
  const leave = staffCommand
    .command('leave')
    .description('Leave management');

  // List leave types
  leave
    .command('types')
    .description('List available leave types')
    .action(async (command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching leave types...').start();
        const response = await client.getLeaveTypes();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch leave types');
          return;
        }

        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        const headers = ['Code', 'Name', 'Annual Days', 'Paid', 'Carry Over'];
        const rows = response.data.map((type) => [
          type.code,
          type.name,
          type.annual_days.toString(),
          type.is_paid ? chalk.green('Yes') : 'No',
          type.can_carry_over ? chalk.blue('Yes') : 'No',
        ]);

        console.log(formatTable(headers, rows));
      });
    });

  // Show leave balance
  leave
    .command('balance <staffId>')
    .description('Show leave balance for a staff member')
    .option('--year <year>', 'Leave year (defaults to current)')
    .action(async (staffId, options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const year = options.year || new Date().getFullYear().toString();

        const spinner = ora('Fetching leave balance...').start();
        const response = await client.getLeaveBalance(staffId, { year });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch leave balance');
          return;
        }

        const balance = response.data;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(balance));
          return;
        }

        printSummary(`Leave Balance: ${balance.staff_name} (${year})`, {
          'Employee #': balance.employee_number,
          'Leave Year': balance.year,
        });

        const headers = ['Leave Type', 'Entitled', 'Used', 'Pending', 'Available'];
        const rows = balance.balances.map((b) => [
          b.leave_type_name,
          b.entitled_days.toString(),
          b.used_days.toString(),
          b.pending_days > 0 ? chalk.yellow(b.pending_days.toString()) : '0',
          b.available_days > 0 ? chalk.green(b.available_days.toString()) : chalk.red('0'),
        ]);

        console.log(formatTable(headers, rows));
      });
    });

  // Leave request history
  leave
    .command('history <staffId>')
    .description('Show leave request history for a staff member')
    .option('--status <status>', 'Filter by status: PENDING, APPROVED, REJECTED, CANCELLED')
    .option('--year <year>', 'Filter by year')
    .option('-l, --limit <n>', 'Limit results', '20')
    .action(async (staffId, options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching leave history...').start();
        const response = await client.getLeaveHistory(staffId, {
          status: options.status as LeaveRequestStatus | undefined,
          year: options.year,
          limit: parseInt(options.limit, 10),
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch leave history');
          return;
        }

        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        if (response.data.requests.length === 0) {
          printInfo('No leave requests found');
          return;
        }

        const headers = ['ID', 'Type', 'From', 'To', 'Days', 'Status', 'Notes'];
        const rows = response.data.requests.map((req) => [
          req.id.slice(0, 8) + '...',
          req.leave_type_name,
          formatDate(req.start_date),
          formatDate(req.end_date),
          req.days.toString(),
          formatLeaveStatus(req.status),
          req.notes ? (req.notes.length > 15 ? req.notes.slice(0, 12) + '...' : req.notes) : '-',
        ]);

        console.log(formatTable(headers, rows));

        if (response.meta) {
          printInfo(`Showing ${response.data.requests.length} of ${response.meta.total} requests`);
        }
      });
    });

  // Create leave request
  leave
    .command('request <staffId>')
    .description('Create a leave request')
    .option('--type <code>', 'Leave type code (e.g., ANNUAL, SICK)')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--notes <text>', 'Request notes/reason')
    .option('--skip-prompts', 'Skip interactive prompts')
    .action(async (staffId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let requestOptions: {
          leaveTypeCode: string;
          startDate: string;
          endDate: string;
          notes?: string;
        };

        if (options.skipPrompts) {
          if (!options.type || !options.from || !options.to) {
            printError('Missing required options. Use --type, --from, and --to');
            return;
          }
          requestOptions = {
            leaveTypeCode: options.type,
            startDate: options.from,
            endDate: options.to,
            notes: options.notes,
          };
        } else {
          // Fetch leave types for choices
          const typesResponse = await client.getLeaveTypes();
          const leaveTypes = typesResponse.data || [];

          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'leaveTypeCode',
              message: 'Leave type:',
              choices: leaveTypes.map((t) => ({
                name: `${t.name} (${t.annual_days} days/year)`,
                value: t.code,
              })),
              default: options.type,
            },
            {
              type: 'input',
              name: 'startDate',
              message: 'Start date (YYYY-MM-DD):',
              default: options.from,
              validate: (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Use YYYY-MM-DD format',
            },
            {
              type: 'input',
              name: 'endDate',
              message: 'End date (YYYY-MM-DD):',
              default: options.to,
              validate: (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Use YYYY-MM-DD format',
            },
            {
              type: 'input',
              name: 'notes',
              message: 'Notes/reason (optional):',
              default: options.notes,
            },
          ]);

          requestOptions = {
            leaveTypeCode: answers.leaveTypeCode,
            startDate: answers.startDate,
            endDate: answers.endDate,
            notes: answers.notes || undefined,
          };
        }

        const spinner = ora('Creating leave request...').start();
        const response = await client.createLeaveRequest(staffId, requestOptions);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to create leave request');
          return;
        }

        const request = response.data;

        printSuccess('Leave request created');

        printSummary('Leave Request', {
          'Request ID': request.id,
          'Leave Type': request.leave_type_name,
          'From': formatDate(request.start_date),
          'To': formatDate(request.end_date),
          'Days': request.days,
          'Status': formatLeaveStatus(request.status),
        });
      });
    });

  // Approve/reject leave request
  leave
    .command('approve <requestId>')
    .description('Approve a leave request')
    .option('--notes <text>', 'Approval notes')
    .action(async (requestId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Approving leave request...').start();
        const response = await client.approveLeaveRequest(requestId, {
          notes: options.notes,
        });
        spinner.stop();

        if (!response.success) {
          printError('Failed to approve leave request');
          return;
        }

        printSuccess('Leave request approved');
      });
    });

  leave
    .command('reject <requestId>')
    .description('Reject a leave request')
    .option('--reason <text>', 'Rejection reason')
    .action(async (requestId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        if (!options.reason) {
          const { reason } = await inquirer.prompt([
            {
              type: 'input',
              name: 'reason',
              message: 'Rejection reason:',
              validate: (input: string) => input.length > 0 || 'Reason is required',
            },
          ]);
          options.reason = reason;
        }

        const spinner = ora('Rejecting leave request...').start();
        const response = await client.rejectLeaveRequest(requestId, {
          reason: options.reason,
        });
        spinner.stop();

        if (!response.success) {
          printError('Failed to reject leave request');
          return;
        }

        printSuccess('Leave request rejected');
      });
    });
}

/**
 * Format leave request status with color
 */
function formatLeaveStatus(status: LeaveRequestStatus): string {
  const colors: Record<LeaveRequestStatus, (s: string) => string> = {
    PENDING: chalk.yellow,
    APPROVED: chalk.green,
    REJECTED: chalk.red,
    CANCELLED: chalk.gray,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}
