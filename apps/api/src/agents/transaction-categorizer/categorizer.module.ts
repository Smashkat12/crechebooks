/**
 * Transaction Categorizer Agent Module
 * TASK-AGENT-002: Transaction Categorizer Agent
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * @module agents/transaction-categorizer/categorizer.module
 * @description NestJS module for the Transaction Categorizer Agent.
 * Imports SdkAgentModule to provide SDK-enhanced categorization capabilities.
 */

import { Module } from '@nestjs/common';
import { TransactionCategorizerAgent } from './categorizer.agent';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';
import { AgentMemoryModule } from '../memory/agent-memory.module';
import { AuditTrailModule } from '../audit/audit-trail.module';
import { SdkCategorizer } from './sdk-categorizer';
import { HybridScorer } from '../shared/hybrid-scorer';
import { AccuracyTracker } from '../shared/accuracy-tracker';
import { ScoringRouter } from '../shared/scoring-router';
import { RolloutModule } from '../rollout/rollout.module';

@Module({
  imports: [
    PrismaModule,
    SdkAgentModule,
    AgentMemoryModule,
    AuditTrailModule,
    RolloutModule,
  ],
  providers: [
    TransactionCategorizerAgent,
    ContextLoader,
    PatternMatcher,
    ConfidenceScorer,
    DecisionLogger,
    SdkCategorizer,
    HybridScorer,
    AccuracyTracker,
    ScoringRouter,
  ],
  exports: [TransactionCategorizerAgent, ContextLoader],
})
export class TransactionCategorizerModule {}
