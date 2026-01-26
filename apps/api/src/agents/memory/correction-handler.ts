/**
 * Correction Handler
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 * TASK-STUB-004: FeedbackLoop Real Integration
 *
 * @module agents/memory/correction-handler
 * @description Handles user corrections to agent decisions.
 * Delegates to AgentMemoryService.recordCorrection and runs
 * RealFeedbackLoop to propagate corrections to learning subsystems.
 *
 * CRITICAL RULES:
 * - Non-blocking feedback loop execution (.catch() pattern)
 * - Graceful error handling (never throws to caller)
 * - Tenant isolation enforced by downstream services
 * - Works without RealFeedbackLoop (Optional injection)
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { AgentMemoryService } from './agent-memory.service';
import { RealFeedbackLoop } from './real-feedback-loop';
import type {
  RecordCorrectionParams,
  PatternLearnResult,
} from './interfaces/agent-memory.interface';

@Injectable()
export class CorrectionHandler {
  private readonly logger = new Logger(CorrectionHandler.name);

  constructor(
    @Inject(AgentMemoryService)
    private readonly memoryService: AgentMemoryService,
    @Optional()
    @Inject(RealFeedbackLoop)
    private readonly feedbackLoop?: RealFeedbackLoop,
  ) {}

  /**
   * Handle a user correction to an agent decision.
   * Delegates to memory service and runs feedback loop.
   */
  async handleCorrection(
    params: RecordCorrectionParams,
  ): Promise<PatternLearnResult> {
    let result: PatternLearnResult;

    try {
      result = await this.memoryService.recordCorrection(params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`recordCorrection failed: ${msg}`);
      result = { patternCreated: false, reason: `Correction failed: ${msg}` };
    }

    // Run real feedback loop (non-blocking)
    if (this.feedbackLoop) {
      this.feedbackLoop
        .processFeedback({
          tenantId: params.tenantId,
          agentDecisionId: params.agentDecisionId,
          originalValue: params.originalValue,
          correctedValue: params.correctedValue,
          correctedBy: params.correctedBy,
          reason: params.reason,
          patternResult: result,
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Feedback loop failed: ${msg}`);
        });
    }

    return result;
  }
}
