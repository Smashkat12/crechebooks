/**
 * OrchestratorScheduleService unit tests.
 *
 * Covers the rollout-critical behaviours:
 *   - Only tenants with orchestrator_month_end_enabled=true AND
 *     subscriptionStatus=ACTIVE are enqueued (default OFF).
 *   - Per-tenant + per-month jobId — Bull dedup prevents double-run.
 *   - A single-tenant enqueue failure doesn't halt the batch.
 *   - Prior-month periodMonth is computed correctly at the SAST boundary.
 */

import type { Queue } from 'bull';
import { OrchestratorScheduleService } from '../../src/scheduler/orchestrator-schedule.service';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { WorkflowRunRepository } from '../../src/agents/orchestrator/workflow-run.repository';

function makeQueue(): jest.Mocked<Queue> {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-x' }),
  } as unknown as jest.Mocked<Queue>;
}

function makePrisma(tenants: Array<{ id: string; name: string }>) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants),
    },
  } as unknown as PrismaService;
}

function makeRepo(): jest.Mocked<WorkflowRunRepository> {
  return {
    create: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  } as unknown as jest.Mocked<WorkflowRunRepository>;
}

describe('OrchestratorScheduleService', () => {
  it('is a no-op when no tenants have opted in', async () => {
    const queue = makeQueue();
    const prisma = makePrisma([]);
    const repo = makeRepo();
    const svc = new OrchestratorScheduleService(queue, prisma, repo);

    await svc.enqueueMonthlyMonthEnd();

    expect(queue.add).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('scopes the tenant query to ACTIVE + orchestratorMonthEndEnabled=true', async () => {
    const queue = makeQueue();
    const prisma = makePrisma([{ id: 't1', name: 'Elle Elephant' }]);
    const repo = makeRepo();
    const svc = new OrchestratorScheduleService(queue, prisma, repo);

    await svc.enqueueMonthlyMonthEnd();

    const where = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0]
      .where as Record<string, unknown>;
    expect(where).toEqual(
      expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        orchestratorMonthEndEnabled: true,
      }),
    );
  });

  it('pre-creates the workflow_runs row before enqueueing the Bull job', async () => {
    const queue = makeQueue();
    const prisma = makePrisma([{ id: 't1', name: 'Elle Elephant' }]);
    const repo = makeRepo();
    const svc = new OrchestratorScheduleService(queue, prisma, repo);

    // Record call ordering by peeking at when each mock was invoked.
    const order: string[] = [];
    repo.create.mockImplementation(async () => {
      order.push('create');
      return null;
    });
    (queue.add as jest.Mock).mockImplementation(async () => {
      order.push('add');
      return { id: 'job' };
    });

    await svc.enqueueMonthlyMonthEnd();

    expect(order).toEqual(['create', 'add']);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        workflowType: 'MONTHLY_CLOSE',
        triggeredBy: 'cron-month-end',
      }),
    );
  });

  it('uses a per-tenant + per-month jobId for Bull dedup', async () => {
    const queue = makeQueue();
    const prisma = makePrisma([{ id: 't1', name: 'Elle Elephant' }]);
    const svc = new OrchestratorScheduleService(queue, prisma, makeRepo());

    await svc.enqueueMonthlyMonthEnd();

    const opts = (queue.add as jest.Mock).mock.calls[0][1] as {
      jobId: string;
    };
    // Shape: {queueName}:{tenantId}:{YYYY-MM}
    expect(opts.jobId).toMatch(/^orchestrator-workflow:t1:\d{4}-\d{2}$/);
  });

  it('continues after a single-tenant enqueue failure', async () => {
    const queue = makeQueue();
    (queue.add as jest.Mock)
      .mockRejectedValueOnce(new Error('redis blip'))
      .mockResolvedValueOnce({ id: 'job-2' });
    const prisma = makePrisma([
      { id: 't1', name: 'Broken Tenant' },
      { id: 't2', name: 'Working Tenant' },
    ]);
    const svc = new OrchestratorScheduleService(queue, prisma, makeRepo());

    await svc.enqueueMonthlyMonthEnd();

    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('targets the prior calendar month (SAST-anchored)', async () => {
    // Freeze time to 2026-07-05 06:00 SAST (UTC+2) — the cron trigger.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T04:00:00Z'));

    const queue = makeQueue();
    const prisma = makePrisma([{ id: 't1', name: 'Elle Elephant' }]);
    const svc = new OrchestratorScheduleService(queue, prisma, makeRepo());

    await svc.enqueueMonthlyMonthEnd();

    const opts = (queue.add as jest.Mock).mock.calls[0][1] as {
      jobId: string;
    };
    // Prior month = 2026-06
    expect(opts.jobId).toBe('orchestrator-workflow:t1:2026-06');

    jest.useRealTimers();
  });
});
