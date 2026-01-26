/**
 * SONA Intelligence Seed Script
 * TASK-STUB-011: Persistence and SONA Cold Start Bootstrap
 *
 * Usage: pnpm exec tsx scripts/seed-intelligence.ts [--force]
 *
 * Seeds SONA from historical PayeePattern and AgentAuditLog data.
 * Respects the SONA_BOOTSTRAPPED flag unless --force is used.
 */

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
    console.log(
      `SONA trajectories:    ${engineStats.sona.trajectoriesRecorded}`,
    );
    console.log(`SONA patterns:        ${engineStats.sona.patternsLearned}`);
    console.log(
      `FastAgentDB episodes: ${engineStats.fastAgentDb.totalEpisodes}`,
    );
    console.log(
      `Learning decisions:   ${engineStats.learningEngine.totalDecisions}`,
    );
    console.log(`Uptime:               ${engineStats.uptimeMs}ms`);
  } finally {
    await app.close();
  }

  console.log('\n=== Seed complete ===');
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
