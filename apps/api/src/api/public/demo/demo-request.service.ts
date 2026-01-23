import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma';
import { EmailService } from '../../../common/email';
import {
  CreateDemoRequestDto,
  DemoRequestResponseDto,
} from './dto/demo-request.dto';

@Injectable()
export class DemoRequestService {
  private readonly logger = new Logger(DemoRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async createDemoRequest(
    dto: CreateDemoRequestDto,
  ): Promise<DemoRequestResponseDto> {
    try {
      const demoRequest = await this.prisma.demoRequest.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          crecheName: dto.crecheName,
          childrenCount: dto.childrenCount,
          province: dto.province,
          currentSoftware: dto.currentSoftware,
          challenges: dto.challenges || [],
          preferredTime: dto.preferredTime,
          marketingConsent: dto.marketingConsent,
          status: 'PENDING',
        },
      });

      this.logger.log(
        `Demo request created: ${demoRequest.id} for ${dto.crecheName} (${dto.email})`,
      );

      // Send email notification to CrecheBooks support (non-blocking)
      this.emailService.sendDemoRequestNotification({
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        crecheName: dto.crecheName,
        childrenCount: dto.childrenCount,
        province: dto.province,
        submittedAt: demoRequest.createdAt,
      }).catch(error => {
        this.logger.error('Failed to send demo request email notification', error);
        // Don't fail the request if email fails
      });

      return {
        success: true,
        message:
          'Demo request received! Our team will contact you within 24 hours.',
        requestId: demoRequest.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create demo request for ${dto.email}`,
        error.stack,
      );
      throw error;
    }
  }
}
