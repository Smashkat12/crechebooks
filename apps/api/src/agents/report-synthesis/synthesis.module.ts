/**
 * Report Synthesis Module
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * @module agents/report-synthesis/synthesis.module
 * @description NestJS module for the report synthesis agent.
 * Provides ReportSynthesisAgent and SynthesisDecisionLogger.
 */

import { Module, forwardRef } from '@nestjs/common';
import { SdkAgentModule } from '../sdk';
import { AuditTrailModule } from '../audit/audit-trail.module';
import { ReportSynthesisAgent } from './synthesis.agent';
import { SynthesisDecisionLogger } from './decision-logger';

@Module({
  imports: [forwardRef(() => SdkAgentModule), AuditTrailModule],
  providers: [ReportSynthesisAgent, SynthesisDecisionLogger],
  exports: [ReportSynthesisAgent, SynthesisDecisionLogger],
})
export class ReportSynthesisModule {}
