/**
 * OrchestratorWorkflowProcessor unit tests.
 *
 * The processor is a thin adapter — it maps ScheduledJobData.triggeredBy
 * onto WorkflowRunTriggeredBy and delegates to OrchestratorAgent. The two
 * behaviours worth exercising are:
 *   1. runId + parameters flow through into executeWorkflow unchanged.
 *   2. An exception from executeWorkflow doesn't escape (Bull would retry;
 *      the workflow_runs row is already FAILED, so retries produce noise).
 */

import type { Job } from 'bull';
import { OrchestratorWorkflowProcessor } from '../../../src/scheduler/processors/orchestrator-workflow.processor';
import type { OrchestratorAgent } from '../../../src/agents/orchestrator/orchestrator.agent';
import type { OrchestratorWorkflowJobData } from '../../../src/scheduler/types/scheduler.types';

function makeJob(data: Partial<OrchestratorWorkflowJobData> = {}) {
  return {
    id: 'job-1',
    data: {
      tenantId: 'tenant-1',
      triggeredBy: 'cron',
      scheduledAt: new Date(),
      workflowType: 'MONTHLY_CLOSE',
      parameters: { periodMonth: '2026-06' },
      runId: 'run-1',
      ...data,
    } as OrchestratorWorkflowJobData,
  } as Job<OrchestratorWorkflowJobData>;
}

function makeAgent(): jest.Mocked<OrchestratorAgent> {
  return {
    executeWorkflow: jest.fn().mockResolvedValue({
      workflowId: 'run-1',
      type: 'MONTHLY_CLOSE',
      status: 'AWAITING_ESCALATION',
      autonomyLevel: 'L2_DRAFT',
      results: [],
      escalations: [],
      startedAt: '',
      completedAt: '',
    }),
    getEscalationSummary: jest.fn(),
    hasCriticalEscalations: jest.fn(),
  } as unknown as jest.Mocked<OrchestratorAgent>;
}

describe('OrchestratorWorkflowProcessor', () => {
  it('delegates to OrchestratorAgent with runId + triggeredBy=cron-month-end', async () => {
    const agent = makeAgent();
    const processor = new OrchestratorWorkflowProcessor(agent);

    await processor.processJob(makeJob());

    expect(agent.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MONTHLY_CLOSE',
        tenantId: 'tenant-1',
        parameters: { periodMonth: '2026-06' },
      }),
      expect.objectContaining({
        runId: 'run-1',
        triggeredBy: 'cron-month-end',
      }),
    );
  });

  it('maps manual scheduled-job trigger onto scheduler-job triggeredBy', async () => {
    const agent = makeAgent();
    const processor = new OrchestratorWorkflowProcessor(agent);

    await processor.processJob(makeJob({ triggeredBy: 'event' }));

    expect(agent.executeWorkflow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ triggeredBy: 'scheduler-job' }),
    );
  });

  it('does not re-throw when the orchestrator throws (no Bull retry)', async () => {
    const agent = makeAgent();
    agent.executeWorkflow.mockRejectedValueOnce(new Error('agent boom'));
    const processor = new OrchestratorWorkflowProcessor(agent);

    await expect(processor.processJob(makeJob())).resolves.toBeUndefined();
  });

  it('defaults parameters to {} when the job carries none', async () => {
    const agent = makeAgent();
    const processor = new OrchestratorWorkflowProcessor(agent);

    await processor.processJob(makeJob({ parameters: undefined }));

    const call = agent.executeWorkflow.mock.calls[0][0];
    expect(call.parameters).toEqual({});
  });
});
