/**
 * WorkflowRun Repository
 *
 * @module agents/orchestrator/workflow-run.repository
 * @description Persistence for OrchestratorAgent workflow invocations. The
 * orchestrator was previously fire-and-forget with a JSON-line log on the
 * container filesystem (ephemeral on Railway); this repository lifts that
 * into the database so operators can inspect current state, replay history,
 * and gate month-end automation on a per-tenant basis.
 *
 * All methods are Prisma-optional (`@Optional()` inject at the caller) —
 * every write is a defensive no-op if the client is missing, matching the
 * pattern used by AuditTrailService.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Prisma, WorkflowRunStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * How a run was triggered. Kept as a string in the DB (VARCHAR) so we can
 * add sources without a migration; this type documents the vocabulary.
 */
export type WorkflowRunTriggeredBy =
  | 'admin-api'
  | 'cron-month-end'
  | 'scheduler-job'
  | 'internal';

export interface CreateWorkflowRunInput {
  id: string;
  tenantId: string;
  workflowType: string;
  triggeredBy: WorkflowRunTriggeredBy;
  input?: Record<string, unknown>;
}

export interface UpdateWorkflowRunInput {
  status?: WorkflowRunStatus;
  currentStep?: string | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  escalatedTo?: string | null;
  completedAt?: Date;
}

export interface ListWorkflowRunsFilters {
  tenantId?: string;
  workflowType?: string;
  status?: WorkflowRunStatus;
  limit?: number;
  offset?: number;
}

/**
 * Read model returned to callers — mirrors the Prisma model with `input` and
 * `output` narrowed away from `Prisma.JsonValue` to `Record<string, unknown>`
 * so consumers don't need to widen types at every call-site.
 */
export interface WorkflowRunRecord {
  id: string;
  tenantId: string;
  workflowType: string;
  status: WorkflowRunStatus;
  triggeredBy: string;
  currentStep: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  escalatedTo: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

@Injectable()
export class WorkflowRunRepository {
  private readonly logger = new Logger(WorkflowRunRepository.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
  ) {}

  /**
   * Create a workflow_runs row at the very start of executeWorkflow. Uses
   * a caller-supplied ID so the orchestrator's existing workflowId (already
   * threaded through logging + audit trail) doubles as the DB row id.
   */
  async create(input: CreateWorkflowRunInput): Promise<WorkflowRunRecord | null> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — skipping WorkflowRun.create');
      return null;
    }

    try {
      const row = await this.prisma.workflowRun.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          workflowType: input.workflowType,
          triggeredBy: input.triggeredBy,
          status: WorkflowRunStatus.RUNNING,
          input: (input.input ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
      return this.toRecord(row);
    } catch (error) {
      this.logger.warn(
        `Failed to create workflow run ${input.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Non-blocking update. Never throws — the orchestrator MUST continue
   * even if the repository write fails, so the workflow itself never
   * regresses on a database blip.
   */
  async update(id: string, patch: UpdateWorkflowRunInput): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — skipping WorkflowRun.update');
      return;
    }

    try {
      await this.prisma.workflowRun.update({
        where: { id },
        data: {
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.currentStep !== undefined && {
            currentStep: patch.currentStep,
          }),
          ...(patch.output !== undefined && {
            output: (patch.output ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          }),
          ...(patch.error !== undefined && { error: patch.error }),
          ...(patch.escalatedTo !== undefined && {
            escalatedTo: patch.escalatedTo,
          }),
          ...(patch.completedAt !== undefined && {
            completedAt: patch.completedAt,
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update workflow run ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findById(id: string): Promise<WorkflowRunRecord | null> {
    if (!this.prisma) return null;

    try {
      const row = await this.prisma.workflowRun.findUnique({ where: { id } });
      return row ? this.toRecord(row) : null;
    } catch (error) {
      this.logger.warn(
        `Failed to find workflow run ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async list(filters: ListWorkflowRunsFilters): Promise<WorkflowRunRecord[]> {
    if (!this.prisma) return [];

    const where: Prisma.WorkflowRunWhereInput = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.workflowType) where.workflowType = filters.workflowType;
    if (filters.status) where.status = filters.status;

    // Cap upper bound so a stray `limit=100000` from an admin call can't
    // hammer the DB. 200 comfortably covers "recent runs" UIs.
    const take = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const skip = Math.max(filters.offset ?? 0, 0);

    try {
      const rows = await this.prisma.workflowRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take,
        skip,
      });
      return rows.map((r) => this.toRecord(r));
    } catch (error) {
      this.logger.warn(
        `Failed to list workflow runs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    workflowType: string;
    status: WorkflowRunStatus;
    triggeredBy: string;
    currentStep: string | null;
    input: Prisma.JsonValue | null;
    output: Prisma.JsonValue | null;
    error: string | null;
    escalatedTo: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }): WorkflowRunRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      workflowType: row.workflowType,
      status: row.status,
      triggeredBy: row.triggeredBy,
      currentStep: row.currentStep,
      input: row.input as Record<string, unknown> | null,
      output: row.output as Record<string, unknown> | null,
      error: row.error,
      escalatedTo: row.escalatedTo,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    };
  }
}
