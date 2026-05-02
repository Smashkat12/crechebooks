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
import { StaffAuthGuard } from '../auth/guards/staff-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentStaff } from '../auth/decorators/current-staff.decorator';
import type { StaffSessionInfo } from '../auth/decorators/current-staff.decorator';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import {
  ListNotificationsQueryDto,
  UnreadCountResponseDto,
  MarkAllReadResponseDto,
} from './dto/notification.dto';

@ApiTags('Staff Portal - Notifications')
@ApiBearerAuth()
@Controller('staff-portal/notifications')
@Public() // Skip global JwtAuthGuard - StaffAuthGuard handles staff session tokens
@UseGuards(StaffAuthGuard)
export class StaffNotificationController {
  private readonly logger = new Logger(StaffNotificationController.name);

  constructor(
    private readonly inAppNotificationService: InAppNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current staff member' })
  @ApiResponse({ status: 200, description: 'Paginated notification list' })
  async list(
    @CurrentStaff() session: StaffSessionInfo,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.inAppNotificationService.listForRecipient({
      tenantId: session.tenantId,
      recipientId: session.staffId,
      recipientType: 'STAFF',
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
    @CurrentStaff() session: StaffSessionInfo,
  ): Promise<UnreadCountResponseDto> {
    const count = await this.inAppNotificationService.getUnreadCount(
      session.tenantId,
      'STAFF',
      session.staffId,
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
    @CurrentStaff() session: StaffSessionInfo,
    @Param('id') id: string,
  ): Promise<void> {
    await this.inAppNotificationService.markAsRead(id, session.tenantId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, type: MarkAllReadResponseDto })
  async markAllRead(
    @CurrentStaff() session: StaffSessionInfo,
  ): Promise<MarkAllReadResponseDto> {
    const count = await this.inAppNotificationService.markAllAsRead(
      session.tenantId,
      'STAFF',
      session.staffId,
    );
    return { count };
  }
}
