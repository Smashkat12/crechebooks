/**
 * Orchestrator Workflow Processor
 *
 * @module scheduler/processors/orchestrator-workflow.processor
 * @description Bull consumer for ORCHESTRATOR_WORKFLOW jobs. Delegates to
 * OrchestratorAgent.executeWorkflow; the agent handles WorkflowRun persistence,
 * audit trail, shadow-runner gating, and escalation logging.
 *
 * Error contract: we catch and swallow non-fatal workflow failures so a
 * downstream agent blowing up cannot poison the queue. Bull's retry
 * mechanism is disabled at the job-data level (see attempts=1 below) — the
 * orchestrator already records FAILED on the WorkflowRun row, so a retry
 * would just produce duplicate work without clearing the underlying cause.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import {
  QUEUE_NAMES,
  OrchestratorWorkflowJobData,
} from '../types/scheduler.types';
import { OrchestratorAgent } from '../../agents/orchestrator/orchestrator.agent';
import type { WorkflowType } from '../../agents/orchestrator/interfaces/orchestrator.interface';
import type { WorkflowRunTriggeredBy } from '../../agents/orchestrator/workflow-run.repository';

@Injectable()
@Processor(QUEUE_NAMES.ORCHESTRATOR_WORKFLOW)
export class OrchestratorWorkflowProcessor extends BaseProcessor<OrchestratorWorkflowJobData> {
  protected readonly logger = new Logger(OrchestratorWorkflowProcessor.name);

  constructor(private readonly orchestrator: OrchestratorAgent) {
    super(QUEUE_NAMES.ORCHESTRATOR_WORKFLOW);
  }

  @Process()
  async processJob(job: Job<OrchestratorWorkflowJobData>): Promise<void> {
    const { tenantId, workflowType, parameters, runId, triggeredBy } = job.data;

    this.logger.log(
      `Processing orchestrator workflow ${workflowType} for tenant ${tenantId} (runId=${runId}, triggeredBy=${triggeredBy})`,
    );

    try {
      const result = await this.orchestrator.executeWorkflow(
        {
          type: workflowType as WorkflowType,
          tenantId,
          parameters: parameters ?? {},
        },
        {
          runId,
          triggeredBy: this.mapTriggeredBy(triggeredBy),
        },
      );

      this.logger.log(
        `Workflow ${runId} finished: status=${result.status}, ` +
          `escalations=${result.escalations.length}, ` +
          `results=${result.results.length}`,
      );
    } catch (err) {
      // OrchestratorAgent already writes FAILED to workflow_runs on any
      // exception in its own try/catch. Re-catching here is a defensive
      // extra — an unhandled throw from executeWorkflow would trigger
      // BaseProcessor.onFailed, which re-throws and lets Bull retry. We
      // do NOT want retries: the WorkflowRun is already marked FAILED, and
      // repeated retries would just produce duplicate audit noise.
      this.logger.error(
        `Workflow ${runId} threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private mapTriggeredBy(
    source: OrchestratorWorkflowJobData['triggeredBy'],
  ): WorkflowRunTriggeredBy {
    if (source === 'cron') return 'cron-month-end';
    if (source === 'manual') return 'admin-api';
    return 'scheduler-job';
  }
}
