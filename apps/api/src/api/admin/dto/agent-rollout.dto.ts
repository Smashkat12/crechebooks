/**
 * Agent Rollout DTOs
 *
 * @module api/admin/dto/agent-rollout
 * @description Request and response DTOs for the SUPER_ADMIN agent rollout
 * console. Backs the /admin/agent-rollout endpoints which let platform admins
 * flip per-tenant SDK agents between DISABLED / SHADOW / PRIMARY.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  PromotableAgentType,
  RolloutMode,
  ComparisonReport,
} from '../../../agents/rollout/interfaces/comparison-report.interface';

/** The five SDK-shadowed agent types the console governs. */
export const PROMOTABLE_AGENT_TYPES: PromotableAgentType[] = [
  'categorizer',
  'matcher',
  'sars',
  'validator',
  'orchestrator',
];

/** Feature flag key mapping — mirrors rollout-promotion.service.ts. */
export const AGENT_FLAG_MAP: Record<PromotableAgentType, string> = {
  categorizer: 'sdk_categorizer',
  matcher: 'sdk_matcher',
  sars: 'sdk_sars',
  validator: 'sdk_validator',
  orchestrator: 'sdk_orchestrator',
};

export const ROLLOUT_MODES: RolloutMode[] = ['DISABLED', 'SHADOW', 'PRIMARY'];

// ============================================
// Request DTOs
// ============================================

export class SetRolloutModeDto {
  @ApiProperty({
    description: 'Target mode for the agent',
    enum: ROLLOUT_MODES,
  })
  @IsIn(ROLLOUT_MODES)
  mode!: RolloutMode;

  @ApiProperty({
    description:
      'Human reason for the change. Written to the audit log alongside the actor id.',
    example: 'Manual promotion after 200 shadow comparisons at 98% match rate',
  })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Bypass the promotion-criteria safety check when moving to PRIMARY. Ignored for DISABLED/SHADOW.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class PromoteAgentDto {
  @ApiProperty({
    description:
      'Reason for the promotion — audit-logged. Auto-promotion still requires SHADOW criteria to be met.',
    example: 'Weekly promotion audit — criteria met on 2026-07-07',
  })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RollbackAllDto {
  @ApiProperty({
    description:
      'Reason for the emergency rollback — audit-logged. All five agents are set to DISABLED.',
    example: 'Emergency: categorizer producing wrong VAT codes',
  })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

// ============================================
// Response DTOs
// ============================================

export class AgentRolloutRowDto {
  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Tenant trading name (for display)' })
  tenantName!: string;

  @ApiProperty({ description: 'Agent type', enum: PROMOTABLE_AGENT_TYPES })
  agentType!: PromotableAgentType;

  @ApiProperty({ description: 'Feature flag key (sdk_*)' })
  flagKey!: string;

  @ApiProperty({ description: 'Current rollout mode', enum: ROLLOUT_MODES })
  mode!: RolloutMode;

  @ApiProperty({
    description:
      'Match rate (0-100) between SDK and heuristic over the reporting window. 0 when no comparisons exist.',
  })
  matchRate!: number;

  @ApiProperty({
    description: 'Total shadow comparisons observed in the reporting window',
  })
  totalDecisions!: number;

  @ApiProperty({ description: 'Whether promotion-to-PRIMARY criteria are met' })
  meetsPromotionCriteria!: boolean;

  @ApiProperty({
    description:
      'Reasons promotion criteria are NOT met (empty when meetsPromotionCriteria is true).',
    type: [String],
  })
  promotionBlockers!: string[];
}

export class AgentRolloutListResponseDto {
  @ApiProperty({ type: [AgentRolloutRowDto] })
  rows!: AgentRolloutRowDto[];

  @ApiProperty({
    description: 'Reporting window in days used to compute stats',
  })
  periodDays!: number;

  @ApiProperty({ description: 'ISO timestamp of when this snapshot was built' })
  generatedAt!: string;
}

export class AgentRolloutTenantResponseDto {
  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Tenant trading name (for display)' })
  tenantName!: string;

  @ApiProperty({ type: [AgentRolloutRowDto] })
  agents!: AgentRolloutRowDto[];

  @ApiProperty({
    description: 'Reporting window in days used to compute stats',
  })
  periodDays!: number;

  @ApiProperty({ description: 'ISO timestamp of when this snapshot was built' })
  generatedAt!: string;
}

export class RolloutMutationResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ description: 'Tenant ID acted on' })
  tenantId!: string;

  @ApiProperty({
    description: 'Agent type acted on',
    enum: PROMOTABLE_AGENT_TYPES,
  })
  agentType!: PromotableAgentType;

  @ApiProperty({ description: 'Previous mode', enum: ROLLOUT_MODES })
  previousMode!: RolloutMode;

  @ApiProperty({ description: 'New mode', enum: ROLLOUT_MODES })
  newMode!: RolloutMode;

  @ApiPropertyOptional({
    description:
      'Reason for a failed operation — set when success is false (e.g. promotion criteria not met).',
  })
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Comparison report used for automatic promotion decisions. Omitted for direct set-mode calls.',
    type: Object,
  })
  report?: ComparisonReport;
}

export class RolloutRollbackAllResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ description: 'Tenant ID acted on' })
  tenantId!: string;

  @ApiProperty({
    description: 'Per-agent rollback results',
    type: [RolloutMutationResponseDto],
  })
  results!: RolloutMutationResponseDto[];
}
