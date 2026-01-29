/**
 * Staff Onboarding Commands
 *
 * cb staff onboarding <id>           - Show onboarding progress
 * cb staff onboarding <id> initiate  - Start onboarding workflow
 * cb staff onboarding <id> complete  - Mark onboarding complete
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { executeAction } from '../../cli.js';
import { requireAuth } from '../../lib/auth.js';
import { createApiClient } from '../../lib/api-client.js';
import {
  formatJson,
  printSuccess,
  printError,
  printInfo,
  printSummary,
  formatDate,
} from '../../lib/output.js';
import type { GlobalOptions, StaffOnboardingStatus } from '../../types/index.js';

export function registerOnboardingCommands(staffCommand: Command): void {
  const onboarding = staffCommand
    .command('onboarding <staffId>')
    .description('Staff onboarding management');

  // Default action - show onboarding progress
  onboarding.action(async (staffId, command) => {
    await executeAction(async () => {
      const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
      const credentials = requireAuth();
      const client = createApiClient(credentials);

      const spinner = ora('Fetching onboarding status...').start();
      const response = await client.getStaffOnboardingStatus(staffId);
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

      // Pretty print onboarding progress
      printSummary(`Onboarding: ${status.staff_name}`, {
        'Employee #': status.employee_number,
        'Status': formatOnboardingStatus(status.status),
        'Started': status.started_at ? formatDate(status.started_at) : 'Not started',
        'Completed': status.completed_at ? formatDate(status.completed_at) : 'Pending',
        'Progress': `${status.completed_steps}/${status.total_steps} steps`,
      });

      // Display steps
      console.log(chalk.bold('Onboarding Steps:'));
      console.log();

      for (const step of status.steps) {
        const icon = step.completed ? chalk.green('[X]') : chalk.gray('[ ]');
        const name = step.completed ? chalk.dim(step.name) : step.name;
        const date = step.completed_at ? chalk.dim(` (${formatDate(step.completed_at)})`) : '';
        console.log(`  ${icon} ${name}${date}`);
        if (step.notes && !step.completed) {
          console.log(`      ${chalk.dim(step.notes)}`);
        }
      }
      console.log();
    });
  });

  // Initiate onboarding
  onboarding
    .command('initiate')
    .description('Start onboarding workflow for staff member')
    .option('--send-email', 'Send welcome email', true)
    .action(async (options, command) => {
      await executeAction(async () => {
        const staffId = command.parent?.args[0];
        if (!staffId) {
          printError('Staff ID is required');
          return;
        }

        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Initiating onboarding...').start();
        const response = await client.initiateOnboarding(staffId, {
          sendEmail: options.sendEmail,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to initiate onboarding');
          return;
        }

        printSuccess(`Onboarding initiated for ${response.data.staff_name}`);

        printSummary('Onboarding Started', {
          'Employee #': response.data.employee_number,
          'Steps': `${response.data.total_steps} steps to complete`,
          'Email Sent': options.sendEmail ? 'Yes' : 'No',
        });
      });
    });

  // Complete onboarding
  onboarding
    .command('complete')
    .description('Mark onboarding as complete')
    .option('--force', 'Complete even if steps are pending')
    .action(async (options, command) => {
      await executeAction(async () => {
        const staffId = command.parent?.args[0];
        if (!staffId) {
          printError('Staff ID is required');
          return;
        }

        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Completing onboarding...').start();
        const response = await client.completeOnboarding(staffId, {
          force: options.force,
        });
        spinner.stop();

        if (!response.success) {
          if (response.error?.includes('pending steps')) {
            printError('Cannot complete onboarding: Some steps are pending');
            printInfo('Use --force to complete anyway, or finish pending steps first');
          } else {
            printError('Failed to complete onboarding');
          }
          return;
        }

        printSuccess(`Onboarding completed for ${response.data?.staff_name}`);
      });
    });

  // Complete a specific step
  onboarding
    .command('step <stepId>')
    .description('Mark a specific onboarding step as complete')
    .option('--notes <text>', 'Add notes to the step')
    .action(async (stepId, options, command) => {
      await executeAction(async () => {
        const staffId = command.parent?.parent?.args[0];
        if (!staffId) {
          printError('Staff ID is required');
          return;
        }

        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Completing step...').start();
        const response = await client.completeOnboardingStep(staffId, stepId, {
          notes: options.notes,
        });
        spinner.stop();

        if (!response.success) {
          printError('Failed to complete step');
          return;
        }

        printSuccess(`Step "${response.data?.step_name}" marked as complete`);

        if (response.data?.remaining_steps === 0) {
          printInfo('All onboarding steps complete! Run "cb staff onboarding <id> complete" to finalize.');
        } else {
          printInfo(`${response.data?.remaining_steps} steps remaining`);
        }
      });
    });
}

/**
 * Format onboarding status with color
 */
function formatOnboardingStatus(status: StaffOnboardingStatus): string {
  const colors: Record<StaffOnboardingStatus, (s: string) => string> = {
    NOT_STARTED: chalk.gray,
    IN_PROGRESS: chalk.yellow,
    COMPLETED: chalk.green,
    BLOCKED: chalk.red,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status.replace('_', ' '));
}
