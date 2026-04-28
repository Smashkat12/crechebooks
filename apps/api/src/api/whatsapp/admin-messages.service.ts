/**
 * AdminMessagesService
 * Item #12 — Step 3: admin WhatsApp inbox.
 *
 * Rules:
 *  - Always tenant-scoped.
 *  - 24h-window: free-form replies allowed only when last INBOUND from that
 *    parent is < 24 h ago. Outside window → caller must use send-template.
 *  - Mutations are audit-logged (WhatsAppMessage entity, action type).
 *  - PII-safe logging: recipient IDs, not raw phone/body.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  MessageDirection,
  WhatsAppMessage,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { WhatsAppProviderService } from '../../integrations/whatsapp/services/whatsapp-provider.service';
import { TwilioContentService } from '../../integrations/whatsapp/services/twilio-content.service';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// -------------------------------------------------------------------------
// Public response shapes
// -------------------------------------------------------------------------

export interface ThreadSummary {
  parentId: string;
  parentName: string;
  lastMessageAt: Date;
  lastMessageSnippet: string;
  unreadCount: number;
}

export interface ThreadListResult {
  threads: ThreadSummary[];
  total: number;
}

export interface ThreadMessagesResult {
  messages: WhatsAppMessage[];
  total: number;
}

export interface ReplyResult {
  message: WhatsAppMessage;
}

export interface WindowCheckResult {
  allowed: boolean;
  lastInboundAt: Date | null;
}

// -------------------------------------------------------------------------
// Service
// -------------------------------------------------------------------------

@Injectable()
export class AdminMessagesService {
  private readonly logger = new Logger(AdminMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly whatsappProvider: WhatsAppProviderService,
    private readonly twilioContent: TwilioContentService,
  ) {}

  // -----------------------------------------------------------------------
  // GET /threads
  // -----------------------------------------------------------------------

  async listThreads(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<ThreadListResult> {
    // Aggregate: find all parentIds that have at least one message, ordered by
    // most-recent message, then join parent name + unread count.

    // Group messages by parentId — Prisma groupBy doesn't directly give us
    // non-aggregated columns, so we use a raw-ish approach:
    // 1. Fetch distinct parentIds with their last message time.
    // 2. Fetch unread counts and last snippet in a second query.

    // Step 1: distinct parents (excluding null) + most-recent message time.
    const groups = await this.prisma.whatsAppMessage.groupBy({
      by: ['parentId'],
      where: {
        tenantId,
        parentId: { not: null },
      },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: offset,
      take: limit,
    });

    const total = await this.prisma.whatsAppMessage
      .groupBy({
        by: ['parentId'],
        where: { tenantId, parentId: { not: null } },
      })
      .then((r) => r.length);

    const threads: ThreadSummary[] = [];

    for (const g of groups) {
      if (!g.parentId) continue;

      const lastMessageAt = g._max.createdAt!;

      // Fetch last message for snippet
      const lastMsg = await this.prisma.whatsAppMessage.findFirst({
        where: { tenantId, parentId: g.parentId },
        orderBy: { createdAt: 'desc' },
        select: { body: true, templateName: true },
      });

      const snippet = (lastMsg?.body ?? lastMsg?.templateName ?? '').slice(
        0,
        100,
      );

      // Unread count (admin inbox — INBOUND messages not marked read)
      const unreadCount = await this.prisma.whatsAppMessage.count({
        where: {
          tenantId,
          parentId: g.parentId,
          direction: MessageDirection.INBOUND,
          isRead: false,
        },
      });

      // Parent name
      const parent = await this.prisma.parent.findUnique({
        where: { id: g.parentId },
        select: { firstName: true, lastName: true },
      });

      threads.push({
        parentId: g.parentId,
        parentName: parent
          ? `${parent.firstName} ${parent.lastName}`.trim()
          : g.parentId,
        lastMessageAt,
        lastMessageSnippet: snippet,
        unreadCount,
      });
    }

    return { threads, total };
  }

  // -----------------------------------------------------------------------
  // GET /threads/:parentId
  // -----------------------------------------------------------------------

  async getThread(
    tenantId: string,
    parentId: string,
    limit: number,
    offset: number,
    order: 'asc' | 'desc',
  ): Promise<ThreadMessagesResult> {
    // Verify parent belongs to tenant
    await this.assertParentInTenant(tenantId, parentId);

    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: { tenantId, parentId },
        orderBy: { createdAt: order },
        take: limit,
        skip: offset,
      }),
      this.prisma.whatsAppMessage.count({
        where: { tenantId, parentId },
      }),
    ]);

    return { messages, total };
  }

  // -----------------------------------------------------------------------
  // POST /threads/:parentId/reply
  // -----------------------------------------------------------------------

  async reply(
    tenantId: string,
    parentId: string,
    actorUserId: string,
    body: string,
    replyToMessageId?: string,
  ): Promise<ReplyResult> {
    await this.assertParentInTenant(tenantId, parentId);

    // 24h-window check
    const window = await this.check24hWindow(tenantId, parentId);
    if (!window.allowed) {
      throw new UnprocessableEntityException({
        message:
          'No active 24-hour session. Use send-template for outside-window messages.',
        requiresTemplate: true,
        lastInboundAt: window.lastInboundAt,
      });
    }

    // Resolve parent phone for delivery
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { whatsapp: true, phone: true },
    });

    const toPhone = parent?.whatsapp ?? parent?.phone;
    if (!toPhone) {
      throw new UnprocessableEntityException(
        'Parent has no WhatsApp or phone number on record.',
      );
    }

    // Send via provider
    const result = await this.whatsappProvider.sendMessage(toPhone, body, {
      tenantId,
    });

    // Persist OUTBOUND row
    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        parentId,
        recipientPhone: toPhone,
        body,
        direction: MessageDirection.OUTBOUND,
        wamid: result.messageId ?? null,
        replyToMessageId: replyToMessageId ?? null,
        status: result.success
          ? WhatsAppMessageStatus.SENT
          : WhatsAppMessageStatus.FAILED,
        sentAt: result.success ? new Date() : null,
      },
    });

    await this.auditLog.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'WhatsAppMessage',
      entityId: msg.id,
      action: AuditAction.CREATE,
      afterValue: {
        direction: 'OUTBOUND',
        parentId,
        twilioSid: result.messageId,
      },
      changeSummary: `Admin replied to parent ${parentId} via WhatsApp`,
    });

    return { message: msg };
  }

  // -----------------------------------------------------------------------
  // POST /threads/:parentId/send-template
  // -----------------------------------------------------------------------

  async sendTemplate(
    tenantId: string,
    parentId: string,
    actorUserId: string,
    contentSid: string,
    templateParams?: Record<string, string>,
  ): Promise<ReplyResult> {
    await this.assertParentInTenant(tenantId, parentId);

    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { whatsapp: true, phone: true },
    });

    const toPhone = parent?.whatsapp ?? parent?.phone;
    if (!toPhone) {
      throw new UnprocessableEntityException(
        'Parent has no WhatsApp or phone number on record.',
      );
    }

    // Build variables array for TwilioContentService
    // keys are positional indices (e.g. "1", "2") per Twilio Content API convention
    const variables = templateParams
      ? Object.entries(templateParams).map(([key, value]) => ({ key, value }))
      : [];

    const sendResult = await this.twilioContent.sendContentMessage(
      toPhone,
      contentSid,
      variables,
      tenantId,
    );

    // Persist OUTBOUND row
    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        parentId,
        recipientPhone: toPhone,
        templateName: contentSid,
        templateParams: templateParams
          ? (templateParams as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        direction: MessageDirection.OUTBOUND,
        wamid: sendResult.messageSid ?? null,
        status: sendResult.success
          ? WhatsAppMessageStatus.SENT
          : WhatsAppMessageStatus.FAILED,
        sentAt: sendResult.success ? new Date() : null,
      },
    });

    await this.auditLog.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'WhatsAppMessage',
      entityId: msg.id,
      action: AuditAction.CREATE,
      afterValue: {
        direction: 'OUTBOUND',
        parentId,
        contentSid,
        twilioSid: sendResult.messageSid,
      },
      changeSummary: `Admin sent template ${contentSid} to parent ${parentId}`,
    });

    return { message: msg };
  }

  // -----------------------------------------------------------------------
  // PATCH /messages/:id/read
  // -----------------------------------------------------------------------

  async markRead(
    tenantId: string,
    messageId: string,
    actorUserId: string,
  ): Promise<WhatsAppMessage> {
    const existing = await this.prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
    });

    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    const updated = await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        isRead: true,
        readByUserId: actorUserId,
        adminReadAt: new Date(),
      },
    });

    await this.auditLog.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'WhatsAppMessage',
      entityId: messageId,
      action: AuditAction.UPDATE,
      beforeValue: { isRead: false },
      afterValue: { isRead: true, readByUserId: actorUserId },
      changeSummary: 'Admin marked message as read',
    });

    return updated;
  }

  // -----------------------------------------------------------------------
  // POST /threads/:parentId/read-all
  // -----------------------------------------------------------------------

  async markAllRead(
    tenantId: string,
    parentId: string,
    actorUserId: string,
  ): Promise<{ count: number }> {
    await this.assertParentInTenant(tenantId, parentId);

    const result = await this.prisma.whatsAppMessage.updateMany({
      where: {
        tenantId,
        parentId,
        direction: MessageDirection.INBOUND,
        isRead: false,
      },
      data: {
        isRead: true,
        readByUserId: actorUserId,
        adminReadAt: new Date(),
      },
    });

    this.logger.log(
      `[AdminMessages] markAllRead parentId=${parentId} count=${result.count} actor=${actorUserId}`,
    );

    return { count: result.count };
  }

  // -----------------------------------------------------------------------
  // GET /unknown
  // -----------------------------------------------------------------------

  async listUnknown(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<{ messages: WhatsAppMessage[]; total: number }> {
    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: {
          tenantId,
          parentId: null,
          direction: MessageDirection.INBOUND,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.whatsAppMessage.count({
        where: {
          tenantId,
          parentId: null,
          direction: MessageDirection.INBOUND,
        },
      }),
    ]);

    return { messages, total };
  }

  // -----------------------------------------------------------------------
  // POST /messages/:id/link-parent
  // -----------------------------------------------------------------------

  async linkParent(
    tenantId: string,
    messageId: string,
    parentId: string,
    actorUserId: string,
  ): Promise<{ updated: number }> {
    // Verify parent belongs to tenant
    await this.assertParentInTenant(tenantId, parentId);

    // Verify message is in tenant
    const msg = await this.prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: { id: true, tenantId: true, fromPhone: true },
    });

    if (!msg || msg.tenantId !== tenantId) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Update this message
    await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { parentId },
    });

    let bulkCount = 1;

    // If fromPhone is known, also link other unknown messages from same phone
    if (msg.fromPhone) {
      const bulkResult = await this.prisma.whatsAppMessage.updateMany({
        where: {
          tenantId,
          parentId: null,
          fromPhone: msg.fromPhone,
          id: { not: messageId },
        },
        data: { parentId },
      });
      bulkCount += bulkResult.count;
    }

    await this.auditLog.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'WhatsAppMessage',
      entityId: messageId,
      action: AuditAction.UPDATE,
      beforeValue: { parentId: null },
      afterValue: { parentId },
      changeSummary: `Admin linked unknown-sender message(s) to parent ${parentId}`,
    });

    return { updated: bulkCount };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Verify parent exists in tenant; throw 404 if not. */
  private async assertParentInTenant(
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { id: true, tenantId: true },
    });
    if (!parent || parent.tenantId !== tenantId) {
      throw new NotFoundException(`Parent ${parentId} not found`);
    }
  }

  /** Check whether a free-form reply is within the 24-hour window. */
  async check24hWindow(
    tenantId: string,
    parentId: string,
  ): Promise<WindowCheckResult> {
    const latest = await this.prisma.whatsAppMessage.findFirst({
      where: {
        tenantId,
        parentId,
        direction: MessageDirection.INBOUND,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!latest) {
      return { allowed: false, lastInboundAt: null };
    }

    const age = Date.now() - latest.createdAt.getTime();
    return {
      allowed: age < TWENTY_FOUR_HOURS_MS,
      lastInboundAt: latest.createdAt,
    };
  }
}
