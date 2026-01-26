/**
 * Audit Trail Module
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * @module agents/audit/audit-trail.module
 * @description NestJS module for the unified database-backed audit trail.
 * Provides AuditTrailService and DecisionHooks to any module that imports it.
 */

import { Module } from '@nestjs/common';
import { AuditTrailService } from './audit-trail.service';
import { DecisionHooks } from './decision-hooks';
import { PrismaModule } from '../../database/prisma';
import { SdkAgentModule } from '../sdk';

@Module({
  imports: [PrismaModule, SdkAgentModule],
  providers: [AuditTrailService, DecisionHooks],
  exports: [AuditTrailService, DecisionHooks],
})
export class AuditTrailModule {}
