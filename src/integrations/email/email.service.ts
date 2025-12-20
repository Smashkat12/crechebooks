/**
 * EmailService
 * TASK-BILL-013: Invoice Delivery Service
 *
 * Handles email sending for invoice delivery.
 * Uses nodemailer for SMTP.
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { BusinessException } from '../../shared/exceptions';

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
   * Send email
   * @throws BusinessException if SMTP not configured or send fails
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    from?: string,
  ): Promise<EmailResult> {
    if (!this.transporter) {
      this.logger.error('Email send failed: SMTP transporter not configured');
      throw new BusinessException(
        'Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.',
        'EMAIL_NOT_CONFIGURED',
      );
    }

    if (!this.isValidEmail(to)) {
      this.logger.error(`Email send failed: Invalid email address: ${to}`);
      throw new BusinessException(
        `Invalid email address: ${to}`,
        'INVALID_EMAIL',
      );
    }

    const fromAddress = from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;

    this.logger.log(`Sending email to ${to}: ${subject}`);

    try {
      const result = await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text: body,
      });

      this.logger.log(
        `Email sent successfully to ${to}, messageId: ${result.messageId}`,
      );

      return {
        messageId: result.messageId,
        status: 'sent',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Email send failed to ${to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BusinessException(
        `Email send failed: ${errorMessage}`,
        'EMAIL_SEND_FAILED',
      );
    }
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
