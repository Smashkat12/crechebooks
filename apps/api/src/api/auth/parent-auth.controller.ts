/**
 * Parent Authentication Controller
 * TASK-PORTAL-011: Parent Portal Magic Link Authentication
 *
 * Handles parent authentication via magic link (passwordless).
 * Endpoints:
 * - POST /auth/parent/magic-link - Request magic link
 * - GET /auth/parent/verify - Verify magic link token
 * - POST /auth/parent/logout - Logout
 * - GET /auth/parent/me - Get current parent info
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
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
import { MagicLinkService } from './services/magic-link.service';
import {
  ParentMagicLinkRequestDto,
  ParentMagicLinkVerifyDto,
  ParentMagicLinkResponseDto,
  ParentVerifyResponseDto,
  ParentLogoutResponseDto,
  ParentMeResponseDto,
} from './dto/parent-login.dto';
import { Public } from './decorators/public.decorator';
import {
  RateLimit,
  RateLimitPresets,
} from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('auth/parent')
@ApiTags('Parent Authentication')
@UseGuards(RateLimitGuard)
export class ParentAuthController {
  private readonly logger = new Logger(ParentAuthController.name);

  constructor(
    private readonly magicLinkService: MagicLinkService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Request a magic link for parent login.
   * Sends email with login link if email exists (does not reveal if email is registered).
   */
  @Post('magic-link')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.AUTH_LOGIN)
  @ApiOperation({
    summary: 'Request magic link for parent login',
    description:
      'Sends a magic link to the provided email if it exists in the system. ' +
      'For security, always returns success regardless of whether the email exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Magic link request processed',
    type: ParentMagicLinkResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many requests. Please try again later.',
  })
  async requestMagicLink(
    @Body() dto: ParentMagicLinkRequestDto,
  ): Promise<ParentMagicLinkResponseDto> {
    this.logger.debug(`Magic link requested for: ${dto.email}`);

    await this.magicLinkService.generateMagicLink(dto.email);

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
  @Get('verify')
  @Public()
  @ApiOperation({
    summary: 'Verify magic link token',
    description:
      'Verifies the magic link token from the email and returns a session token for authenticated requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token verified, session created',
    type: ParentVerifyResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired token',
  })
  async verifyMagicLink(
    @Query() dto: ParentMagicLinkVerifyDto,
  ): Promise<ParentVerifyResponseDto> {
    this.logger.debug('Verifying magic link token');

    // Verify the magic link token
    const parent = await this.magicLinkService.verifyMagicLink(dto.token);

    // Create session token
    const session = await this.magicLinkService.createParentSession(
      parent.id,
      parent.email,
      parent.tenantId,
    );

    this.logger.log(`Parent logged in successfully: ${parent.id}`);

    return {
      sessionToken: session.token,
      expiresIn: session.expiresIn,
      parent: {
        id: parent.id,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        phone: parent.phone || undefined,
      },
    };
  }

  /**
   * Logout parent session.
   * Currently just returns success as sessions are stateless JWT.
   * In future, could implement token blacklisting via Redis.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout parent session',
    description: 'Ends the parent session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    type: ParentLogoutResponseDto,
  })
  async logout(): Promise<ParentLogoutResponseDto> {
    // In a stateless JWT system, logout is handled client-side
    // Could implement token blacklisting here if needed
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Get current authenticated parent info.
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current parent info',
    description: 'Returns information about the currently authenticated parent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parent info returned',
    type: ParentMeResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated or invalid token',
  })
  async getCurrentParent(
    @Headers('authorization') authHeader: string,
  ): Promise<ParentMeResponseDto> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authentication token provided');
    }

    const token = authHeader.substring(7);
    const parent = await this.magicLinkService.verifySessionToken(token);

    if (!parent) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Get children count
    const parentWithChildren = await this.prisma.parent.findUnique({
      where: { id: parent.id },
      include: {
        _count: {
          select: { children: true },
        },
      },
    });

    return {
      id: parent.id,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phone: parent.phone || undefined,
      tenantId: parent.tenantId,
      childrenCount: parentWithChildren?._count.children || 0,
    };
  }
}
