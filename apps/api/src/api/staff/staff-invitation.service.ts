/**
 * StaffInvitationService
 * TASK-STAFF-INVITE-001: Per-staff invite flow with magic-link bootstrap
 *
 * Design decisions:
 * - Re-invite: revoke prior PENDING invite + create new one (allows admin to resend
 *   without manual revoke step; REVOKED row preserved for audit trail).
 * - accept→session: does NOT issue an immediate session. After accepting,
 *   a magic-link is sent to the staff's email. Staff must click it to prove
 *   email ownership before getting a session (defence-in-depth).
 * - Token: 32 random bytes (base64url = 43 chars). SHA-256 hash stored;
 *   raw token only in email link, never returned to API caller.
 * - Expiry: 7 days from invite creation.
 * - expireOldInvites(): hook for scheduled sweep — TODO platform-engineer to wire cron.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MailgunService } from '../../integrations/mailgun/mailgun.service';
import { StaffMagicLinkService } from '../auth/services/staff-magic-link.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { Prisma, StaffInvitationStatus } from '@prisma/client';

const INVITE_EXPIRY_DAYS = 7;

export type DerivedInviteStatus =
  | 'NOT_INVITED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'EXPIRED'
  | 'REVOKED';

export interface InviteResult {
  inviteSentAt: Date;
  expiresAt: Date;
}

export interface AcceptInviteResult {
  staffId: string;
  magicLinkSent: boolean;
}

export interface RevokeResult {
  success: boolean;
}

export interface InviteStatusResult {
  status: DerivedInviteStatus;
  invitationId?: string;
  expiresAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt?: Date;
}

@Injectable()
export class StaffInvitationService {
  private readonly logger = new Logger(StaffInvitationService.name);
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailgunService: MailgunService,
    private readonly staffMagicLinkService: StaffMagicLinkService,
    private readonly configService: ConfigService,
  ) {
    this.webUrl =
      this.configService.get<string>('STAFF_PORTAL_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:3001';
  }

  // ---------------------------------------------------------------------------
  // inviteStaff
  // ---------------------------------------------------------------------------

  /**
   * Invite a staff member to the staff portal.
   *
   * Re-invite behaviour: if there is already a PENDING invite for this staff
   * member, it is REVOKED before a new one is created. This lets admins resend
   * without needing to call revoke first. The old REVOKED row is preserved for
   * audit purposes.
   */
  async inviteStaff(
    tenantId: string,
    staffId: string,
    invitedById: string,
  ): Promise<InviteResult> {
    // 1. Verify staff exists in tenant
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff || staff.tenantId !== tenantId || staff.deletedAt) {
      throw new NotFoundException('Staff member not found');
    }

    if (!staff.email) {
      throw new BadRequestException(
        'Staff member does not have an email address. Update their profile first.',
      );
    }

    // 2. Check for existing PENDING invite → revoke it (re-invite pattern)
    const existingPending = await this.prisma.staffInvitation.findFirst({
      where: {
        tenantId,
        staffId,
        status: StaffInvitationStatus.PENDING,
      },
    });

    if (existingPending) {
      this.logger.log(
        `Revoking prior PENDING invite ${existingPending.id} for staff ${staffId} before re-invite`,
      );
      await this.prisma.staffInvitation.update({
        where: { id: existingPending.id },
        data: {
          status: StaffInvitationStatus.REVOKED,
          revokedAt: new Date(),
        },
      });

      // Audit: prior invite revoked due to re-invite
      await this.auditLog(
        tenantId,
        invitedById,
        existingPending.id,
        AuditAction.UPDATE,
        {
          action: 'REVOKED_FOR_REINVITE',
          staffId,
        },
      );
    }

    // 3. Generate raw token + hash
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // 4. Persist invitation
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const invitation = await this.prisma.staffInvitation.create({
      data: {
        tenantId,
        staffId,
        email: staff.email,
        tokenHash,
        status: StaffInvitationStatus.PENDING,
        invitedById,
        expiresAt,
      },
    });

    this.logger.log(
      `Created staff invitation ${invitation.id} for staff ${staffId}`,
    );

    // 5. Send invite email (raw token in link — never stored/returned)
    const tenantRecord = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tradingName: true, name: true },
    });
    const tenantName =
      tenantRecord?.tradingName || tenantRecord?.name || 'your school';

    await this.sendInviteEmail(
      staff.email,
      staff.firstName,
      tenantName,
      rawToken,
      expiresAt,
    );

    // 6. Audit: invite created
    await this.auditLog(
      tenantId,
      invitedById,
      invitation.id,
      AuditAction.CREATE,
      {
        action: 'STAFF_INVITED',
        staffId,
        email: staff.email,
        expiresAt: expiresAt.toISOString(),
      },
    );

    return { inviteSentAt: now, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // acceptInvite
  // ---------------------------------------------------------------------------

  /**
   * Accept an invitation using a raw token from the email link.
   *
   * Decision: does NOT issue an immediate session. Instead, triggers the
   * existing magic-link flow so the staff member proves email ownership before
   * gaining access. Returns { staffId, magicLinkSent: true }.
   */
  async acceptInvite(rawToken: string): Promise<AcceptInviteResult> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or unknown invite token');
    }

    if (invitation.status === StaffInvitationStatus.REVOKED) {
      throw new BadRequestException('This invitation has been revoked');
    }

    if (invitation.status === StaffInvitationStatus.ACCEPTED) {
      throw new ConflictException('This invitation has already been accepted');
    }

    if (
      invitation.status === StaffInvitationStatus.EXPIRED ||
      invitation.expiresAt < new Date()
    ) {
      // Mark EXPIRED if still PENDING past expiry
      if (invitation.status === StaffInvitationStatus.PENDING) {
        await this.prisma.staffInvitation.update({
          where: { id: invitation.id },
          data: { status: StaffInvitationStatus.EXPIRED },
        });
      }
      throw new BadRequestException(
        'This invitation has expired. Please ask your admin to send a new invite.',
      );
    }

    // Verify staff still exists
    const staff = await this.prisma.staff.findUnique({
      where: { id: invitation.staffId },
    });

    if (!staff || !staff.isActive || staff.deletedAt) {
      throw new NotFoundException('Staff account not found or inactive');
    }

    // Mark invitation accepted
    await this.prisma.staffInvitation.update({
      where: { id: invitation.id },
      data: {
        status: StaffInvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    this.logger.log(
      `Invitation ${invitation.id} accepted for staff ${staff.id}`,
    );

    // Issue magic-link email so staff can actually log in
    await this.staffMagicLinkService.generateMagicLink(invitation.email);

    // Audit: invite accepted
    await this.auditLog(
      invitation.tenantId,
      staff.id,
      invitation.id,
      AuditAction.UPDATE,
      {
        action: 'STAFF_INVITE_ACCEPTED',
        staffId: staff.id,
      },
    );

    return { staffId: staff.id, magicLinkSent: true };
  }

  // ---------------------------------------------------------------------------
  // revokeInvite
  // ---------------------------------------------------------------------------

  async revokeInvite(
    tenantId: string,
    invitationId: string,
    revokedById: string,
  ): Promise<RevokeResult> {
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.tenantId !== tenantId) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== StaffInvitationStatus.PENDING) {
      throw new BadRequestException(
        `Cannot revoke an invitation with status: ${invitation.status}`,
      );
    }

    await this.prisma.staffInvitation.update({
      where: { id: invitationId },
      data: {
        status: StaffInvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.auditLog(
      tenantId,
      revokedById,
      invitationId,
      AuditAction.UPDATE,
      {
        action: 'STAFF_INVITE_REVOKED',
        staffId: invitation.staffId,
      },
    );

    this.logger.log(
      `Invitation ${invitationId} revoked by user ${revokedById}`,
    );

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // getInviteStatus
  // ---------------------------------------------------------------------------

  async getInviteStatus(
    tenantId: string,
    staffId: string,
  ): Promise<InviteStatusResult> {
    // Verify staff in tenant
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff || staff.tenantId !== tenantId) {
      throw new NotFoundException('Staff member not found');
    }

    const latest = await this.prisma.staffInvitation.findFirst({
      where: { tenantId, staffId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return { status: 'NOT_INVITED' };
    }

    let derivedStatus: DerivedInviteStatus;

    if (latest.status === StaffInvitationStatus.ACCEPTED) {
      derivedStatus = 'ACCEPTED';
    } else if (latest.status === StaffInvitationStatus.REVOKED) {
      derivedStatus = 'REVOKED';
    } else if (
      latest.status === StaffInvitationStatus.EXPIRED ||
      (latest.status === StaffInvitationStatus.PENDING &&
        latest.expiresAt < new Date())
    ) {
      derivedStatus = 'EXPIRED';
    } else {
      derivedStatus = 'PENDING';
    }

    return {
      status: derivedStatus,
      invitationId: latest.id,
      expiresAt: latest.expiresAt,
      acceptedAt: latest.acceptedAt ?? undefined,
      revokedAt: latest.revokedAt ?? undefined,
      createdAt: latest.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // expireOldInvites (scheduled job hook)
  // ---------------------------------------------------------------------------

  /**
   * Mark PENDING invitations whose expiresAt is in the past as EXPIRED.
   * This is a maintenance sweep — call it from a scheduled cron job.
   * TODO: platform-engineer to wire this to a @Cron() scheduler processor.
   *
   * @returns count of rows updated
   */
  async expireOldInvites(): Promise<number> {
    const result = await this.prisma.staffInvitation.updateMany({
      where: {
        status: StaffInvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: StaffInvitationStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale staff invitations`);
    }

    return result.count;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async sendInviteEmail(
    email: string,
    firstName: string,
    tenantName: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const acceptUrl = `${this.webUrl}/staff-portal/accept-invite?token=${encodeURIComponent(rawToken)}`;
    const subject = `You've been invited to ${tenantName} on CrecheBooks`;

    const expiryDate = expiresAt.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const text = `
Hi ${firstName},

You have been invited to access the ${tenantName} staff portal on CrecheBooks.

Click the link below to accept your invitation and set up your account:

${acceptUrl}

This link is valid until ${expiryDate}.

If you were not expecting this invitation, you can safely ignore this email.

Best regards,
The CrecheBooks Team
    `.trim();

    const html = `<!DOCTYPE html>
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

  <p>You have been invited to access the <strong>${tenantName}</strong> staff portal on CrecheBooks.</p>

  <p>As a staff member you will be able to view your payslips, submit leave requests, manage your onboarding documents, and more.</p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${acceptUrl}"
       style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
      Accept Invitation
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    This invitation is valid until <strong>${expiryDate}</strong>.
  </p>

  <p style="color: #666; font-size: 14px;">
    If the button above does not work, copy and paste this link into your browser:
    <br>
    <a href="${acceptUrl}" style="color: #059669; word-break: break-all;">${acceptUrl}</a>
  </p>

  <p style="color: #666; font-size: 14px;">
    If you were not expecting this invitation, you can safely ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    Best regards,<br>The CrecheBooks Team
  </p>
</body>
</html>`;

    await this.mailgunService.sendEmail({
      to: email,
      subject,
      text,
      html,
      tags: ['staff-portal', 'staff-invite'],
    });

    this.logger.log(`Staff invite email queued to ${email}`);
  }

  private async auditLog(
    tenantId: string,
    userId: string,
    entityId: string,
    action: AuditAction,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'StaffInvitation',
          entityId,
          action,
          afterValue: details as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Audit log failure must not block the business operation
      this.logger.error(
        `Audit log failed for StaffInvitation ${entityId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
