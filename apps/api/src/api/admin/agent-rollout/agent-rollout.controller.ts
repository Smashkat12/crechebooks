/**
 * Agent Rollout Admin Controller
 *
 * @module api/admin/agent-rollout/agent-rollout.controller
 * @description SUPER_ADMIN-only endpoints for flipping per-tenant SDK-agent
 * rollout modes. These are the endpoints that finally give the coded-but-off
 * LLM agent layer an admin surface — see 2026-07-06 rollout audit for context.
 *
 * All routes require SUPER_ADMIN via the globally-registered RolesGuard.
 * Every mutation writes an audit_logs row (see AgentRolloutService.writeAudit).
 */

import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { IUser } from '../../../database/entities/user.entity';
import { AgentRolloutService } from './agent-rollout.service';
import type { PromotableAgentType } from '../../../agents/rollout/interfaces/comparison-report.interface';
import {
  AgentRolloutListResponseDto,
  AgentRolloutTenantResponseDto,
  PROMOTABLE_AGENT_TYPES,
  PromoteAgentDto,
  RollbackAllDto,
  RolloutMutationResponseDto,
  RolloutRollbackAllResponseDto,
  SetRolloutModeDto,
} from '../dto/agent-rollout.dto';

function isPromotableAgentType(v: string): v is PromotableAgentType {
  return (PROMOTABLE_AGENT_TYPES as readonly string[]).includes(v);
}

function extractActor(user: IUser | undefined, req: Request) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  const ipAddress =
    (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor) ??
    req.ip ??
    undefined;
  return {
    userId: user?.id,
    ipAddress,
    userAgent: req.headers['user-agent'],
  };
}

@Controller('admin/agent-rollout')
@ApiTags('Admin - Agent Rollout')
@ApiBearerAuth('JWT-auth')
export class AgentRolloutController {
  private readonly logger = new Logger(AgentRolloutController.name);

  constructor(private readonly service: AgentRolloutService) {}

  // ============================================
  // READ
  // ============================================

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List rollout state for every tenant × agent',
    description:
      'Joins feature_flags with a summary of recent shadow_comparisons ' +
      'so the admin console can show each agent’s current mode and recent accuracy.',
  })
  @ApiQuery({
    name: 'periodDays',
    required: false,
    type: Number,
    description: 'Reporting window in days (default 7).',
  })
  @ApiResponse({ status: 200, type: AgentRolloutListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async list(
    @Query('periodDays') periodDaysRaw?: string,
  ): Promise<AgentRolloutListResponseDto> {
    const periodDays = periodDaysRaw ? parseInt(periodDaysRaw, 10) : 7;
    return this.service.listAll(
      Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 7,
    );
  }

  @Get(':tenantId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get one tenant’s full rollout state' })
  @ApiResponse({ status: 200, type: AgentRolloutTenantResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async getForTenant(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Query('periodDays') periodDaysRaw?: string,
  ): Promise<AgentRolloutTenantResponseDto> {
    const periodDays = periodDaysRaw ? parseInt(periodDaysRaw, 10) : 7;
    return this.service.getTenant(
      tenantId,
      Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 7,
    );
  }

  // ============================================
  // WRITE
  // ============================================

  @Post(':tenantId/:agentType')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Set agent mode for a tenant',
    description:
      'Sets an SDK agent to DISABLED, SHADOW, or PRIMARY for the given tenant. ' +
      'Promoting to PRIMARY without ?force=true fails when the shadow-comparison ' +
      'criteria have not been met. DISABLED/SHADOW are unconditional.',
  })
  @ApiResponse({ status: 201, type: RolloutMutationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async setMode(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('agentType') agentTypeParam: string,
    @Body() dto: SetRolloutModeDto,
    @CurrentUser() user: IUser | undefined,
    @Req() req: Request,
  ): Promise<RolloutMutationResponseDto> {
    if (!isPromotableAgentType(agentTypeParam)) {
      return {
        success: false,
        tenantId,
        agentType: 'categorizer',
        previousMode: 'DISABLED',
        newMode: 'DISABLED',
        reason: `Unknown agent type: ${agentTypeParam}`,
      };
    }
    return this.service.setMode(
      tenantId,
      agentTypeParam,
      dto.mode,
      dto.reason,
      dto.force === true,
      extractActor(user, req),
    );
  }

  @Post(':tenantId/:agentType/promote')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Auto-promote SHADOW → PRIMARY',
    description:
      'Delegates to RolloutPromotionService which enforces the standard go/no-go ' +
      'criteria (minMatchRate, minComparisons, minPeriodDays, maxLatencyMultiplier).',
  })
  @ApiResponse({ status: 201, type: RolloutMutationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async promote(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('agentType') agentTypeParam: string,
    @Body() dto: PromoteAgentDto,
    @CurrentUser() user: IUser | undefined,
    @Req() req: Request,
  ): Promise<RolloutMutationResponseDto> {
    if (!isPromotableAgentType(agentTypeParam)) {
      return {
        success: false,
        tenantId,
        agentType: 'categorizer',
        previousMode: 'DISABLED',
        newMode: 'DISABLED',
        reason: `Unknown agent type: ${agentTypeParam}`,
      };
    }
    return this.service.promote(
      tenantId,
      agentTypeParam,
      dto.reason,
      extractActor(user, req),
    );
  }

  @Post(':tenantId/rollback-all')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Emergency rollback: disable ALL agents for a tenant',
    description:
      'Sets every SDK agent (categorizer, matcher, sars, validator, orchestrator) ' +
      'back to DISABLED for the given tenant. Safety brake — unconditional.',
  })
  @ApiResponse({ status: 201, type: RolloutRollbackAllResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async rollbackAll(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: RollbackAllDto,
    @CurrentUser() user: IUser | undefined,
    @Req() req: Request,
  ): Promise<RolloutRollbackAllResponseDto> {
    return this.service.rollbackAll(
      tenantId,
      dto.reason,
      extractActor(user, req),
    );
  }
}
