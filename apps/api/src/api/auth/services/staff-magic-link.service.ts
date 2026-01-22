/**
 * Staff Magic Link Authentication Service
 * TASK-PORTAL-021: Staff Portal Layout and Authentication
 *
 * Provides passwordless authentication for staff via email magic links.
 * Uses JWT tokens with short expiry for security.
 *
 * Flow:
 * 1. generateMagicLink() - Creates JWT token, sends email
 * 2. verifyMagicLink() - Validates token, returns staff info
 * 3. createStaffSession() - Creates longer-lived session token
 */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { MailgunService } from '../../../integrations/mailgun/mailgun.service';
import {
  StaffMagicLinkPayload,
  StaffSessionPayload,
} from '../dto/staff-login.dto';

/** Staff info returned after verification */
export interface VerifiedStaff {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  simplePayEmployeeId?: string;
  position?: string;
  department?: string;
  employmentType?: string;
  startDate?: Date;
}

/** Configuration for staff magic link */
interface StaffMagicLinkConfig {
  expiresInMinutes: number;
  sessionExpiresInHours: number;
  portalBaseUrl: string;
}

@Injectable()
export class StaffMagicLinkService {
  private readonly logger = new Logger(StaffMagicLinkService.name);
  private readonly config: StaffMagicLinkConfig;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailgunService: MailgunService,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      expiresInMinutes: parseInt(
        this.configService.get<string>('STAFF_MAGIC_LINK_EXPIRY_MINUTES') ||
          this.configService.get<string>('MAGIC_LINK_EXPIRY_MINUTES') ||
          '15',
        10,
      ),
      sessionExpiresInHours: parseInt(
        this.configService.get<string>('STAFF_SESSION_EXPIRY_HOURS') || '24',
        10,
      ),
      portalBaseUrl:
        this.configService.get<string>('STAFF_PORTAL_URL') ||
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000',
    };
  }

  /**
   * Generate a magic link for staff login and send via email.
   * Returns success even if email doesn't exist (security: don't reveal valid emails).
   *
   * @param email - Staff's work email address
   * @returns true if email was sent (or would have been sent)
   */
  async generateMagicLink(email: string): Promise<boolean> {
    this.logger.debug(`Staff magic link requested for: ${email}`);

    // Find staff by email (case-insensitive)
    const staff = await this.prisma.staff.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        isActive: true,
        deletedAt: null,
      },
      include: {
        simplePayMapping: true,
      },
    });

    if (!staff) {
      // Don't reveal that email doesn't exist - log and return success
      this.logger.warn(`Staff magic link requested for non-existent email: ${email}`);
      return true;
    }

    if (!staff.email) {
      this.logger.warn(`Staff ${staff.id} has no email address`);
      return true;
    }

    // Generate JWT token with short expiry
    const payload: StaffMagicLinkPayload = {
      sub: staff.id,
      email: staff.email,
      tenantId: staff.tenantId,
      type: 'staff_magic_link',
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: `${this.config.expiresInMinutes}m`,
    });

    // Build magic link URL
    const magicLinkUrl = `${this.config.portalBaseUrl}/staff/verify?token=${encodeURIComponent(token)}`;

    // Send email via Mailgun
    try {
      await this.sendMagicLinkEmail(staff.email, staff.firstName, magicLinkUrl);
      this.logger.log(`Staff magic link sent to: ${staff.id}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send staff magic link email: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to send magic link. Please try again later.',
      );
    }
  }

  /**
   * Send the magic link email using Mailgun.
   */
  private async sendMagicLinkEmail(
    email: string,
    firstName: string,
    magicLinkUrl: string,
  ): Promise<void> {
    const subject = 'Your CrecheBooks Staff Portal Login Link';

    const text = `
Hi ${firstName},

You requested to sign in to the CrecheBooks Staff Portal.

Click the link below to sign in:
${magicLinkUrl}

This link will expire in ${this.config.expiresInMinutes} minutes.

If you didn't request this link, you can safely ignore this email.

Best regards,
The CrecheBooks Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; margin: 0;">CrecheBooks</h1>
    <p style="color: #059669; margin: 5px 0 0 0; font-weight: 600;">Staff Portal</p>
  </div>

  <p>Hi ${firstName},</p>

  <p>You requested to sign in to the CrecheBooks Staff Portal.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${magicLinkUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">
      Sign In to Staff Portal
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    This link will expire in ${this.config.expiresInMinutes} minutes.
  </p>

  <p style="color: #666; font-size: 14px;">
    If you didn't request this link, you can safely ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    Best regards,<br>The CrecheBooks Team
  </p>
</body>
</html>
    `.trim();

    await this.mailgunService.sendEmail({
      to: email,
      subject,
      text,
      html,
      tags: ['staff-portal', 'magic-link'],
    });
  }

  /**
   * Verify a magic link token and return staff information.
   *
   * @param token - JWT token from magic link
   * @returns Verified staff information
   * @throws UnauthorizedException if token is invalid or expired
   */
  async verifyMagicLink(token: string): Promise<VerifiedStaff> {
    this.logger.debug('Verifying staff magic link token');

    let payload: StaffMagicLinkPayload;

    try {
      payload = this.jwtService.verify<StaffMagicLinkPayload>(token);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        this.logger.warn('Staff magic link token expired');
        throw new UnauthorizedException({
          message: 'Magic link has expired. Please request a new one.',
          code: 'TOKEN_EXPIRED',
        });
      }
      this.logger.warn(
        `Invalid staff magic link token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid magic link');
    }

    // Validate token type
    if (payload.type !== 'staff_magic_link') {
      this.logger.warn('Invalid token type for staff magic link verification');
      throw new UnauthorizedException('Invalid magic link');
    }

    // Verify staff still exists and is active
    const staff = await this.prisma.staff.findUnique({
      where: { id: payload.sub },
      include: {
        simplePayMapping: true,
      },
    });

    if (!staff || !staff.isActive || staff.deletedAt) {
      this.logger.warn(`Staff account not found or inactive: ${payload.sub}`);
      throw new UnauthorizedException('Account not found or inactive');
    }

    this.logger.log(`Staff magic link verified for: ${staff.id}`);

    return {
      id: staff.id,
      email: staff.email || '',
      firstName: staff.firstName,
      lastName: staff.lastName,
      tenantId: staff.tenantId,
      simplePayEmployeeId: staff.simplePayMapping?.simplePayEmployeeId,
      position: staff.position || undefined,
      department: staff.department || undefined,
      employmentType: staff.employmentType,
      startDate: staff.startDate,
    };
  }

  /**
   * Create a session token for the authenticated staff member.
   * This token has a longer expiry for convenience.
   *
   * @param staffId - Staff's UUID
   * @param email - Staff's email
   * @param tenantId - Tenant UUID
   * @param simplePayEmployeeId - SimplePay employee ID (optional)
   * @returns Session token and expiry info
   */
  async createStaffSession(
    staffId: string,
    email: string,
    tenantId: string,
    simplePayEmployeeId?: string,
  ): Promise<{ token: string; expiresIn: number }> {
    const payload: StaffSessionPayload = {
      sub: staffId,
      email,
      tenantId,
      simplePayEmployeeId,
      type: 'staff_session',
    };

    const expiresIn = this.config.sessionExpiresInHours * 3600; // Convert to seconds

    const token = this.jwtService.sign(payload, {
      expiresIn: `${this.config.sessionExpiresInHours}h`,
    });

    this.logger.log(`Staff session created for: ${staffId}`);

    return { token, expiresIn };
  }

  /**
   * Verify a session token and return staff information.
   *
   * @param token - Session token
   * @returns Verified staff information or null
   */
  async verifySessionToken(token: string): Promise<VerifiedStaff | null> {
    try {
      const payload = this.jwtService.verify<StaffSessionPayload>(token);

      if (payload.type !== 'staff_session') {
        return null;
      }

      const staff = await this.prisma.staff.findUnique({
        where: { id: payload.sub },
        include: {
          simplePayMapping: true,
        },
      });

      if (!staff || !staff.isActive || staff.deletedAt) {
        return null;
      }

      return {
        id: staff.id,
        email: staff.email || '',
        firstName: staff.firstName,
        lastName: staff.lastName,
        tenantId: staff.tenantId,
        simplePayEmployeeId: staff.simplePayMapping?.simplePayEmployeeId,
        position: staff.position || undefined,
        department: staff.department || undefined,
        employmentType: staff.employmentType,
        startDate: staff.startDate,
      };
    } catch {
      return null;
    }
  }
}
