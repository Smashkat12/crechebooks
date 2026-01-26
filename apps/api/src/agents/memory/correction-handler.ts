/**
 * Correction Handler
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * @module agents/memory/correction-handler
 * @description Handles user corrections to agent decisions.
 * Delegates to AgentMemoryService.recordCorrection and runs
 * agentic-flow feedback loop stub.
 *
 * CRITICAL RULES:
 * - Non-blocking feedback loop execution
 * - Graceful error handling (never throws to caller)
 * - Tenant isolation enforced by downstream services
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentMemoryService } from './agent-memory.service';
import type {
  RecordCorrectionParams,
  PatternLearnResult,
} from './interfaces/agent-memory.interface';

// ────────────────────────────────────────────────────────────────────
// Local stub: agentic-flow feedback loop doesn't exist yet
// ────────────────────────────────────────────────────────────────────

class FeedbackLoopStub {
  async processFeedback(_data: Record<string, unknown>): Promise<void> {
    /* stub — forward-compatible with future agentic-flow feedback integration */
  }
}

@Injectable()
export class CorrectionHandler {
  private readonly logger = new Logger(CorrectionHandler.name);
  private readonly feedbackLoop = new FeedbackLoopStub();

  constructor(
    @Inject(AgentMemoryService)
    private readonly memoryService: AgentMemoryService,
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

    // Run feedback loop stub (non-blocking)
    this.feedbackLoop
      .processFeedback({
        tenantId: params.tenantId,
        agentDecisionId: params.agentDecisionId,
        correctedValue: params.correctedValue,
        patternResult: result,
      })
      .catch((err: Error) => {
        this.logger.warn(`Feedback loop failed: ${err.message}`);
      });

    return result;
  }
}
