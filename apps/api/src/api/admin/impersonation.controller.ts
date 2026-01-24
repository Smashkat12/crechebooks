/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * Controller for impersonation endpoints
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { ImpersonationService } from './impersonation.service';
import {
  StartImpersonationDto,
  ImpersonationResponseDto,
  TenantsForImpersonationResponseDto,
  CurrentImpersonationResponseDto,
  EndImpersonationResponseDto,
  ImpersonationSessionHistoryDto,
  ListImpersonationSessionsQueryDto,
} from './dto/impersonation.dto';
import { ACCESS_TOKEN_COOKIE } from '../auth/strategies/jwt.strategy';

// Cookie name for storing original admin token during impersonation
const ADMIN_TOKEN_COOKIE = 'admin_token';

@Controller('admin/impersonate')
@ApiTags('Admin - Impersonation')
@ApiBearerAuth('JWT-auth')
export class ImpersonationController {
  private readonly logger = new Logger(ImpersonationController.name);

  constructor(private readonly impersonationService: ImpersonationService) {}

  @Get('tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List tenants available for impersonation',
    description: 'Returns all tenants with available roles that can be assumed.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email' })
  @ApiResponse({
    status: 200,
    description: 'Tenants retrieved successfully',
    type: TenantsForImpersonationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - valid JWT token required' })
  @ApiForbiddenResponse({ description: 'Forbidden - SUPER_ADMIN role required' })
  async getTenants(
    @Query('search') search?: string,
  ): Promise<TenantsForImpersonationResponseDto> {
    this.logger.debug('Getting tenants for impersonation');
    return this.impersonationService.getTenantsForImpersonation(search);
  }

  @Post('start')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Start impersonation session',
    description:
      'Creates an impersonation session to access tenant endpoints with the specified role. ' +
      'Returns a new JWT with impersonation context. The original admin token is preserved in a separate cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Impersonation session started',
    type: ImpersonationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - valid JWT token required' })
  @ApiForbiddenResponse({ description: 'Forbidden - SUPER_ADMIN role required' })
  async startImpersonation(
    @CurrentUser() user: IUser,
    @Body() dto: StartImpersonationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImpersonationResponseDto> {
    this.logger.debug(`Starting impersonation for admin ${user.id} -> tenant ${dto.tenantId}`);

    const ipAddress = this.getClientIp(req);
    const userAgent = req.headers['user-agent'];

    const { response, accessToken } = await this.impersonationService.startImpersonation(
      user.id,
      dto,
      ipAddress,
      userAgent,
    );

    // Store original admin token before setting impersonation token
    const originalToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (originalToken) {
      res.cookie(ADMIN_TOKEN_COOKIE, originalToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: response.expiresIn * 1000,
        path: '/',
      });
    }

    // Set impersonation token as the active access token
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: response.expiresIn * 1000,
      path: '/',
    });

    return response;
  }

  @Post('end')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'End impersonation session',
    description:
      'Ends the current impersonation session and restores the original admin token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Impersonation session ended',
    type: EndImpersonationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - valid JWT token required' })
  @ApiForbiddenResponse({ description: 'Forbidden - SUPER_ADMIN role required' })
  async endImpersonation(
    @CurrentUser() user: IUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EndImpersonationResponseDto> {
    this.logger.debug(`Ending impersonation for admin ${user.id}`);

    const ipAddress = this.getClientIp(req);
    const userAgent = req.headers['user-agent'];

    const response = await this.impersonationService.endImpersonation(
      user.id,
      undefined,
      ipAddress,
      userAgent,
    );

    // Restore original admin token
    const adminToken = req.cookies?.[ADMIN_TOKEN_COOKIE];
    if (adminToken) {
      res.cookie(ACCESS_TOKEN_COOKIE, adminToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        path: '/',
      });

      // Clear the admin token cookie
      res.clearCookie(ADMIN_TOKEN_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;
  }

  @Get('current')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get current impersonation session',
    description: 'Returns the current active impersonation session if any.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current session retrieved',
    type: CurrentImpersonationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - valid JWT token required' })
  @ApiForbiddenResponse({ description: 'Forbidden - SUPER_ADMIN role required' })
  async getCurrentSession(
    @CurrentUser() user: IUser,
  ): Promise<CurrentImpersonationResponseDto> {
    this.logger.debug(`Getting current impersonation session for admin ${user.id}`);
    return this.impersonationService.getCurrentSession(user.id);
  }

  @Get('sessions')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get impersonation session history',
    description: 'Returns a paginated list of past impersonation sessions for audit purposes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session history retrieved',
    type: ImpersonationSessionHistoryDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - valid JWT token required' })
  @ApiForbiddenResponse({ description: 'Forbidden - SUPER_ADMIN role required' })
  async getSessionHistory(
    @Query() query: ListImpersonationSessionsQueryDto,
  ): Promise<ImpersonationSessionHistoryDto> {
    this.logger.debug('Getting impersonation session history');
    return this.impersonationService.getSessionHistory(query);
  }

  /**
   * Extract client IP address from request
   */
  private getClientIp(req: Request): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip;
  }
}
