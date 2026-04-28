/**
 * StaffInviteAcceptController
 * TASK-STAFF-INVITE-001: Public accept endpoint for staff portal invitations
 *
 * Separate from StaffAuthController (auth module) to avoid circular dependency:
 *   StaffModule → AuthModule (for StaffMagicLinkService)
 *   If AuthModule → StaffModule, that would be circular.
 *
 * Route: POST /api/v1/auth/staff-invite/accept
 *
 * Decision: accept does NOT issue an immediate session. The StaffInvitationService
 * calls staffMagicLinkService.generateMagicLink(), which dispatches a fresh
 * magic-link email. The staff member clicks that link and goes through the normal
 * /auth/staff/verify flow to obtain a session token. This two-step handshake
 * proves email ownership before granting portal access (defence-in-depth).
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AcceptStaffInviteDto } from './dto/accept-staff-invite.dto';
import { StaffInvitationService } from './staff-invitation.service';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import {
  RateLimit,
  RateLimitPresets,
} from '../../common/decorators/rate-limit.decorator';

@ApiTags('Staff Authentication')
@Controller('auth/staff-invite')
@UseGuards(RateLimitGuard)
export class StaffInviteAcceptController {
  private readonly logger = new Logger(StaffInviteAcceptController.name);

  constructor(
    private readonly staffInvitationService: StaffInvitationService,
  ) {}

  /**
   * Accept a staff portal invitation using the raw token from the email link.
   *
   * Decision — accept → magic-link (NOT immediate session):
   * After the invite token is validated and marked ACCEPTED, the existing
   * StaffMagicLinkService sends a fresh 15-minute magic link to the staff's email.
   * The staff member then clicks that link and calls POST /auth/staff/verify to
   * obtain a 24-hour session token. This two-step handshake proves email ownership
   * (defence-in-depth) without introducing a new session issuance path.
   */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.AUTH_LOGIN)
  @ApiOperation({
    summary: 'Accept a staff portal invitation',
    description:
      'Validates the 7-day invite token and triggers a 15-minute magic-link email. ' +
      'The staff member must click the magic-link to obtain a session token via ' +
      'POST /auth/staff/verify. No session is issued directly from this endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted — magic link dispatched to staff email',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example:
            'Magic link sent to your email. Please check your inbox to sign in.',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid, expired, revoked, or already-accepted token',
  })
  async acceptInvite(
    @Body() dto: AcceptStaffInviteDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug('Staff invite accept requested');

    await this.staffInvitationService.acceptInvite(dto.token);

    return {
      success: true,
      message:
        'Magic link sent to your email. Please check your inbox to sign in.',
    };
  }
}
