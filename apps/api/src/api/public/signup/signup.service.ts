import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma';
import { Auth0ManagementService } from '../../auth/services/auth0-management.service';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);
  private readonly TRIAL_DAYS = 14;
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0Management: Auth0ManagementService,
  ) {}

  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    // Resolve canonical fields from legacy aliases (JOURNEY1-005 DTO compatibility)
    const resolvedEmail = (dto.adminEmail ?? dto.email ?? '')
      .toLowerCase()
      .trim();
    const resolvedName = dto.adminName ?? dto.fullName ?? '';

    if (!resolvedEmail) {
      throw new BadRequestException('Email address is required.');
    }
    if (!resolvedName) {
      throw new BadRequestException('Admin name is required.');
    }

    let auth0UserId: string | null = null;

    try {
      // Check if tenant with this email already exists
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { email: resolvedEmail },
      });

      if (existingTenant) {
        throw new ConflictException(
          'A tenant with this email already exists. Please use a different email or contact support.',
        );
      }

      // Check if user with this email already exists
      const existingUser = await this.prisma.user.findFirst({
        where: { email: resolvedEmail },
      });

      if (existingUser) {
        throw new ConflictException(
          'A user with this email already exists. Please use a different email or contact support.',
        );
      }

      // Calculate trial expiry date
      const trialExpiresAt = new Date(
        Date.now() + this.TRIAL_DAYS * 24 * 60 * 60 * 1000,
      );

      // Hash password for local dev-login fallback
      const hashedPassword = await bcrypt.hash(
        dto.password,
        this.BCRYPT_ROUNDS,
      );

      // Create Auth0 user if Auth0 Management API is configured
      let auth0Id: string;
      if (this.auth0Management.isConfigured()) {
        this.logger.debug(`Creating Auth0 user for: ${resolvedEmail}`);

        // Check if user already exists in Auth0
        const existingAuth0User =
          await this.auth0Management.getUserByEmail(resolvedEmail);

        if (existingAuth0User) {
          // User exists in Auth0 but not in our database - use their existing auth0Id
          auth0Id = existingAuth0User.user_id;
          this.logger.log(
            `Found existing Auth0 user: ${auth0Id} for ${resolvedEmail}`,
          );
        } else {
          // Create new Auth0 user
          const auth0User = await this.auth0Management.createUser({
            email: resolvedEmail,
            password: dto.password,
            name: resolvedName,
          });
          auth0Id = auth0User.user_id;
          auth0UserId = auth0Id; // Track for cleanup on failure
          this.logger.log(
            `Created Auth0 user: ${auth0Id} for ${resolvedEmail}`,
          );
        }
      } else {
        // Auth0 not configured - use temporary ID (for development only)
        auth0Id = `auth0|temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        this.logger.warn(
          `Auth0 Management API not configured. Using temporary auth0Id for ${resolvedEmail}. ` +
            'Configure AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET for production.',
        );
      }

      // Log optional metadata from form (not persisted to DB columns)
      const marketingConsent =
        dto.marketingOptIn ?? dto.marketingConsent ?? false;
      if (dto.numberOfChildren) {
        this.logger.debug(
          `Signup metadata: numberOfChildren=${dto.numberOfChildren}, marketingConsent=${marketingConsent}`,
        );
      }

      // Create tenant and user in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: dto.crecheName,
            email: resolvedEmail,
            phone: dto.phone,
            addressLine1: dto.addressLine1 ?? '',
            city: dto.city ?? '',
            province: dto.province ?? '',
            postalCode: dto.postalCode ?? '',
            subscriptionStatus: 'TRIAL',
            trialExpiresAt,
          },
        });

        // Create admin user with real Auth0 ID
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            auth0Id: auth0Id,
            email: resolvedEmail,
            name: resolvedName,
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

        // Store hashed password in audit log as fallback for dev-login
        // This allows local development without Auth0
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            entityType: 'USER',
            entityId: user.id,
            action: 'TRIAL_SIGNUP',
            afterValue: {
              hashedPassword,
              trialExpiresAt: trialExpiresAt.toISOString(),
              auth0Id: auth0Id,
              auth0Configured: this.auth0Management.isConfigured(),
            },
            changeSummary: 'Trial account signup',
          },
        });

        // TASK-ACCT-014: Create onboarding progress record
        // Only mark addressSet=true if the signup form actually provided an address
        const addressProvided = !!(dto.addressLine1 && dto.city);
        await tx.onboardingProgress.create({
          data: {
            tenantId: tenant.id,
            addressSet: addressProvided,
            lastActiveStep: addressProvided ? 'bankDetails' : 'address',
          },
        });

        return { tenant, user };
      });

      this.logger.log(
        `Trial signup completed for ${dto.crecheName} (${resolvedEmail}). ` +
          `Tenant: ${result.tenant.id}, User: ${result.user.id}, Auth0: ${auth0Id}`,
      );

      return {
        success: true,
        message: 'Trial activated! Check your email for login instructions.',
        tenantId: result.tenant.id,
        userId: result.user.id,
        trialExpiresAt,
      };
    } catch (error) {
      // If we created an Auth0 user but database creation failed, clean up Auth0
      if (auth0UserId) {
        this.logger.warn(
          `Database transaction failed, cleaning up Auth0 user: ${auth0UserId}`,
        );
        try {
          await this.auth0Management.deleteUser(auth0UserId);
          this.logger.log(`Cleaned up Auth0 user: ${auth0UserId}`);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up Auth0 user ${auth0UserId}: ${cleanupError}`,
          );
        }
      }

      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error(
        `Failed to process signup for ${resolvedEmail}. Error code: ${error.code}, Message: ${error.message}`,
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
