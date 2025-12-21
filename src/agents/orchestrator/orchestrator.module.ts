/**
 * Orchestrator Agent Module
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/orchestrator.module
 * @description NestJS module for the Orchestrator Agent.
 * Imports and coordinates all specialized agent modules.
 */

import { Module } from '@nestjs/common';
import { OrchestratorAgent } from './orchestrator.agent';
import { WorkflowRouter } from './workflow-router';
import { EscalationManager } from './escalation-manager';
import { TransactionCategorizerModule } from '../transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../payment-matcher/matcher.module';
import { SarsAgentModule } from '../sars-agent/sars.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    DatabaseModule,
    TransactionCategorizerModule,
    PaymentMatcherModule,
    SarsAgentModule,
  ],
  providers: [OrchestratorAgent, WorkflowRouter, EscalationManager],
  exports: [OrchestratorAgent],
})
export class OrchestratorModule {}
