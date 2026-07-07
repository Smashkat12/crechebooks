/**
 * TemplatesService
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * @module api/templates
 * @description CRUD + fall-through-defaults for MessageTemplate rows. Uses
 * MessageTemplateResolverService's static defaults so the frontend always sees
 * the complete key/channel matrix, even when the tenant hasn't customized any
 * template yet.
 *
 * CRITICAL: All queries scoped to tenantId (multi-tenant isolation).
 * CRITICAL: Every mutation writes an audit log entry.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MessageTemplate,
  MessageTemplateChannel,
  MessageTemplateKey,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { MessageTemplateResolverService } from '../../database/services/message-template-resolver.service';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  findDefaultTemplate,
  MessageTemplateChannelLiteral,
  MessageTemplateKeyLiteral,
} from '../../database/constants/message-template-defaults';
import {
  MessageTemplateResponseDto,
  UpsertMessageTemplateDto,
} from './dto/message-template.dto';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly resolver: MessageTemplateResolverService,
  ) {}

  /**
   * List templates for the tenant, merged with fall-through defaults so every
   * (key, channel) combination that has a coded default appears in the
   * result. Overrides win; unchanged rows are returned as `isDefault: true`.
   *
   * @param tenantId - Tenant scope (mandatory).
   * @param channel - Optional filter (EMAIL / WHATSAPP / SMS).
   */
  async list(
    tenantId: string,
    channel?: MessageTemplateChannel,
  ): Promise<MessageTemplateResponseDto[]> {
    const overrides = await this.prisma.messageTemplate.findMany({
      where: { tenantId, ...(channel ? { channel } : {}) },
    });
    const overrideByKey = new Map<string, MessageTemplate>();
    for (const row of overrides) {
      overrideByKey.set(this.overrideKey(row.key, row.channel), row);
    }

    const merged: MessageTemplateResponseDto[] = [];
    for (const def of DEFAULT_MESSAGE_TEMPLATES) {
      if (channel && def.channel !== channel) continue;
      const override = overrideByKey.get(
        this.overrideKey(def.key, def.channel),
      );
      if (override) {
        merged.push(
          this.toResponse(tenantId, override, def.label, def.placeholders),
        );
      } else {
        merged.push({
          id: null,
          tenantId,
          key: def.key as MessageTemplateKey,
          channel: def.channel as MessageTemplateChannel,
          subject: def.subject,
          body: def.body,
          isDefault: true,
          label: def.label,
          placeholders: def.placeholders,
          createdAt: null,
          updatedAt: null,
        });
      }
    }
    return merged;
  }

  /**
   * Fetch a single template. If the tenant has no override, the coded default
   * is returned (never throws NotFound when a default exists).
   */
  async findOne(
    tenantId: string,
    key: MessageTemplateKey,
    channel: MessageTemplateChannel,
  ): Promise<MessageTemplateResponseDto> {
    const override = await this.prisma.messageTemplate.findUnique({
      where: {
        tenantId_key_channel: { tenantId, key, channel },
      },
    });
    const def = findDefaultTemplate(
      key as MessageTemplateKeyLiteral,
      channel as MessageTemplateChannelLiteral,
    );
    if (!override && !def) {
      throw new NotFoundException(
        `No template defined for key=${key}, channel=${channel}`,
      );
    }
    if (override) {
      return this.toResponse(
        tenantId,
        override,
        def?.label ?? `${key} ${channel}`,
        def?.placeholders ?? [],
      );
    }
    // def is non-null here (checked above)
    return {
      id: null,
      tenantId,
      key,
      channel,
      subject: def!.subject,
      body: def!.body,
      isDefault: true,
      label: def!.label,
      placeholders: def!.placeholders,
      createdAt: null,
      updatedAt: null,
    };
  }

  /**
   * Upsert a tenant override. Persists the row and writes an audit log
   * capturing the before/after values so financial-compliance auditors can
   * reconstruct any change to outbound-message wording.
   */
  async upsert(
    tenantId: string,
    userId: string,
    key: MessageTemplateKey,
    channel: MessageTemplateChannel,
    dto: UpsertMessageTemplateDto,
  ): Promise<MessageTemplateResponseDto> {
    const def = findDefaultTemplate(
      key as MessageTemplateKeyLiteral,
      channel as MessageTemplateChannelLiteral,
    );
    if (!def) {
      throw new NotFoundException(
        `Cannot save template for unknown key/channel: ${key}/${channel}`,
      );
    }

    const before = await this.prisma.messageTemplate.findUnique({
      where: {
        tenantId_key_channel: { tenantId, key, channel },
      },
    });

    const nextSubject =
      dto.subject === undefined ? (before?.subject ?? null) : dto.subject;

    const row = await this.prisma.messageTemplate.upsert({
      where: { tenantId_key_channel: { tenantId, key, channel } },
      create: {
        tenantId,
        key,
        channel,
        subject: nextSubject,
        body: dto.body,
        isDefault: false,
      },
      update: {
        subject: nextSubject,
        body: dto.body,
        isDefault: false,
      },
    });

    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'MessageTemplate',
      entityId: row.id,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      beforeValue: before
        ? {
            subject: before.subject,
            body: before.body,
          }
        : undefined,
      afterValue: {
        subject: row.subject,
        body: row.body,
      },
      changeSummary: `${before ? 'Updated' : 'Created'} template ${key}/${channel}`,
    });

    return this.toResponse(tenantId, row, def.label, def.placeholders);
  }

  /**
   * Delete a tenant's override — reverts to the coded default. Idempotent:
   * DELETE on a template with no override is a no-op and still returns the
   * default. Audit log records the revert only when a row was actually
   * removed (that's the meaningful event).
   */
  async delete(
    tenantId: string,
    userId: string,
    key: MessageTemplateKey,
    channel: MessageTemplateChannel,
  ): Promise<MessageTemplateResponseDto> {
    const def = findDefaultTemplate(
      key as MessageTemplateKeyLiteral,
      channel as MessageTemplateChannelLiteral,
    );
    if (!def) {
      throw new NotFoundException(
        `Cannot revert unknown key/channel: ${key}/${channel}`,
      );
    }

    const before = await this.prisma.messageTemplate.findUnique({
      where: { tenantId_key_channel: { tenantId, key, channel } },
    });

    if (before) {
      await this.prisma.messageTemplate.delete({ where: { id: before.id } });
      await this.auditLogService.logAction({
        tenantId,
        userId,
        entityType: 'MessageTemplate',
        entityId: before.id,
        action: AuditAction.DELETE,
        beforeValue: { subject: before.subject, body: before.body },
        changeSummary: `Reverted template ${key}/${channel} to default`,
      });
    }

    return {
      id: null,
      tenantId,
      key,
      channel,
      subject: def.subject,
      body: def.body,
      isDefault: true,
      label: def.label,
      placeholders: def.placeholders,
      createdAt: null,
      updatedAt: null,
    };
  }

  private overrideKey(key: string, channel: string): string {
    return `${key}::${channel}`;
  }

  private toResponse(
    tenantId: string,
    row: MessageTemplate,
    label: string,
    placeholders: string[],
  ): MessageTemplateResponseDto {
    return {
      id: row.id,
      tenantId,
      key: row.key,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      isDefault: row.isDefault,
      label,
      placeholders,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
