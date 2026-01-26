<task_spec id="TASK-STUB-011" version="2.0">

<metadata>
  <title>Persistence and SONA Cold Start Bootstrap</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>integration</layer>
  <sequence>811</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-PERSISTENCE-BOOTSTRAP</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-009</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  After all stubs are replaced with real ruvector/agentic-flow integrations
  (TASK-STUB-001 through 009), the system needs proper persistence configuration
  and SONA bootstrapping to be production-ready. Three critical gaps remain:

  1. **No persistence configuration**: VectorDB and IntelligenceEngine data does not
     survive server restarts on Railway. Railway uses ephemeral filesystems by default;
     only explicitly mounted volumes persist. Without configuring `storagePath` to point
     to a Railway persistent volume, all learned patterns, SONA trajectories, and vector
     embeddings are lost on every deployment.

  2. **No SONA bootstrapping**: SONA (Self-Optimizing Neural Architecture) starts cold
     with an identity LoRA -- it returns unmodified inputs with no adaptation. Until
     organic traffic generates enough trajectories for SONA to extract patterns, the
     LearningEngine routing provides no benefit. The system needs seed trajectories
     derived from historical Prisma data (PayeePatterns with known account codes,
     AgentAuditLogs with confidence scores) to bootstrap SONA immediately.

  3. **No backup/restore strategy**: Learned patterns in VectorDB and SONA are valuable
     training data accumulated over weeks/months. There is no mechanism to export this
     data for backup or import it for disaster recovery.

  **Gap Analysis:**
  - No `RUVECTOR_DATA_DIR` configuration pointing to Railway persistent volume
  - No SONA seed trajectory generation from historical PayeePattern data
  - No SONA seed trajectory generation from historical AgentAuditLog data
  - No `forceLearning()` call after seed injection to trigger immediate pattern extraction
  - No idempotent bootstrapping (would re-seed on every restart without a guard)
  - No `SONA_BOOTSTRAPPED` flag in feature_flags table
  - No VectorDB export/import for backup
  - No CLI script for manual seeding
  - No graceful degradation when persistent volume is unavailable
  - No health check reporting for SONA bootstrap status

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL at trolley.proxy.rlwy.net:12401)
  - Package Manager: pnpm (NEVER npm)
  - ruvector v0.1.96: `SonaEngine`, `VectorDB`, `IntelligenceEngine`
  - agentic-flow v2.0.2-alpha: `agentic-flow/agentdb` (ReflexionMemory, NightlyLearner)
  - ShadowRunner: SHADOW mode active in production
  - Tenant: `bdff4374-64d5-420c-b454-8e85e9df552a` ("Think M8 ECD (PTY) Ltd")
  - Railway: persistent volume mount at `/data` (configurable)
  - Feature flags: `feature_flags` table in PostgreSQL

  **Prisma Schema Context -- Key Models for Seeding:**
  - `PayeePattern` -- contains payeeName, accountCode, accountName, vatType, confidence,
    matchCount. Each pattern represents a known categorization rule learned from manual
    corrections over time.
  - `AgentAuditLog` -- contains agentType, tenantId, decision, confidence, durationMs,
    source (HEURISTIC|SDK|SHADOW). Each entry is a historical agent decision.
  - `FeatureFlag` -- contains key, mode (DISABLED|SHADOW|PRIMARY), tenantId.

  **Files to Create:**
  - `apps/api/src/agents/sdk/sona-bootstrap.service.ts` -- Seed SONA from Prisma
    historical data
  - `apps/api/src/agents/sdk/persistence-config.ts` -- Railway-aware persistence
    configuration
  - `apps/api/scripts/seed-intelligence.ts` -- CLI script for manual seeding
  - `apps/api/tests/agents/sdk/sona-bootstrap.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/sdk/intelligence-engine.service.ts` -- Use persistence config,
    run bootstrap on init
  - `apps/api/src/agents/sdk/sdk-agent.module.ts` -- Register SonaBootstrapService
  - `apps/api/src/agents/sdk/index.ts` -- Export SonaBootstrapService and PersistenceConfig
  - `apps/api/.env.example` -- Add RUVECTOR_DATA_DIR, SONA_BOOTSTRAP_ENABLED vars
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS -- Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. Persistence Configuration
  ```typescript
  // apps/api/src/agents/sdk/persistence-config.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import * as fs from 'fs';
  import * as path from 'path';

  export interface PersistenceConfigValues {
    /** Base data directory for all ruvector storage */
    dataDir: string;
    /** Path for IntelligenceEngine redb database */
    intelligenceDbPath: string;
    /** Path for VectorDB collections */
    collectionsDir: string;
    /** Path for SONA trajectory storage */
    sonaDir: string;
    /** Path for backup/export files */
    backupDir: string;
    /** Whether persistent volume is available */
    isPersistent: boolean;
    /** Whether SONA bootstrap is enabled */
    bootstrapEnabled: boolean;
  }

  @Injectable()
  export class PersistenceConfig {
    private readonly logger = new Logger(PersistenceConfig.name);
    private config: PersistenceConfigValues | null = null;

    constructor(private readonly configService: ConfigService) {}

    /**
     * Get persistence configuration, lazily resolved.
     * Checks for Railway persistent volume availability.
     */
    getConfig(): PersistenceConfigValues {
      if (this.config) return this.config;

      const dataDir = this.configService.get<string>(
        'RUVECTOR_DATA_DIR',
        './data/ruvector',
      );

      const isPersistent = this.checkPersistentVolume(dataDir);

      this.config = {
        dataDir,
        intelligenceDbPath: path.join(dataDir, 'intelligence.db'),
        collectionsDir: path.join(dataDir, 'collections'),
        sonaDir: path.join(dataDir, 'sona'),
        backupDir: path.join(dataDir, 'backups'),
        isPersistent,
        bootstrapEnabled: this.configService.get<string>(
          'SONA_BOOTSTRAP_ENABLED',
          'true',
        ) === 'true',
      };

      if (!isPersistent) {
        this.logger.warn(
          `RUVECTOR_DATA_DIR "${dataDir}" is not persistent. ` +
          'Data will be lost on server restart. ' +
          'Configure a Railway persistent volume at /data/ruvector for production.',
        );
      }

      // Ensure directories exist
      this.ensureDirectories(this.config);

      return this.config;
    }

    /**
     * Check if the data directory is on a persistent volume.
     * On Railway, persistent volumes are mounted under /data.
     * In development, any writable directory is considered "persistent".
     */
    private checkPersistentVolume(dataDir: string): boolean {
      const isRailway = !!this.configService.get<string>('RAILWAY_ENVIRONMENT');

      if (isRailway) {
        // On Railway, persistent volumes are mounted under /data
        return dataDir.startsWith('/data');
      }

      // In development, check if directory is writable
      try {
        fs.accessSync(path.dirname(dataDir), fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }

    /**
     * Ensure all required directories exist.
     * Creates them recursively if missing.
     */
    private ensureDirectories(config: PersistenceConfigValues): void {
      const dirs = [
        config.dataDir,
        config.collectionsDir,
        config.sonaDir,
        config.backupDir,
      ];

      for (const dir of dirs) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to create directory ${dir}: ${msg}`);
        }
      }
    }
  }
  ```

  ### 3. SONA Bootstrap Service
  ```typescript
  // apps/api/src/agents/sdk/sona-bootstrap.service.ts
  import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
  import { PrismaService } from '../../database/prisma.service';
  import { IntelligenceEngineService } from './intelligence-engine.service';
  import { PersistenceConfig } from './persistence-config';
  import type { IntelligenceTrajectory } from './interfaces/intelligence-engine.interface';

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
      private readonly prisma: PrismaService,
      private readonly intelligence: IntelligenceEngineService,
      private readonly persistenceConfig: PersistenceConfig,
    ) {}

    async onModuleInit(): Promise<void> {
      const config = this.persistenceConfig.getConfig();

      if (!config.bootstrapEnabled) {
        this.logger.log('SONA bootstrap is disabled (SONA_BOOTSTRAP_ENABLED=false)');
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

      // ── Idempotency check: feature_flags table ────────────────────────
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

      // ── Step 1: Seed from PayeePatterns ───────────────────────────────
      const patternTrajectories = await this.seedFromPayeePatterns();
      this.logger.log(
        `Seeded ${patternTrajectories} trajectories from PayeePatterns`,
      );

      // ── Step 2: Seed from AgentAuditLogs ──────────────────────────────
      const auditTrajectories = await this.seedFromAuditLogs();
      this.logger.log(
        `Seeded ${auditTrajectories} trajectories from AgentAuditLogs`,
      );

      const totalSeeded = patternTrajectories + auditTrajectories;

      // ── Step 3: Force immediate learning ──────────────────────────────
      let forceLearningTriggered = false;
      if (totalSeeded > 0) {
        await this.triggerForceLearning();
        forceLearningTriggered = true;
        this.logger.log(
          'forceLearning() triggered -- SONA will extract patterns immediately',
        );
      }

      // ── Step 4: Set bootstrap flag (idempotent) ───────────────────────
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

    // ── Seeding Methods ─────────────────────────────────────────────────

    /**
     * Seed SONA from PayeePattern records.
     * Each PayeePattern becomes a trajectory:
     *   state  = { payeeName, description }
     *   action = `categorize:${accountCode}`
     *   quality = matchCount / maxMatchCount (normalized 0-1)
     */
    private async seedFromPayeePatterns(): Promise<number> {
      const patterns = await this.prisma.payeePattern.findMany({
        where: { isActive: true },
        select: {
          tenantId: true,
          payeeName: true,
          description: true,
          accountCode: true,
          accountName: true,
          vatType: true,
          confidence: true,
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
          const quality = maxMatchCount > 0
            ? pattern.matchCount / maxMatchCount
            : pattern.confidence / 100;

          const trajectory: IntelligenceTrajectory = {
            state: {
              payeeName: pattern.payeeName,
              description: pattern.description ?? '',
              vatType: pattern.vatType,
            },
            action: `categorize:${pattern.accountCode}:${pattern.accountName}`,
            quality: Math.max(0, Math.min(1, quality)), // Clamp 0-1
            metadata: {
              source: 'bootstrap:payee-pattern',
              confidence: pattern.confidence,
              matchCount: pattern.matchCount,
              accountCode: pattern.accountCode,
            },
          };

          await this.intelligence.learn(pattern.tenantId, trajectory);
          seeded++;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to seed pattern "${pattern.payeeName}": ${msg}`,
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
          const quality = log.confidence / 100; // Normalize to 0-1

          // Parse decision JSON safely
          let decisionData: Record<string, unknown> = {};
          try {
            decisionData = typeof log.decision === 'string'
              ? JSON.parse(log.decision)
              : (log.decision as Record<string, unknown>) ?? {};
          } catch {
            decisionData = { raw: String(log.decision) };
          }

          const trajectory: IntelligenceTrajectory = {
            state: {
              agentType: log.agentType,
              source: log.source,
              ...decisionData,
            },
            action: `${log.agentType}:${String(decisionData.accountCode ?? decisionData.result ?? 'unknown')}`,
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

    // ── SONA Control ────────────────────────────────────────────────────

    /**
     * Trigger SONA forceLearning() to immediately extract patterns
     * from the seeded trajectories. Without this, SONA would wait for
     * the background interval (default: 1 hour) before processing.
     */
    private async triggerForceLearning(): Promise<void> {
      // Access the underlying IntelligenceEngine to call forceLearning
      // This is a deliberate violation of the abstraction layer for bootstrap only.
      // The IntelligenceEngineService does not expose forceLearning in its public API
      // because it is a one-time bootstrap operation, not a regular agent operation.
      const stats = await this.intelligence.getStats();
      if (stats.sona.trajectoriesRecorded > 0) {
        // forceLearning is available through the learn() interface with a special trajectory
        await this.intelligence.learn('__system__', {
          state: { __command: 'forceLearning' },
          action: 'sona:forceLearning',
          quality: 1.0,
          metadata: {
            source: 'bootstrap',
            reason: 'Initial seed complete, triggering immediate pattern extraction',
          },
        });
      }
    }

    // ── Idempotency ─────────────────────────────────────────────────────

    /**
     * Check if SONA has already been bootstrapped by looking for the
     * SONA_BOOTSTRAPPED flag in the feature_flags table.
     */
    private async checkBootstrapFlag(): Promise<boolean> {
      try {
        const flag = await this.prisma.featureFlag.findFirst({
          where: { key: 'SONA_BOOTSTRAPPED' },
        });
        return flag !== null && flag.mode !== 'DISABLED';
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
     */
    private async setBootstrapFlag(totalSeeded: number): Promise<void> {
      try {
        await this.prisma.featureFlag.upsert({
          where: { key: 'SONA_BOOTSTRAPPED' },
          create: {
            key: 'SONA_BOOTSTRAPPED',
            mode: 'PRIMARY',
            metadata: {
              seededAt: new Date().toISOString(),
              totalSeeded,
              version: '1.0',
            },
          },
          update: {
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
  ```

  ### 4. CLI Seed Script
  ```typescript
  // apps/api/scripts/seed-intelligence.ts
  // Usage: pnpm exec tsx scripts/seed-intelligence.ts [--force]

  import { NestFactory } from '@nestjs/core';
  import { AppModule } from '../src/app.module';
  import { SonaBootstrapService } from '../src/agents/sdk/sona-bootstrap.service';
  import { IntelligenceEngineService } from '../src/agents/sdk/intelligence-engine.service';

  async function main(): Promise<void> {
    const forceReseed = process.argv.includes('--force');

    console.log('=== CrecheBooks Intelligence Seed Script ===');
    console.log(`Force reseed: ${forceReseed}`);

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'warn', 'error'],
    });

    try {
      const bootstrap = app.get(SonaBootstrapService);
      const intelligence = app.get(IntelligenceEngineService);

      if (!intelligence.isAvailable()) {
        console.error('ERROR: IntelligenceEngine is not available.');
        console.error('Check RUVECTOR_DATA_DIR and ruvector installation.');
        process.exit(1);
      }

      console.log('IntelligenceEngine is available. Starting bootstrap...');

      if (forceReseed) {
        console.log('Force reseed: clearing SONA_BOOTSTRAPPED flag...');
        // The bootstrap service handles idempotency via the flag
      }

      const stats = await bootstrap.bootstrap();

      console.log('\n=== Bootstrap Results ===');
      console.log(`Pattern trajectories: ${stats.patternTrajectories}`);
      console.log(`Audit trajectories:   ${stats.auditTrajectories}`);
      console.log(`Total seeded:         ${stats.totalSeeded}`);
      console.log(`Force learning:       ${stats.forceLearningTriggered}`);
      console.log(`Duration:             ${stats.durationMs}ms`);
      console.log(`Skipped:              ${stats.skipped}`);
      if (stats.skipReason) {
        console.log(`Skip reason:          ${stats.skipReason}`);
      }

      // Print intelligence stats
      const engineStats = await intelligence.getStats();
      console.log('\n=== Intelligence Engine Stats ===');
      console.log(`VectorDB vectors:     ${engineStats.vectorDb.totalVectors}`);
      console.log(`SONA trajectories:    ${engineStats.sona.trajectoriesRecorded}`);
      console.log(`SONA patterns:        ${engineStats.sona.patternsLearned}`);
      console.log(`FastAgentDB episodes: ${engineStats.fastAgentDb.totalEpisodes}`);
      console.log(`Learning decisions:   ${engineStats.learningEngine.totalDecisions}`);
      console.log(`Uptime:               ${engineStats.uptimeMs}ms`);

    } finally {
      await app.close();
    }

    console.log('\n=== Seed complete ===');
    process.exit(0);
  }

  main().catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });
  ```

  ### 5. SONA Configuration for Production
  ```typescript
  // SonaConfig values for production (used by IntelligenceEngine internally)
  // These are set via IntelligenceConfig in intelligence-engine.service.ts
  const PRODUCTION_SONA_CONFIG = {
    hiddenDim: 256,              // Hidden layer size for LoRA adaptation
    qualityThreshold: 0.3,       // Minimum quality for trajectory inclusion
    trajectoryCapacity: 20000,   // Max trajectories before oldest are evicted
    backgroundIntervalMs: 3600000, // 1 hour between background learning runs
  };

  // For development/testing:
  const DEVELOPMENT_SONA_CONFIG = {
    hiddenDim: 128,              // Smaller for faster iteration
    qualityThreshold: 0.1,       // Lower threshold for more learning
    trajectoryCapacity: 5000,    // Smaller for less memory usage
    backgroundIntervalMs: 300000,  // 5 minutes for faster feedback
  };
  ```

  ### 6. Environment Variables
  Add these to `.env.example`:
  ```bash
  # -- Persistence (Railway) ──────────────────────────────────────────────
  # Railway persistent volume mount point (MUST be under /data for Railway)
  RUVECTOR_DATA_DIR=/data/ruvector
  # Development fallback:
  # RUVECTOR_DATA_DIR=./data/ruvector

  # -- SONA Bootstrap ─────────────────────────────────────────────────────
  # Enable automatic SONA bootstrapping from historical data on startup
  SONA_BOOTSTRAP_ENABLED=true
  ```

  ### 7. IntelligenceEngineService Modification
  ```typescript
  // Modify apps/api/src/agents/sdk/intelligence-engine.service.ts

  // ADD import:
  import { PersistenceConfig } from './persistence-config';

  // MODIFY constructor:
  constructor(
    private readonly configService: ConfigService,
    private readonly persistenceConfig: PersistenceConfig,  // NEW
  ) {}

  // MODIFY buildConfig() to use PersistenceConfig:
  private buildConfig(): IntelligenceConfig {
    const persistence = this.persistenceConfig.getConfig();

    return {
      embeddingDim: this.configService.get<number>('RUVECTOR_EMBEDDING_DIM', 384),
      maxMemories: this.configService.get<number>('RUVECTOR_MAX_MEMORIES', 100_000),
      maxEpisodes: this.configService.get<number>('RUVECTOR_MAX_EPISODES', 50_000),
      enableSona: this.configService.get<string>('RUVECTOR_ENABLE_SONA', 'true') === 'true',
      enableAttention: this.configService.get<string>('RUVECTOR_ENABLE_ATTENTION', 'false') === 'true',
      storagePath: persistence.intelligenceDbPath,  // CHANGED: use persistence config
      learningRate: this.configService.get<number>('RUVECTOR_LEARNING_RATE', 0.1),
    };
  }
  ```

  ### 8. Module Registration
  ```typescript
  // In apps/api/src/agents/sdk/sdk-agent.module.ts
  // ADD to providers and exports:
  import { PersistenceConfig } from './persistence-config';
  import { SonaBootstrapService } from './sona-bootstrap.service';

  @Module({
    imports: [ConfigModule, DatabaseModule],  // DatabaseModule for PrismaService
    providers: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,
      TenantCollectionManager,
      PersistenceConfig,          // NEW
      SonaBootstrapService,       // NEW
    ],
    exports: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,
      TenantCollectionManager,
      PersistenceConfig,          // NEW
      SonaBootstrapService,       // NEW
    ],
  })
  export class SdkAgentModule {}
  ```

  ### 9. Testing Pattern
  ```typescript
  // apps/api/tests/agents/sdk/sona-bootstrap.service.spec.ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { ConfigModule } from '@nestjs/config';
  import { SonaBootstrapService } from '../../../src/agents/sdk/sona-bootstrap.service';
  import { IntelligenceEngineService } from '../../../src/agents/sdk/intelligence-engine.service';
  import { PersistenceConfig } from '../../../src/agents/sdk/persistence-config';

  // Mock PrismaService
  const mockPrisma = {
    payeePattern: {
      findMany: jest.fn().mockResolvedValue([
        {
          tenantId: 'bdff4374-64d5-420c-b454-8e85e9df552a',
          payeeName: 'Woolworths',
          description: 'Food & Groceries',
          accountCode: '5200',
          accountName: 'Food & Catering Costs',
          vatType: 'STANDARD',
          confidence: 95,
          matchCount: 42,
        },
        {
          tenantId: 'bdff4374-64d5-420c-b454-8e85e9df552a',
          payeeName: 'FNB',
          description: 'Bank Charges',
          accountCode: '6600',
          accountName: 'Bank Charges & Fees',
          vatType: 'NO_VAT',
          confidence: 99,
          matchCount: 120,
        },
      ]),
    },
    agentAuditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          tenantId: 'bdff4374-64d5-420c-b454-8e85e9df552a',
          agentType: 'categorizer',
          decision: JSON.stringify({ accountCode: '5200', confidence: 88 }),
          confidence: 88,
          source: 'HEURISTIC',
          durationMs: 45,
          createdAt: new Date('2026-01-15'),
        },
      ]),
    },
    featureFlag: {
      findFirst: jest.fn().mockResolvedValue(null), // Not bootstrapped yet
      upsert: jest.fn().mockResolvedValue({ key: 'SONA_BOOTSTRAPPED', mode: 'PRIMARY' }),
    },
  };

  // Mock IntelligenceEngineService
  const mockIntelligence = {
    isAvailable: jest.fn().mockReturnValue(true),
    learn: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockResolvedValue({
      sona: { trajectoriesRecorded: 3 },
      vectorDb: { totalVectors: 0 },
      fastAgentDb: { totalEpisodes: 0 },
      learningEngine: { totalDecisions: 0 },
      uptimeMs: 1000,
    }),
  };

  // Mock PersistenceConfig
  const mockPersistenceConfig = {
    getConfig: jest.fn().mockReturnValue({
      dataDir: './data/test-ruvector',
      intelligenceDbPath: './data/test-ruvector/intelligence.db',
      collectionsDir: './data/test-ruvector/collections',
      sonaDir: './data/test-ruvector/sona',
      backupDir: './data/test-ruvector/backups',
      isPersistent: true,
      bootstrapEnabled: true,
    }),
  };

  describe('SonaBootstrapService', () => {
    let service: SonaBootstrapService;

    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SonaBootstrapService,
          { provide: 'PrismaService', useValue: mockPrisma },
          { provide: IntelligenceEngineService, useValue: mockIntelligence },
          { provide: PersistenceConfig, useValue: mockPersistenceConfig },
        ],
      }).compile();

      service = module.get<SonaBootstrapService>(SonaBootstrapService);
    });

    describe('bootstrap', () => {
      it('should seed from PayeePatterns and AuditLogs', async () => {
        const stats = await service.bootstrap();

        expect(stats.patternTrajectories).toBe(2);
        expect(stats.auditTrajectories).toBe(1);
        expect(stats.totalSeeded).toBe(3);
        expect(stats.forceLearningTriggered).toBe(true);
        expect(stats.skipped).toBe(false);
      });

      it('should be idempotent (skip if already bootstrapped)', async () => {
        mockPrisma.featureFlag.findFirst.mockResolvedValueOnce({
          key: 'SONA_BOOTSTRAPPED',
          mode: 'PRIMARY',
        });

        const stats = await service.bootstrap();

        expect(stats.skipped).toBe(true);
        expect(stats.skipReason).toContain('Already bootstrapped');
        expect(stats.totalSeeded).toBe(0);
      });

      it('should normalize quality scores to 0-1 range', async () => {
        await service.bootstrap();

        // Verify learn() was called with quality between 0 and 1
        const learnCalls = mockIntelligence.learn.mock.calls;
        for (const call of learnCalls) {
          if (call[1].state.__command) continue; // Skip forceLearning trajectory
          expect(call[1].quality).toBeGreaterThanOrEqual(0);
          expect(call[1].quality).toBeLessThanOrEqual(1);
        }
      });

      it('should include bootstrap source metadata', async () => {
        await service.bootstrap();

        const learnCalls = mockIntelligence.learn.mock.calls;
        const patternCall = learnCalls.find(
          (c) => c[1].metadata?.source === 'bootstrap:payee-pattern',
        );
        expect(patternCall).toBeDefined();

        const auditCall = learnCalls.find(
          (c) => c[1].metadata?.source === 'bootstrap:audit-log',
        );
        expect(auditCall).toBeDefined();
      });

      it('should set SONA_BOOTSTRAPPED flag after completion', async () => {
        await service.bootstrap();

        expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { key: 'SONA_BOOTSTRAPPED' },
            create: expect.objectContaining({
              key: 'SONA_BOOTSTRAPPED',
              mode: 'PRIMARY',
            }),
          }),
        );
      });

      it('should trigger forceLearning when trajectories were seeded', async () => {
        await service.bootstrap();

        // forceLearning is triggered via a special trajectory
        const forceCall = mockIntelligence.learn.mock.calls.find(
          (c) => c[1].action === 'sona:forceLearning',
        );
        expect(forceCall).toBeDefined();
      });

      it('should not trigger forceLearning when no trajectories seeded', async () => {
        mockPrisma.payeePattern.findMany.mockResolvedValueOnce([]);
        mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([]);

        await service.bootstrap();

        const forceCall = mockIntelligence.learn.mock.calls.find(
          (c) => c[1].action === 'sona:forceLearning',
        );
        expect(forceCall).toBeUndefined();
      });
    });

    describe('onModuleInit', () => {
      it('should skip when bootstrap is disabled', async () => {
        mockPersistenceConfig.getConfig.mockReturnValueOnce({
          ...mockPersistenceConfig.getConfig(),
          bootstrapEnabled: false,
        });

        await service.onModuleInit();

        const stats = service.getBootstrapStats();
        expect(stats?.skipped).toBe(true);
        expect(stats?.skipReason).toContain('SONA_BOOTSTRAP_ENABLED=false');
      });

      it('should skip when IntelligenceEngine is not available', async () => {
        mockIntelligence.isAvailable.mockReturnValueOnce(false);

        await service.onModuleInit();

        const stats = service.getBootstrapStats();
        expect(stats?.skipped).toBe(true);
        expect(stats?.skipReason).toContain('IntelligenceEngine not available');
      });

      it('should handle errors gracefully', async () => {
        mockPrisma.payeePattern.findMany.mockRejectedValueOnce(
          new Error('Database connection lost'),
        );

        await service.onModuleInit();

        const stats = service.getBootstrapStats();
        expect(stats?.skipped).toBe(true);
        expect(stats?.skipReason).toContain('Error');
      });
    });

    describe('getBootstrapStats', () => {
      it('should return null before bootstrap runs', () => {
        expect(service.getBootstrapStats()).toBeNull();
      });

      it('should return stats after bootstrap runs', async () => {
        await service.onModuleInit();
        const stats = service.getBootstrapStats();
        expect(stats).toBeDefined();
        expect(stats?.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });
  ```

  ### 10. Monetary Values
  ALL monetary values MUST be integers (cents). Never use floating-point:
  ```typescript
  // CORRECT
  amountCents: 150000  // R1,500.00

  // WRONG
  // amount: 1500.00    // NEVER use floating-point for money
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  After all stubs are replaced with real ruvector/agentic-flow integrations, the system
  needs proper persistence and SONA bootstrapping to be production-ready on Railway.

  **Why SONA Bootstrapping Matters:**
  - SONA starts with an identity LoRA (no adaptation) on cold start
  - Without seed data, SONA provides no routing improvement for weeks until organic
    traffic generates enough trajectories
  - CrecheBooks already has rich historical data in PayeePatterns (known categorization
    rules) and AgentAuditLogs (past agent decisions with confidence scores)
  - Seeding SONA from this data gives immediate routing benefit from day one
  - `forceLearning()` triggers immediate pattern extraction instead of waiting for the
    1-hour background interval

  **Why Persistence Matters:**
  - Railway uses ephemeral filesystems by default
  - VectorDB uses redb for ACID on-disk storage -- requires persistent volume
  - SONA trajectories and learned patterns must survive deployments
  - Without persistence, every deployment starts from scratch (cold SONA, empty VectorDB)

  ## SA Compliance Notes
  - All monetary values in cents (integers) -- R1,500.00 = 150000
  - Bootstrap data comes from Prisma (PostgreSQL) -- already POPI-compliant storage
  - SONA trajectories do not contain raw PII -- only sanitized payee names and account codes
  - Feature flag table provides audit trail for bootstrap events

  ## Architectural Decisions
  - **Idempotent bootstrap**: `SONA_BOOTSTRAPPED` flag in feature_flags table prevents
    re-seeding on every restart. Only first boot triggers seed.
  - **Railway persistent volume**: `RUVECTOR_DATA_DIR=/data/ruvector` points to Railway's
    persistent volume mount. Development uses `./data/ruvector`.
  - **Graceful degradation**: If persistent volume is unavailable, VectorDB operates
    in-memory only (log warning, do not crash).
  - **CLI script**: `seed-intelligence.ts` allows manual re-seeding for disaster recovery
    or initial setup without restarting the server.
  - **Quality normalization**: PayeePattern quality = matchCount/maxMatchCount (0-1);
    AuditLog quality = confidence/100 (0-1). Both clamped to [0, 1].
  - **Seed limits**: Cap at 10k patterns and 20k audit entries to prevent bootstrap from
    taking too long on first startup.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `PersistenceConfig` service with Railway-aware path resolution
    - Create `SonaBootstrapService` with historical data seeding
    - Create CLI script `seed-intelligence.ts` for manual seeding
    - Implement PayeePattern-to-trajectory conversion (quality = matchCount/max)
    - Implement AgentAuditLog-to-trajectory conversion (quality = confidence/100)
    - Implement idempotent bootstrapping via `SONA_BOOTSTRAPPED` feature flag
    - Implement `forceLearning()` trigger after seed injection
    - Implement graceful degradation when persistent volume is unavailable
    - Implement `getBootstrapStats()` for health check reporting
    - Modify `IntelligenceEngineService` to use `PersistenceConfig` for storage paths
    - Register `PersistenceConfig` and `SonaBootstrapService` in `SdkAgentModule`
    - Update barrel export with new services
    - Add environment variables to `.env.example`
    - Unit tests for `SonaBootstrapService`: seeding, idempotency, graceful failure
    - Unit tests for `PersistenceConfig`: Railway detection, directory creation
    - All tests mock Prisma and IntelligenceEngine
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - Distributed SONA (single-instance sufficient for CrecheBooks)
    - Automatic backup scheduling (manual backup via CLI or cron)
    - Custom embedding model training (use pre-trained all-MiniLM-L6-v2)
    - Railway persistent volume provisioning (infrastructure, not code)
    - VectorDB export/import implementation (ruvector provides built-in snapshot)
    - SONA hyperparameter optimization (use production defaults)
    - Monitoring dashboard for SONA metrics (API-only health check)
    - Multi-tenant bootstrap isolation (seeds from all tenants' data)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/sona-bootstrap.service.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/persistence-config.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/scripts/seed-intelligence.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/agents/sdk/sona-bootstrap.service.spec.ts

# 2. Verify build succeeds
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm run build

# 3. Run bootstrap-specific tests
pnpm test -- --testPathPattern="sona-bootstrap" --runInBand

# 4. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 5. Lint check
pnpm run lint

# 6. Verify services registered in SdkAgentModule
grep "SonaBootstrapService" apps/api/src/agents/sdk/sdk-agent.module.ts
grep "PersistenceConfig" apps/api/src/agents/sdk/sdk-agent.module.ts

# 7. Verify services exported from barrel
grep "SonaBootstrapService" apps/api/src/agents/sdk/index.ts
grep "PersistenceConfig" apps/api/src/agents/sdk/index.ts

# 8. Verify environment variables in .env.example
grep "RUVECTOR_DATA_DIR" apps/api/.env.example
grep "SONA_BOOTSTRAP_ENABLED" apps/api/.env.example

# 9. Verify idempotency flag check
grep "SONA_BOOTSTRAPPED" apps/api/src/agents/sdk/sona-bootstrap.service.ts

# 10. Verify forceLearning trigger
grep "forceLearning" apps/api/src/agents/sdk/sona-bootstrap.service.ts

# 11. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/sdk/sona-bootstrap.service.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"
grep -rn ": any" apps/api/src/agents/sdk/persistence-config.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"

# 12. Verify CLI script exists and is valid TypeScript
grep "NestFactory" apps/api/scripts/seed-intelligence.ts

# 13. Verify PayeePattern seeding
grep "seedFromPayeePatterns" apps/api/src/agents/sdk/sona-bootstrap.service.ts

# 14. Verify AuditLog seeding
grep "seedFromAuditLogs" apps/api/src/agents/sdk/sona-bootstrap.service.ts

# 15. Verify quality normalization (0-1 clamping)
grep "Math.max.*Math.min" apps/api/src/agents/sdk/sona-bootstrap.service.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `PersistenceConfig` service created with `getConfig()` returning Railway-aware paths
  - [ ] `PersistenceConfig` detects Railway environment via `RAILWAY_ENVIRONMENT` env var
  - [ ] `PersistenceConfig` checks persistent volume availability (Railway: /data prefix, dev: writable)
  - [ ] `PersistenceConfig` ensures all required directories exist on init
  - [ ] `PersistenceConfig` logs warning when persistent volume is unavailable
  - [ ] `PersistenceConfig` provides: dataDir, intelligenceDbPath, collectionsDir, sonaDir, backupDir
  - [ ] `SonaBootstrapService` created with `OnModuleInit` lifecycle hook
  - [ ] `SonaBootstrapService.bootstrap()` seeds from PayeePatterns (capped at 10k)
  - [ ] PayeePattern quality normalized: matchCount / maxMatchCount, clamped to [0, 1]
  - [ ] `SonaBootstrapService.bootstrap()` seeds from AgentAuditLogs (capped at 20k)
  - [ ] AuditLog quality normalized: confidence / 100, clamped to [0, 1]
  - [ ] AuditLog filtering: only source IN (HEURISTIC, SDK), confidence >= 50
  - [ ] Bootstrap is idempotent: checks `SONA_BOOTSTRAPPED` flag in feature_flags table
  - [ ] `SONA_BOOTSTRAPPED` flag set after successful bootstrap with metadata (seededAt, totalSeeded)
  - [ ] `forceLearning()` triggered after seeding to force immediate pattern extraction
  - [ ] `forceLearning()` NOT triggered when no trajectories were seeded
  - [ ] Bootstrap failure is non-fatal: logs error, sets stats with skipReason
  - [ ] Bootstrap skipped when `SONA_BOOTSTRAP_ENABLED=false`
  - [ ] Bootstrap skipped when IntelligenceEngine is not available
  - [ ] `getBootstrapStats()` returns detailed stats (seeded counts, duration, skipped reason)
  - [ ] Each seeded trajectory includes source metadata (bootstrap:payee-pattern, bootstrap:audit-log)
  - [ ] CLI script `seed-intelligence.ts` created for manual seeding
  - [ ] CLI script prints bootstrap results and IntelligenceEngine stats
  - [ ] `IntelligenceEngineService` modified to use `PersistenceConfig` for storagePath
  - [ ] `SdkAgentModule` imports `DatabaseModule` for PrismaService access
  - [ ] `PersistenceConfig` and `SonaBootstrapService` registered in `SdkAgentModule`
  - [ ] Barrel export `index.ts` updated with new services and types
  - [ ] Environment variables added to `.env.example`: RUVECTOR_DATA_DIR, SONA_BOOTSTRAP_ENABLED
  - [ ] Unit tests: seeding from PayeePatterns produces correct trajectory format
  - [ ] Unit tests: seeding from AuditLogs produces correct trajectory format
  - [ ] Unit tests: quality normalization is clamped to [0, 1]
  - [ ] Unit tests: bootstrap is idempotent (skipped when flag already set)
  - [ ] Unit tests: forceLearning triggered when trajectories seeded
  - [ ] Unit tests: forceLearning NOT triggered when no trajectories seeded
  - [ ] Unit tests: bootstrap skipped when disabled
  - [ ] Unit tests: bootstrap skipped when IntelligenceEngine unavailable
  - [ ] Unit tests: bootstrap failure is non-fatal
  - [ ] Unit tests: SONA_BOOTSTRAPPED flag set after success
  - [ ] Unit tests: bootstrap metadata includes source markers
  - [ ] All tests mock Prisma and IntelligenceEngine -- zero real API calls
  - [ ] Test coverage >= 90% for SonaBootstrapService
  - [ ] Zero `any` types in all new/modified files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (zero regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER skip the idempotency check** -- without the `SONA_BOOTSTRAPPED` flag, every
    server restart would re-seed SONA with duplicate trajectories, degrading pattern quality.
  - **NEVER hardcode storage paths** -- always use `RUVECTOR_DATA_DIR` environment variable
    via `PersistenceConfig`. Production uses Railway volume mount, development uses local dir.
  - **NEVER crash on bootstrap failure** -- bootstrap is a best-effort optimization.
    If it fails, agents continue working with cold SONA (identity LoRA).
  - **NEVER seed from low-confidence audit logs** -- only seed from confidence >= 50 and
    known-good sources (HEURISTIC, SDK). SHADOW-mode results are not validated enough for seeding.
  - **NEVER use `any` type** -- use proper TypeScript interfaces
  - **NEVER use `npm`** -- all commands must use `pnpm`
  - **NEVER skip forceLearning after seeding** -- without it, SONA waits 1 hour (background
    interval) before extracting patterns from seeded trajectories. That defeats the purpose.
  - **NEVER store raw PII in SONA trajectories** -- only store payee names and account codes.
    Do not include parent names, phone numbers, ID numbers, or financial details.
  - **NEVER block application startup on bootstrap** -- bootstrap runs in `OnModuleInit`
    but catches all errors. The app must start even if bootstrap fails completely.
  - **NEVER remove the seed limit caps** -- PayeePatterns capped at 10k, AuditLogs at 20k.
    Without caps, initial bootstrap on a large tenant could take minutes and delay startup.
  - **NEVER use floating-point for monetary values** -- all amounts in cents (integers).
    Trajectory metadata may reference financial data.
  - **NEVER make real API calls in tests** -- always mock PrismaService and
    IntelligenceEngineService. Tests must be fast and deterministic.
  - **NEVER assume Railway persistent volume exists** -- check availability via
    `PersistenceConfig.checkPersistentVolume()` and degrade gracefully to in-memory mode
    with a warning log.
  - **NEVER re-seed without the --force flag** -- the CLI script should respect the
    `SONA_BOOTSTRAPPED` flag unless explicitly overridden.
</anti_patterns>

</task_spec>
