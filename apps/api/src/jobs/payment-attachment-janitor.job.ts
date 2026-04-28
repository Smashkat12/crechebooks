/**
 * PaymentAttachmentJanitorJob
 *
 * Daily sweep (03:00 SAST / Africa/Johannesburg) that purges orphan PENDING
 * payment_attachments older than 60 days.
 *
 * "Orphan PENDING" = reviewStatus=PENDING and uploadedAt < now()-60d.  These
 * have been sitting in the review queue for 60+ days with no admin action.
 *
 * For each row the job:
 *  1. Deletes the S3 object (storage cleanup).
 *  2. Audit-logs the deletion (system actor, AuditAction.DELETE).
 *  3. Hard-deletes the DB row.
 *
 * If the S3 delete fails the DB row is intentionally NOT deleted so we never
 * leave an unreachable S3 object without a DB record.  The error is logged and
 * processing continues with the next row.
 *
 * Returns summary counters: { scanned, deleted, s3Errors }.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentAttachmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import { StorageService } from '../integrations/storage/storage.service';
import { StorageKind } from '../integrations/storage/storage.types';

const STALE_DAYS = 60;
const AGENT_ID = 'payment-attachment-janitor';

export interface JanitorSummary {
  scanned: number;
  deleted: number;
  s3Errors: number;
}

@Injectable()
export class PaymentAttachmentJanitorJob {
  private readonly logger = new Logger(PaymentAttachmentJanitorJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Daily sweep at 03:00 SAST (Africa/Johannesburg) to purge stale PENDING
   * payment attachments whose S3 objects and DB rows are no longer useful.
   */
  @Cron('0 3 * * *', {
    name: 'payment-attachment-janitor',
    timeZone: 'Africa/Johannesburg',
  })
  async purgeOrphanAttachments(): Promise<JanitorSummary> {
    const summary: JanitorSummary = { scanned: 0, deleted: 0, s3Errors: 0 };

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - STALE_DAYS);

      const rows = await this.prisma.paymentAttachment.findMany({
        where: {
          reviewStatus: PaymentAttachmentStatus.PENDING,
          uploadedAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          s3Key: true,
          filename: true,
          kind: true,
          uploadedAt: true,
        },
      });

      summary.scanned = rows.length;
      this.logger.log(
        `PaymentAttachmentJanitor: scanned=${rows.length} cutoff=${cutoff.toISOString()}`,
      );

      for (const row of rows) {
        // Step 1 — delete S3 object
        try {
          await this.storageService.deleteObject(
            row.tenantId,
            StorageKind.ProofOfPayment,
            row.s3Key,
          );
        } catch (s3Err) {
          summary.s3Errors += 1;
          this.logger.error({
            message:
              'PaymentAttachmentJanitor: S3 delete failed — skipping DB row',
            attachmentId: row.id,
            tenantId: row.tenantId,
            s3Key: row.s3Key,
            error: s3Err instanceof Error ? s3Err.message : String(s3Err),
          });
          // Do NOT delete the DB row — retain it so the orphan S3 object can be
          // retried on the next run and so admins can diagnose the failure.
          continue;
        }

        // Step 2 — audit-log the deletion (system actor, no userId)
        try {
          await this.auditLogService.logDelete({
            tenantId: row.tenantId,
            agentId: AGENT_ID,
            entityType: 'PaymentAttachment',
            entityId: row.id,
            beforeValue: {
              id: row.id,
              tenantId: row.tenantId,
              s3Key: row.s3Key,
              filename: row.filename,
              kind: row.kind,
              uploadedAt: row.uploadedAt.toISOString(),
              reason: `Janitor purge: PENDING for >${STALE_DAYS} days`,
            },
          });
        } catch (auditErr) {
          // Audit failure is non-fatal — log and press on.  We already deleted
          // the S3 object so stopping here would leave a DB row pointing to a
          // gone S3 key, which is worse than a missing audit entry.
          this.logger.error({
            message:
              'PaymentAttachmentJanitor: audit log failed — continuing with DB delete',
            attachmentId: row.id,
            error:
              auditErr instanceof Error ? auditErr.message : String(auditErr),
          });
        }

        // Step 3 — hard-delete the DB row
        await this.prisma.paymentAttachment.delete({ where: { id: row.id } });
        summary.deleted += 1;
      }

      this.logger.log(
        `PaymentAttachmentJanitor: complete scanned=${summary.scanned} deleted=${summary.deleted} s3Errors=${summary.s3Errors}`,
      );
    } catch (err) {
      this.logger.error({
        message: 'PaymentAttachmentJanitor: unexpected error during sweep',
        error: err instanceof Error ? err.message : String(err),
        file: 'payment-attachment-janitor.job.ts',
        function: 'purgeOrphanAttachments',
        timestamp: new Date().toISOString(),
      });
    }

    return summary;
  }
}
