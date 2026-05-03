/**
 * PopOrphanSweepJob — F2-P-001
 *
 * Problem: parent uploads a PoP to S3 (presign → PUT) but the follow-up
 * register API call fails. The S3 object exists with no DB row and orphans
 * forever because the next retry generates a new s3Key.
 *
 * Fix: daily sweep at 04:00 SAST that:
 *  1. Lists all S3 objects under tenants/{tenantId}/proof-of-payments/
 *     for every tenant that has the StorageKind.ProofOfPayment prefix.
 *     (Since we don't have a per-tenant prefix list, we list the whole
 *      tenants/ prefix and filter by kind.)
 *  2. Cross-references the list against payment_attachments.s3_key.
 *  3. Deletes S3 objects older than MAX_AGE_HOURS with no DB row (orphans).
 *
 * The sweep runs at 04:00 SAST (01:00 UTC) — offset from the janitor job
 * at 03:00 to avoid competing load.
 *
 * NOTE (S3 lifecycle rule):
 *   As an additional safety net, apply the following lifecycle policy to both
 *   S3 buckets (crechebooks-uploads-staging, crechebooks-uploads-prod):
 *
 *   Rule ID:   abort-pending-pop-uploads
 *   Filter:    Prefix = "tenants/"   (or more targeted if needed)
 *   Action:    AbortIncompleteMultipartUpload after 1 day
 *   (This handles multipart edge-cases; single-PUT objects are covered
 *    by this cron job.)
 *
 *   The bucket already has "abort-incomplete-multipart-7d". Adding a
 *   tighter 1-day rule for incomplete multipart under tenants/ is optional
 *   but recommended. The main orphan vector (failed register) is single-PUT
 *   and is handled by this job.
 *
 * Summary shape: { scanned, orphans, deleted, s3Errors }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import { StorageService } from '../integrations/storage/storage.service';
import { StorageKind } from '../integrations/storage/storage.types';

/** Orphan S3 objects older than this are eligible for deletion. */
const MAX_AGE_HOURS = 24;

/** Prefix that covers all PoP objects across all tenants */
const POP_S3_PREFIX = 'tenants/';

/** Only objects under this kind sub-path are considered */
const POP_KIND_SEGMENT = '/proof-of-payments/';

const AGENT_ID = 'pop-orphan-sweep';

export interface OrphanSweepSummary {
  /** Total S3 objects inspected */
  scanned: number;
  /** Objects identified as orphans (no DB row + age > MAX_AGE_HOURS) */
  orphans: number;
  /** Objects successfully deleted */
  deleted: number;
  /** S3 delete errors */
  s3Errors: number;
}

@Injectable()
export class PopOrphanSweepJob {
  private readonly logger = new Logger(PopOrphanSweepJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Daily sweep at 04:00 SAST (Africa/Johannesburg) = 01:00 UTC.
   * Offset from PaymentAttachmentJanitorJob (03:00 SAST) to avoid concurrent load.
   */
  @Cron('0 4 * * *', {
    name: 'pop-orphan-sweep',
    timeZone: 'Africa/Johannesburg',
  })
  async sweepOrphans(): Promise<OrphanSweepSummary> {
    return this.runSweep({ dryRun: false });
  }

  /**
   * Core sweep logic, shared between the cron trigger and the admin endpoint.
   *
   * @param dryRun - When true, orphans are identified and logged but NOT deleted.
   */
  async runSweep(opts: { dryRun: boolean }): Promise<OrphanSweepSummary> {
    const summary: OrphanSweepSummary = {
      scanned: 0,
      orphans: 0,
      deleted: 0,
      s3Errors: 0,
    };

    try {
      const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);

      // 1. List all S3 objects under tenants/ — filter to proof-of-payments
      const allObjects =
        await this.storageService.listObjectsWithPrefix(POP_S3_PREFIX);

      const popObjects = allObjects.filter((obj) =>
        obj.key.includes(POP_KIND_SEGMENT),
      );

      summary.scanned = popObjects.length;
      this.logger.log(
        `PopOrphanSweep: scanned=${summary.scanned} cutoff=${cutoff.toISOString()} dryRun=${opts.dryRun}`,
      );

      if (popObjects.length === 0) {
        return summary;
      }

      // 2. Fetch all DB keys in one query to avoid N+1
      const dbKeys = await this.fetchAllDbKeys();

      // 3. Identify and sweep orphans
      for (const obj of popObjects) {
        if (obj.lastModified >= cutoff) {
          // Too recent — skip (may still be in the register window)
          continue;
        }

        if (dbKeys.has(obj.key)) {
          // Registered — not an orphan
          continue;
        }

        summary.orphans += 1;

        if (opts.dryRun) {
          this.logger.log(
            `PopOrphanSweep [DRY-RUN]: would delete orphan key=${obj.key} lastModified=${obj.lastModified.toISOString()}`,
          );
          continue;
        }

        // 4. Delete orphan from S3
        try {
          // Extract tenantId from key: tenants/{tenantId}/proof-of-payments/...
          const tenantId = extractTenantId(obj.key);
          await this.storageService.deleteObject(
            tenantId,
            StorageKind.ProofOfPayment,
            obj.key,
          );
        } catch (s3Err) {
          summary.s3Errors += 1;
          this.logger.error({
            message: 'PopOrphanSweep: S3 delete failed — skipping',
            key: obj.key,
            error: s3Err instanceof Error ? s3Err.message : String(s3Err),
          });
          continue;
        }

        summary.deleted += 1;

        // 5. Audit-log the deletion (best-effort)
        try {
          await this.auditLogService.logAction({
            // No tenantId scoping for system sweep — use the tenantId from key
            tenantId: extractTenantId(obj.key),
            agentId: AGENT_ID,
            entityType: 'S3OrphanObject',
            entityId: obj.key,
            action: AuditAction.DELETE,
            changeSummary: `Orphan PoP S3 object deleted by sweep (age>${MAX_AGE_HOURS}h, no DB row)`,
          });
        } catch (auditErr) {
          this.logger.warn({
            message: 'PopOrphanSweep: audit log failed — continuing',
            key: obj.key,
            error:
              auditErr instanceof Error ? auditErr.message : String(auditErr),
          });
        }
      }

      this.logger.log(
        `PopOrphanSweep: complete scanned=${summary.scanned} orphans=${summary.orphans} deleted=${summary.deleted} s3Errors=${summary.s3Errors} dryRun=${opts.dryRun}`,
      );
    } catch (err) {
      this.logger.error({
        message: 'PopOrphanSweep: unexpected error during sweep',
        error: err instanceof Error ? err.message : String(err),
        file: 'pop-orphan-sweep.job.ts',
        function: 'runSweep',
        timestamp: new Date().toISOString(),
      });
    }

    return summary;
  }

  /**
   * Load all s3_key values from payment_attachments into a Set for O(1) lookup.
   * This avoids N+1 S3-object → DB queries.
   */
  private async fetchAllDbKeys(): Promise<Set<string>> {
    const rows = await this.prisma.paymentAttachment.findMany({
      select: { s3Key: true },
    });
    return new Set(rows.map((r) => r.s3Key));
  }
}

/**
 * Extract tenantId from an S3 key of the form
 * tenants/{tenantId}/proof-of-payments/...
 *
 * Throws if the key does not match the expected shape.
 */
function extractTenantId(key: string): string {
  // key = tenants/<uuid>/proof-of-payments/...
  const parts = key.split('/');
  // parts[0] = 'tenants', parts[1] = tenantId, parts[2] = kind
  if (parts.length < 3 || parts[0] !== 'tenants' || !parts[1]) {
    throw new Error(`Cannot extract tenantId from S3 key: ${key}`);
  }
  return parts[1];
}
