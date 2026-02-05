/**
 * WhatsApp API Controller
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * Provides REST API endpoints for WhatsApp opt-in management
 * and message history viewing.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { getTenantId } from '../auth/utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  WhatsAppOptInDto,
  WhatsAppOptOutDto,
  WhatsAppMessageDto,
  WhatsAppStatusDto,
  WhatsAppHistoryQueryDto,
  WhatsAppSuccessResponseDto,
  WhatsAppHistoryResponseDto,
  WhatsAppMessageStatusDto,
  WhatsAppContextTypeDto,
} from './dto/whatsapp-api.dto';

@Controller('whatsapp')
@ApiTags('WhatsApp')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('opt-in')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Opt parent into WhatsApp notifications',
    description:
      'Enables WhatsApp notifications for a parent. Records POPIA consent timestamp.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parent successfully opted in',
    type: WhatsAppSuccessResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async optIn(
    @Body() dto: WhatsAppOptInDto,
    @CurrentUser() user: IUser,
  ): Promise<WhatsAppSuccessResponseDto> {
    const tenantId = getTenantId(user);

    this.logger.log(
      `WhatsApp opt-in: tenant=${tenantId}, parentId=${dto.parentId}`,
    );

    // Verify parent belongs to tenant
    const parent = await this.prisma.parent.findFirst({
      where: {
        id: dto.parentId,
        tenantId,
      },
      select: { id: true, phone: true, whatsapp: true },
    });

    if (!parent) {
      this.logger.warn(
        `Parent not found or not in tenant: ${dto.parentId}, tenant=${tenantId}`,
      );
      return { success: false };
    }

    // Check if parent has a phone number for WhatsApp
    const phoneNumber = parent.whatsapp || parent.phone;
    if (!phoneNumber) {
      this.logger.warn(
        `Parent has no phone number for WhatsApp: ${dto.parentId}`,
      );
      return { success: false };
    }

    await this.whatsappService.optIn(dto.parentId);

    this.logger.log(`WhatsApp opt-in successful: parentId=${dto.parentId}`);
    return { success: true };
  }

  @Post('opt-out')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Opt parent out of WhatsApp notifications',
    description: 'Disables WhatsApp notifications for a parent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parent successfully opted out',
    type: WhatsAppSuccessResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async optOut(
    @Body() dto: WhatsAppOptOutDto,
    @CurrentUser() user: IUser,
  ): Promise<WhatsAppSuccessResponseDto> {
    const tenantId = getTenantId(user);

    this.logger.log(
      `WhatsApp opt-out: tenant=${tenantId}, parentId=${dto.parentId}`,
    );

    // Verify parent belongs to tenant
    const parent = await this.prisma.parent.findFirst({
      where: {
        id: dto.parentId,
        tenantId,
      },
      select: { id: true, phone: true },
    });

    if (!parent) {
      this.logger.warn(
        `Parent not found or not in tenant: ${dto.parentId}, tenant=${tenantId}`,
      );
      return { success: false };
    }

    // Get phone number and opt out
    const phoneNumber = parent.phone;
    if (phoneNumber) {
      await this.whatsappService.optOut(phoneNumber);
    }

    this.logger.log(`WhatsApp opt-out successful: parentId=${dto.parentId}`);
    return { success: true };
  }

  @Get('history/:parentId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get WhatsApp message history for a parent',
    description:
      'Returns the WhatsApp message history for a specific parent, ordered by most recent first.',
  })
  @ApiParam({
    name: 'parentId',
    description: 'Parent UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Message history retrieved successfully',
    type: WhatsAppHistoryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getHistory(
    @Param('parentId') parentId: string,
    @Query() query: WhatsAppHistoryQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<WhatsAppHistoryResponseDto> {
    const tenantId = getTenantId(user);

    this.logger.debug(
      `Getting WhatsApp history: tenant=${tenantId}, parentId=${parentId}, limit=${query.limit}`,
    );

    // Verify parent belongs to tenant
    const parent = await this.prisma.parent.findFirst({
      where: {
        id: parentId,
        tenantId,
      },
      select: { id: true },
    });

    if (!parent) {
      this.logger.warn(
        `Parent not found or not in tenant: ${parentId}, tenant=${tenantId}`,
      );
      return { success: true, messages: [], total: 0 };
    }

    const messages = await this.whatsappService.getMessageHistory(
      tenantId,
      parentId,
      query.limit,
    );

    // Map Prisma entities to DTOs
    const messageDtos: WhatsAppMessageDto[] = messages.map((msg) => ({
      id: msg.id,
      status: msg.status as WhatsAppMessageStatusDto,
      contextType: msg.contextType as WhatsAppContextTypeDto,
      contextId: msg.contextId ?? undefined,
      templateName: msg.templateName,
      recipientPhone: msg.recipientPhone,
      createdAt: msg.createdAt.toISOString(),
      sentAt: msg.sentAt?.toISOString(),
      deliveredAt: msg.deliveredAt?.toISOString(),
      readAt: msg.readAt?.toISOString(),
      errorCode: msg.errorCode ?? undefined,
      errorMessage: msg.errorMessage ?? undefined,
    }));

    return {
      success: true,
      messages: messageDtos,
      total: messages.length,
    };
  }

  @Get('status/:parentId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Check WhatsApp opt-in status for a parent',
    description:
      'Returns whether a parent has opted in to WhatsApp notifications and POPIA consent details.',
  })
  @ApiParam({
    name: 'parentId',
    description: 'Parent UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
    type: WhatsAppStatusDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getStatus(
    @Param('parentId') parentId: string,
    @CurrentUser() user: IUser,
  ): Promise<WhatsAppStatusDto> {
    const tenantId = getTenantId(user);

    this.logger.debug(
      `Getting WhatsApp status: tenant=${tenantId}, parentId=${parentId}`,
    );

    // Get parent with opt-in status
    const parent = await this.prisma.parent.findFirst({
      where: {
        id: parentId,
        tenantId,
      },
      select: {
        id: true,
        phone: true,
        whatsapp: true,
        whatsappOptIn: true,
        updatedAt: true,
      },
    });

    if (!parent) {
      this.logger.warn(
        `Parent not found or not in tenant: ${parentId}, tenant=${tenantId}`,
      );
      return { optedIn: false };
    }

    const whatsappPhone = parent.whatsapp || parent.phone;

    return {
      optedIn: parent.whatsappOptIn,
      optedInAt: parent.whatsappOptIn
        ? parent.updatedAt.toISOString()
        : undefined,
      whatsappPhone: whatsappPhone ?? undefined,
    };
  }
}
