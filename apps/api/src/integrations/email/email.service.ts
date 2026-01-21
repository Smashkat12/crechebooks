/**
 * EmailService
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Handles email sending for invoice delivery and staff onboarding.
 * Uses Mailgun API (preferred) or nodemailer SMTP as fallback.
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
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
  /** Tags for categorization */
  tags?: string[];
  /** Enable open tracking (default: true for Mailgun) */
  trackOpens?: boolean;
  /** Enable click tracking (default: true for Mailgun) */
  trackClicks?: boolean;
  /** Custom variables for webhook correlation (Mailgun v:key format) */
  customVariables?: Record<string, string>;
}

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
}

interface IMailgunClient {
  messages: {
    create: (
      domain: string,
      data: Record<string, unknown>,
    ) => Promise<{ id: string; message: string }>;
  };
  domains: {
    get: (domain: string) => Promise<unknown>;
  };
}

type EmailProvider = 'mailgun' | 'smtp' | 'none';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private smtpTransporter: Transporter<SMTPTransport.SentMessageInfo> | null =
    null;
  private mailgunClient: IMailgunClient | null = null;
  private mailgunDomain: string = '';
  private mailgunFromEmail: string = '';
  private provider: EmailProvider = 'none';

  async onModuleInit(): Promise<void> {
    // Try Mailgun first (preferred), then SMTP
    await this.initializeMailgun();
    if (!this.mailgunClient) {
      this.initializeSmtp();
    }
  }

  private async initializeMailgun(): Promise<void> {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const region = process.env.MAILGUN_REGION ?? 'us';

    if (!apiKey || !domain) {
      this.logger.debug('Mailgun not configured, will try SMTP');
      return;
    }

    try {
      const mailgun = new Mailgun(FormData);
      const baseUrl =
        region === 'eu'
          ? 'https://api.eu.mailgun.net'
          : 'https://api.mailgun.net';

      this.mailgunClient = mailgun.client({
        username: 'api',
        key: apiKey,
        url: baseUrl,
      }) as IMailgunClient;
      this.mailgunDomain = domain;
      this.mailgunFromEmail =
        process.env.MAILGUN_FROM_EMAIL ?? `postmaster@${domain}`;

      // Verify connection by checking domain
      await this.mailgunClient.domains.get(domain);
      this.provider = 'mailgun';
      this.logger.log(
        `Email service initialized with Mailgun (domain: ${domain}, region: ${region})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to initialize Mailgun: ${errorMessage}`);
      this.mailgunClient = null;
    }
  }

  private initializeSmtp(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn(
        'No email provider configured. Email sending will fail. Configure MAILGUN_API_KEY/MAILGUN_DOMAIN or SMTP_HOST/SMTP_USER/SMTP_PASS',
      );
      return;
    }

    this.smtpTransporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    this.provider = 'smtp';
    this.logger.log(`Email service initialized with SMTP (${host}:${port})`);
  }

  /**
   * Send email (simple - backwards compatible)
   * @throws BusinessException if email service not configured or send fails
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
   * @throws BusinessException if email service not configured or send fails
   */
  async sendEmailWithOptions(options: EmailOptions): Promise<EmailResult> {
    if (this.provider === 'none') {
      this.logger.error('Email send failed: No email provider configured');
      throw new BusinessException(
        'Email service not configured. Set MAILGUN_API_KEY/MAILGUN_DOMAIN or SMTP environment variables.',
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

    if (this.provider === 'mailgun') {
      return this.sendViaMailgun(options);
    } else {
      return this.sendViaSmtp(options);
    }
  }

  /**
   * Send email via Mailgun API
   */
  private async sendViaMailgun(options: EmailOptions): Promise<EmailResult> {
    if (!this.mailgunClient) {
      throw new BusinessException(
        'Mailgun client not initialized',
        'EMAIL_NOT_CONFIGURED',
      );
    }

    const fromAddress = options.from ?? this.mailgunFromEmail;

    this.logger.log(
      `[Mailgun] Sending email to ${options.to}: ${options.subject}`,
    );
    if (options.attachments?.length) {
      this.logger.log(`  with ${options.attachments.length} attachment(s)`);
    }

    try {
      // Build message data
      const messageData: Record<string, unknown> = {
        from: fromAddress,
        to: [options.to],
        subject: options.subject,
        text: options.body,
      };

      if (options.html) {
        messageData.html = options.html;
      }

      if (options.cc?.length) {
        messageData.cc = options.cc;
      }

      if (options.bcc?.length) {
        messageData.bcc = options.bcc;
      }

      if (options.replyTo) {
        messageData['h:Reply-To'] = options.replyTo;
      }

      // Tags for categorization
      if (options.tags?.length) {
        messageData['o:tag'] = options.tags;
      }

      // Tracking options (enabled by default for webhook support)
      messageData['o:tracking'] = 'yes';
      messageData['o:tracking-opens'] =
        options.trackOpens !== false ? 'yes' : 'no';
      messageData['o:tracking-clicks'] =
        options.trackClicks !== false ? 'yes' : 'no';

      // Custom variables for webhook correlation (v:key format)
      if (options.customVariables) {
        for (const [key, value] of Object.entries(options.customVariables)) {
          messageData[`v:${key}`] = value;
        }
      }

      // Handle attachments
      if (options.attachments?.length) {
        messageData.attachment = options.attachments.map((att) => ({
          filename: att.filename,
          data: att.content,
          contentType: att.contentType,
        }));
      }

      const result = await this.mailgunClient.messages.create(
        this.mailgunDomain,
        messageData,
      );

      this.logger.log(
        `[Mailgun] Email queued successfully to ${options.to}, id: ${result.id}`,
      );

      return {
        messageId: result.id,
        status: 'queued',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Mailgun] Email send failed to ${options.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BusinessException(
        `Email send failed: ${errorMessage}`,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  /**
   * Send email via SMTP (nodemailer)
   */
  private async sendViaSmtp(options: EmailOptions): Promise<EmailResult> {
    if (!this.smtpTransporter) {
      throw new BusinessException(
        'SMTP transporter not initialized',
        'EMAIL_NOT_CONFIGURED',
      );
    }

    const fromAddress =
      options.from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;

    this.logger.log(
      `[SMTP] Sending email to ${options.to}: ${options.subject}`,
    );
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

      const result = await this.smtpTransporter.sendMail({
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
        `[SMTP] Email sent successfully to ${options.to}, messageId: ${result.messageId}`,
      );

      return {
        messageId: result.messageId,
        status: 'sent',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[SMTP] Email send failed to ${options.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BusinessException(
        `Email send failed: ${errorMessage}`,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return this.provider !== 'none';
  }

  /**
   * Get the current email provider
   */
  getProvider(): EmailProvider {
    return this.provider;
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

  /**
   * Send a raw email without template processing
   * TASK-COMM-002: Simple interface for ad-hoc broadcast messages
   *
   * @param options - Email options with to, subject, text, and optional html
   * @returns Email result with messageId
   */
  async sendRaw(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId?: string }> {
    const result = await this.sendEmailWithOptions({
      to: options.to,
      subject: options.subject,
      body: options.text,
      html: options.html,
    });

    return { messageId: result.messageId };
  }
}
