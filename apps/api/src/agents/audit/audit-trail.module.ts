/**
 * Audit Trail Module
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 * TASK-STUB-008: Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)
 *
 * @module agents/audit/audit-trail.module
 * @description NestJS module for the unified database-backed audit trail.
 * Provides AuditTrailService, DecisionHooks, and RealDecisionHooks
 * to any module that imports it.
 */

import { Module } from '@nestjs/common';
import { AuditTrailService } from './audit-trail.service';
import { DecisionHooks } from './decision-hooks';
import { RealDecisionHooks, DECISION_HOOKS_TOKEN } from './real-decision-hooks';
import { SonaWeightAdapter } from '../shared/sona-weight-adapter';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';

@Module({
  imports: [PrismaModule, SdkAgentModule],
  providers: [
    AuditTrailService,
    {
      provide: SonaWeightAdapter,
      useFactory: () => {
        try {
          return new SonaWeightAdapter();
        } catch {
          return undefined; // @Optional() in RealDecisionHooks handles this
        }
      },
    },
    RealDecisionHooks,
    {
      provide: DECISION_HOOKS_TOKEN,
      useExisting: RealDecisionHooks,
    },
    DecisionHooks,
  ],
  exports: [AuditTrailService, DecisionHooks, RealDecisionHooks],
})
export class AuditTrailModule {}
