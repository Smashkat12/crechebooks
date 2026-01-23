import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface ContactSubmission {
  name: string;
  email: string;
  phone?: string;
  message: string;
  submittedAt: Date;
}

export interface DemoRequest {
  name: string;
  email: string;
  phone?: string;
  crecheName?: string;
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
  private transporter: Transporter;
  private readonly supportEmail: string;
  private readonly frontendUrl: string;
  private readonly smtpFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.supportEmail = this.configService.get<string>('SUPPORT_EMAIL', 'hello@crechebooks.co.za');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://crechebooks.co.za');
    this.smtpFrom = this.configService.get<string>('SMTP_FROM', 'hello@crechebooks.co.za');

    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      this.logger.warn('Email service not configured. Email notifications will be disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      this.logger.log('Email service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email service', error);
    }
  }

  async sendContactNotification(contact: ContactSubmission): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured. Skipping contact notification.');
      return;
    }

    try {
      const mailOptions = {
        from: this.smtpFrom,
        to: this.supportEmail,
        subject: `New Contact Form Submission - ${contact.name}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${contact.name}</p>
          <p><strong>Email:</strong> ${contact.email}</p>
          ${contact.phone ? `<p><strong>Phone:</strong> ${contact.phone}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p>${contact.message.replace(/\n/g, '<br>')}</p>
          <p><strong>Submitted at:</strong> ${contact.submittedAt.toLocaleString('en-ZA')}</p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Contact notification sent for ${contact.email}`);
    } catch (error) {
      this.logger.error('Failed to send contact notification', error);
      throw error;
    }
  }

  async sendDemoRequestNotification(demo: DemoRequest): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured. Skipping demo request notification.');
      return;
    }

    try {
      const mailOptions = {
        from: this.smtpFrom,
        to: this.supportEmail,
        subject: `New Demo Request - ${demo.name}`,
        html: `
          <h2>New Demo Request</h2>
          <p><strong>Name:</strong> ${demo.name}</p>
          <p><strong>Email:</strong> ${demo.email}</p>
          ${demo.phone ? `<p><strong>Phone:</strong> ${demo.phone}</p>` : ''}
          ${demo.crecheName ? `<p><strong>Crèche Name:</strong> ${demo.crecheName}</p>` : ''}
          <p><strong>Submitted at:</strong> ${demo.submittedAt.toLocaleString('en-ZA')}</p>
          <hr>
          <p><em>Please follow up with this demo request within 24 hours.</em></p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Demo request notification sent for ${demo.email}`);
    } catch (error) {
      this.logger.error('Failed to send demo request notification', error);
      throw error;
    }
  }

  async sendWelcomeEmail(user: User, tenant: Tenant, trialExpiresAt: Date): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured. Skipping welcome email.');
      return;
    }

    const userName = user.firstName || user.email.split('@')[0];
    const trialDays = Math.ceil((trialExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    try {
      const mailOptions = {
        from: this.smtpFrom,
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

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Welcome email sent to ${user.email}`);
    } catch (error) {
      this.logger.error('Failed to send welcome email', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured. Skipping password reset email.');
      return;
    }

    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    try {
      const mailOptions = {
        from: this.smtpFrom,
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

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error('Failed to send password reset email', error);
      throw error;
    }
  }
}
