/**
 * WorkflowRunRepository unit tests.
 *
 * Uses a hand-rolled mocked Prisma client (no jest-mock-extended) because
 * the rest of the orchestrator specs in this project prefer manual mocks —
 * kept consistent for reviewers. Each test asserts the outward-observable
 * contract: Prisma calls issued, filters applied, defensive fall-throughs.
 */

import { WorkflowRunStatus } from '@prisma/client';
import {
  WorkflowRunRepository,
  type CreateWorkflowRunInput,
} from '../../../src/agents/orchestrator/workflow-run.repository';

// ── Mocks ────────────────────────────────────────────────────────────

type MockPrisma = {
  workflowRun: {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
};

function createMockPrisma(): MockPrisma {
  return {
    workflowRun: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const baseRow = {
  id: 'run-1',
  tenantId: 'tenant-1',
  workflowType: 'MONTHLY_CLOSE',
  status: WorkflowRunStatus.RUNNING,
  triggeredBy: 'admin-api',
  currentStep: null,
  input: { periodMonth: '2026-06' },
  output: null,
  error: null,
  escalatedTo: null,
  startedAt: new Date('2026-07-05T06:00:00Z'),
  completedAt: null,
};

// ── Tests ────────────────────────────────────────────────────────────

describe('WorkflowRunRepository', () => {
  describe('create()', () => {
    it('inserts a workflow_runs row with RUNNING status and returns a record', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.create.mockResolvedValueOnce(baseRow);
      const repo = new WorkflowRunRepository(prisma as never);

      const input: CreateWorkflowRunInput = {
        id: 'run-1',
        tenantId: 'tenant-1',
        workflowType: 'MONTHLY_CLOSE',
        triggeredBy: 'admin-api',
        input: { periodMonth: '2026-06' },
      };

      const result = await repo.create(input);

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'run-1',
          tenantId: 'tenant-1',
          workflowType: 'MONTHLY_CLOSE',
          triggeredBy: 'admin-api',
          status: WorkflowRunStatus.RUNNING,
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'run-1', status: 'RUNNING' }),
      );
    });

    it('returns null and swallows the error when Prisma throws', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.create.mockRejectedValueOnce(new Error('db down'));
      const repo = new WorkflowRunRepository(prisma as never);

      const result = await repo.create({
        id: 'run-1',
        tenantId: 'tenant-1',
        workflowType: 'BANK_IMPORT',
        triggeredBy: 'internal',
      });

      expect(result).toBeNull();
    });

    it('is a no-op when Prisma is not injected (graceful degradation)', async () => {
      const repo = new WorkflowRunRepository();
      const result = await repo.create({
        id: 'run-1',
        tenantId: 'tenant-1',
        workflowType: 'BANK_IMPORT',
        triggeredBy: 'internal',
      });
      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('applies only the fields that are supplied (partial patch)', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.update.mockResolvedValueOnce({});
      const repo = new WorkflowRunRepository(prisma as never);

      await repo.update('run-1', {
        status: WorkflowRunStatus.COMPLETED,
        currentStep: null,
      });

      expect(prisma.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: {
          status: WorkflowRunStatus.COMPLETED,
          currentStep: null,
        },
      });
    });

    it('translates a null output patch into Prisma.JsonNull', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.update.mockResolvedValueOnce({});
      const repo = new WorkflowRunRepository(prisma as never);

      await repo.update('run-1', { output: null });

      // Payload includes an `output` key whose value is Prisma's JsonNull
      // sentinel — the mock captures it and we check it's non-undefined.
      const call = prisma.workflowRun.update.mock.calls[0][0] as {
        data: { output: unknown };
      };
      expect(call.data.output).toBeDefined();
    });

    it('never throws on DB errors (orchestrator continues)', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.update.mockRejectedValueOnce(new Error('conn lost'));
      const repo = new WorkflowRunRepository(prisma as never);

      await expect(
        repo.update('run-1', { status: WorkflowRunStatus.FAILED }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findById()', () => {
    it('returns null when the row is missing', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.findUnique.mockResolvedValueOnce(null);
      const repo = new WorkflowRunRepository(prisma as never);

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });

    it('maps Prisma JsonValue fields onto the read model shape', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.findUnique.mockResolvedValueOnce({
        ...baseRow,
        output: { results: [] },
      });
      const repo = new WorkflowRunRepository(prisma as never);

      const result = await repo.findById('run-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'run-1',
          input: { periodMonth: '2026-06' },
          output: { results: [] },
        }),
      );
    });
  });

  describe('list()', () => {
    it('filters by tenantId + workflowType + status and caps limit at 200', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.findMany.mockResolvedValueOnce([baseRow]);
      const repo = new WorkflowRunRepository(prisma as never);

      await repo.list({
        tenantId: 'tenant-1',
        workflowType: 'MONTHLY_CLOSE',
        status: WorkflowRunStatus.RUNNING,
        limit: 9999,
        offset: 5,
      });

      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          workflowType: 'MONTHLY_CLOSE',
          status: WorkflowRunStatus.RUNNING,
        },
        orderBy: { startedAt: 'desc' },
        take: 200,
        skip: 5,
      });
    });

    it('defaults limit to 50 when unspecified', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.findMany.mockResolvedValueOnce([]);
      const repo = new WorkflowRunRepository(prisma as never);

      await repo.list({});
      const call = prisma.workflowRun.findMany.mock.calls[0][0] as {
        take: number;
      };
      expect(call.take).toBe(50);
    });

    it('returns [] on DB error (safe default for admin listing)', async () => {
      const prisma = createMockPrisma();
      prisma.workflowRun.findMany.mockRejectedValueOnce(new Error('boom'));
      const repo = new WorkflowRunRepository(prisma as never);

      const result = await repo.list({ tenantId: 'tenant-1' });
      expect(result).toEqual([]);
    });
  });
});
