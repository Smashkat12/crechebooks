import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
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
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentParent } from '../auth/decorators/current-parent.decorator';
import type { ParentSession } from '../auth/decorators/current-parent.decorator';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import {
  ListNotificationsQueryDto,
  UnreadCountResponseDto,
  MarkAllReadResponseDto,
} from './dto/notification.dto';

@ApiTags('Parent Portal - Notifications')
@ApiBearerAuth()
@Controller('parent-portal/notifications')
@Public()
@UseGuards(ParentAuthGuard)
export class ParentNotificationController {
  private readonly logger = new Logger(ParentNotificationController.name);

  constructor(
    private readonly inAppNotificationService: InAppNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current parent' })
  @ApiResponse({ status: 200, description: 'Paginated notification list' })
  async list(
    @CurrentParent() session: ParentSession,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.inAppNotificationService.listForRecipient({
      tenantId: session.tenantId,
      recipientId: session.parentId,
      recipientType: 'PARENT',
      cursor: query.cursor,
      limit: query.limit ?? 20,
      type: query.type,
      isRead: query.isRead,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({ status: 200, type: UnreadCountResponseDto })
  async unreadCount(
    @CurrentParent() session: ParentSession,
  ): Promise<UnreadCountResponseDto> {
    const count = await this.inAppNotificationService.getUnreadCount(
      session.tenantId,
      'PARENT',
      session.parentId,
    );
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 204, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @CurrentParent() session: ParentSession,
    @Param('id') id: string,
  ): Promise<void> {
    await this.inAppNotificationService.markAsRead(id, session.tenantId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, type: MarkAllReadResponseDto })
  async markAllRead(
    @CurrentParent() session: ParentSession,
  ): Promise<MarkAllReadResponseDto> {
    const count = await this.inAppNotificationService.markAllAsRead(
      session.tenantId,
      'PARENT',
      session.parentId,
    );
    return { count };
  }
}
