/**
 * SONA Bootstrap Service
 * TASK-STUB-011: Persistence and SONA Cold Start Bootstrap
 *
 * @module agents/sdk/sona-bootstrap.service
 * @description Seeds SONA (Self-Optimizing Neural Architecture) from historical
 * Prisma data (PayeePatterns, AgentAuditLogs) to avoid cold-start degradation.
 * Idempotent: checks SONA_BOOTSTRAPPED flag in feature_flags table.
 * Non-fatal: all errors are caught and logged; the app starts regardless.
 *
 * Uses @Optional() @Inject(PrismaService) for graceful degradation
 * when DatabaseModule is not available (e.g., in unit tests or isolated modules).
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { IntelligenceEngineService } from './intelligence-engine.service';
import { PersistenceConfig } from './persistence-config';
import type { IntelligenceTrajectory } from './interfaces/intelligence-engine.interface';

/**
 * System tenant ID used for system-wide feature flags and SONA learning.
 * This tenant is created via migration (see 20250202_add_system_tenant.sql).
 * Using a well-known UUID ensures consistency across environments.
 */
const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface BootstrapStats {
  /** Number of PayeePattern trajectories seeded */
  patternTrajectories: number;
  /** Number of AgentAuditLog trajectories seeded */
  auditTrajectories: number;
  /** Total trajectories seeded */
  totalSeeded: number;
  /** Whether forceLearning was called */
  forceLearningTriggered: boolean;
  /** Duration of bootstrap in milliseconds */
  durationMs: number;
  /** Whether bootstrap was skipped (already done or disabled) */
  skipped: boolean;
  /** Reason for skipping (if skipped) */
  skipReason?: string;
}

@Injectable()
export class SonaBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SonaBootstrapService.name);
  private bootstrapStats: BootstrapStats | null = null;

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma: PrismaService | undefined,
    private readonly intelligence: IntelligenceEngineService,
    private readonly persistenceConfig: PersistenceConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = this.persistenceConfig.getConfig();

    if (!config.bootstrapEnabled) {
      this.logger.log(
        'SONA bootstrap is disabled (SONA_BOOTSTRAP_ENABLED=false)',
      );
      this.bootstrapStats = {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: 0,
        skipped: true,
        skipReason: 'SONA_BOOTSTRAP_ENABLED=false',
      };
      return;
    }

    if (!this.intelligence.isAvailable()) {
      this.logger.warn(
        'SONA bootstrap skipped: IntelligenceEngine not available',
      );
      this.bootstrapStats = {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: 0,
        skipped: true,
        skipReason: 'IntelligenceEngine not available',
      };
      return;
    }

    if (!this.prisma) {
      this.logger.warn('SONA bootstrap skipped: PrismaService not available');
      this.bootstrapStats = {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: 0,
        skipped: true,
        skipReason: 'PrismaService not available',
      };
      return;
    }

    try {
      this.bootstrapStats = await this.bootstrap();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SONA bootstrap failed (non-fatal): ${msg}`);
      this.bootstrapStats = {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: 0,
        skipped: true,
        skipReason: `Error: ${msg}`,
      };
    }
  }

  /**
   * Execute the SONA bootstrap process.
   * Idempotent: checks SONA_BOOTSTRAPPED flag before seeding.
   */
  async bootstrap(): Promise<BootstrapStats> {
    const startTime = Date.now();

    if (!this.prisma) {
      return {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: 'PrismaService not available',
      };
    }

    // -- Idempotency check: feature_flags table --
    const alreadyBootstrapped = await this.checkBootstrapFlag();
    if (alreadyBootstrapped) {
      this.logger.log('SONA already bootstrapped (SONA_BOOTSTRAPPED flag set)');
      return {
        patternTrajectories: 0,
        auditTrajectories: 0,
        totalSeeded: 0,
        forceLearningTriggered: false,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: 'Already bootstrapped (SONA_BOOTSTRAPPED flag set)',
      };
    }

    this.logger.log('Starting SONA bootstrap from historical data...');

    // -- Step 1: Seed from PayeePatterns --
    const patternTrajectories = await this.seedFromPayeePatterns();
    this.logger.log(
      `Seeded ${patternTrajectories} trajectories from PayeePatterns`,
    );

    // -- Step 2: Seed from AgentAuditLogs --
    const auditTrajectories = await this.seedFromAuditLogs();
    this.logger.log(
      `Seeded ${auditTrajectories} trajectories from AgentAuditLogs`,
    );

    const totalSeeded = patternTrajectories + auditTrajectories;

    // -- Step 3: Force immediate learning --
    let forceLearningTriggered = false;
    if (totalSeeded > 0) {
      await this.triggerForceLearning();
      forceLearningTriggered = true;
      this.logger.log(
        'forceLearning() triggered -- SONA will extract patterns immediately',
      );
    }

    // -- Step 4: Set bootstrap flag (idempotent) --
    await this.setBootstrapFlag(totalSeeded);

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `SONA bootstrap complete: ${totalSeeded} trajectories seeded ` +
        `(${patternTrajectories} patterns, ${auditTrajectories} audits) ` +
        `in ${durationMs}ms`,
    );

    return {
      patternTrajectories,
      auditTrajectories,
      totalSeeded,
      forceLearningTriggered,
      durationMs,
      skipped: false,
    };
  }

  /**
   * Get bootstrap statistics.
   * Returns null if bootstrap has not been attempted.
   */
  getBootstrapStats(): BootstrapStats | null {
    return this.bootstrapStats;
  }

  // -- Seeding Methods --

  /**
   * Seed SONA from PayeePattern records.
   * Each PayeePattern becomes a trajectory:
   *   state  = { payeeName, description }
   *   action = `categorize:${accountCode}`
   *   quality = matchCount / maxMatchCount (normalized 0-1)
   */
  private async seedFromPayeePatterns(): Promise<number> {
    if (!this.prisma) return 0;

    const patterns = await this.prisma.payeePattern.findMany({
      where: { isActive: true },
      select: {
        tenantId: true,
        payeePattern: true,
        defaultAccountCode: true,
        defaultAccountName: true,
        confidenceBoost: true,
        matchCount: true,
      },
      orderBy: { matchCount: 'desc' },
      take: 10000, // Cap at 10k patterns for initial seed
    });

    if (patterns.length === 0) return 0;

    // Find max matchCount for normalization
    const maxMatchCount = Math.max(...patterns.map((p) => p.matchCount));
    let seeded = 0;

    for (const pattern of patterns) {
      try {
        const confidence = Number(pattern.confidenceBoost);
        const quality =
          maxMatchCount > 0
            ? pattern.matchCount / maxMatchCount
            : confidence / 100;

        const trajectory: IntelligenceTrajectory = {
          state: {
            payeeName: pattern.payeePattern,
            description: '',
          },
          action: `categorize:${pattern.defaultAccountCode}:${pattern.defaultAccountName}`,
          quality: Math.max(0, Math.min(1, quality)), // Clamp 0-1
          metadata: {
            source: 'bootstrap:payee-pattern',
            confidence,
            matchCount: pattern.matchCount,
            accountCode: pattern.defaultAccountCode,
          },
        };

        await this.intelligence.learn(pattern.tenantId, trajectory);
        seeded++;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to seed pattern "${pattern.payeePattern}": ${msg}`,
        );
      }
    }

    return seeded;
  }

  /**
   * Seed SONA from AgentAuditLog records.
   * Each audit entry becomes a trajectory:
   *   state  = { agentType, decision context }
   *   action = agent decision
   *   quality = confidence / 100 (normalized 0-1)
   */
  private async seedFromAuditLogs(): Promise<number> {
    if (!this.prisma) return 0;

    const logs = await this.prisma.agentAuditLog.findMany({
      where: {
        source: { in: ['HEURISTIC', 'SDK'] }, // Only seed from known-good sources
        confidence: { gte: 50 }, // Only seed from reasonable-confidence decisions
      },
      select: {
        tenantId: true,
        agentType: true,
        decision: true,
        confidence: true,
        source: true,
        durationMs: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20000, // Cap at 20k audit entries for initial seed
    });

    if (logs.length === 0) return 0;

    let seeded = 0;

    for (const log of logs) {
      try {
        const quality = (log.confidence ?? 0) / 100; // Normalize to 0-1

        // Parse decision JSON safely
        let decisionData: Record<string, unknown> = {};
        try {
          decisionData =
            typeof log.decision === 'string'
              ? (JSON.parse(log.decision) as Record<string, unknown>)
              : ((log.decision as Record<string, unknown>) ?? {});
        } catch {
          decisionData = { raw: String(log.decision) };
        }

        const trajectory: IntelligenceTrajectory = {
          state: {
            agentType: log.agentType,
            source: log.source,
            ...decisionData,
          },
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          action: `${log.agentType}:${String(decisionData['accountCode'] ?? decisionData['result'] ?? 'unknown')}`,
          quality: Math.max(0, Math.min(1, quality)), // Clamp 0-1
          metadata: {
            source: 'bootstrap:audit-log',
            originalSource: log.source,
            confidence: log.confidence,
            durationMs: log.durationMs,
            agentType: log.agentType,
            createdAt: log.createdAt.toISOString(),
          },
        };

        await this.intelligence.learn(log.tenantId, trajectory);
        seeded++;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to seed audit log (agent=${log.agentType}): ${msg}`,
        );
      }
    }

    return seeded;
  }

  // -- SONA Control --

  /**
   * Trigger SONA forceLearning() to immediately extract patterns
   * from the seeded trajectories. Without this, SONA would wait for
   * the background interval (default: 1 hour) before processing.
   */
  private async triggerForceLearning(): Promise<void> {
    // Access the underlying IntelligenceEngine to call forceLearning
    // This is a deliberate violation of the abstraction layer for bootstrap only.
    const stats = await this.intelligence.getStats();
    if (stats.sona.trajectoriesRecorded > 0) {
      // forceLearning is available through the learn() interface with a special trajectory
      await this.intelligence.learn(SYSTEM_TENANT_ID, {
        state: { __command: 'forceLearning' },
        action: 'sona:forceLearning',
        quality: 1.0,
        metadata: {
          source: 'bootstrap',
          reason:
            'Initial seed complete, triggering immediate pattern extraction',
        },
      });
    }
  }

  // -- Idempotency --

  /**
   * Check if SONA has already been bootstrapped by looking for the
   * SONA_BOOTSTRAPPED flag in the feature_flags table.
   * Uses the __system__ tenant (UUID: 00000000-0000-0000-0000-000000000000).
   */
  private async checkBootstrapFlag(): Promise<boolean> {
    if (!this.prisma) return false;

    try {
      const flag = await this.prisma.featureFlag.findUnique({
        where: {
          tenantId_flag: {
            tenantId: SYSTEM_TENANT_ID,
            flag: 'SONA_BOOTSTRAPPED',
          },
        },
      });
      return flag !== null && flag.enabled;
    } catch (error: unknown) {
      // If feature_flags table doesn't exist or query fails,
      // assume not bootstrapped
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not check bootstrap flag: ${msg}`);
      return false;
    }
  }

  /**
   * Set the SONA_BOOTSTRAPPED flag in feature_flags table.
   * Records the number of trajectories seeded for audit purposes.
   * Uses the __system__ tenant (UUID: 00000000-0000-0000-0000-000000000000).
   */
  private async setBootstrapFlag(totalSeeded: number): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.featureFlag.upsert({
        where: {
          tenantId_flag: {
            tenantId: SYSTEM_TENANT_ID,
            flag: 'SONA_BOOTSTRAPPED',
          },
        },
        create: {
          tenantId: SYSTEM_TENANT_ID,
          flag: 'SONA_BOOTSTRAPPED',
          enabled: true,
          mode: 'PRIMARY',
          metadata: {
            seededAt: new Date().toISOString(),
            totalSeeded,
            version: '1.0',
          },
        },
        update: {
          enabled: true,
          mode: 'PRIMARY',
          metadata: {
            seededAt: new Date().toISOString(),
            totalSeeded,
            version: '1.0',
            reseeded: true,
          },
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not set bootstrap flag: ${msg}`);
    }
  }
}
