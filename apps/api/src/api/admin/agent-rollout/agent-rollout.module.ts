/**
 * Agent Rollout Admin Module
 *
 * @module api/admin/agent-rollout/agent-rollout.module
 * @description Wires the SUPER_ADMIN /admin/agent-rollout endpoints to the
 * existing rollout primitives (FeatureFlagService, RolloutPromotionService,
 * ShadowComparisonAggregator) and the AuditLogService.
 */

import { Module, forwardRef } from '@nestjs/common';
import { RolloutModule } from '../../../agents/rollout/rollout.module';
import { PrismaModule } from '../../../database/prisma';
import { DatabaseModule } from '../../../database/database.module';
import { AgentRolloutController } from './agent-rollout.controller';
import { AgentRolloutService } from './agent-rollout.service';

@Module({
  imports: [
    PrismaModule,
    RolloutModule,
    // DatabaseModule provides AuditLogService. forwardRef prevents cyclic import
    // via the AdminModule → DatabaseModule → WhatsAppModule chain (mirrors the
    // pattern already used in AdminModule).
    forwardRef(() => DatabaseModule),
  ],
  controllers: [AgentRolloutController],
  providers: [AgentRolloutService],
  exports: [AgentRolloutService],
})
export class AgentRolloutApiModule {}
