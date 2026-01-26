/**
 * CLI Script: Emergency Rollback Agent
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * Usage:
 *   pnpm exec tsx scripts/rollback-agent.ts --agent categorizer --tenant bdff4374-64d5-420c-b454-8e85e9df552a
 *
 * Agent types: categorizer, matcher, sars, validator, orchestrator
 *
 * WARNING: This immediately disables the SDK agent. No criteria check.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RolloutPromotionService } from '../src/agents/rollout/rollout-promotion.service';
import type { PromotableAgentType } from '../src/agents/rollout/interfaces/comparison-report.interface';

const VALID_AGENTS: PromotableAgentType[] = [
  'categorizer',
  'matcher',
  'sars',
  'validator',
  'orchestrator',
];

function parseArgs(): { agent: PromotableAgentType; tenant: string } {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf('--agent');
  const tenantIdx = args.indexOf('--tenant');

  if (agentIdx === -1 || tenantIdx === -1) {
    console.error(
      'Usage: pnpm exec tsx scripts/rollback-agent.ts --agent <type> --tenant <uuid>',
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
  };
}

async function main(): Promise<void> {
  const { agent, tenant } = parseArgs();

  console.log('=== CrecheBooks EMERGENCY ROLLBACK Script ===');
  console.log(`Agent:  ${agent}`);
  console.log(`Tenant: ${tenant}`);
  console.log('WARNING: This immediately disables the SDK agent.');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const promotionService = app.get(RolloutPromotionService);

    console.log('\n--- Rolling back to DISABLED ---');
    const result = await promotionService.rollback(agent, tenant);

    console.log(`Success:  ${result.success}`);
    console.log(`Previous: ${result.previousMode}`);
    console.log(`New:      ${result.newMode}`);
    if (result.reason) {
      console.log(`Reason:   ${result.reason}`);
    }
  } finally {
    await app.close();
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Rollback script failed:', error);
  process.exit(1);
});
