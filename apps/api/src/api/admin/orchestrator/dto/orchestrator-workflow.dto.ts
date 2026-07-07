/**
 * DTOs for the SUPER_ADMIN orchestrator workflow endpoints.
 *
 * Endpoints:
 *   POST   /admin/orchestrator/workflows/:workflowType/run
 *   GET    /admin/orchestrator/workflows/runs/:runId
 *   GET    /admin/orchestrator/workflows/runs?tenantId=&limit=
 *
 * The runnable enum is intentionally narrower than WorkflowType — we only
 * surface the three orchestrated workflows (bank import, month-end,
 * tax-submission). Sub-workflows like CALCULATE_PAYE are internal steps of
 * MONTH_END and don't need their own operator surface.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { WorkflowType } from '../../../../agents/orchestrator/interfaces/orchestrator.interface';

/**
 * Public workflow types operators can trigger. Maps 1:1 to internal
 * WorkflowType values via ADMIN_WORKFLOW_TYPE_MAP; MONTH_END is an alias for
 * the existing MONTHLY_CLOSE workflow (kept internally for backwards
 * compatibility with escalation-manager priorities and workflow-router).
 */
export enum AdminOrchestratorWorkflowType {
  BANK_IMPORT = 'BANK_IMPORT',
  MONTH_END = 'MONTH_END',
  TAX_SUBMISSION = 'TAX_SUBMISSION',
}

/**
 * Alias table so the manual endpoint speaks operator-friendly names while
 * OrchestratorAgent keeps its established internal vocabulary. TAX_SUBMISSION
 * currently maps to VAT201 generation — the highest-value SARS workflow to
 * surface manually; PAYE/EMP201 remain as internal steps of MONTH_END.
 */
export const ADMIN_WORKFLOW_TYPE_MAP: Record<
  AdminOrchestratorWorkflowType,
  WorkflowType
> = {
  [AdminOrchestratorWorkflowType.BANK_IMPORT]: 'BANK_IMPORT',
  [AdminOrchestratorWorkflowType.MONTH_END]: 'MONTHLY_CLOSE',
  [AdminOrchestratorWorkflowType.TAX_SUBMISSION]: 'GENERATE_VAT201',
};

export class RunOrchestratorWorkflowDto {
  @ApiProperty({
    description:
      'Tenant the workflow runs against. Required because SUPER_ADMIN callers are not tenant-scoped.',
    example: 'bdff4374-64d5-420c-b454-8e85e9df552a',
  })
  @IsUUID('4')
  tenantId!: string;

  @ApiPropertyOptional({
    description:
      'Workflow-specific parameters. BANK_IMPORT accepts none; MONTH_END expects `{ periodMonth: "YYYY-MM" }`; TAX_SUBMISSION expects `{ periodStart, periodEnd }` (ISO dates).',
    example: { periodMonth: '2026-06' },
    type: Object,
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class RunOrchestratorWorkflowResponseDto {
  @ApiProperty({ description: 'Persisted workflow_runs row id' })
  runId!: string;

  @ApiProperty({
    description: 'Status at the moment the endpoint returned (see WorkflowRunStatus)',
    example: 'AWAITING_ESCALATION',
  })
  status!: string;

  @ApiProperty({ description: 'Public workflow type that was executed' })
  workflowType!: AdminOrchestratorWorkflowType;

  @ApiProperty({ description: 'Tenant the run targeted' })
  tenantId!: string;

  @ApiProperty({ description: 'When the run started (ISO 8601)' })
  startedAt!: string;

  @ApiPropertyOptional({ description: 'When the run finished (ISO 8601)' })
  completedAt?: string | null;
}

export class ListWorkflowRunsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter to runs for a specific tenant. When omitted, returns runs across ALL tenants (SUPER_ADMIN visibility).',
  })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Filter to a specific workflow type (public enum values).',
    enum: AdminOrchestratorWorkflowType,
  })
  @IsOptional()
  @IsEnum(AdminOrchestratorWorkflowType)
  workflowType?: AdminOrchestratorWorkflowType;

  @ApiPropertyOptional({
    description: 'Cap on rows returned. 1–200, default 50.',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Row offset for cursor-less pagination.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class WorkflowRunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({
    description: 'Public workflow type — maps back from the internal workflow type.',
  })
  workflowType!: string;

  @ApiProperty({
    description: 'RUNNING | COMPLETED | FAILED | AWAITING_ESCALATION',
  })
  status!: string;

  @ApiProperty({
    description: 'Where the run came from — admin-api, cron-month-end, etc.',
  })
  triggeredBy!: string;

  @ApiPropertyOptional({ nullable: true })
  currentStep?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  input?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  output?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  error?: string | null;

  @ApiPropertyOptional({ nullable: true })
  escalatedTo?: string | null;

  @ApiProperty()
  startedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt?: string | null;
}

/**
 * Path-parameter DTO: exists so we get consistent validation errors for
 * malformed run IDs instead of a bare 404.
 */
export class WorkflowRunIdParamDto {
  @ApiProperty()
  @IsString()
  runId!: string;
}
