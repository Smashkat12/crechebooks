/**
 * Orchestrator Admin Controller
 *
 * @module api/admin/orchestrator/orchestrator-admin.controller
 * @description SUPER_ADMIN-scoped surface for triggering and inspecting
 * OrchestratorAgent workflow runs. Everything under /admin is skipped by
 * TenantGuard (see TenantGuard.canActivate), so tenantId is accepted in
 * the request body / query and validated by this controller.
 *
 * Rollout stance: workflows do not auto-run in production. This endpoint is
 * gated by SUPER_ADMIN and MUST be called explicitly to trigger a run — the
 * MONTH_END cron additionally requires per-tenant opt-in via
 * `tenants.orchestrator_month_end_enabled`.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OrchestratorAgent } from '../../../agents/orchestrator/orchestrator.agent';
import {
  WorkflowRunRepository,
  type WorkflowRunRecord,
} from '../../../agents/orchestrator/workflow-run.repository';
import type { WorkflowType } from '../../../agents/orchestrator/interfaces/orchestrator.interface';
import { v4 as uuidv4 } from 'uuid';
import {
  ADMIN_WORKFLOW_TYPE_MAP,
  AdminOrchestratorWorkflowType,
  ListWorkflowRunsQueryDto,
  RunOrchestratorWorkflowDto,
  RunOrchestratorWorkflowResponseDto,
  WorkflowRunResponseDto,
} from './dto/orchestrator-workflow.dto';

/**
 * Reverse of ADMIN_WORKFLOW_TYPE_MAP, so status responses translate internal
 * workflow types back into the public admin enum.
 */
const INTERNAL_TO_ADMIN_TYPE: Partial<
  Record<WorkflowType, AdminOrchestratorWorkflowType>
> = {
  BANK_IMPORT: AdminOrchestratorWorkflowType.BANK_IMPORT,
  MONTHLY_CLOSE: AdminOrchestratorWorkflowType.MONTH_END,
  GENERATE_VAT201: AdminOrchestratorWorkflowType.TAX_SUBMISSION,
};

@Controller('admin/orchestrator')
@ApiTags('Admin - Orchestrator')
@ApiBearerAuth('JWT-auth')
export class OrchestratorAdminController {
  private readonly logger = new Logger(OrchestratorAdminController.name);

  constructor(
    private readonly orchestrator: OrchestratorAgent,
    private readonly workflowRuns: WorkflowRunRepository,
  ) {}

  @Post('workflows/:workflowType/run')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiParam({
    name: 'workflowType',
    enum: AdminOrchestratorWorkflowType,
    description: 'Public workflow type to execute',
  })
  @ApiOperation({
    summary: 'Run an orchestrator workflow for a tenant',
    description:
      'Triggers OrchestratorAgent.executeWorkflow synchronously and returns the persisted workflow_runs id + final status. ' +
      'Because the underlying workflow blocks on external agents (categorizer, matcher, SARS), callers should treat this as a long-running request; consider polling the status endpoint instead when possible. ' +
      'Rollout gate: SUPER_ADMIN only. No tenant auto-opt-in — you must specify the tenant.',
  })
  @ApiResponse({
    status: 202,
    description: 'Workflow completed / escalated / failed — check `status`.',
    type: RunOrchestratorWorkflowResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async runWorkflow(
    @Param('workflowType') workflowTypeParam: string,
    @Body() dto: RunOrchestratorWorkflowDto,
  ): Promise<RunOrchestratorWorkflowResponseDto> {
    // We hand-validate the path param instead of relying on a pipe: NestJS
    // doesn't run class-validator on primitive :params, and a route-level
    // @IsEnum ValidationPipe would require wiring a whole DTO for one field.
    const adminType = this.parseWorkflowType(workflowTypeParam);
    const internalType = ADMIN_WORKFLOW_TYPE_MAP[adminType];
    const runId = uuidv4();

    this.logger.log(
      `SUPER_ADMIN triggered ${adminType} (internal=${internalType}) for tenant ${dto.tenantId} — runId=${runId}`,
    );

    // Create the row up-front so a caller who polls `GET runs/:runId`
    // between the enqueue and the first agent step still sees RUNNING.
    await this.workflowRuns.create({
      id: runId,
      tenantId: dto.tenantId,
      workflowType: internalType,
      triggeredBy: 'admin-api',
      input: dto.context,
    });

    const result = await this.orchestrator.executeWorkflow(
      {
        type: internalType,
        tenantId: dto.tenantId,
        parameters: dto.context ?? {},
      },
      { runId, triggeredBy: 'admin-api' },
    );

    // Re-read the persisted row so the status the caller sees is the same
    // one the status endpoint will return — no drift between execute() and
    // persistFinalRun() semantics.
    const persisted = await this.workflowRuns.findById(runId);
    return {
      runId,
      status: persisted?.status ?? this.mapResultStatus(result.status),
      workflowType: adminType,
      tenantId: dto.tenantId,
      startedAt: persisted?.startedAt.toISOString() ?? result.startedAt,
      completedAt:
        persisted?.completedAt?.toISOString() ?? result.completedAt ?? null,
    };
  }

  @Get('workflows/runs/:runId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Fetch a persisted workflow run by id' })
  @ApiResponse({ status: 200, type: WorkflowRunResponseDto })
  @ApiNotFoundResponse({ description: 'No workflow run with that id' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async getWorkflowRun(
    @Param('runId') runId: string,
  ): Promise<WorkflowRunResponseDto> {
    const record = await this.workflowRuns.findById(runId);
    if (!record) {
      throw new NotFoundException(`Workflow run ${runId} not found`);
    }
    return this.toResponse(record);
  }

  @Get('workflows/runs')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List recent workflow runs',
    description:
      'Returns the newest runs across all tenants (or one tenant, when tenantId is supplied) ordered by startedAt desc. Capped at 200 per page.',
  })
  @ApiResponse({ status: 200, type: [WorkflowRunResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async listWorkflowRuns(
    @Query() query: ListWorkflowRunsQueryDto,
  ): Promise<WorkflowRunResponseDto[]> {
    const records = await this.workflowRuns.list({
      tenantId: query.tenantId,
      workflowType: query.workflowType
        ? ADMIN_WORKFLOW_TYPE_MAP[query.workflowType]
        : undefined,
      limit: query.limit,
      offset: query.offset,
    });
    return records.map((r) => this.toResponse(r));
  }

  private parseWorkflowType(value: string): AdminOrchestratorWorkflowType {
    const valid = Object.values(AdminOrchestratorWorkflowType) as string[];
    if (valid.includes(value)) {
      return value as AdminOrchestratorWorkflowType;
    }
    throw new NotFoundException(
      `Unknown workflow type "${value}". Expected one of: BANK_IMPORT, MONTH_END, TAX_SUBMISSION.`,
    );
  }

  private toResponse(record: WorkflowRunRecord): WorkflowRunResponseDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      workflowType:
        INTERNAL_TO_ADMIN_TYPE[record.workflowType as WorkflowType] ??
        record.workflowType,
      status: record.status,
      triggeredBy: record.triggeredBy,
      currentStep: record.currentStep,
      input: record.input,
      output: record.output,
      error: record.error,
      escalatedTo: record.escalatedTo,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Fallback mapping used only when the workflow_runs row cannot be re-read
   * (Prisma unavailable in a degraded environment). Mirrors
   * OrchestratorAgent.mapResultToRunStatus so the response shape doesn't
   * depend on whether the persistence write succeeded.
   */
  private mapResultStatus(status: string): string {
    if (status === 'FAILED') return 'FAILED';
    if (status === 'COMPLETED') return 'COMPLETED';
    return 'AWAITING_ESCALATION';
  }
}
