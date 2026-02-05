/**
 * Onboarding Admin Controller
 * TASK-WA-014: WhatsApp Onboarding Admin Visibility
 *
 * Provides REST endpoints for admins to view onboarding sessions,
 * get statistics, and convert completed sessions to enrollments.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../api/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../api/auth/guards/roles.guard';
import { Roles } from '../../../api/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../api/auth/decorators/current-user.decorator';
import { getTenantId } from '../../../api/auth/utils/tenant-assertions';
import type { IUser } from '../../../database/entities/user.entity';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  ListOnboardingDto,
  CreateEnrollmentFromOnboardingDto,
} from '../dto/onboarding.dto';

@ApiTags('whatsapp-onboarding')
@Controller('whatsapp/onboarding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /whatsapp/onboarding/stats
   * Returns aggregate counts for onboarding sessions and conversion rate.
   * MUST come before the :id route to avoid parameter collision.
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get onboarding statistics' })
  @ApiResponse({ status: 200, description: 'Onboarding statistics' })
  async getStats(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    const [total, inProgress, completed, abandoned] = await Promise.all([
      this.prisma.whatsAppOnboardingSession.count({ where: { tenantId } }),
      this.prisma.whatsAppOnboardingSession.count({
        where: { tenantId, status: 'IN_PROGRESS' },
      }),
      this.prisma.whatsAppOnboardingSession.count({
        where: { tenantId, status: 'COMPLETED' },
      }),
      this.prisma.whatsAppOnboardingSession.count({
        where: { tenantId, status: 'ABANDONED' },
      }),
    ]);
    return {
      total,
      inProgress,
      completed,
      abandoned,
      conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * GET /whatsapp/onboarding
   * Lists onboarding sessions with optional status filter and pagination.
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List onboarding sessions' })
  @ApiResponse({ status: 200, description: 'Paginated onboarding sessions' })
  async listSessions(
    @CurrentUser() user: IUser,
    @Query() query: ListOnboardingDto,
  ) {
    const tenantId = getTenantId(user);
    return this.prisma.whatsAppOnboardingSession.findMany({
      where: {
        tenantId,
        ...(query.status && { status: query.status as any }),
      },
      orderBy: { updatedAt: 'desc' },
      take: query.limit || 50,
      skip: query.offset || 0,
      select: {
        id: true,
        waId: true,
        currentStep: true,
        status: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        parentId: true,
      },
    });
  }

  /**
   * GET /whatsapp/onboarding/:id
   * Returns full session detail including collected data and parent relation.
   */
  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get onboarding session detail' })
  @ApiResponse({ status: 200, description: 'Session detail' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const session = await this.prisma.whatsAppOnboardingSession.findFirst({
      where: { id, tenantId },
      include: { parent: true },
    });
    if (!session) {
      throw new NotFoundException('Onboarding session not found');
    }
    return session;
  }

  /**
   * POST /whatsapp/onboarding/:id/enroll
   * Converts a completed onboarding session into a new enrollment.
   */
  @Post(':id/enroll')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Convert completed onboarding to enrollment' })
  @ApiResponse({ status: 201, description: 'Enrollment created' })
  @ApiResponse({ status: 404, description: 'Completed session not found' })
  async convertToEnrollment(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: CreateEnrollmentFromOnboardingDto,
  ) {
    const tenantId = getTenantId(user);
    const session = await this.prisma.whatsAppOnboardingSession.findFirst({
      where: { id, tenantId, status: 'COMPLETED' },
    });
    if (!session) {
      throw new NotFoundException('Completed onboarding session not found');
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        tenantId,
        childId: body.childId,
        feeStructureId: body.feeStructureId,
        startDate: new Date(body.startDate),
        status: 'PENDING',
      },
    });
    return { enrollmentId: enrollment.id };
  }
}
