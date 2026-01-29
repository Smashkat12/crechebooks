/**
 * API Key Service
 *
 * TASK-CLI-001: Secure API key management for CLI/MCP production access
 *
 * Security features:
 * - Keys generated with crypto.randomBytes (256-bit entropy)
 * - Only hash stored in database (bcrypt with cost factor 12)
 * - Full key returned only once on creation
 * - Key prefix stored for display/identification
 * - Scopes limit what operations a key can perform
 * - Last used tracking for security audits
 * - Soft revocation preserves audit trail
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { ApiKey, ApiKeyScope } from '@prisma/client';
import { IUser } from '../../../database/entities/user.entity';

// Key format: cb_<environment>_<32 random chars>
// Example: cb_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
const KEY_PREFIX = 'cb_';
const KEY_LENGTH = 32; // 256 bits of entropy
const BCRYPT_ROUNDS = 12;

export interface CreateApiKeyDto {
  name: string;
  scopes: ApiKeyScope[];
  description?: string;
  environment?: string;
  expiresAt?: Date;
}

export interface ApiKeyWithSecret extends ApiKey {
  /** Full API key - only returned on creation, never stored */
  secretKey: string;
}

export interface ValidatedApiKey {
  apiKey: ApiKey;
  user: IUser;
  tenantId: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a new API key
   * @returns The created key with the secret (only time it's available)
   */
  async createApiKey(
    userId: string,
    tenantId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyWithSecret> {
    this.logger.log(
      `Creating API key "${dto.name}" for user ${userId} in tenant ${tenantId}`,
    );

    // Generate secure random key
    const randomPart = crypto
      .randomBytes(KEY_LENGTH)
      .toString('base64url')
      .slice(0, KEY_LENGTH);
    const environment = dto.environment || 'production';
    const envPrefix =
      environment === 'production' ? 'prod' : environment.slice(0, 4);
    const fullKey = `${KEY_PREFIX}${envPrefix}_${randomPart}`;

    // Extract prefix for display (first 12 chars)
    const keyPrefix = fullKey.slice(0, 12);

    // Hash the key for storage
    const keyHash = await bcrypt.hash(fullKey, BCRYPT_ROUNDS);

    // Ensure scopes are valid - default to FULL_ACCESS if empty
    const scopes =
      dto.scopes.length > 0 ? dto.scopes : [ApiKeyScope.FULL_ACCESS];

    // Create the key record
    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        keyPrefix,
        keyHash,
        tenantId,
        userId,
        scopes,
        description: dto.description,
        environment,
        expiresAt: dto.expiresAt,
      },
    });

    this.logger.log(`API key created: ${apiKey.id} (prefix: ${keyPrefix}...)`);

    return {
      ...apiKey,
      secretKey: fullKey,
    };
  }

  /**
   * Validate an API key and return user context
   * Called by ApiKeyAuthGuard on each request
   */
  async validateApiKey(
    key: string,
    clientIp?: string,
  ): Promise<ValidatedApiKey | null> {
    // Key must start with cb_ prefix
    if (!key.startsWith(KEY_PREFIX)) {
      this.logger.debug('Invalid key format - missing prefix');
      return null;
    }

    // Extract prefix for lookup (optimization: narrow down candidates)
    const keyPrefix = key.slice(0, 12);

    // Find candidate keys by prefix (there should typically be only one)
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        keyPrefix,
        revokedAt: null, // Not revoked
        OR: [
          { expiresAt: null }, // No expiry
          { expiresAt: { gt: new Date() } }, // Not expired
        ],
      },
      include: {
        createdBy: {
          include: {
            tenant: true,
          },
        },
        tenant: true,
      },
    });

    if (candidates.length === 0) {
      this.logger.debug(`No active API key found for prefix: ${keyPrefix}...`);
      return null;
    }

    // Verify hash against each candidate (usually just one)
    for (const apiKey of candidates) {
      const isValid = await bcrypt.compare(key, apiKey.keyHash);
      if (isValid) {
        // Update last used timestamp (fire and forget)
        this.updateLastUsed(apiKey.id, clientIp).catch((err) => {
          this.logger.warn(`Failed to update lastUsedAt: ${err.message}`);
        });

        // Build user context from the key's creator
        const user = apiKey.createdBy;
        const userContext: IUser = {
          id: user.id,
          auth0Id: user.auth0Id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: apiKey.tenantId,
          isActive: user.isActive,
          currentTenantId: apiKey.tenantId,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };

        this.logger.debug(
          `API key validated: ${apiKey.id} for user ${user.email}`,
        );

        return {
          apiKey,
          user: userContext,
          tenantId: apiKey.tenantId,
        };
      }
    }

    this.logger.debug('API key validation failed - hash mismatch');
    return null;
  }

  /**
   * Check if an API key has the required scope
   */
  hasScope(apiKey: ApiKey, requiredScope: ApiKeyScope): boolean {
    // FULL_ACCESS grants all permissions
    if (apiKey.scopes.includes(ApiKeyScope.FULL_ACCESS)) {
      return true;
    }
    return apiKey.scopes.includes(requiredScope);
  }

  /**
   * List API keys for a tenant (without hashes)
   */
  async listApiKeys(
    tenantId: string,
    includeRevoked = false,
  ): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: {
        tenantId,
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single API key by ID
   */
  async getApiKey(id: string, tenantId: string): Promise<ApiKey> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  /**
   * Revoke an API key (soft delete)
   */
  async revokeApiKey(
    id: string,
    tenantId: string,
    revokedByUserId: string,
  ): Promise<ApiKey> {
    const apiKey = await this.getApiKey(id, tenantId);

    if (apiKey.revokedAt) {
      throw new ConflictException('API key is already revoked');
    }

    this.logger.log(`Revoking API key ${id} by user ${revokedByUserId}`);

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedBy: revokedByUserId,
      },
    });
  }

  /**
   * Rotate an API key - revoke old one and create new one with same settings
   */
  async rotateApiKey(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<ApiKeyWithSecret> {
    const oldKey = await this.getApiKey(id, tenantId);

    if (oldKey.revokedAt) {
      throw new ForbiddenException('Cannot rotate a revoked API key');
    }

    // Create new key with same settings
    const newKey = await this.createApiKey(userId, tenantId, {
      name: `${oldKey.name} (rotated)`,
      scopes: oldKey.scopes,
      description: oldKey.description || undefined,
      environment: oldKey.environment,
      expiresAt: oldKey.expiresAt || undefined,
    });

    // Revoke the old key
    await this.revokeApiKey(id, tenantId, userId);

    this.logger.log(`Rotated API key ${id} -> ${newKey.id}`);

    return newKey;
  }

  /**
   * Update last used timestamp and IP
   */
  private async updateLastUsed(id: string, clientIp?: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: clientIp,
      },
    });
  }

  /**
   * Clean up expired keys (called by scheduled job)
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.prisma.apiKey.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedBy: 'SYSTEM_EXPIRY',
      },
    });

    if (result.count > 0) {
      this.logger.log(`Revoked ${result.count} expired API keys`);
    }

    return result.count;
  }
}
