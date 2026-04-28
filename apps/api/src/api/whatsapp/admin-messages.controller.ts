/**
 * AdminMessagesController
 * Item #12 — Step 3: admin WhatsApp inbox REST endpoints.
 *
 * Mount: GET|POST|PATCH /admin/messages/*
 * Auth:  JwtAuthGuard (global) + RolesGuard
 * Read:  OWNER, ADMIN, VIEWER
 * Write: OWNER, ADMIN
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { AdminMessagesService } from './admin-messages.service';
import {
  ListThreadsQueryDto,
  GetThreadQueryDto,
  ReplyToThreadDto,
  SendTemplateDto,
  LinkParentDto,
  ListUnknownQueryDto,
} from './dto/admin-messages.dto';

@ApiTags('Admin - WhatsApp Inbox')
@ApiBearerAuth()
@Controller('admin/messages')
@UseGuards(RolesGuard)
export class AdminMessagesController {
  private readonly logger = new Logger(AdminMessagesController.name);

  constructor(private readonly svc: AdminMessagesService) {}

  // -----------------------------------------------------------------------
  // GET /admin/messages/threads
  // -----------------------------------------------------------------------

  @Get('threads')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List parent conversation threads',
    description:
      'Returns parents who have WhatsApp messages, sorted by most-recent message. ' +
      'Includes unread count and last message snippet.',
  })
  @ApiResponse({ status: 200, description: 'Thread list' })
  async listThreads(
    @CurrentUser() user: IUser,
    @Query() query: ListThreadsQueryDto,
  ) {
    return this.svc.listThreads(
      getTenantId(user),
      query.limit ?? 50,
      query.offset ?? 0,
    );
  }

  // -----------------------------------------------------------------------
  // GET /admin/messages/threads/:parentId
  // -----------------------------------------------------------------------

  @Get('threads/:parentId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get full conversation for a parent' })
  @ApiParam({ name: 'parentId', description: 'Parent UUID' })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'asc = oldest first (default)',
  })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  async getThread(
    @CurrentUser() user: IUser,
    @Param('parentId') parentId: string,
    @Query() query: GetThreadQueryDto,
  ) {
    return this.svc.getThread(
      getTenantId(user),
      parentId,
      query.limit ?? 100,
      query.offset ?? 0,
      query.order ?? 'asc',
    );
  }

  // -----------------------------------------------------------------------
  // POST /admin/messages/threads/:parentId/reply
  // -----------------------------------------------------------------------

  @Post('threads/:parentId/reply')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a free-form reply within 24-hour session window',
    description:
      'Requires an active 24-hour inbound session. Returns 422 with ' +
      '{ requiresTemplate: true } if outside window.',
  })
  @ApiParam({ name: 'parentId', description: 'Parent UUID' })
  @ApiResponse({ status: 201, description: 'Reply sent and persisted' })
  @ApiResponse({
    status: 422,
    description: 'Outside 24-hour window — use send-template',
  })
  async reply(
    @CurrentUser() user: IUser,
    @Param('parentId') parentId: string,
    @Body() dto: ReplyToThreadDto,
  ) {
    return this.svc.reply(
      getTenantId(user),
      parentId,
      user.id,
      dto.body,
      dto.replyToMessageId,
    );
  }

  // -----------------------------------------------------------------------
  // POST /admin/messages/threads/:parentId/send-template
  // -----------------------------------------------------------------------

  @Post('threads/:parentId/send-template')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send an approved Twilio Content API template',
    description: 'Use when outside the 24-hour session window.',
  })
  @ApiParam({ name: 'parentId', description: 'Parent UUID' })
  @ApiResponse({ status: 201, description: 'Template sent and persisted' })
  async sendTemplate(
    @CurrentUser() user: IUser,
    @Param('parentId') parentId: string,
    @Body() dto: SendTemplateDto,
  ) {
    return this.svc.sendTemplate(
      getTenantId(user),
      parentId,
      user.id,
      dto.contentSid,
      dto.templateParams,
    );
  }

  // -----------------------------------------------------------------------
  // PATCH /admin/messages/:id/read
  // -----------------------------------------------------------------------

  @Patch(':id/read')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark a single message as read' })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: 'Updated message' })
  async markRead(@CurrentUser() user: IUser, @Param('id') messageId: string) {
    return this.svc.markRead(getTenantId(user), messageId, user.id);
  }

  // -----------------------------------------------------------------------
  // POST /admin/messages/threads/:parentId/read-all
  // -----------------------------------------------------------------------

  @Post('threads/:parentId/read-all')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk-mark all unread messages for a parent as read',
  })
  @ApiParam({ name: 'parentId', description: 'Parent UUID' })
  @ApiResponse({ status: 200, description: '{ count: number }' })
  async markAllRead(
    @CurrentUser() user: IUser,
    @Param('parentId') parentId: string,
  ) {
    return this.svc.markAllRead(getTenantId(user), parentId, user.id);
  }

  // -----------------------------------------------------------------------
  // GET /admin/messages/unknown
  // -----------------------------------------------------------------------

  @Get('unknown')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List inbound messages from unrecognised senders (parentId=null)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated unknown-sender messages',
  })
  async listUnknown(
    @CurrentUser() user: IUser,
    @Query() query: ListUnknownQueryDto,
  ) {
    return this.svc.listUnknown(
      getTenantId(user),
      query.limit ?? 50,
      query.offset ?? 0,
    );
  }

  // -----------------------------------------------------------------------
  // POST /admin/messages/:id/link-parent
  // -----------------------------------------------------------------------

  @Post(':id/link-parent')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link an unknown-sender message to a parent',
    description:
      'Updates the specified message and any other unknown messages from the ' +
      'same phone number to point to the given parent.',
  })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  @ApiResponse({ status: 200, description: '{ updated: number }' })
  async linkParent(
    @CurrentUser() user: IUser,
    @Param('id') messageId: string,
    @Body() dto: LinkParentDto,
  ) {
    return this.svc.linkParent(
      getTenantId(user),
      messageId,
      dto.parentId,
      user.id,
    );
  }
}
