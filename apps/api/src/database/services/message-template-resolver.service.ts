/**
 * MessageTemplateResolverService
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * @module database/services/message-template-resolver
 * @description Resolves a rendered subject + body for any (tenantId, key,
 * channel) triple. Preference order:
 *   1. Tenant-specific override in the `message_templates` table.
 *   2. Coded default from message-template-defaults.ts.
 *
 * The resolver ONLY handles string sourcing + placeholder substitution. Sender
 * services keep their existing plumbing (recipient lookup, PDF generation,
 * WhatsApp routing, etc.). This keeps the diff minimal and preserves the
 * substitution behaviour of existing UI paths — a tenant with no overrides
 * gets exactly the same bytes on the wire as before.
 *
 * CRITICAL: All queries MUST filter by tenantId (multi-tenant isolation).
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  MessageTemplate,
  MessageTemplateKey,
  MessageTemplateChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  DefaultMessageTemplate,
  MessageTemplateKeyLiteral,
  MessageTemplateChannelLiteral,
  findDefaultTemplate,
} from '../constants/message-template-defaults';

/** Placeholder substitutions supplied by the caller. */
export type TemplateVariables = Record<
  string,
  string | number | null | undefined
>;

/**
 * Resolved template ready for delivery. `subject` is `null` for
 * subject-less channels (WhatsApp/SMS).
 */
export interface ResolvedMessageTemplate {
  key: MessageTemplateKeyLiteral;
  channel: MessageTemplateChannelLiteral;
  subject: string | null;
  body: string;
  /** True when the source was a tenant override; false when the default was used. */
  isCustom: boolean;
}

@Injectable()
export class MessageTemplateResolverService {
  private readonly logger = new Logger(MessageTemplateResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve raw (unrendered) template strings.
   * Use `resolveAndRender` when you have variables to substitute.
   */
  async resolve(
    tenantId: string,
    key: MessageTemplateKeyLiteral,
    channel: MessageTemplateChannelLiteral,
  ): Promise<ResolvedMessageTemplate | null> {
    let override: MessageTemplate | null = null;
    try {
      override = await this.prisma.messageTemplate.findUnique({
        where: {
          tenantId_key_channel: {
            tenantId,
            key: key as MessageTemplateKey,
            channel: channel as MessageTemplateChannel,
          },
        },
      });
    } catch (error) {
      // If the table doesn't exist yet (migration not run), fall through to defaults.
      this.logger.warn(
        `Falling back to default template for ${key}/${channel} (tenant ${tenantId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (override) {
      return {
        key,
        channel,
        subject: override.subject,
        body: override.body,
        isCustom: true,
      };
    }

    const fallback = findDefaultTemplate(key, channel);
    if (!fallback) {
      this.logger.debug(
        `No default template defined for ${key}/${channel} (tenant ${tenantId})`,
      );
      return null;
    }

    return {
      key,
      channel,
      subject: fallback.subject,
      body: fallback.body,
      isCustom: false,
    };
  }

  /**
   * Resolve and render a template — subject and body have all placeholders
   * substituted using `variables`. Missing placeholders are left as-is (they
   * render literally, matching the legacy renderers' behaviour).
   */
  async resolveAndRender(
    tenantId: string,
    key: MessageTemplateKeyLiteral,
    channel: MessageTemplateChannelLiteral,
    variables: TemplateVariables,
  ): Promise<ResolvedMessageTemplate | null> {
    const resolved = await this.resolve(tenantId, key, channel);
    if (!resolved) return null;
    return {
      ...resolved,
      subject: resolved.subject
        ? this.renderString(resolved.subject, variables)
        : null,
      body: this.renderString(resolved.body, variables),
    };
  }

  /**
   * Substitute `{name}` placeholders. Values are coerced to string; `null` /
   * `undefined` become empty string. This matches ReminderService and the
   * legacy sender behaviour bit-for-bit.
   */
  renderString(template: string, variables: TemplateVariables): string {
    let result = template;
    for (const [name, value] of Object.entries(variables)) {
      const safeValue =
        value === null || value === undefined ? '' : String(value);
      result = result.replaceAll(`{${name}}`, safeValue);
    }
    return result;
  }

  /**
   * Return every coded default. Used by the templates API to fall-through
   * defaults for keys the tenant hasn't overridden.
   */
  listDefaults(): DefaultMessageTemplate[] {
    return DEFAULT_MESSAGE_TEMPLATES;
  }
}
