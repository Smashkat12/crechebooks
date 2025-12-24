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
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [forwardRef(() => DatabaseModule)],
  providers: [SarsAgent, SarsDecisionLogger, SarsContextValidator],
  exports: [SarsAgent, SarsContextValidator],
})
export class SarsAgentModule {}
