/**
 * InboundMessagePersistenceService
 * Item #12 — Step 2: persist incoming Twilio WhatsApp messages before routing.
 *
 * Responsibilities:
 *  - Write a WhatsAppMessage row with direction=INBOUND.
 *  - Resolve parentId by phone (newest-active match; logs alternates).
 *  - Re-upload Twilio media to S3 (StorageKind.WhatsAppMedia); falls back
 *    to original Twilio URL on upload failure so the webhook never blocks.
 *  - For unrecognised numbers (parentId=null) the row is still persisted and
 *    surfaced via the admin "Unknown senders" queue.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, MessageDirection } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import { v4 as uuidv4 } from 'uuid';

/** Shape stored in the mediaUrls JSONB column. */
export interface MediaAttachment {
  url: string;
  contentType: string;
  s3Key?: string;
}

/** Parsed media items from the Twilio incoming webhook body. */
export interface TwilioMediaItem {
  url: string;
  contentType: string;
}

@Injectable()
export class InboundMessagePersistenceService {
  private readonly logger = new Logger(InboundMessagePersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Persist an inbound WhatsApp message.
   *
   * @param tenantId   Resolved tenant (may be the fallback tenant when the
   *                   number is unknown — still required for tenant scoping).
   * @param fromPhone  Raw phone string from Twilio's `From` field, with the
   *                   `whatsapp:` prefix already stripped (e.g. "+27821234567").
   * @param body       Text body of the message (may be empty for media-only).
   * @param twilioSid  Twilio MessageSid — stored in the `wamid` column for
   *                   consistency with the existing outbound tracking field.
   * @param mediaItems Parsed media from NumMedia + MediaUrl0..N fields.
   * @returns The created WhatsAppMessage id.
   */
  async persist(
    tenantId: string,
    fromPhone: string,
    body: string,
    twilioSid: string,
    mediaItems: TwilioMediaItem[],
  ): Promise<string> {
    // ------------------------------------------------------------------
    // 1. Resolve parent by phone number (tenant-scoped)
    // ------------------------------------------------------------------
    const phoneVariants = this.phoneVariants(fromPhone);

    const matchingParents = await this.prisma.parent.findMany({
      where: {
        tenantId,
        OR: phoneVariants.flatMap((p) => [{ whatsapp: p }, { phone: p }]),
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'desc' },
    });

    let parentId: string | null = null;

    if (matchingParents.length === 1) {
      parentId = matchingParents[0].id;
    } else if (matchingParents.length > 1) {
      // Auto-match newest-active; log alternates for later UI triage.
      parentId = matchingParents[0].id;
      this.logger.warn(
        `[InboundPersist] Multiple parents share phone in tenant=${tenantId}. ` +
          `Auto-matched parentId=${parentId}. ` +
          `Alternates: ${matchingParents
            .slice(1)
            .map((p) => p.id)
            .join(', ')}. ` +
          `TODO: surface multi-match triage in admin UI.`,
      );
    } else {
      this.logger.log(
        `[InboundPersist] No parent matched for phone=${fromPhone} ` +
          `tenant=${tenantId}. Row will be persisted with parentId=null ` +
          `(unknown sender queue).`,
      );
    }

    // ------------------------------------------------------------------
    // 2. Re-upload media to S3 (best-effort; fallback on error)
    // ------------------------------------------------------------------
    const mediaAttachments: MediaAttachment[] = [];

    for (const item of mediaItems) {
      try {
        const attachment = await this.reuploadMedia(
          tenantId,
          item.url,
          item.contentType,
        );
        mediaAttachments.push(attachment);
      } catch (err) {
        // Non-fatal — use original Twilio URL as fallback.
        this.logger.error(
          `[InboundPersist] Media re-upload failed for url=${item.url}: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Falling back to original Twilio URL.`,
        );
        mediaAttachments.push({ url: item.url, contentType: item.contentType });
      }
    }

    // ------------------------------------------------------------------
    // 3. Persist the WhatsAppMessage row
    // ------------------------------------------------------------------
    const created = await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        parentId: parentId ?? undefined,
        // recipientPhone stores the *destination* for outbound rows.
        // For inbound rows we have no "recipient" — we store fromPhone here
        // to keep the NOT NULL constraint satisfied; fromPhone column also
        // captures it for queries.
        recipientPhone: fromPhone,
        fromPhone,
        body: body || null,
        direction: MessageDirection.INBOUND,
        wamid: twilioSid || null,
        mediaUrls:
          mediaAttachments.length > 0
            ? (mediaAttachments as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        // templateName + contextType are nullable for INBOUND rows.
        templateName: null,
        contextType: null,
        isRead: false,
      },
      select: { id: true },
    });

    this.logger.log(
      `[InboundPersist] Persisted INBOUND message id=${created.id} ` +
        `parentId=${parentId ?? 'null'} twilioSid=${twilioSid}`,
    );

    return created.id;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch a Twilio media URL (requires Basic auth) and put the result in S3.
   *
   * Twilio media URLs are authenticated — unauthenticated GETs return 401.
   * We use TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN as Basic auth credentials.
   */
  private async reuploadMedia(
    tenantId: string,
    twilioUrl: string,
    contentType: string,
  ): Promise<MediaAttachment> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(twilioUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      throw new Error(
        `Twilio media fetch returned ${res.status} for ${twilioUrl}`,
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Derive a safe filename extension from the content type.
    const ext = this.extFromContentType(contentType);
    const objectId = uuidv4();
    const filename = `${objectId}${ext}`;
    const s3Key = this.storage.buildKey(
      tenantId,
      StorageKind.WhatsAppMedia,
      filename,
    );

    await this.storage.putObject(
      tenantId,
      StorageKind.WhatsAppMedia,
      s3Key,
      buffer,
      contentType,
    );

    return { url: twilioUrl, contentType, s3Key };
  }

  /** Generate common phone variants to match against DB values. */
  private phoneVariants(phone: string): string[] {
    // phone may arrive as "+27821234567" or "27821234567" or "0821234567"
    const variants: string[] = [phone];

    // With + prefix
    if (!phone.startsWith('+')) {
      variants.push(`+${phone}`);
    }

    // Without + prefix
    if (phone.startsWith('+')) {
      variants.push(phone.slice(1));
    }

    // SA local format: 27XXXXXXXXX → 0XXXXXXXXX
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.startsWith('27') && digitsOnly.length === 11) {
      variants.push(`0${digitsOnly.slice(2)}`);
    }

    return [...new Set(variants)];
  }

  /** Map a MIME type to a file extension (best-effort). */
  private extFromContentType(contentType: string): string {
    const ct = contentType.split(';')[0].trim().toLowerCase();
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'application/pdf': '.pdf',
    };
    return map[ct] ?? '';
  }
}
