import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma';
import { CreateContactDto, ContactResponseDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createContactSubmission(
    dto: CreateContactDto,
  ): Promise<ContactResponseDto> {
    try {
      const submission = await this.prisma.contactSubmission.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          subject: dto.subject,
          message: dto.message,
          status: 'PENDING',
        },
      });

      this.logger.log(
        `Contact submission created: ${submission.id} from ${dto.email}`,
      );

      return {
        success: true,
        message: 'Thank you for contacting us! We will respond within 24 hours.',
        submissionId: submission.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create contact submission from ${dto.email}`,
        error.stack,
      );
      throw error;
    }
  }
}
