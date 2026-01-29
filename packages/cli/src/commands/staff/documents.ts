/**
 * Staff Documents Commands
 *
 * cb staff documents list <staffId>       - List staff documents
 * cb staff documents upload <staffId> <file> - Upload document
 * cb staff documents verify <documentId>  - Verify document
 * cb staff documents pending              - List pending verifications
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  printWarning,
  formatDate,
} from '../../lib/output.js';
import type { GlobalOptions, DocumentType, DocumentVerificationStatus } from '../../types/index.js';

export function registerDocumentsCommands(staffCommand: Command): void {
  const documents = staffCommand
    .command('documents')
    .description('Staff document management');

  // List documents for a staff member
  documents
    .command('list <staffId>')
    .description('List documents for a staff member')
    .option('--type <type>', 'Filter by document type')
    .option('--status <status>', 'Filter by verification status')
    .action(async (staffId, options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching documents...').start();
        const response = await client.getStaffDocuments(staffId, {
          type: options.type as DocumentType | undefined,
          verificationStatus: options.status as DocumentVerificationStatus | undefined,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch documents');
          return;
        }

        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        if (response.data.documents.length === 0) {
          printInfo('No documents found');
          return;
        }

        console.log(chalk.bold(`Documents for ${response.data.staff_name}`));
        console.log();

        const headers = ['ID', 'Type', 'Name', 'Status', 'Uploaded', 'Expires'];
        const rows = response.data.documents.map((doc) => [
          doc.id.slice(0, 8) + '...',
          doc.type,
          doc.name.length > 20 ? doc.name.slice(0, 17) + '...' : doc.name,
          formatVerificationStatus(doc.verification_status),
          formatDate(doc.uploaded_at),
          doc.expires_at ? formatDate(doc.expires_at) : '-',
        ]);

        console.log(formatTable(headers, rows));

        // Show expiry warnings
        const expiringSoon = response.data.documents.filter((doc) => {
          if (!doc.expires_at) return false;
          const expiryDate = new Date(doc.expires_at);
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
        });

        if (expiringSoon.length > 0) {
          printWarning(`${expiringSoon.length} document(s) expiring within 30 days`);
        }
      });
    });

  // Upload document
  documents
    .command('upload <staffId> <file>')
    .description('Upload a document for a staff member')
    .option('--type <type>', 'Document type (ID_DOCUMENT, CONTRACT, QUALIFICATION, etc.)')
    .option('--name <name>', 'Document name/description')
    .option('--expires <date>', 'Expiry date (YYYY-MM-DD)')
    .action(async (staffId, filePath, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Resolve file path
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
          printError(`File not found: ${resolvedPath}`);
          return;
        }

        // Get file stats
        const stats = fs.statSync(resolvedPath);
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (stats.size > maxSize) {
          printError('File too large. Maximum size is 10MB');
          return;
        }

        let documentType = options.type as DocumentType;
        let documentName = options.name || path.basename(resolvedPath);
        let expiresAt = options.expires;

        if (!options.type) {
          // Interactive mode for document type
          const { type } = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Document type:',
              choices: [
                { name: 'ID Document (ID/Passport)', value: 'ID_DOCUMENT' },
                { name: 'Employment Contract', value: 'CONTRACT' },
                { name: 'Qualification/Certificate', value: 'QUALIFICATION' },
                { name: 'Police Clearance', value: 'POLICE_CLEARANCE' },
                { name: 'Medical Certificate', value: 'MEDICAL' },
                { name: 'Tax Document', value: 'TAX' },
                { name: 'Other', value: 'OTHER' },
              ],
            },
          ]);
          documentType = type;
        }

        const spinner = ora('Uploading document...').start();
        const fileBuffer = fs.readFileSync(resolvedPath);
        const response = await client.uploadStaffDocument(staffId, {
          type: documentType,
          name: documentName,
          fileName: path.basename(resolvedPath),
          fileBuffer,
          expiresAt,
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to upload document');
          return;
        }

        printSuccess('Document uploaded successfully');

        printInfo(`Document ID: ${response.data.id}`);
        printInfo(`Status: ${formatVerificationStatus(response.data.verification_status)}`);

        if (response.data.requires_verification) {
          printWarning('This document requires verification before the employee can be marked as fully onboarded');
        }
      });
    });

  // Verify document
  documents
    .command('verify <documentId>')
    .description('Verify a staff document')
    .option('--approve', 'Approve the document')
    .option('--reject', 'Reject the document')
    .option('--notes <text>', 'Verification notes')
    .option('--reason <text>', 'Rejection reason (required for reject)')
    .action(async (documentId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        // Determine action
        let action: 'approve' | 'reject';
        if (options.approve && options.reject) {
          printError('Cannot both approve and reject');
          return;
        } else if (options.approve) {
          action = 'approve';
        } else if (options.reject) {
          action = 'reject';
        } else {
          const { selectedAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedAction',
              message: 'Verification action:',
              choices: [
                { name: 'Approve', value: 'approve' },
                { name: 'Reject', value: 'reject' },
              ],
            },
          ]);
          action = selectedAction;
        }

        // Get rejection reason if needed
        let reason = options.reason;
        if (action === 'reject' && !reason) {
          const { inputReason } = await inquirer.prompt([
            {
              type: 'input',
              name: 'inputReason',
              message: 'Rejection reason:',
              validate: (input: string) => input.length > 0 || 'Reason is required',
            },
          ]);
          reason = inputReason;
        }

        const spinner = ora(`${action === 'approve' ? 'Approving' : 'Rejecting'} document...`).start();
        const response = await client.verifyStaffDocument(documentId, {
          action,
          notes: options.notes,
          rejectionReason: reason,
        });
        spinner.stop();

        if (!response.success) {
          printError(`Failed to ${action} document`);
          return;
        }

        printSuccess(`Document ${action === 'approve' ? 'approved' : 'rejected'}`);
      });
    });

  // List pending verifications
  documents
    .command('pending')
    .description('List documents pending verification')
    .option('-l, --limit <n>', 'Limit results', '50')
    .action(async (options, command) => {
      await executeAction(async () => {
        const globalOpts = command.parent?.parent?.opts() as GlobalOptions;
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Fetching pending verifications...').start();
        const response = await client.getPendingDocuments({
          limit: parseInt(options.limit, 10),
        });
        spinner.stop();

        if (!response.success || !response.data) {
          printError('Failed to fetch pending documents');
          return;
        }

        const format = globalOpts?.format || 'table';

        if (format === 'json') {
          console.log(formatJson(response.data));
          return;
        }

        if (response.data.documents.length === 0) {
          printSuccess('No documents pending verification');
          return;
        }

        console.log(chalk.bold('Documents Pending Verification'));
        console.log();

        const headers = ['Doc ID', 'Staff', 'Type', 'Name', 'Uploaded'];
        const rows = response.data.documents.map((doc) => [
          doc.id.slice(0, 8) + '...',
          doc.staff_name,
          doc.type,
          doc.name.length > 20 ? doc.name.slice(0, 17) + '...' : doc.name,
          formatDate(doc.uploaded_at),
        ]);

        console.log(formatTable(headers, rows));

        printInfo(`${response.data.documents.length} document(s) awaiting verification`);
      });
    });

  // Download document
  documents
    .command('download <documentId>')
    .description('Download a staff document')
    .option('-o, --output <path>', 'Output file path')
    .action(async (documentId, options) => {
      await executeAction(async () => {
        const credentials = requireAuth();
        const client = createApiClient(credentials);

        const spinner = ora('Downloading document...').start();

        try {
          const response = await client.downloadStaffDocument(documentId);

          if (!response.success || !response.data) {
            spinner.fail('Failed to download document');
            return;
          }

          const outputPath = options.output || response.data.fileName;
          fs.writeFileSync(outputPath, response.data.buffer);
          spinner.succeed(`Downloaded to ${outputPath}`);
        } catch (error) {
          spinner.fail('Failed to download document');
          throw error;
        }
      });
    });
}

/**
 * Format verification status with color
 */
function formatVerificationStatus(status: DocumentVerificationStatus): string {
  const colors: Record<DocumentVerificationStatus, (s: string) => string> = {
    PENDING: chalk.yellow,
    VERIFIED: chalk.green,
    REJECTED: chalk.red,
    EXPIRED: chalk.gray,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}
