/**
 * Communication Controller
 * TASK-COMM-003: Communication API Controller
 *
 * REST endpoints for ad-hoc communication management.
 * Provides endpoints for creating, sending, and managing broadcast messages.
 *
 * @module api/communications/communication.controller
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  Logger,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdhocCommunicationService } from '../../communications/services/adhoc-communication.service';
import { RecipientResolverService } from '../../communications/services/recipient-resolver.service';
import { BroadcastMessageEntity } from '../../communications/entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../../communications/entities/message-recipient.entity';
import { RecipientGroupEntity } from '../../communications/entities/recipient-group.entity';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
  RecipientFilterCriteria,
  ParentFilter,
  StaffFilter,
} from '../../communications/types/communication.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { NotFoundException } from '../../shared/exceptions';
import {
  CreateBroadcastDto,
  RecipientFilterDto,
} from './dto/send-broadcast.dto';
import {
  PreviewRecipientsDto,
  RecipientPreviewResponseDto,
} from './dto/preview-recipients.dto';
import {
  BroadcastResponseDto,
  BroadcastListItemDto,
  BroadcastDetailDto,
  BroadcastSingleResponseDto,
  BroadcastListResponseDto,
  MessageResponseDto,
} from './dto/broadcast-response.dto';
import {
  CreateRecipientGroupDto,
  RecipientGroupResponseDto,
  RecipientGroupListResponseDto,
} from './dto/recipient-group.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts-query.dto';

/**
 * Transform snake_case filter DTO to camelCase filter criteria
 */
function transformFilterDto(
  filter?: RecipientFilterDto,
): RecipientFilterCriteria | undefined {
  if (!filter) return undefined;

  const result: RecipientFilterCriteria = {};

  if (filter.parent_filter) {
    const pf = filter.parent_filter;
    result.parentFilter = {
      isActive: pf.is_active,
      enrollmentStatus: pf.enrollment_status,
      feeStructureId: pf.fee_structure_id,
      hasOutstandingBalance: pf.has_outstanding_balance,
      daysOverdue: pf.days_overdue,
      whatsappOptIn: pf.whatsapp_opt_in,
      smsOptIn: pf.sms_opt_in,
    } as ParentFilter;
  }

  if (filter.staff_filter) {
    const sf = filter.staff_filter;
    result.staffFilter = {
      isActive: sf.is_active,
      employmentType: sf.employment_type,
      department: sf.department,
      position: sf.position,
    } as StaffFilter;
  }

  if (filter.selected_ids) {
    result.selectedIds = filter.selected_ids;
  }

  return result;
}

@Controller('communications')
@ApiTags('Communications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunicationController {
  private readonly logger = new Logger(CommunicationController.name);

  constructor(
    private readonly adhocService: AdhocCommunicationService,
    private readonly recipientResolver: RecipientResolverService,
    private readonly broadcastEntity: BroadcastMessageEntity,
    private readonly recipientEntity: MessageRecipientEntity,
    private readonly recipientGroupEntity: RecipientGroupEntity,
  ) {}

  // ==================== BROADCASTS ====================

  @Post('broadcasts')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a new broadcast message',
    description:
      'Creates a draft broadcast message and resolves recipients based on filter criteria.',
  })
  @ApiResponse({ status: 201, type: BroadcastSingleResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async createBroadcast(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: IUser,
  ): Promise<BroadcastSingleResponseDto> {
    this.logger.log(
      `Create broadcast: tenant=${getTenantId(user)}, type=${dto.recipient_type}, channel=${dto.channel}`,
    );

    const broadcast = await this.adhocService.createBroadcast(
      getTenantId(user),
      user.id,
      {
        tenantId: getTenantId(user),
        subject: dto.subject,
        body: dto.body,
        htmlBody: dto.html_body,
        recipientType: dto.recipient_type,
        recipientFilter: transformFilterDto(dto.recipient_filter),
        recipientGroupId: dto.recipient_group_id,
        channel: dto.channel,
        scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : undefined,
      },
    );

    return new BroadcastSingleResponseDto(true, broadcast);
  }

  @Post('broadcasts/:id/send')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Queue a broadcast for sending',
    description:
      'Queues a draft broadcast message for background processing and delivery.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'Broadcast not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async sendBroadcast(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<MessageResponseDto> {
    this.logger.log(`Send broadcast: id=${id}, tenant=${getTenantId(user)}`);

    await this.adhocService.sendBroadcast(getTenantId(user), id, user.id);

    return { message: 'Broadcast queued for sending' };
  }

  @Post('broadcasts/:id/cancel')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cancel a pending broadcast',
    description: 'Cancels a draft or scheduled broadcast before it is sent.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'Broadcast not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async cancelBroadcast(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<MessageResponseDto> {
    this.logger.log(`Cancel broadcast: id=${id}, tenant=${getTenantId(user)}`);

    await this.adhocService.cancelBroadcast(getTenantId(user), id, user.id);

    return { message: 'Broadcast cancelled' };
  }

  @Get('broadcasts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List broadcast messages',
    description:
      'Returns a paginated list of broadcast messages with optional filtering.',
  })
  @ApiResponse({ status: 200, type: BroadcastListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listBroadcasts(
    @Query() query: ListBroadcastsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<BroadcastListResponseDto> {
    this.logger.debug(
      `List broadcasts: tenant=${getTenantId(user)}, page=${query.page}, status=${query.status}`,
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    // Get broadcasts with filter
    const broadcasts = await this.adhocService.listBroadcasts(
      getTenantId(user),
      {
        status: query.status,
        recipientType: query.recipient_type,
        limit: limit + 1, // Fetch one extra to check if there are more
        offset,
      },
    );

    // Check if there are more results
    const hasNext = broadcasts.length > limit;
    if (hasNext) {
      broadcasts.pop(); // Remove the extra item
    }

    // Transform to response DTOs
    const data = broadcasts.map((b) => new BroadcastListItemDto(b));

    // Calculate total (for now, estimate based on current results)
    // In a production app, you might want a separate count query
    const total = offset + data.length + (hasNext ? 1 : 0);
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: hasNext,
        has_prev: page > 1,
      },
    };
  }

  @Get('broadcasts/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get broadcast details',
    description:
      'Returns detailed broadcast information including delivery statistics.',
  })
  @ApiResponse({ status: 200, type: BroadcastDetailDto })
  @ApiNotFoundResponse({ description: 'Broadcast not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getBroadcast(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: BroadcastDetailDto }> {
    this.logger.debug(`Get broadcast: id=${id}, tenant=${getTenantId(user)}`);

    const broadcast = await this.adhocService.getBroadcast(
      getTenantId(user),
      id,
    );
    if (!broadcast) {
      throw new NotFoundException('Broadcast', id);
    }

    // Get delivery stats
    const stats = await this.recipientEntity.getDeliveryStats(id);

    return {
      success: true,
      data: new BroadcastDetailDto(broadcast, stats),
    };
  }

  // ==================== RECIPIENTS ====================

  @Post('recipients/preview')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Preview recipients based on filter criteria',
    description:
      'Returns a preview of recipients that would receive a broadcast based on the given filter criteria.',
  })
  @ApiResponse({ status: 200, type: RecipientPreviewResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async previewRecipients(
    @Body() dto: PreviewRecipientsDto,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: RecipientPreviewResponseDto }> {
    this.logger.debug(
      `Preview recipients: tenant=${getTenantId(user)}, type=${dto.recipient_type}`,
    );

    const recipients = await this.recipientResolver.resolve(
      getTenantId(user),
      dto.recipient_type,
      transformFilterDto(dto.filter),
      dto.channel,
    );

    // Transform to response format with snake_case
    const previewRecipients = recipients.slice(0, 20).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      preferred_contact: r.preferredContact,
    }));

    return {
      success: true,
      data: {
        total: recipients.length,
        recipients: previewRecipients,
        has_more: recipients.length > 20,
      },
    };
  }

  // ==================== RECIPIENT GROUPS ====================

  @Get('groups')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List recipient groups',
    description:
      'Returns all recipient groups (saved filter presets) for the tenant.',
  })
  @ApiResponse({ status: 200, type: RecipientGroupListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listGroups(
    @CurrentUser() user: IUser,
  ): Promise<RecipientGroupListResponseDto> {
    this.logger.debug(`List groups: tenant=${getTenantId(user)}`);

    const groups = await this.recipientGroupEntity.findByTenant(
      getTenantId(user),
    );

    return {
      success: true,
      data: groups.map((g) => new RecipientGroupResponseDto(g)),
    };
  }

  @Post('groups')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a recipient group',
    description:
      'Creates a new recipient group with the specified filter criteria.',
  })
  @ApiResponse({ status: 201, type: RecipientGroupResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async createGroup(
    @Body() dto: CreateRecipientGroupDto,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: RecipientGroupResponseDto }> {
    this.logger.log(
      `Create group: tenant=${getTenantId(user)}, name=${dto.name}`,
    );

    const group = await this.recipientGroupEntity.create(
      {
        tenantId: getTenantId(user),
        name: dto.name,
        description: dto.description,
        recipientType: dto.recipient_type,
        filterCriteria: transformFilterDto(dto.filter_criteria) ?? {},
      },
      user.id,
    );

    return {
      success: true,
      data: new RecipientGroupResponseDto(group),
    };
  }

  @Get('groups/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get recipient group details',
    description: 'Returns details for a specific recipient group.',
  })
  @ApiResponse({ status: 200, type: RecipientGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Recipient group not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: RecipientGroupResponseDto }> {
    this.logger.debug(`Get group: id=${id}, tenant=${getTenantId(user)}`);

    const group = await this.recipientGroupEntity.findById(id);
    if (!group || group.tenantId !== getTenantId(user)) {
      throw new NotFoundException('RecipientGroup', id);
    }

    return {
      success: true,
      data: new RecipientGroupResponseDto(group),
    };
  }

  @Delete('groups/:id')
  @HttpCode(204)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete a recipient group',
    description:
      'Deletes a custom recipient group. System groups cannot be deleted.',
  })
  @ApiResponse({ status: 204, description: 'Group deleted successfully' })
  @ApiNotFoundResponse({ description: 'Recipient group not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system group' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async deleteGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<void> {
    this.logger.log(`Delete group: id=${id}, tenant=${getTenantId(user)}`);

    await this.recipientGroupEntity.delete(getTenantId(user), id);
  }
}
