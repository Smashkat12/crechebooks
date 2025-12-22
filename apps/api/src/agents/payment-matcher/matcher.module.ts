/**
 * Payment Matcher Agent Module
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/matcher.module
 * @description NestJS module for the Payment Matcher Agent.
 */

import { Module } from '@nestjs/common';
import { PaymentMatcherAgent } from './matcher.agent';
import { MatchDecisionLogger } from './decision-logger';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  providers: [PaymentMatcherAgent, MatchDecisionLogger],
  exports: [PaymentMatcherAgent],
})
export class PaymentMatcherModule {}
