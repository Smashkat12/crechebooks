/**
 * Orchestrator Agent Module
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/orchestrator.module
 * @description NestJS module for the Orchestrator Agent.
 * Imports and coordinates all specialized agent modules.
 */

import { Module, forwardRef } from '@nestjs/common';
import { OrchestratorAgent } from './orchestrator.agent';
import { WorkflowRouter } from './workflow-router';
import { EscalationManager } from './escalation-manager';
import { SdkOrchestrator } from './sdk-orchestrator';
import { WorkflowResultAdaptor } from './workflow-result-adaptor';
import { TransactionCategorizerModule } from '../transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../payment-matcher/matcher.module';
import { SarsAgentModule } from '../sars-agent/sars.module';
import { SdkAgentModule } from '../sdk/sdk-agent.module';
import { DatabaseModule } from '../../database/database.module';
import { AuditTrailModule } from '../audit/audit-trail.module';
import { RolloutModule } from '../rollout/rollout.module';

@Module({
  imports: [
    forwardRef(() => DatabaseModule), // Use forwardRef to break circular dependency
    TransactionCategorizerModule,
    PaymentMatcherModule,
    SarsAgentModule,
    SdkAgentModule,
    AuditTrailModule, // TASK-SDK-011: Structured Audit Trail
    RolloutModule, // TASK-SDK-012: Parallel Rollout Framework
  ],
  providers: [
    OrchestratorAgent,
    WorkflowRouter,
    EscalationManager,
    SdkOrchestrator,
    WorkflowResultAdaptor,
  ],
  exports: [OrchestratorAgent],
})
export class OrchestratorModule {}
