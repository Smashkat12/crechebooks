/**
 * Transaction Categorizer Agent Module
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/categorizer.module
 * @description NestJS module for the Transaction Categorizer Agent.
 */

import { Module } from '@nestjs/common';
import { TransactionCategorizerAgent } from './categorizer.agent';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    TransactionCategorizerAgent,
    ContextLoader,
    PatternMatcher,
    ConfidenceScorer,
    DecisionLogger,
  ],
  exports: [TransactionCategorizerAgent, ContextLoader],
})
export class TransactionCategorizerModule {}
