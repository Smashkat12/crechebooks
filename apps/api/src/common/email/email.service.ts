import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { IMailgunClient } from 'mailgun.js/Interfaces';

export interface ContactSubmission {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  submittedAt: Date;
}

export interface DemoRequest {
  fullName: string;
  email: string;
  phone: string;
  crecheName: string;
  childrenCount: number;
  province: string;
  submittedAt: Date;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface Tenant {
  id: string;
  name: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private mailgunClient: IMailgunClient;
  private readonly supportEmail: string;
  private readonly frontendUrl: string;
  private readonly mailgunDomain: string;
  private readonly mailgunFromEmail: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.supportEmail = this.configService.get<string>(
      'SUPPORT_EMAIL',
      'hello@crechebooks.co.za',
    );
    this.frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.elleelephant.co.za',
    );
    this.mailgunDomain = this.configService.get<string>('MAILGUN_DOMAIN', '');
    this.mailgunFromEmail = this.configService.get<string>(
      'MAILGUN_FROM_EMAIL',
      'CrecheBooks <noreply@crechebooks.co.za>',
    );

    const mailgunApiKey = this.configService.get<string>('MAILGUN_API_KEY');

    if (!mailgunApiKey || !this.mailgunDomain) {
      this.logger.warn(
        'Mailgun not configured. Email notifications will be disabled. Set MAILGUN_API_KEY and MAILGUN_DOMAIN.',
      );
      this.isConfigured = false;
      return;
    }

    try {
      const mailgun = new Mailgun(formData);
      this.mailgunClient = mailgun.client({
        username: 'api',
        key: mailgunApiKey,
      });

      this.isConfigured = true;
      this.logger.log('Mailgun email service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Mailgun email service', error);
      this.isConfigured = false;
    }
  }

  async sendContactNotification(contact: ContactSubmission): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Mailgun not configured. Skipping contact notification.',
      );
      return;
    }

    try {
      const messageData = {
        from: this.mailgunFromEmail,
        to: this.supportEmail,
        subject: `🔔 New Contact Form - ${contact.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0EA5E9;">📧 New Contact Form Submission</h2>

            <div style="background-color: #F0F9FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${contact.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${contact.email}">${contact.email}</a></p>
              ${contact.phone ? `<p><strong>Phone:</strong> <a href="tel:${contact.phone}">${contact.phone}</a></p>` : ''}
              ${contact.subject ? `<p><strong>Subject:</strong> ${contact.subject}</p>` : ''}
            </div>

            <div style="background-color: #FFFFFF; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px;">
              <h3 style="margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap;">${contact.message}</p>
            </div>

            <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
              <strong>Submitted:</strong> ${contact.submittedAt.toLocaleString(
                'en-ZA',
                {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}
            </p>

            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

            <p style="font-size: 12px; color: #6B7280;">
              View all submissions in your <a href="${this.frontendUrl}/dashboard">CrecheBooks Dashboard</a>
            </p>
          </div>
        `,
      };

      await this.mailgunClient.messages.create(this.mailgunDomain, messageData);
      this.logger.log(`✅ Contact notification sent for ${contact.email}`);
    } catch (error) {
      this.logger.error(
        'Failed to send contact notification via Mailgun',
        error,
      );
      // Don't throw - we don't want to fail the request if email fails
    }
  }

  async sendDemoRequestNotification(demo: DemoRequest): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Mailgun not configured. Skipping demo request notification.',
      );
      return;
    }

    try {
      const messageData = {
        from: this.mailgunFromEmail,
        to: this.supportEmail,
        subject: `🎯 New Demo Request - ${demo.crecheName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0EA5E9;">🎯 New Demo Request</h2>

            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>⚡ Action Required:</strong> Please follow up within 24 hours!</p>
            </div>

            <div style="background-color: #F0F9FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Contact Information</h3>
              <p><strong>Name:</strong> ${demo.fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${demo.email}">${demo.email}</a></p>
              <p><strong>Phone:</strong> <a href="tel:${demo.phone}">${demo.phone}</a></p>
            </div>

            <div style="background-color: #FFFFFF; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px;">
              <h3 style="margin-top: 0;">Crèche Details</h3>
              <p><strong>Crèche Name:</strong> ${demo.crecheName}</p>
              <p><strong>Number of Children:</strong> ${demo.childrenCount}</p>
              <p><strong>Province:</strong> ${demo.province}</p>
            </div>

            <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
              <strong>Submitted:</strong> ${demo.submittedAt.toLocaleString(
                'en-ZA',
                {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}
            </p>

            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

            <p style="font-size: 12px; color: #6B7280;">
              View all demo requests in your <a href="${this.frontendUrl}/dashboard">CrecheBooks Dashboard</a>
            </p>
          </div>
        `,
      };

      await this.mailgunClient.messages.create(this.mailgunDomain, messageData);
      this.logger.log(`✅ Demo request notification sent for ${demo.email}`);
    } catch (error) {
      this.logger.error(
        'Failed to send demo request notification via Mailgun',
        error,
      );
      // Don't throw - we don't want to fail the request if email fails
    }
  }

  async sendWelcomeEmail(
    user: User,
    tenant: Tenant,
    trialExpiresAt: Date,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('Mailgun not configured. Skipping welcome email.');
      return;
    }

    const userName = user.firstName || user.email.split('@')[0];
    const trialDays = Math.ceil(
      (trialExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    try {
      const messageData = {
        from: this.mailgunFromEmail,
        to: user.email,
        subject: `Welcome to CrecheBooks - Your ${trialDays}-Day Trial Starts Now!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0EA5E9;">Welcome to CrecheBooks!</h1>

            <p>Hi ${userName},</p>

            <p>Thank you for signing up for CrecheBooks! Your account has been created successfully.</p>

            <div style="background-color: #F0F9FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #0EA5E9; margin-top: 0;">Your Trial Details</h2>
              <p><strong>Organization:</strong> ${tenant.name}</p>
              <p><strong>Trial Period:</strong> ${trialDays} days</p>
              <p><strong>Trial Expires:</strong> ${trialExpiresAt.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <h3>Getting Started</h3>
            <ol>
              <li>Log in to your account at <a href="${this.frontendUrl}/login">${this.frontendUrl}/login</a></li>
              <li>Set up your crèche details and billing information</li>
              <li>Add your first parent and child</li>
              <li>Explore all features including invoicing, reporting, and more</li>
            </ol>

            <h3>Need Help?</h3>
            <p>We're here to help you get the most out of CrecheBooks:</p>
            <ul>
              <li>📧 Email us at <a href="mailto:${this.supportEmail}">${this.supportEmail}</a></li>
              <li>📚 Check out our <a href="${this.frontendUrl}/help">Help Center</a></li>
              <li>💬 Use the in-app chat support</li>
            </ul>

            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>💡 Pro Tip:</strong> Make the most of your trial by setting up your billing cycles and payment methods early. This will help you see the full power of automated invoicing!</p>
            </div>

            <p>Best regards,<br>The CrecheBooks Team</p>

            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

            <p style="font-size: 12px; color: #6B7280;">
              CrecheBooks - Simplifying Crèche Management<br>
              <a href="${this.frontendUrl}">${this.frontendUrl}</a>
            </p>
          </div>
        `,
      };

      await this.mailgunClient.messages.create(this.mailgunDomain, messageData);
      this.logger.log(`✅ Welcome email sent to ${user.email}`);
    } catch (error) {
      this.logger.error('Failed to send welcome email via Mailgun', error);
      // Don't throw - we don't want to fail signup if email fails
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Mailgun not configured. Skipping password reset email.',
      );
      return;
    }

    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    try {
      const messageData = {
        from: this.mailgunFromEmail,
        to: email,
        subject: 'Reset Your CrecheBooks Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0EA5E9;">Reset Your Password</h1>

            <p>You requested to reset your password for your CrecheBooks account.</p>

            <p>Click the button below to reset your password:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #0EA5E9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
            </div>

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${resetUrl}</p>

            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.</p>
            </div>

            <p>Best regards,<br>The CrecheBooks Team</p>

            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

            <p style="font-size: 12px; color: #6B7280;">
              CrecheBooks - Simplifying Crèche Management<br>
              <a href="${this.frontendUrl}">${this.frontendUrl}</a>
            </p>
          </div>
        `,
      };

      await this.mailgunClient.messages.create(this.mailgunDomain, messageData);
      this.logger.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        'Failed to send password reset email via Mailgun',
        error,
      );
      throw error;
    }
  }
}
