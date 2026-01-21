/**
 * MailgunService
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Handles email sending via Mailgun API.
 * Provides transactional email delivery with better reliability than SMTP.
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { BusinessException } from '../../shared/exceptions';

export interface MailgunAttachment {
  filename: string;
  data: Buffer | string;
  contentType?: string;
}

export interface MailgunEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: MailgunAttachment[];
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  tags?: string[];
  trackOpens?: boolean;
  trackClicks?: boolean;
  /** Custom variables for webhook correlation (v:key format) */
  customVariables?: Record<string, string>;
}

export interface MailgunEmailResult {
  id: string;
  message: string;
  status: 'queued' | 'failed';
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

@Injectable()
export class MailgunService implements OnModuleInit {
  private readonly logger = new Logger(MailgunService.name);
  private client: IMailgunClient | null = null;
  private domain: string = '';
  private fromEmail: string = '';

  async onModuleInit(): Promise<void> {
    await this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const region = process.env.MAILGUN_REGION ?? 'us';

    if (!apiKey || !domain) {
      this.logger.warn(
        'Mailgun configuration incomplete. Email sending will fail. Set MAILGUN_API_KEY, MAILGUN_DOMAIN',
      );
      return;
    }

    try {
      const mailgun = new Mailgun(FormData);
      const baseUrl =
        region === 'eu'
          ? 'https://api.eu.mailgun.net'
          : 'https://api.mailgun.net';

      this.client = mailgun.client({
        username: 'api',
        key: apiKey,
        url: baseUrl,
      }) as IMailgunClient;
      this.domain = domain;
      this.fromEmail = process.env.MAILGUN_FROM_EMAIL ?? `postmaster@${domain}`;

      // Verify connection by checking domain
      await this.client.domains.get(domain);
      this.logger.log(
        `Mailgun client initialized for domain: ${domain} (${region} region)`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Mailgun: ${errorMessage}`);
      this.client = null;
    }
  }

  /**
   * Send email via Mailgun API
   * @throws BusinessException if Mailgun not configured or send fails
   */
  async sendEmail(options: MailgunEmailOptions): Promise<MailgunEmailResult> {
    if (!this.client) {
      this.logger.error('Email send failed: Mailgun client not configured');
      throw new BusinessException(
        'Email service not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN environment variables.',
        'EMAIL_NOT_CONFIGURED',
      );
    }

    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
    for (const email of toAddresses) {
      if (!this.isValidEmail(email)) {
        this.logger.error(`Email send failed: Invalid email address: ${email}`);
        throw new BusinessException(
          `Invalid email address: ${email}`,
          'INVALID_EMAIL',
        );
      }
    }

    const fromAddress = options.from ?? this.fromEmail;

    this.logger.log(
      `Sending email to ${toAddresses.join(', ')}: ${options.subject}`,
    );
    if (options.attachments?.length) {
      this.logger.log(`  with ${options.attachments.length} attachment(s)`);
    }

    try {
      // Build message data
      const messageData: Record<string, unknown> = {
        from: fromAddress,
        to: toAddresses,
        subject: options.subject,
        text: options.text,
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

      if (options.tags?.length) {
        messageData['o:tag'] = options.tags;
      }

      if (options.trackOpens !== undefined) {
        messageData['o:tracking-opens'] = options.trackOpens ? 'yes' : 'no';
      }

      if (options.trackClicks !== undefined) {
        messageData['o:tracking-clicks'] = options.trackClicks ? 'yes' : 'no';
      }

      // Handle custom variables (v:key format for webhook correlation)
      if (options.customVariables) {
        for (const [key, value] of Object.entries(options.customVariables)) {
          messageData[`v:${key}`] = value;
        }
      }

      // Handle attachments
      if (options.attachments?.length) {
        messageData.attachment = options.attachments.map((att) => ({
          filename: att.filename,
          data: att.data,
          contentType: att.contentType,
        }));
      }

      const result = await this.client.messages.create(
        this.domain,
        messageData,
      );

      this.logger.log(
        `Email queued successfully to ${toAddresses.join(', ')}, id: ${result.id}`,
      );

      return {
        id: result.id,
        message: result.message,
        status: 'queued',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Email send failed to ${toAddresses.join(', ')}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BusinessException(
        `Email send failed: ${errorMessage}`,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  /**
   * Simple email sending (backwards compatible interface)
   */
  async sendSimpleEmail(
    to: string,
    subject: string,
    body: string,
    from?: string,
  ): Promise<MailgunEmailResult> {
    return this.sendEmail({
      to,
      subject,
      text: body,
      from,
    });
  }

  /**
   * Check if Mailgun is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
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
   * Get the configured domain
   */
  getDomain(): string {
    return this.domain;
  }

  /**
   * Get the configured from email
   */
  getFromEmail(): string {
    return this.fromEmail;
  }
}
