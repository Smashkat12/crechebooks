/**
 * Mailgun Inbound Webhook Controller
 *
 * Receives forwarded emails from Mailgun (specifically: FNB statements that
 * have been forwarded from the user's Gmail via a filter rule). Decrypts the
 * password-protected PDF attachment and hands it to the existing
 * TransactionImportService, which parses + dedups + imports + auto-categorizes.
 *
 * Security: Mailgun signs each request with HMAC-SHA256(timestamp+token, signing-key).
 * We verify that signature before processing anything.
 *
 * Idempotency: enforced downstream — TransactionImportService dedups by
 * date + amount + description hash within the tenant's existing transactions.
 */

import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Public } from '../../api/auth/decorators/public.decorator';
import { TransactionImportService } from '../../database/services/transaction-import.service';
import { decryptPdf, PdfDecryptError } from './fnb-pdf-decryptor';

interface MailgunInboundBody {
  recipient?: string;
  sender?: string;
  from?: string;
  subject?: string;
  'body-plain'?: string;
  'attachment-count'?: string;
  'Message-Id'?: string;
  signature?: string;
  token?: string;
  timestamp?: string;
}

@Controller('webhooks/mailgun-inbound')
export class MailgunInboundController {
  private readonly logger = new Logger(MailgunInboundController.name);
  private readonly signingKey: string;
  private readonly fnbPassword: string;
  private readonly tenantId: string;
  private readonly bankAccount: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly importService: TransactionImportService,
  ) {
    this.signingKey = this.configService.get<string>(
      'MAILGUN_SIGNING_KEY',
      '',
    );
    this.fnbPassword = this.configService.get<string>(
      'FNB_STATEMENT_PASSWORD',
      '',
    );
    // Default to Elle Elephant prod tenant; overridable for staging/test.
    this.tenantId = this.configService.get<string>(
      'FNB_STATEMENT_TENANT_ID',
      'bdff4374-64d5-420c-b454-8e85e9df552a',
    );
    this.bankAccount = this.configService.get<string>(
      'FNB_STATEMENT_BANK_ACCOUNT',
      'Business Account',
    );
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AnyFilesInterceptor())
  async handleInbound(
    @Body() body: MailgunInboundBody,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ): Promise<{ status: string; processed: number; skipped: number }> {
    this.logger.log(
      `Inbound email: from=${body.from ?? body.sender} subject="${body.subject}" attachments=${files.length}`,
    );

    this.verifySignature(body);

    if (!this.fnbPassword) {
      this.logger.error(
        'FNB_STATEMENT_PASSWORD not configured; cannot decrypt FNB PDFs',
      );
      throw new BadRequestException('Server not configured for FNB statements');
    }

    // Filter to FNB statement senders only — defence in depth even though
    // the Mailgun route filter should already restrict this.
    const sender = (body.sender ?? body.from ?? '').toLowerCase();
    const isFnbStatement =
      sender.includes('fnbstatements.co.za') ||
      sender.includes('fnbcheque@') ||
      sender.includes('@fnb.co.za');

    if (!isFnbStatement) {
      this.logger.warn(
        `Rejecting inbound from non-FNB sender: ${sender}`,
      );
      return { status: 'ignored', processed: 0, skipped: files.length };
    }

    const pdfFiles = files.filter(
      (f) =>
        f.mimetype === 'application/pdf' ||
        f.originalname.toLowerCase().endsWith('.pdf'),
    );

    if (pdfFiles.length === 0) {
      this.logger.warn('Inbound email has no PDF attachments');
      return { status: 'no-pdfs', processed: 0, skipped: files.length };
    }

    let processed = 0;
    let skipped = 0;

    for (const pdf of pdfFiles) {
      try {
        this.logger.log(
          `Decrypting PDF: ${pdf.originalname} (${pdf.size} bytes)`,
        );
        const decrypted = await decryptPdf(pdf.buffer, this.fnbPassword);

        const result = await this.importService.importFromFile(
          {
            buffer: decrypted,
            originalname: pdf.originalname,
            mimetype: 'application/pdf',
            size: decrypted.length,
          },
          this.bankAccount,
          this.tenantId,
        );

        this.logger.log(
          `Import done: batch=${result.importBatchId} status=${result.status} ` +
            `parsed=${result.totalParsed} created=${result.transactionsCreated} ` +
            `dupes=${result.duplicatesSkipped} errors=${result.errors.length}`,
        );
        processed++;
      } catch (err) {
        skipped++;
        if (err instanceof PdfDecryptError) {
          this.logger.error(
            `Decrypt failed for ${pdf.originalname}: ${err.message}`,
          );
        } else {
          this.logger.error(
            `Import failed for ${pdf.originalname}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return { status: 'ok', processed, skipped };
  }

  /**
   * Verify Mailgun's HMAC-SHA256 signature.
   * Throws BadRequestException if invalid; only no-ops if no signing key is
   * configured (dev/local).
   */
  private verifySignature(body: MailgunInboundBody): void {
    if (!this.signingKey) {
      this.logger.warn(
        'MAILGUN_SIGNING_KEY not set; skipping signature verification',
      );
      return;
    }

    const { signature, token, timestamp } = body;
    if (!signature || !token || !timestamp) {
      throw new BadRequestException(
        'Missing Mailgun signature fields (signature/token/timestamp)',
      );
    }

    const expected = createHmac('sha256', this.signingKey)
      .update(`${timestamp}${token}`)
      .digest('hex');

    if (expected !== signature) {
      this.logger.error('Mailgun signature mismatch');
      throw new BadRequestException('Invalid Mailgun signature');
    }
  }
}
