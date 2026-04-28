/**
 * StaffInvitationController
 * TASK-STAFF-INVITE-001: Per-staff invite flow — admin-facing endpoints
 *
 * Admin endpoints (require OWNER or ADMIN role + JwtAuthGuard):
 *   POST /api/v1/staff/:id/invite         - Send/resend invite
 *   POST /api/v1/staff/:id/revoke-invite  - Revoke pending invite
 *   GET  /api/v1/staff/:id/invite-status  - Query current invite status
 *
 * Public accept endpoint lives in StaffAuthController (auth module).
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { UserRole } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { StaffInvitationService } from './staff-invitation.service';

@ApiTags('Staff Invitations')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffInvitationController {
  private readonly logger = new Logger(StaffInvitationController.name);

  constructor(
    private readonly staffInvitationService: StaffInvitationService,
  ) {}

  /**
   * Send (or resend) a portal invitation to a staff member.
   * If a PENDING invite already exists, it is revoked and a fresh one is sent.
   * Roles: OWNER, ADMIN.
   */
  @Post(':id/invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send (or resend) staff portal invitation',
    description:
      "Sends a 7-day invitation link to the staff member's email. " +
      'If a PENDING invite already exists, it is revoked and a new one is issued.',
  })
  @ApiParam({ name: 'id', description: 'Staff member UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invitation sent',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        inviteSentAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Staff has no email address' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async sendInvite(
    @CurrentUser() user: IUser,
    @Param('id') staffId: string,
  ): Promise<{ success: boolean; inviteSentAt: Date; expiresAt: Date }> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Admin ${user.id} inviting staff ${staffId} in tenant ${tenantId}`,
    );

    const result = await this.staffInvitationService.inviteStaff(
      tenantId,
      staffId,
      user.id,
    );

    return { success: true, ...result };
  }

  /**
   * Revoke a pending portal invitation.
   * Roles: OWNER, ADMIN.
   */
  @Post(':id/revoke-invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a pending staff portal invitation',
  })
  @ApiParam({ name: 'id', description: 'Invitation UUID (not staff UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Invitation revoked',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invitation is not in PENDING status',
  })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revokeInvite(
    @CurrentUser() user: IUser,
    @Param('id') invitationId: string,
  ): Promise<{ success: boolean }> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Admin ${user.id} revoking invitation ${invitationId} in tenant ${tenantId}`,
    );

    return this.staffInvitationService.revokeInvite(
      tenantId,
      invitationId,
      user.id,
    );
  }

  /**
   * Get the current invite status for a staff member.
   * Roles: OWNER, ADMIN.
   */
  @Get(':id/invite-status')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get current invite status for a staff member',
    description:
      'Returns derived status: NOT_INVITED | PENDING | ACCEPTED | EXPIRED | REVOKED. ' +
      'EXPIRED is returned when status=EXPIRED or status=PENDING but expiresAt is in the past.',
  })
  @ApiParam({ name: 'id', description: 'Staff member UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invite status',
    schema: {
      properties: {
        status: {
          type: 'string',
          enum: ['NOT_INVITED', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'],
        },
        invitationId: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        acceptedAt: { type: 'string', format: 'date-time', nullable: true },
        revokedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getInviteStatus(
    @CurrentUser() user: IUser,
    @Param('id') staffId: string,
  ) {
    const tenantId = getTenantId(user);
    return this.staffInvitationService.getInviteStatus(tenantId, staffId);
  }
}
