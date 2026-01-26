/**
 * Payment Matcher Agent Module
 * TASK-AGENT-003: Payment Matcher Agent
 * TASK-SDK-004: PaymentMatcher SDK Migration
 *
 * @module agents/payment-matcher/matcher.module
 * @description NestJS module for the Payment Matcher Agent.
 * Imports SdkAgentModule for optional SDK-enhanced matching.
 */

import { Module } from '@nestjs/common';
import { PaymentMatcherAgent } from './matcher.agent';
import { MatchDecisionLogger } from './decision-logger';
import { SdkPaymentMatcher } from './sdk-matcher';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';
import { AgentMemoryModule } from '../memory/agent-memory.module';
import { AuditTrailModule } from '../audit/audit-trail.module';
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
    PaymentMatcherAgent,
    MatchDecisionLogger,
    SdkPaymentMatcher,
    HybridScorer,
    AccuracyTracker,
    ScoringRouter,
  ],
  exports: [PaymentMatcherAgent],
})
export class PaymentMatcherModule {}
