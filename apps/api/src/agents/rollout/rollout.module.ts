/**
 * Rollout Module
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 *
 * @module agents/rollout/rollout.module
 * @description NestJS module providing feature flags and shadow runner
 * for safe per-tenant, per-agent SDK rollout.
 */

import { Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flags.service';
import { ShadowRunner } from './shadow-runner';
import { PrismaModule } from '../../database/prisma';
import { AuditTrailModule } from '../audit/audit-trail.module';

@Module({
  imports: [PrismaModule, AuditTrailModule],
  providers: [FeatureFlagService, ShadowRunner],
  exports: [FeatureFlagService, ShadowRunner],
})
export class RolloutModule {}
