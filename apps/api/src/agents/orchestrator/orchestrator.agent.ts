/**
 * Orchestrator Agent
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/orchestrator.agent
 * @description Main orchestrator that coordinates specialized agents:
 * - TransactionCategorizerAgent
 * - PaymentMatcherAgent
 * - SarsAgent
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - SARS workflows always L2 (require review)
 * - Transaction/Payment workflows use L3 for high confidence
 * - Tenant isolation on ALL operations
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TransactionCategorizerAgent } from '../transaction-categorizer/categorizer.agent';
import { PaymentMatcherAgent } from '../payment-matcher/matcher.agent';
import { SarsAgent } from '../sars-agent/sars.agent';
import { WorkflowRouter } from './workflow-router';
import { EscalationManager } from './escalation-manager';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  WorkflowRequest,
  WorkflowResult,
  OrchestratorDecisionLog,
} from './interfaces/orchestrator.interface';
import { SdkOrchestrator } from './sdk-orchestrator';
import { isMultiStepWorkflow } from './workflow-definitions';
import { AuditTrailService } from '../audit/audit-trail.service';
import { ShadowRunner } from '../rollout/shadow-runner';
import type { ComparisonResult } from '../rollout/interfaces/rollout.interface';

@Injectable()
export class OrchestratorAgent {
  private readonly logger = new Logger(OrchestratorAgent.name);
  private readonly decisionsPath = path.join(
    process.cwd(),
    '.claude/logs/decisions.jsonl',
  );

  constructor(
    private readonly transactionCategorizer: TransactionCategorizerAgent,
    private readonly paymentMatcher: PaymentMatcherAgent,
    private readonly sarsAgent: SarsAgent,
    private readonly workflowRouter: WorkflowRouter,
    private readonly escalationManager: EscalationManager,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(SdkOrchestrator)
    private readonly sdkOrchestrator?: SdkOrchestrator,
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrail?: AuditTrailService,
    @Optional()
    @Inject(ShadowRunner)
    private readonly shadowRunner?: ShadowRunner,
  ) {}

  /**
   * Execute a workflow with automatic agent routing
   *
   * @param request - Workflow request with type and parameters
   * @returns Workflow result with aggregated agent results
   */
  async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
    if (this.shadowRunner && this.sdkOrchestrator) {
      return this.shadowRunner.run<WorkflowResult>({
        tenantId: request.tenantId,
        agentType: 'orchestrator',
        sdkFn: () => this._executeWorkflowCore(request, false),
        heuristicFn: () => this._executeWorkflowCore(request, true),
        compareFn: (sdk: WorkflowResult, heuristic: WorkflowResult): ComparisonResult => ({
          tenantId: request.tenantId,
          agentType: 'orchestrator',
          sdkResult: sdk,
          heuristicResult: heuristic,
          sdkDurationMs: 0,
          heuristicDurationMs: 0,
          resultsMatch: sdk.status === heuristic.status,
          details: {
            sdkStatus: sdk.status,
            heuristicStatus: heuristic.status,
            sdkResultCount: sdk.results.length,
            heuristicResultCount: heuristic.results.length,
          },
        }),
      });
    }
    return this._executeWorkflowCore(request, false);
  }

  private async _executeWorkflowCore(request: WorkflowRequest, skipSdk: boolean): Promise<WorkflowResult> {
    const workflowId = uuidv4();
    const startedAt = new Date().toISOString();

    this.logger.log(
      `Starting workflow ${workflowId}: ${request.type} for tenant ${request.tenantId}`,
    );

    // TASK-SDK-011: Log workflow start (non-blocking)
    if (this.auditTrail) {
      this.auditTrail.logWorkflow({
        tenantId: request.tenantId,
        workflowId,
        eventType: 'WORKFLOW_START',
        details: { type: request.type, parameters: request.parameters },
      }).catch((err: Error) => this.logger.warn(`Audit workflow start failed: ${err.message}`));
    }

    // Log routing decision
    this.workflowRouter.logRoutingDecision(request.type, request.tenantId);

    const result: WorkflowResult = {
      workflowId,
      type: request.type,
      status: 'COMPLETED',
      autonomyLevel: this.workflowRouter.getAutonomyLevel(request.type),
      results: [],
      escalations: [],
      startedAt,
      completedAt: '',
    };

    try {
      // Try SDK orchestration for multi-step workflows (BANK_IMPORT, MONTHLY_CLOSE)
      if (!skipSdk && this.sdkOrchestrator && isMultiStepWorkflow(request.type)) {
        try {
          const sdkResult = await this.sdkOrchestrator.execute(request);
          if (sdkResult) {
            // SDK handled it - preserve our workflowId and startedAt
            sdkResult.workflowId = workflowId;
            sdkResult.startedAt = startedAt;
            // Still log escalations and decisions
            await this.escalationManager.logMultipleEscalations(
              workflowId,
              request.type,
              request.tenantId,
              sdkResult.escalations,
            );
            await this.logWorkflowDecision(sdkResult);
            return sdkResult;
          }
        } catch (sdkError) {
          this.logger.warn(
            `SDK orchestrator failed, falling back to sequential: ${sdkError instanceof Error ? sdkError.message : String(sdkError)}`,
          );
          // Fall through to existing sequential logic
        }
      }

      switch (request.type) {
        case 'CATEGORIZE_TRANSACTIONS':
          await this.executeCategorization(request, result);
          break;
        case 'MATCH_PAYMENTS':
          await this.executePaymentMatching(request, result);
          break;
        case 'CALCULATE_PAYE':
          await this.executePayeCalculation(request, result);
          break;
        case 'GENERATE_EMP201':
          await this.executeEmp201(request, result);
          break;
        case 'GENERATE_VAT201':
          await this.executeVat201(request, result);
          break;
        case 'BANK_IMPORT':
          // Categorize first, then match payments
          await this.executeCategorization(request, result);
          await this.executePaymentMatching(request, result);
          break;
        case 'MONTHLY_CLOSE':
          await this.executeMonthlyClose(request, result);
          break;
        default:
          throw new Error(`Unknown workflow type: ${String(request.type)}`);
      }
    } catch (error) {
      result.status = 'FAILED';
      result.escalations.push({
        type: 'WORKFLOW_ERROR',
        reason: error instanceof Error ? error.message : String(error),
        details: { stack: error instanceof Error ? error.stack : undefined },
      });
      this.logger.error(
        `Workflow ${workflowId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    result.completedAt = new Date().toISOString();

    // Determine final status
    if (result.status !== 'FAILED') {
      if (
        result.escalations.length > 0 ||
        result.results.some((r) => r.escalated > 0)
      ) {
        result.status = 'ESCALATED';
      } else if (result.results.some((r) => r.errors > 0)) {
        result.status = 'PARTIAL';
      }
    }

    // Log all escalations
    await this.escalationManager.logMultipleEscalations(
      workflowId,
      request.type,
      request.tenantId,
      result.escalations,
    );

    // Log workflow decision
    await this.logWorkflowDecision(result);

    // TASK-SDK-011: Log workflow end (non-blocking)
    if (this.auditTrail) {
      const durationMs = Date.now() - new Date(startedAt).getTime();
      this.auditTrail.logWorkflow({
        tenantId: request.tenantId,
        workflowId,
        eventType: 'WORKFLOW_END',
        details: { type: request.type, status: result.status, resultCount: result.results.length },
        durationMs,
      }).catch((err: Error) => this.logger.warn(`Audit workflow end failed: ${err.message}`));
    }

    this.logger.log(
      `Workflow ${workflowId} completed: ${result.status} ` +
        `(processed: ${result.results.reduce((s, r) => s + r.processed, 0)}, ` +
        `auto-applied: ${result.results.reduce((s, r) => s + r.autoApplied, 0)}, ` +
        `escalated: ${result.results.reduce((s, r) => s + r.escalated, 0)})`,
    );

    return result;
  }

  /**
   * Execute transaction categorization
   */
  private async executeCategorization(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId: request.tenantId,
        status: 'PENDING',
        isDeleted: false,
      },
    });

    let autoApplied = 0;
    let escalated = 0;
    let errors = 0;

    for (const tx of transactions) {
      try {
        const catResult = await this.transactionCategorizer.categorize(
          tx,
          request.tenantId,
        );

        if (catResult.autoApplied) {
          autoApplied++;
        } else {
          escalated++;
          result.escalations.push({
            type: 'LOW_CONFIDENCE_CATEGORIZATION',
            reason: catResult.reasoning,
            details: {
              transactionId: tx.id,
              confidence: catResult.confidenceScore,
              accountCode: catResult.accountCode,
            },
          });
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Failed to categorize transaction ${tx.id}: ${error}`,
        );
      }
    }

    result.results.push({
      agent: 'transaction-categorizer',
      processed: transactions.length,
      autoApplied,
      escalated,
      errors,
    });
  }

  /**
   * Execute payment matching
   */
  private async executePaymentMatching(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    // Get credit transactions that haven't been allocated
    const credits = await this.prisma.transaction.findMany({
      where: {
        tenantId: request.tenantId,
        isCredit: true,
        status: { in: ['PENDING', 'CATEGORIZED'] },
        isDeleted: false,
      },
    });

    let autoApplied = 0;
    let escalated = 0;
    let errors = 0;

    for (const tx of credits) {
      try {
        const candidates = await this.paymentMatcher.findCandidates(
          tx,
          request.tenantId,
        );

        const decision = await this.paymentMatcher.makeMatchDecision(
          tx,
          candidates,
          request.tenantId,
        );

        if (decision.action === 'AUTO_APPLY') {
          autoApplied++;
        } else if (decision.action === 'REVIEW_REQUIRED') {
          escalated++;
          result.escalations.push({
            type: 'PAYMENT_MATCH',
            reason: decision.reasoning,
            details: {
              transactionId: tx.id,
              confidence: decision.confidence,
              invoiceId: decision.invoiceId,
              alternatives: decision.alternatives?.length || 0,
            },
          });
        }
        // NO_MATCH doesn't count as escalation unless explicitly needed
      } catch (error) {
        errors++;
        this.logger.error(`Failed to match payment ${tx.id}: ${error}`);
      }
    }

    result.results.push({
      agent: 'payment-matcher',
      processed: credits.length,
      autoApplied,
      escalated,
      errors,
    });
  }

  /**
   * Execute PAYE calculation
   */
  private async executePayeCalculation(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    const params = request.parameters as {
      grossIncomeCents: number;
      payFrequency: 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY';
      dateOfBirth: Date;
      medicalAidMembers: number;
      period: string;
    };

    const decision = await this.sarsAgent.calculatePayeForReview({
      tenantId: request.tenantId,
      ...params,
    });

    // SARS is always escalated
    result.results.push({
      agent: 'sars-agent',
      processed: 1,
      autoApplied: 0,
      escalated: 1,
      errors: 0,
    });

    result.escalations.push({
      type: 'SARS_PAYE',
      reason: 'PAYE calculation requires human review',
      details: {
        amountCents: decision.calculatedAmountCents,
        period: decision.period,
      },
    });
  }

  /**
   * Execute EMP201 generation
   */
  private async executeEmp201(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    const params = request.parameters as {
      periodMonth: string;
    };

    const decision = await this.sarsAgent.generateEmp201ForReview({
      tenantId: request.tenantId,
      periodMonth: params.periodMonth,
    });

    // SARS is always escalated
    result.results.push({
      agent: 'sars-agent',
      processed: 1,
      autoApplied: 0,
      escalated: 1,
      errors: 0,
    });

    result.escalations.push({
      type: 'SARS_EMP201',
      reason: 'EMP201 submission requires human review',
      details: {
        amountCents: decision.calculatedAmountCents,
        period: decision.period,
      },
    });
  }

  /**
   * Execute VAT201 generation
   */
  private async executeVat201(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    const params = request.parameters as {
      periodStart: Date;
      periodEnd: Date;
    };

    const decision = await this.sarsAgent.generateVat201ForReview({
      tenantId: request.tenantId,
      periodStart: new Date(params.periodStart),
      periodEnd: new Date(params.periodEnd),
    });

    // SARS is always escalated
    result.results.push({
      agent: 'sars-agent',
      processed: 1,
      autoApplied: 0,
      escalated: 1,
      errors: 0,
    });

    result.escalations.push({
      type: 'SARS_VAT201',
      reason: 'VAT201 submission requires human review',
      details: {
        amountCents: decision.calculatedAmountCents,
        period: decision.period,
      },
    });
  }

  /**
   * Execute full monthly close process
   */
  private async executeMonthlyClose(
    request: WorkflowRequest,
    result: WorkflowResult,
  ): Promise<void> {
    const params = request.parameters as {
      periodMonth: string;
    };

    // Step 1: Categorize remaining transactions
    await this.executeCategorization(request, result);

    // Step 2: Match pending payments
    await this.executePaymentMatching(request, result);

    // Step 3: Generate EMP201
    await this.executeEmp201(
      { ...request, parameters: { periodMonth: params.periodMonth } },
      result,
    );

    // Add month-end specific escalation
    result.escalations.push({
      type: 'MONTHLY_CLOSE',
      reason: 'Month-end close completed - review required',
      details: {
        period: params.periodMonth,
        agentsRun: result.results.map((r) => r.agent),
        totalEscalated: result.results.reduce((s, r) => s + r.escalated, 0),
      },
    });
  }

  /**
   * Log workflow decision to decisions.jsonl
   */
  private async logWorkflowDecision(result: WorkflowResult): Promise<void> {
    const entry: OrchestratorDecisionLog = {
      timestamp: new Date().toISOString(),
      agent: 'orchestrator',
      workflowId: result.workflowId,
      type: result.type,
      status: result.status,
      autonomyLevel: result.autonomyLevel,
      totalProcessed: result.results.reduce((s, r) => s + r.processed, 0),
      totalAutoApplied: result.results.reduce((s, r) => s + r.autoApplied, 0),
      totalEscalated: result.results.reduce((s, r) => s + r.escalated, 0),
      durationMs:
        new Date(result.completedAt).getTime() -
        new Date(result.startedAt).getTime(),
    };

    try {
      const logsDir = path.dirname(this.decisionsPath);
      await fs.mkdir(logsDir, { recursive: true });
      await fs.appendFile(this.decisionsPath, JSON.stringify(entry) + '\n');
    } catch (error) {
      this.logger.error(
        `Failed to log workflow decision: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get summary of pending escalations for a tenant
   */
  async getEscalationSummary(tenantId: string): Promise<Map<string, number>> {
    return this.escalationManager.getPendingSummary(tenantId);
  }

  /**
   * Check if tenant has critical escalations pending
   */
  async hasCriticalEscalations(tenantId: string): Promise<boolean> {
    return this.escalationManager.hasCriticalEscalations(tenantId);
  }
}
