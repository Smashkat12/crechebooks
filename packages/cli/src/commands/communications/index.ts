/**
 * Communications Commands
 *
 * cb communications broadcast list        - List broadcast messages
 * cb communications broadcast create      - Create broadcast (interactive)
 * cb communications broadcast send <id>   - Send a draft broadcast
 * cb communications broadcast cancel <id> - Cancel a broadcast
 * cb communications broadcast get <id>    - Get broadcast details
 * cb communications groups list           - List recipient groups
 * cb communications groups create         - Create recipient group
 * cb communications groups delete <id>    - Delete recipient group
 * cb communications preview               - Preview recipients for filters
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
  formatTable,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
  formatDate,
} from '../../lib/output.js';
import type { GlobalOptions } from '../../types/index.js';

// Types for communications
type RecipientType = 'parent' | 'staff' | 'custom';
type CommunicationChannel = 'email' | 'whatsapp' | 'sms' | 'all';
type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'partially_sent' | 'failed' | 'cancelled';

interface Broadcast {
  id: string;
  subject: string | null;
  body: string;
  recipient_type: RecipientType;
  channel: CommunicationChannel;
  status: BroadcastStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
  scheduled_at: string | null;
  delivery_stats?: {
    email_sent: number;
    email_delivered: number;
    email_opened: number;
    whatsapp_sent: number;
    whatsapp_delivered: number;
    whatsapp_read: number;
    sms_sent: number;
    sms_delivered: number;
  };
}

interface RecipientGroup {
  id: string;
  name: string;
  description: string | null;
  recipient_type: RecipientType;
  is_system: boolean;
  created_at: string;
}

interface RecipientPreview {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string;
}

export function registerCommunicationsCommands(program: Command): void {
  const communications = program
    .command('communications')
    .alias('comms')
    .description('Communication and broadcast management');

  // ==================== BROADCAST COMMANDS ====================

  const broadcast = communications
    .command('broadcast')
    .description('Broadcast message management');

  // List broadcasts
  broadcast
    .command('list')
    .description('List broadcast messages')
    .option('-s, --status <status>', 'Filter by status: draft, scheduled, sending, sent, failed, cancelled')
    .option('-t, --type <type>', 'Filter by recipient type: parent, staff, custom')
    .option('-l, --limit <n>', 'Limit results', '20')
    .option('-p, --page <n>', 'Page number', '1')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching broadcasts...').start();
        const response = await client.listBroadcasts({
          status: options.status,
          recipientType: options.type,
          limit: parseInt(options.limit, 10),
          page: parseInt(options.page, 10),
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch broadcasts');
          return;
        }

        const broadcasts = response.data as Broadcast[];

        if (broadcasts.length === 0) {
          printInfo('No broadcasts found');
          return;
        }

        const format = globalOpts?.format || 'table';
        if (format === 'json') {
          console.log(formatJson(broadcasts));
          return;
        }

        // Table format
        const headers = ['ID', 'Subject', 'Type', 'Channel', 'Status', 'Recipients', 'Created'];
        const rows = broadcasts.map((b) => [
          b.id.slice(0, 8),
          (b.subject || '(No subject)').slice(0, 30),
          b.recipient_type.toUpperCase(),
          b.channel.toUpperCase(),
          formatBroadcastStatus(b.status),
          `${b.sent_count}/${b.total_recipients}`,
          formatDate(b.created_at),
        ]);

        console.log(formatTable(headers, rows));

        if (response.meta) {
          printInfo(`Page ${response.meta.page} of ${response.meta.totalPages} (${response.meta.total} total)`);
        }
      });
    });

  // Get broadcast details
  broadcast
    .command('get <id>')
    .description('Get broadcast details with delivery statistics')
    .action(async (id, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching broadcast...').start();
        const response = await client.getBroadcast(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Broadcast not found');
          return;
        }

        const b = response.data as Broadcast;
        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(b));
          return;
        }

        printSummary(`Broadcast: ${b.subject || '(No subject)'}`, {
          'ID': b.id,
          'Status': formatBroadcastStatus(b.status),
          'Recipient Type': b.recipient_type.toUpperCase(),
          'Channel': b.channel.toUpperCase(),
          'Total Recipients': b.total_recipients.toString(),
          'Created': formatDate(b.created_at),
          'Scheduled': b.scheduled_at ? formatDate(b.scheduled_at) : 'N/A',
          'Sent': b.sent_at ? formatDate(b.sent_at) : 'N/A',
        });

        if (b.delivery_stats) {
          console.log();
          console.log(chalk.bold('Delivery Statistics:'));
          console.log(`  Email:    ${b.delivery_stats.email_delivered}/${b.delivery_stats.email_sent} delivered, ${b.delivery_stats.email_opened} opened`);
          console.log(`  WhatsApp: ${b.delivery_stats.whatsapp_delivered}/${b.delivery_stats.whatsapp_sent} delivered, ${b.delivery_stats.whatsapp_read} read`);
          console.log(`  SMS:      ${b.delivery_stats.sms_delivered}/${b.delivery_stats.sms_sent} delivered`);
        }

        console.log();
        console.log(chalk.bold('Message Body:'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(b.body);
        console.log(chalk.dim('─'.repeat(60)));
      });
    });

  // Create broadcast (interactive)
  broadcast
    .command('create')
    .description('Create a new broadcast message')
    .option('--subject <subject>', 'Email subject')
    .option('--body <body>', 'Message body')
    .option('--type <type>', 'Recipient type: parent, staff')
    .option('--channel <channel>', 'Channel: email, whatsapp, sms, all')
    .option('--send', 'Send immediately after creation')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        let recipientType = options.type;
        let channel = options.channel;
        let subject = options.subject;
        let body = options.body;

        // Interactive prompts if not provided
        if (!recipientType || !channel || !body) {
          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'recipientType',
              message: 'Who should receive this message?',
              choices: [
                { name: 'Parents (all active)', value: 'parent' },
                { name: 'Staff (all active)', value: 'staff' },
              ],
              default: options.type || 'parent',
              when: !options.type,
            },
            {
              type: 'list',
              name: 'channel',
              message: 'Which channel(s)?',
              choices: [
                { name: 'Email only', value: 'email' },
                { name: 'WhatsApp only', value: 'whatsapp' },
                { name: 'SMS only', value: 'sms' },
                { name: 'All channels (based on preference)', value: 'all' },
              ],
              default: options.channel || 'email',
              when: !options.channel,
            },
            {
              type: 'input',
              name: 'subject',
              message: 'Subject (for email):',
              default: options.subject,
              when: !options.subject && (options.channel === 'email' || options.channel === 'all' || !options.channel),
            },
            {
              type: 'editor',
              name: 'body',
              message: 'Message body:',
              default: options.body,
              when: !options.body,
            },
          ]);

          recipientType = recipientType || answers.recipientType;
          channel = channel || answers.channel;
          subject = subject || answers.subject;
          body = body || answers.body;
        }

        if (!body) {
          printError('Message body is required');
          return;
        }

        // Preview recipients
        const previewSpinner = ora('Resolving recipients...').start();
        const previewResponse = await client.previewRecipients({
          recipientType,
          channel,
        });
        previewSpinner.stop();

        if (!previewResponse.success || !previewResponse.data) {
          printError('Failed to resolve recipients');
          return;
        }

        const recipientCount = previewResponse.data.total;
        const recipients = previewResponse.data.recipients as RecipientPreview[];
        console.log();
        printInfo(`This broadcast will be sent to ${chalk.bold(recipientCount)} recipients`);

        if (recipients.length > 0) {
          console.log(chalk.dim('Sample recipients:'));
          recipients.slice(0, 5).forEach((r) => {
            console.log(chalk.dim(`  - ${r.name} (${r.email || r.phone || 'no contact'})`));
          });
          if (previewResponse.data.has_more) {
            console.log(chalk.dim(`  ... and ${recipientCount - 5} more`));
          }
        }

        if (recipientCount === 0) {
          printWarning('No recipients match your criteria');
          return;
        }

        // Confirm creation
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Create broadcast for ${recipientCount} recipients?`,
            default: true,
          },
        ]);

        if (!confirm) {
          printInfo('Cancelled');
          return;
        }

        // Create broadcast
        const createSpinner = ora('Creating broadcast...').start();
        const createResponse = await client.createBroadcast({
          subject,
          body,
          recipientType,
          channel,
        });
        createSpinner.stop();

        if (!createResponse.success || !createResponse.data) {
          printError('Failed to create broadcast');
          return;
        }

        const createdBroadcast = createResponse.data as Broadcast;
        printSuccess(`Created broadcast: ${createdBroadcast.id}`);

        // Send immediately if requested
        if (options.send) {
          const { confirmSend } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmSend',
              message: 'Send this broadcast now?',
              default: true,
            },
          ]);

          if (confirmSend) {
            const sendSpinner = ora('Queuing broadcast for sending...').start();
            const sendResponse = await client.sendBroadcast(createdBroadcast.id);
            sendSpinner.stop();

            if (sendResponse.success) {
              printSuccess('Broadcast queued for sending');
            } else {
              printError('Failed to queue broadcast');
            }
          }
        } else {
          printInfo(`Use 'cb communications broadcast send ${createdBroadcast.id}' to send`);
        }
      });
    });

  // Send broadcast
  broadcast
    .command('send <id>')
    .description('Queue a draft broadcast for sending')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Get broadcast details first
        const spinner = ora('Fetching broadcast...').start();
        const response = await client.getBroadcast(id);
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Broadcast not found');
          return;
        }

        const b = response.data as Broadcast;

        if (b.status !== 'draft') {
          printError(`Cannot send broadcast with status: ${b.status}. Only DRAFT broadcasts can be sent.`);
          return;
        }

        console.log();
        printSummary('Broadcast to Send', {
          'Subject': b.subject || '(No subject)',
          'Recipients': b.total_recipients.toString(),
          'Channel': b.channel.toUpperCase(),
        });

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Send to ${b.total_recipients} recipients?`,
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Cancelled');
            return;
          }
        }

        const sendSpinner = ora('Queuing broadcast...').start();
        const sendResponse = await client.sendBroadcast(id);
        sendSpinner.stop();

        if (sendResponse.success) {
          printSuccess('Broadcast queued for sending');
          printInfo('Messages will be delivered in the background');
        } else {
          printError('Failed to queue broadcast');
        }
      });
    });

  // Cancel broadcast
  broadcast
    .command('cancel <id>')
    .description('Cancel a pending broadcast')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Cancel this broadcast?',
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Cancelled');
            return;
          }
        }

        const spinner = ora('Cancelling broadcast...').start();
        const response = await client.cancelBroadcast(id);
        spinner.stop();

        if (response.success) {
          printSuccess('Broadcast cancelled');
        } else {
          printError('Failed to cancel broadcast');
        }
      });
    });

  // ==================== RECIPIENT GROUP COMMANDS ====================

  const groups = communications
    .command('groups')
    .description('Recipient group management');

  // List groups
  groups
    .command('list')
    .description('List recipient groups')
    .action(async (command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching groups...').start();
        const response = await client.listRecipientGroups();
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch recipient groups');
          return;
        }

        const groups = response.data as RecipientGroup[];

        if (groups.length === 0) {
          printInfo('No recipient groups found');
          return;
        }

        const format = globalOpts?.format || 'table';
        if (format === 'json') {
          console.log(formatJson(groups));
          return;
        }

        const headers = ['ID', 'Name', 'Type', 'System', 'Created'];
        const rows = groups.map((g) => [
          g.id.slice(0, 8),
          g.name,
          g.recipient_type.toUpperCase(),
          g.is_system ? 'Yes' : 'No',
          formatDate(g.created_at),
        ]);

        console.log(formatTable(headers, rows));
      });
    });

  // Create group
  groups
    .command('create')
    .description('Create a recipient group')
    .option('--name <name>', 'Group name')
    .option('--description <desc>', 'Group description')
    .option('--type <type>', 'Recipient type: parent, staff')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Group name:',
            default: options.name,
            validate: (input: string) => input.length > 0 || 'Name is required',
            when: !options.name,
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description (optional):',
            default: options.description,
            when: !options.description,
          },
          {
            type: 'list',
            name: 'recipientType',
            message: 'Recipient type:',
            choices: [
              { name: 'Parents', value: 'parent' },
              { name: 'Staff', value: 'staff' },
            ],
            default: options.type || 'parent',
            when: !options.type,
          },
        ]);

        const spinner = ora('Creating group...').start();
        const response = await client.createRecipientGroup({
          name: options.name || answers.name,
          description: options.description || answers.description,
          recipientType: options.type || answers.recipientType,
        });
        spinner.stop();

        if (response.success && response.data) {
          const group = response.data as RecipientGroup;
          printSuccess(`Created group: ${group.name}`);
        } else {
          printError('Failed to create group');
        }
      });
    });

  // Delete group
  groups
    .command('delete <id>')
    .description('Delete a recipient group')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Delete this recipient group?',
              default: false,
            },
          ]);

          if (!confirm) {
            printInfo('Cancelled');
            return;
          }
        }

        const spinner = ora('Deleting group...').start();
        const response = await client.deleteRecipientGroup(id);
        spinner.stop();

        if (response.success) {
          printSuccess('Group deleted');
        } else {
          printError('Failed to delete group');
        }
      });
    });

  // ==================== PREVIEW COMMAND ====================

  communications
    .command('preview')
    .description('Preview recipients for a broadcast')
    .option('-t, --type <type>', 'Recipient type: parent, staff', 'parent')
    .option('-c, --channel <channel>', 'Channel: email, whatsapp, sms, all', 'email')
    .action(async (options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Resolving recipients...').start();
        const response = await client.previewRecipients({
          recipientType: options.type,
          channel: options.channel,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to preview recipients');
          return;
        }

        const { total, recipients: rawRecipients, has_more } = response.data;
        const recipients = rawRecipients as RecipientPreview[];

        console.log();
        printInfo(`Total recipients: ${chalk.bold(total)}`);
        console.log();

        if (recipients.length > 0) {
          const headers = ['Name', 'Email', 'Phone', 'Preferred'];
          const rows = recipients.map((r) => [
            r.name,
            r.email || '-',
            r.phone || '-',
            r.preferred_contact,
          ]);

          console.log(formatTable(headers, rows));

          if (has_more) {
            printInfo(`Showing ${recipients.length} of ${total} recipients`);
          }
        } else {
          printWarning('No recipients match your criteria');
        }
      });
    });
}

// Helper function to format broadcast status with colors
function formatBroadcastStatus(status: BroadcastStatus): string {
  const statusMap: Record<BroadcastStatus, string> = {
    draft: chalk.gray('DRAFT'),
    scheduled: chalk.blue('SCHEDULED'),
    sending: chalk.yellow('SENDING'),
    sent: chalk.green('SENT'),
    partially_sent: chalk.yellow('PARTIAL'),
    failed: chalk.red('FAILED'),
    cancelled: chalk.dim('CANCELLED'),
  };
  return statusMap[status] || status.toUpperCase();
}
