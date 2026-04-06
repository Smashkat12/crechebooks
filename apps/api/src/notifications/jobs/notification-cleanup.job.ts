import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

const RETENTION_DAYS = 90;

@Injectable()
export class NotificationCleanupJob {
  private readonly logger = new Logger(NotificationCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run daily at 3:00 AM SAST
  @Cron('0 3 * * *', { timeZone: 'Africa/Johannesburg' })
  async cleanup(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    try {
      const result = await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { createdAt: { lt: cutoff }, isRead: true },
          ],
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired/old notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Notification cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
