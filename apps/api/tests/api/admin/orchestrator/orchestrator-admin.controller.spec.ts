/**
 * OrchestratorAdminController unit tests.
 *
 * Focused on:
 *   - The public → internal workflow-type mapping (BANK_IMPORT / MONTH_END /
 *     TAX_SUBMISSION → BANK_IMPORT / MONTHLY_CLOSE / GENERATE_VAT201).
 *   - Pre-creating the workflow_runs row before executeWorkflow, so a status
 *     poll during the race window doesn't 404.
 *   - Passing the reused runId + triggeredBy='admin-api' into OrchestratorAgent.
 *   - 404 semantics for unknown workflow types and missing run ids.
 *
 * Guard behaviour (SUPER_ADMIN gating, TenantGuard bypass) is enforced by
 * the global RolesGuard + @Roles decorator, exercised in an integration
 * layer — this spec assumes the guard has already admitted the request.
 */

import { NotFoundException } from '@nestjs/common';
import { WorkflowRunStatus } from '@prisma/client';
import { OrchestratorAdminController } from '../../../../src/api/admin/orchestrator/orchestrator-admin.controller';
import type { OrchestratorAgent } from '../../../../src/agents/orchestrator/orchestrator.agent';
import type { WorkflowRunRepository } from '../../../../src/agents/orchestrator/workflow-run.repository';
import { AdminOrchestratorWorkflowType } from '../../../../src/api/admin/orchestrator/dto/orchestrator-workflow.dto';

const tenantId = 'bdff4374-64d5-420c-b454-8e85e9df552a';

function makeRepo(): jest.Mocked<WorkflowRunRepository> {
  return {
    create: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<WorkflowRunRepository>;
}

function makeOrchestrator(): jest.Mocked<OrchestratorAgent> {
  return {
    executeWorkflow: jest.fn().mockResolvedValue({
      workflowId: 'ignored-by-controller',
      type: 'BANK_IMPORT',
      status: 'COMPLETED',
      autonomyLevel: 'L3_FULL_AUTO',
      results: [],
      escalations: [],
      startedAt: '2026-07-05T06:00:00.000Z',
      completedAt: '2026-07-05T06:00:03.000Z',
    }),
    getEscalationSummary: jest.fn(),
    hasCriticalEscalations: jest.fn(),
  } as unknown as jest.Mocked<OrchestratorAgent>;
}

describe('OrchestratorAdminController', () => {
  describe('POST /admin/orchestrator/workflows/:type/run', () => {
    it('maps MONTH_END to MONTHLY_CLOSE and threads a fresh runId through', async () => {
      const orchestrator = makeOrchestrator();
      const repo = makeRepo();
      repo.findById.mockResolvedValueOnce({
        id: 'stub',
        tenantId,
        workflowType: 'MONTHLY_CLOSE',
        status: WorkflowRunStatus.AWAITING_ESCALATION,
        triggeredBy: 'admin-api',
        currentStep: null,
        input: null,
        output: null,
        error: null,
        escalatedTo: null,
        startedAt: new Date('2026-07-05T06:00:00Z'),
        completedAt: new Date('2026-07-05T06:00:03Z'),
      });
      const controller = new OrchestratorAdminController(orchestrator, repo);

      const response = await controller.runWorkflow(
        AdminOrchestratorWorkflowType.MONTH_END,
        { tenantId, context: { periodMonth: '2026-06' } },
      );

      // Row created up-front with the internal workflow type
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          workflowType: 'MONTHLY_CLOSE',
          triggeredBy: 'admin-api',
        }),
      );

      // executeWorkflow called with the internal type + reused runId
      expect(orchestrator.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MONTHLY_CLOSE',
          tenantId,
          parameters: { periodMonth: '2026-06' },
        }),
        expect.objectContaining({
          triggeredBy: 'admin-api',
          runId: expect.any(String),
        }),
      );

      expect(response.workflowType).toBe(
        AdminOrchestratorWorkflowType.MONTH_END,
      );
      expect(response.status).toBe(WorkflowRunStatus.AWAITING_ESCALATION);
      expect(response.tenantId).toBe(tenantId);
    });

    it('maps TAX_SUBMISSION to GENERATE_VAT201', async () => {
      const orchestrator = makeOrchestrator();
      const repo = makeRepo();
      const controller = new OrchestratorAdminController(orchestrator, repo);

      await controller.runWorkflow(
        AdminOrchestratorWorkflowType.TAX_SUBMISSION,
        {
          tenantId,
          context: {
            periodStart: '2026-06-01',
            periodEnd: '2026-06-30',
          },
        },
      );

      const call = repo.create.mock.calls[0][0] as { workflowType: string };
      expect(call.workflowType).toBe('GENERATE_VAT201');
    });

    it('404s with a helpful message for unknown workflow types', async () => {
      const controller = new OrchestratorAdminController(
        makeOrchestrator(),
        makeRepo(),
      );
      await expect(
        controller.runWorkflow('OBLITERATE_TENANT', {
          tenantId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('falls back to result-status mapping if repo re-read fails', async () => {
      // When Prisma returns null on the re-read (persistence blip) the
      // controller shouldn't 500 — it should synthesise a status from the
      // executeWorkflow return value.
      const orchestrator = makeOrchestrator();
      orchestrator.executeWorkflow.mockResolvedValueOnce({
        workflowId: 'x',
        type: 'BANK_IMPORT',
        status: 'FAILED',
        autonomyLevel: 'L3_FULL_AUTO',
        results: [],
        escalations: [],
        startedAt: '2026-07-05T06:00:00.000Z',
        completedAt: '2026-07-05T06:00:03.000Z',
      });
      const repo = makeRepo();
      repo.findById.mockResolvedValueOnce(null);
      const controller = new OrchestratorAdminController(orchestrator, repo);

      const response = await controller.runWorkflow(
        AdminOrchestratorWorkflowType.BANK_IMPORT,
        { tenantId },
      );
      expect(response.status).toBe('FAILED');
    });
  });

  describe('GET /admin/orchestrator/workflows/runs/:runId', () => {
    it('returns the persisted run mapped to the public workflow type', async () => {
      const repo = makeRepo();
      repo.findById.mockResolvedValueOnce({
        id: 'run-1',
        tenantId,
        workflowType: 'BANK_IMPORT',
        status: WorkflowRunStatus.COMPLETED,
        triggeredBy: 'admin-api',
        currentStep: null,
        input: null,
        output: { processed: 3 },
        error: null,
        escalatedTo: null,
        startedAt: new Date('2026-07-05T06:00:00Z'),
        completedAt: new Date('2026-07-05T06:00:03Z'),
      });
      const controller = new OrchestratorAdminController(
        makeOrchestrator(),
        repo,
      );

      const response = await controller.getWorkflowRun('run-1');

      expect(response.workflowType).toBe(
        AdminOrchestratorWorkflowType.BANK_IMPORT,
      );
      expect(response.status).toBe(WorkflowRunStatus.COMPLETED);
      expect(response.output).toEqual({ processed: 3 });
    });

    it('404s when the run does not exist', async () => {
      const repo = makeRepo();
      repo.findById.mockResolvedValueOnce(null);
      const controller = new OrchestratorAdminController(
        makeOrchestrator(),
        repo,
      );
      await expect(controller.getWorkflowRun('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /admin/orchestrator/workflows/runs', () => {
    it('translates the public workflow-type filter into the internal type before querying', async () => {
      const repo = makeRepo();
      const controller = new OrchestratorAdminController(
        makeOrchestrator(),
        repo,
      );

      await controller.listWorkflowRuns({
        tenantId,
        workflowType: AdminOrchestratorWorkflowType.MONTH_END,
        limit: 10,
      });

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          workflowType: 'MONTHLY_CLOSE',
          limit: 10,
        }),
      );
    });

    it('returns internal workflow types translated back to public names', async () => {
      const repo = makeRepo();
      repo.list.mockResolvedValueOnce([
        {
          id: 'run-1',
          tenantId,
          workflowType: 'MONTHLY_CLOSE',
          status: WorkflowRunStatus.RUNNING,
          triggeredBy: 'cron-month-end',
          currentStep: 'categorize',
          input: { periodMonth: '2026-06' },
          output: null,
          error: null,
          escalatedTo: null,
          startedAt: new Date(),
          completedAt: null,
        },
      ]);
      const controller = new OrchestratorAdminController(
        makeOrchestrator(),
        repo,
      );

      const response = await controller.listWorkflowRuns({});
      expect(response[0].workflowType).toBe(
        AdminOrchestratorWorkflowType.MONTH_END,
      );
    });
  });
});
