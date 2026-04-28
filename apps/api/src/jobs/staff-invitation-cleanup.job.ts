/**
 * StaffInvitationCleanupJob
 * TASK-STAFF-INVITE-001: Wire expireOldInvites() as a daily cron.
 *
 * Runs daily at 03:00 SAST (Africa/Johannesburg = UTC+2).
 * Cron string: '0 1 * * *' in UTC == 03:00 SAST.
 * Calls StaffInvitationService.expireOldInvites() and logs the affected count.
 * Tenant-agnostic: the service method runs a global updateMany across all tenants.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StaffInvitationService } from '../api/staff/staff-invitation.service';

@Injectable()
export class StaffInvitationCleanupJob {
  private readonly logger = new Logger(StaffInvitationCleanupJob.name);

  constructor(
    private readonly staffInvitationService: StaffInvitationService,
  ) {}

  /**
   * Daily sweep at 03:00 SAST (01:00 UTC) to expire stale PENDING invitations.
   */
  @Cron('0 1 * * *', {
    name: 'staff-invitation-cleanup',
    timeZone: 'Africa/Johannesburg',
  })
  async expireStaleInvites(): Promise<void> {
    this.logger.log('Starting staff invitation expiry sweep');

    try {
      const count = await this.staffInvitationService.expireOldInvites();
      this.logger.log(
        `Staff invitation expiry sweep complete: ${count} invitation(s) expired`,
      );
    } catch (error) {
      this.logger.error({
        message: 'Staff invitation expiry sweep failed',
        error: error instanceof Error ? error.message : String(error),
        file: 'staff-invitation-cleanup.job.ts',
        function: 'expireStaleInvites',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
