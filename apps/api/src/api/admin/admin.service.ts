import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma';
import {
  ContactSubmissionsResponseDto,
  DemoRequestsResponseDto,
} from './dto/submissions.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getContactSubmissions(): Promise<ContactSubmissionsResponseDto> {
    try {
      const [submissions, total, pendingCount] = await Promise.all([
        this.prisma.contactSubmission.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100, // Limit to recent 100 submissions
        }),
        this.prisma.contactSubmission.count(),
        this.prisma.contactSubmission.count({
          where: { status: 'PENDING' },
        }),
      ]);

      this.logger.log(`Retrieved ${submissions.length} contact submissions`);

      // Convert null to undefined for optional fields
      const transformedSubmissions = submissions.map((s) => ({
        ...s,
        phone: s.phone ?? undefined,
      }));

      return {
        submissions: transformedSubmissions,
        total,
        pendingCount,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve contact submissions', error);
      throw error;
    }
  }

  async getDemoRequests(): Promise<DemoRequestsResponseDto> {
    try {
      const [requests, total, pendingCount] = await Promise.all([
        this.prisma.demoRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100, // Limit to recent 100 requests
        }),
        this.prisma.demoRequest.count(),
        this.prisma.demoRequest.count({
          where: { status: 'PENDING' },
        }),
      ]);

      this.logger.log(`Retrieved ${requests.length} demo requests`);

      // Convert null to undefined for optional fields
      const transformedRequests = requests.map((r) => ({
        ...r,
        currentSoftware: r.currentSoftware ?? undefined,
        preferredTime: r.preferredTime ?? undefined,
      }));

      return {
        requests: transformedRequests,
        total,
        pendingCount,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve demo requests', error);
      throw error;
    }
  }

  async updateContactSubmissionStatus(
    id: string,
    status: 'PENDING' | 'CONTACTED',
  ): Promise<void> {
    try {
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { status },
      });

      this.logger.log(`Updated contact submission ${id} status to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update contact submission ${id} status`,
        error,
      );
      throw error;
    }
  }

  async updateDemoRequestStatus(
    id: string,
    status: 'PENDING' | 'CONTACTED',
  ): Promise<void> {
    try {
      await this.prisma.demoRequest.update({
        where: { id },
        data: { status },
      });

      this.logger.log(`Updated demo request ${id} status to ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update demo request ${id} status`, error);
      throw error;
    }
  }
}
