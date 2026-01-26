/**
 * SARS Agent Module
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * @module agents/sars-agent/sars.module
 * @description NestJS module for the SARS Agent.
 * Provides PAYE, UIF, EMP201, and VAT201 calculation agents.
 */

import { Module, forwardRef } from '@nestjs/common';
import { SarsAgent } from './sars.agent';
import { SarsDecisionLogger } from './decision-logger';
import { SarsContextValidator } from './context-validator';
import { SdkSarsExplainer } from './sdk-sars-explainer';
import { DatabaseModule } from '../../database/database.module';
import { SdkAgentModule } from '../sdk';
import { AuditTrailModule } from '../audit/audit-trail.module';
import { RolloutModule } from '../rollout/rollout.module';

@Module({
  imports: [forwardRef(() => DatabaseModule), SdkAgentModule, AuditTrailModule, RolloutModule],
  providers: [
    SarsAgent,
    SarsDecisionLogger,
    SarsContextValidator,
    SdkSarsExplainer,
  ],
  exports: [SarsAgent, SarsContextValidator],
})
export class SarsAgentModule {}
