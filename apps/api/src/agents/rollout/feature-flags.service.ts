/**
 * Feature Flags Service
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 *
 * @module agents/rollout/feature-flags.service
 * @description Per-tenant, per-agent feature flag management for SDK rollout.
 * Reads from DB on every call (no caching) to enable instant rollback.
 * When Prisma is unavailable, defaults to DISABLED (safe default).
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SdkMode } from './interfaces/rollout.interface';

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
  ) {}

  /**
   * Get the SDK mode for a specific tenant and flag.
   * Returns DISABLED if:
   * - No flag exists
   * - Flag exists but not enabled
   * - Mode string is unrecognized
   * - Prisma is unavailable
   */
  async getMode(tenantId: string, flag: string): Promise<SdkMode> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — defaulting to DISABLED');
      return SdkMode.DISABLED;
    }

    try {
      const record = await this.prisma.featureFlag.findUnique({
        where: { tenantId_flag: { tenantId, flag } },
      });

      if (!record || !record.enabled) {
        return SdkMode.DISABLED;
      }

      // Validate mode string
      if (record.mode === SdkMode.SHADOW) {
        return SdkMode.SHADOW;
      }
      if (record.mode === SdkMode.PRIMARY) {
        return SdkMode.PRIMARY;
      }

      // Unknown mode string — safe default
      this.logger.warn(
        `Unknown mode "${record.mode}" for flag "${flag}" (tenant ${tenantId}) — defaulting to DISABLED`,
      );
      return SdkMode.DISABLED;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`getMode failed for flag "${flag}": ${msg}`);
      return SdkMode.DISABLED;
    }
  }

  /**
   * Enable SHADOW mode for a specific tenant and flag.
   * Upserts the flag record.
   */
  async enableShadow(
    tenantId: string,
    flag: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.prisma) {
      this.logger.warn('Prisma unavailable — cannot enable shadow mode');
      return;
    }

    await this.prisma.featureFlag.upsert({
      where: { tenantId_flag: { tenantId, flag } },
      create: {
        tenantId,
        flag,
        enabled: true,
        mode: SdkMode.SHADOW,
        metadata: metadata ?? undefined,
      },
      update: {
        enabled: true,
        mode: SdkMode.SHADOW,
        metadata: metadata ?? undefined,
      },
    });
  }

  /**
   * Enable PRIMARY mode for a specific tenant and flag.
   * Upserts the flag record.
   */
  async enablePrimary(
    tenantId: string,
    flag: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.prisma) {
      this.logger.warn('Prisma unavailable — cannot enable primary mode');
      return;
    }

    await this.prisma.featureFlag.upsert({
      where: { tenantId_flag: { tenantId, flag } },
      create: {
        tenantId,
        flag,
        enabled: true,
        mode: SdkMode.PRIMARY,
        metadata: metadata ?? undefined,
      },
      update: {
        enabled: true,
        mode: SdkMode.PRIMARY,
        metadata: metadata ?? undefined,
      },
    });
  }

  /**
   * Disable a specific tenant flag.
   * Upserts the flag with enabled=false and mode=DISABLED.
   */
  async disable(tenantId: string, flag: string): Promise<void> {
    if (!this.prisma) {
      this.logger.warn('Prisma unavailable — cannot disable flag');
      return;
    }

    await this.prisma.featureFlag.upsert({
      where: { tenantId_flag: { tenantId, flag } },
      create: {
        tenantId,
        flag,
        enabled: false,
        mode: SdkMode.DISABLED,
      },
      update: {
        enabled: false,
        mode: SdkMode.DISABLED,
      },
    });
  }

  /**
   * Get all feature flags for a tenant.
   */
  async getAllFlags(tenantId: string): Promise<
    Array<{
      flag: string;
      enabled: boolean;
      mode: string;
      metadata: unknown;
    }>
  > {
    if (!this.prisma) {
      return [];
    }

    const flags = await this.prisma.featureFlag.findMany({
      where: { tenantId },
      orderBy: { flag: 'asc' },
    });

    return flags.map((f) => ({
      flag: f.flag,
      enabled: f.enabled,
      mode: f.mode,
      metadata: f.metadata,
    }));
  }

  /**
   * Check if a flag is enabled (mode !== DISABLED).
   */
  async isEnabled(tenantId: string, flag: string): Promise<boolean> {
    const mode = await this.getMode(tenantId, flag);
    return mode !== SdkMode.DISABLED;
  }
}
