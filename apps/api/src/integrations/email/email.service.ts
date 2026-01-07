/**
 * EmailService
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Handles email sending for invoice delivery and staff onboarding.
 * Uses nodemailer for SMTP.
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { BusinessException } from '../../shared/exceptions';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  path?: string; // Alternative: path to file on disk
}

export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'failed';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP configuration incomplete. Email sending will fail. Set SMTP_HOST, SMTP_USER, SMTP_PASS',
      );
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    this.logger.log(`Email transporter initialized for ${host}:${port}`);
  }

  /**
   * Send email (simple - backwards compatible)
   * @throws BusinessException if SMTP not configured or send fails
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    from?: string,
  ): Promise<EmailResult> {
    return this.sendEmailWithOptions({
      to,
      subject,
      body,
      from,
    });
  }

  /**
   * Send email with full options (attachments, HTML, CC, etc.)
   * TASK-STAFF-001: Added for welcome pack email delivery
   * @throws BusinessException if SMTP not configured or send fails
   */
  async sendEmailWithOptions(options: EmailOptions): Promise<EmailResult> {
    if (!this.transporter) {
      this.logger.error('Email send failed: SMTP transporter not configured');
      throw new BusinessException(
        'Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.',
        'EMAIL_NOT_CONFIGURED',
      );
    }

    if (!this.isValidEmail(options.to)) {
      this.logger.error(
        `Email send failed: Invalid email address: ${options.to}`,
      );
      throw new BusinessException(
        `Invalid email address: ${options.to}`,
        'INVALID_EMAIL',
      );
    }

    const fromAddress =
      options.from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;

    this.logger.log(`Sending email to ${options.to}: ${options.subject}`);
    if (options.attachments?.length) {
      this.logger.log(`  with ${options.attachments.length} attachment(s)`);
    }

    try {
      // Build nodemailer attachments format
      const attachments = options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        path: att.path,
      }));

      const result = await this.transporter.sendMail({
        from: fromAddress,
        to: options.to,
        cc: options.cc?.join(', '),
        bcc: options.bcc?.join(', '),
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.body,
        html: options.html,
        attachments,
      });

      this.logger.log(
        `Email sent successfully to ${options.to}, messageId: ${result.messageId}`,
      );

      return {
        messageId: result.messageId,
        status: 'sent',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Email send failed to ${options.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BusinessException(
        `Email send failed: ${errorMessage}`,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  /**
   * Check if SMTP is configured
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Validate email address format
   */
  isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
