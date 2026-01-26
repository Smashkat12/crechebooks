/**
 * CLI Script: Promote Agent
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * Usage:
 *   pnpm exec tsx scripts/promote-agent.ts --agent categorizer --tenant bdff4374-64d5-420c-b454-8e85e9df552a --mode PRIMARY
 *
 * Agent types: categorizer, matcher, sars, validator, orchestrator
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RolloutPromotionService } from '../src/agents/rollout/rollout-promotion.service';
import { ShadowComparisonAggregator } from '../src/agents/rollout/shadow-comparison-aggregator';
import type { PromotableAgentType } from '../src/agents/rollout/interfaces/comparison-report.interface';

const VALID_AGENTS: PromotableAgentType[] = [
  'categorizer',
  'matcher',
  'sars',
  'validator',
  'orchestrator',
];

function parseArgs(): {
  agent: PromotableAgentType;
  tenant: string;
  mode: string;
} {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf('--agent');
  const tenantIdx = args.indexOf('--tenant');
  const modeIdx = args.indexOf('--mode');

  if (agentIdx === -1 || tenantIdx === -1 || modeIdx === -1) {
    console.error(
      'Usage: pnpm exec tsx scripts/promote-agent.ts --agent <type> --tenant <uuid> --mode <PRIMARY|SHADOW>',
    );
    console.error(
      `Agent types: ${VALID_AGENTS.join(', ')}`,
    );
    process.exit(1);
  }

  const agent = args[agentIdx + 1] as PromotableAgentType;
  if (!VALID_AGENTS.includes(agent)) {
    console.error(
      `Invalid agent type: ${agent}. Valid types: ${VALID_AGENTS.join(', ')}`,
    );
    process.exit(1);
  }

  return {
    agent,
    tenant: args[tenantIdx + 1],
    mode: args[modeIdx + 1],
  };
}

async function main(): Promise<void> {
  const { agent, tenant, mode } = parseArgs();

  console.log('=== CrecheBooks Agent Promotion Script ===');
  console.log(`Agent:  ${agent}`);
  console.log(`Tenant: ${tenant}`);
  console.log(`Mode:   ${mode}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const promotionService = app.get(RolloutPromotionService);
    const aggregator = app.get(ShadowComparisonAggregator);

    // Generate report first
    console.log('\n--- Generating Comparison Report ---');
    const report = await aggregator.generateReport(agent, tenant, 7);
    console.log(`Total decisions:    ${report.totalDecisions}`);
    console.log(`Match rate:         ${report.matchRate}%`);
    console.log(`SDK better:         ${report.sdkBetter}`);
    console.log(`Heuristic better:   ${report.heuristicBetter}`);
    console.log(`Identical:          ${report.identical}`);
    console.log(`SDK avg latency:    ${report.sdkAvgLatencyMs}ms`);
    console.log(`Heuristic avg lat:  ${report.heuristicAvgLatencyMs}ms`);
    console.log(`SDK avg confidence: ${report.sdkAvgConfidence}`);
    console.log(`Meets criteria:     ${report.meetsPromotionCriteria}`);
    if (report.promotionBlockers.length > 0) {
      console.log(
        `Blockers:           ${report.promotionBlockers.join(', ')}`,
      );
    }

    if (mode === 'PRIMARY') {
      console.log('\n--- Promoting to PRIMARY ---');
      const result = await promotionService.promote(agent, tenant);
      console.log(`Success:  ${result.success}`);
      console.log(`Previous: ${result.previousMode}`);
      console.log(`New:      ${result.newMode}`);
      if (result.reason) {
        console.log(`Reason:   ${result.reason}`);
      }
    }
  } finally {
    await app.close();
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Promotion script failed:', error);
  process.exit(1);
});
