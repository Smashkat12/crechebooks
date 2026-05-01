import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import { InAppPreferenceService } from '../../notifications/in-app-preference.service';
import {
  ListNotificationsQueryDto,
  UnreadCountResponseDto,
  MarkAllReadResponseDto,
  UpdatePreferencesDto,
} from './dto/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly preferenceService: InAppPreferenceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiResponse({ status: 200, description: 'Paginated notification list' })
  async list(
    @CurrentUser() user: IUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const tenantId = getTenantId(user);
    return this.inAppNotificationService.listForRecipient({
      tenantId,
      recipientId: user.id,
      recipientType: 'USER',
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
    @CurrentUser() user: IUser,
  ): Promise<UnreadCountResponseDto> {
    const tenantId = getTenantId(user);
    const count = await this.inAppNotificationService.getUnreadCount(
      tenantId,
      'USER',
      user.id,
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
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<void> {
    const tenantId = getTenantId(user);
    await this.inAppNotificationService.markAsRead(id, tenantId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, type: MarkAllReadResponseDto })
  async markAllRead(
    @CurrentUser() user: IUser,
  ): Promise<MarkAllReadResponseDto> {
    const tenantId = getTenantId(user);
    const count = await this.inAppNotificationService.markAllAsRead(
      tenantId,
      'USER',
      user.id,
    );
    return { count };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    return this.preferenceService.getPreferences(tenantId, 'USER', user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser() user: IUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const tenantId = getTenantId(user);
    return this.preferenceService.updatePreferences(
      tenantId,
      'USER',
      user.id,
      dto,
    );
  }
}
