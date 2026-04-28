/**
 * ParentMessagesController
 * Item #12 — Step 4: parent portal read-only WhatsApp thread view.
 *
 * Mount:  GET /parent-portal/messages
 * Auth:   ParentAuthGuard (session token from magic-link service)
 * Scope:  Read-only v1 — parent sees their own conversation thread.
 *         Parent-initiated send is deferred to v2.
 */

import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import { CurrentParent } from '../auth/decorators/current-parent.decorator';
import type { ParentSession } from '../auth/decorators/current-parent.decorator';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaginationQueryDto } from './dto/admin-messages.dto';

@ApiTags('Parent Portal - Messages')
@ApiBearerAuth()
@Controller('parent-portal/messages')
@Public()
@UseGuards(ParentAuthGuard)
export class ParentMessagesController {
  private readonly logger = new Logger(ParentMessagesController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /parent-portal/messages
   *
   * Returns the authenticated parent's own conversation thread (both
   * INBOUND messages they sent and OUTBOUND messages the creche sent to them),
   * paginated oldest-first by default.
   *
   * v1: read-only. Parent-initiated send is out of scope.
   */
  @Get()
  @ApiOperation({
    summary: 'Get own WhatsApp conversation thread (read-only v1)',
    description:
      'Returns all WhatsApp messages where parentId matches the ' +
      'authenticated parent. Paginated, oldest-first.',
  })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  async getOwnThread(
    @CurrentParent() session: ParentSession,
    @Query() query: PaginationQueryDto,
  ) {
    const tenantId = session.tenantId;
    const parentId = session.parentId;
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: { tenantId, parentId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
        // Omit readByUserId / adminReadAt from parent view — internal fields.
        select: {
          id: true,
          parentId: true,
          direction: true,
          body: true,
          templateName: true,
          mediaUrls: true,
          status: true,
          wamid: true,
          createdAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
        },
      }),
      this.prisma.whatsAppMessage.count({
        where: { tenantId, parentId },
      }),
    ]);

    return {
      messages,
      total,
      limit,
      offset,
    };
  }
}
