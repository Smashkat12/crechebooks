/**
 * Staff Authentication Controller
 * TASK-PORTAL-021: Staff Portal Magic Link Authentication
 *
 * Handles staff authentication via magic link (passwordless).
 * Endpoints:
 * - POST /auth/staff/login - Request magic link
 * - POST /auth/staff/verify - Verify token
 * - POST /auth/staff/logout - Clear session
 * - GET /auth/staff/session - Get current session
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StaffMagicLinkService } from './services/staff-magic-link.service';
import {
  StaffLoginRequestDto,
  StaffVerifyRequestDto,
  StaffLoginResponseDto,
  StaffVerifyResponseDto,
  StaffLogoutResponseDto,
  StaffSessionDto,
} from './dto/staff-login.dto';
import { Public } from './decorators/public.decorator';
import {
  RateLimit,
  RateLimitPresets,
} from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Controller('auth/staff')
@ApiTags('Staff Authentication')
@UseGuards(RateLimitGuard)
export class StaffAuthController {
  private readonly logger = new Logger(StaffAuthController.name);

  constructor(private readonly staffMagicLinkService: StaffMagicLinkService) {}

  /**
   * Request a magic link for staff login.
   * Sends email with login link if email exists (does not reveal if email is registered).
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.AUTH_LOGIN)
  @ApiOperation({
    summary: 'Request magic link for staff login',
    description:
      'Sends a magic link to the provided email if it exists in the system. ' +
      'For security, always returns success regardless of whether the email exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Magic link request processed',
    type: StaffLoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many requests. Please try again later.',
  })
  async requestMagicLink(
    @Body() dto: StaffLoginRequestDto,
  ): Promise<StaffLoginResponseDto> {
    this.logger.debug(`Staff magic link requested for: ${dto.email}`);

    await this.staffMagicLinkService.generateMagicLink(dto.email);

    // Always return success to prevent email enumeration
    return {
      success: true,
      message:
        'If this email is registered, you will receive a magic link shortly.',
    };
  }

  /**
   * Verify magic link token and create session.
   */
  @Post('verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify magic link token',
    description:
      'Verifies the magic link token from the email and returns a session token for authenticated requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token verified, session created',
    type: StaffVerifyResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired token',
  })
  async verifyMagicLink(
    @Body() dto: StaffVerifyRequestDto,
  ): Promise<StaffVerifyResponseDto> {
    this.logger.debug('Verifying staff magic link token');

    // Verify the magic link token
    const staff = await this.staffMagicLinkService.verifyMagicLink(dto.token);

    // Create session token
    const session = this.staffMagicLinkService.createStaffSession(
      staff.id,
      staff.email,
      staff.tenantId,
      staff.simplePayEmployeeId,
    );

    this.logger.log(`Staff logged in successfully: ${staff.id}`);

    return {
      sessionToken: session.token,
      expiresIn: session.expiresIn,
      staff: {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        simplePayEmployeeId: staff.simplePayEmployeeId,
        position: staff.position,
        department: staff.department,
      },
    };
  }

  /**
   * Logout staff session.
   * Currently just returns success as sessions are stateless JWT.
   * In future, could implement token blacklisting via Redis.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout staff session',
    description: 'Ends the staff session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    type: StaffLogoutResponseDto,
  })
  logout(): StaffLogoutResponseDto {
    // In a stateless JWT system, logout is handled client-side
    // Could implement token blacklisting here if needed
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Get current authenticated staff session info.
   */
  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current staff session info',
    description:
      'Returns information about the currently authenticated staff member.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff session info returned',
    type: StaffSessionDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated or invalid token',
  })
  async getCurrentSession(
    @Headers('authorization') authHeader: string,
  ): Promise<StaffSessionDto> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authentication token provided');
    }

    const token = authHeader.substring(7);
    const staff = await this.staffMagicLinkService.verifySessionToken(token);

    if (!staff) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return {
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      tenantId: staff.tenantId,
      simplePayEmployeeId: staff.simplePayEmployeeId,
      position: staff.position,
      department: staff.department,
      employmentType: staff.employmentType,
      startDate: staff.startDate?.toISOString().split('T')[0],
    };
  }
}
