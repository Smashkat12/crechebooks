import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);
  private readonly TRIAL_DAYS = 14;
  private readonly BCRYPT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    try {
      // Check if tenant with this email already exists
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { email: dto.adminEmail },
      });

      if (existingTenant) {
        throw new ConflictException(
          'A tenant with this email already exists. Please use a different email or contact support.',
        );
      }

      // Calculate trial expiry date
      const trialExpiresAt = new Date(
        Date.now() + this.TRIAL_DAYS * 24 * 60 * 60 * 1000,
      );

      // Hash password
      const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

      // Generate a temporary auth0Id (will be replaced by actual Auth0 integration)
      const tempAuth0Id = `auth0|temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create tenant and user in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: dto.crecheName,
            email: dto.adminEmail,
            phone: dto.phone,
            addressLine1: dto.addressLine1,
            city: dto.city,
            province: dto.province,
            postalCode: dto.postalCode,
            subscriptionStatus: 'TRIAL',
            trialExpiresAt, // Store trial expiry date
          },
        });

        // Create admin user
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            auth0Id: tempAuth0Id,
            email: dto.adminEmail,
            name: dto.adminName,
            role: 'ADMIN',
            isActive: true,
            currentTenantId: tenant.id,
          },
        });

        // Create UserTenantRole mapping
        await tx.userTenantRole.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: 'ADMIN',
            isActive: true,
          },
        });

        // Store hashed password temporarily in audit log
        // Note: In production, this should be handled by Auth0
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            entityType: 'USER',
            entityId: user.id,
            action: 'TRIAL_SIGNUP',
            afterValue: {
              hashedPassword, // Temporary storage - remove in production with Auth0
              trialExpiresAt: trialExpiresAt.toISOString(),
            },
            changeSummary: 'Trial account signup',
          },
        });

        return { tenant, user };
      });

      this.logger.log(
        `Trial signup completed for ${dto.crecheName} (${dto.adminEmail}). Tenant: ${result.tenant.id}, User: ${result.user.id}`,
      );

      return {
        success: true,
        message: 'Trial activated! Check your email for login instructions.',
        tenantId: result.tenant.id,
        userId: result.user.id,
        trialExpiresAt,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error(
        `Failed to process signup for ${dto.adminEmail}`,
        error.stack,
      );

      if (error.code === 'P2002') {
        // Prisma unique constraint violation
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }

      throw new BadRequestException(
        'Failed to create trial account. Please try again later.',
      );
    }
  }
}
