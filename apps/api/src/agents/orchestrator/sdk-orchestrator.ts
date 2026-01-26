/**
 * SDK Orchestrator
 * TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration
 *
 * @module agents/orchestrator/sdk-orchestrator
 * @description SDK-enhanced orchestrator that supports parallel execution
 * and error isolation for multi-step workflows.
 *
 * Uses workflow definitions with step dependencies and parallel flags:
 * - BANK_IMPORT: runs categorize + match in PARALLEL via Promise.allSettled
 * - MONTHLY_CLOSE: runs SEQUENTIALLY (categorize -> match -> EMP201)
 *
 * Falls back to undefined (caller uses existing sequential logic) if SDK init fails.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - SARS workflows ALWAYS L2_DRAFT (hardcoded above routing decisions)
 * - Tenant isolation on ALL operations
 * - Temperature = 0 for financial operations
 * - Error isolation: one step failing does NOT abort other steps
 */

import {
  Injectable,
  Optional,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BaseSdkAgent } from '../sdk/base-sdk-agent';
import { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import { SdkConfigService } from '../sdk/sdk-config';
import { RuvectorService } from '../sdk/ruvector.service';
import { AgentDefinition } from '../sdk/interfaces/sdk-agent.interface';
import { TransactionCategorizerAgent } from '../transaction-categorizer/categorizer.agent';
import { PaymentMatcherAgent } from '../payment-matcher/matcher.agent';
import { SarsAgent } from '../sars-agent/sars.agent';
import { WorkflowRouter } from './workflow-router';
import { EscalationManager } from './escalation-manager';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  WorkflowRequest,
  WorkflowResult,
  AutonomyLevel,
} from './interfaces/orchestrator.interface';
import {
  SubagentContext,
  SubagentResult,
  WorkflowStepDefinition,
} from './interfaces/sdk-orchestrator.interface';
import { getWorkflowDefinition } from './workflow-definitions';
import { WorkflowResultAdaptor } from './workflow-result-adaptor';

@Injectable()
export class SdkOrchestrator extends BaseSdkAgent {
  protected override readonly logger: Logger;

  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    @Optional()
    @Inject(forwardRef(() => TransactionCategorizerAgent))
    private readonly transactionCategorizer?: TransactionCategorizerAgent,
    @Optional()
    @Inject(forwardRef(() => PaymentMatcherAgent))
    private readonly paymentMatcher?: PaymentMatcherAgent,
    @Optional()
    @Inject(forwardRef(() => SarsAgent))
    private readonly sarsAgent?: SarsAgent,
    @Optional()
    @Inject(WorkflowRouter)
    private readonly workflowRouter?: WorkflowRouter,
    @Optional()
    @Inject(EscalationManager)
    private readonly escalationManager?: EscalationManager,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvectorService?: RuvectorService,
    @Optional()
    @Inject(WorkflowResultAdaptor)
    private readonly resultAdaptor?: WorkflowResultAdaptor,
  ) {
    super(factory, config, 'SdkOrchestrator');
    this.logger = new Logger('SdkOrchestrator');
  }

  /**
   * Returns the orchestrator agent definition for a given tenant.
   * @param tenantId - Tenant ID for tenant-specific configuration
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return this.factory.createOrchestratorAgent(tenantId);
  }

  /**
   * Execute a workflow using SDK orchestration with parallel execution and error isolation.
   * Returns undefined if the workflow type has no SDK definition or if critical
   * dependencies are missing, allowing the caller to fall back to sequential execution.
   *
   * @param request - The workflow request to execute
   * @returns WorkflowResult if SDK handled it, undefined if caller should fall back
   */
  async execute(request: WorkflowRequest): Promise<WorkflowResult | undefined> {
    const definition = getWorkflowDefinition(request.type);
    if (!definition) {
      this.logger.debug(`No SDK workflow definition for ${request.type}`);
      return undefined;
    }

    const workflowId = uuidv4();
    const startedAt = new Date().toISOString();
    const autonomyLevel =
      this.workflowRouter?.getAutonomyLevel(request.type) ??
      (definition.autonomyLevel as AutonomyLevel);

    // CRITICAL: SARS L2 enforcement — hardcoded above routing decisions
    const effectiveAutonomy: AutonomyLevel = definition.containsSars
      ? 'L2_DRAFT'
      : autonomyLevel;

    this.logger.log(
      `SDK Orchestrator: executing ${request.type} workflow ${workflowId} ` +
        `(autonomy: ${effectiveAutonomy}, steps: ${String(definition.steps.length)})`,
    );

    // Partition steps into parallel (no dependencies) and sequential (has dependencies)
    const parallelSteps = definition.steps.filter(
      (s) => s.parallel && s.dependsOn.length === 0,
    );
    const sequentialSteps = definition.steps.filter(
      (s) => !s.parallel || s.dependsOn.length > 0,
    );

    const subagentResults: SubagentResult[] = [];

    // Execute parallel steps first via Promise.allSettled for error isolation
    if (parallelSteps.length > 1) {
      const parallelResults = await Promise.allSettled(
        parallelSteps.map((step) =>
          this.executeStep(step, request, workflowId),
        ),
      );
      for (const settled of parallelResults) {
        if (settled.status === 'fulfilled') {
          subagentResults.push(settled.value);
        } else {
          subagentResults.push({
            status: 'FAILED',
            agentType: 'unknown',
            error:
              settled.reason instanceof Error
                ? settled.reason.message
                : String(settled.reason),
            durationMs: 0,
          });
        }
      }
    } else if (parallelSteps.length === 1) {
      // Single parallel step — just execute directly
      subagentResults.push(
        await this.executeStep(parallelSteps[0], request, workflowId),
      );
    }

    // Execute sequential steps in dependency order
    for (const step of sequentialSteps) {
      const result = await this.executeStep(step, request, workflowId);
      subagentResults.push(result);
    }

    // Use adaptor to convert to WorkflowResult
    if (!this.resultAdaptor) {
      this.logger.warn('WorkflowResultAdaptor not available');
      return undefined;
    }

    const workflowResult = this.resultAdaptor.adapt(
      workflowId,
      request.type,
      effectiveAutonomy,
      subagentResults,
      startedAt,
    );

    return workflowResult;
  }

  /**
   * Execute a single workflow step with error isolation.
   * Routes to the appropriate agent based on step.agentType.
   *
   * @param step - The workflow step definition
   * @param request - The original workflow request
   * @param workflowId - The workflow's unique ID
   * @returns SubagentResult with execution details
   */
  private async executeStep(
    step: WorkflowStepDefinition,
    request: WorkflowRequest,
    workflowId: string,
  ): Promise<SubagentResult> {
    const startTime = Date.now();
    const context: SubagentContext = {
      tenantId: request.tenantId,
      workflowId,
      stepId: step.stepId,
      agentType: step.agentType,
      input: request.parameters ?? {},
    };

    try {
      switch (step.agentType) {
        case 'transaction-categorizer':
          return await this.executeCategorization(context, request, startTime);
        case 'payment-matcher':
          return await this.executePaymentMatching(context, request, startTime);
        case 'sars-agent':
          return await this.executeSarsStep(context, request, startTime);
        default:
          return {
            status: 'FAILED',
            agentType: step.agentType,
            error: `Unknown agent type: ${step.agentType}`,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        status: 'FAILED',
        agentType: step.agentType,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute transaction categorization step.
   * Mirrors orchestrator.agent.ts executeCategorization logic
   * but returns SubagentResult instead of mutating WorkflowResult.
   */
  private async executeCategorization(
    context: SubagentContext,
    request: WorkflowRequest,
    startTime: number,
  ): Promise<SubagentResult> {
    if (!this.transactionCategorizer || !this.prisma) {
      return {
        status: 'FAILED',
        agentType: 'transaction-categorizer',
        error: 'TransactionCategorizerAgent or PrismaService not available',
        durationMs: Date.now() - startTime,
      };
    }

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
    const escalations: SubagentResult['escalations'] = [];

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
          escalations.push({
            type: 'LOW_CONFIDENCE_CATEGORIZATION',
            reason: catResult.reasoning,
            details: {
              transactionId: tx.id,
              confidence: catResult.confidenceScore,
              accountCode: catResult.accountCode,
            },
          });
        }
      } catch {
        errors++;
      }
    }

    return {
      status:
        errors === transactions.length && transactions.length > 0
          ? 'FAILED'
          : 'SUCCESS',
      agentType: 'transaction-categorizer',
      processed: transactions.length,
      autoApplied,
      escalated,
      errors,
      escalations,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute payment matching step.
   * Mirrors orchestrator.agent.ts executePaymentMatching logic
   * but returns SubagentResult instead of mutating WorkflowResult.
   */
  private async executePaymentMatching(
    context: SubagentContext,
    request: WorkflowRequest,
    startTime: number,
  ): Promise<SubagentResult> {
    if (!this.paymentMatcher || !this.prisma) {
      return {
        status: 'FAILED',
        agentType: 'payment-matcher',
        error: 'PaymentMatcherAgent or PrismaService not available',
        durationMs: Date.now() - startTime,
      };
    }

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
    const escalations: SubagentResult['escalations'] = [];

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
          escalations.push({
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
        // NO_MATCH doesn't count as escalation
      } catch {
        errors++;
      }
    }

    return {
      status:
        errors === credits.length && credits.length > 0 ? 'FAILED' : 'SUCCESS',
      agentType: 'payment-matcher',
      processed: credits.length,
      autoApplied,
      escalated,
      errors,
      escalations,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a SARS step (PAYE, EMP201, or VAT201).
   * The step.stepId determines which SARS method to call:
   * - 'paye' -> calculatePayeForReview
   * - 'emp201' -> generateEmp201ForReview
   * - 'vat201' -> generateVat201ForReview
   *
   * SARS results are ALWAYS escalated (L2_DRAFT).
   */
  private async executeSarsStep(
    context: SubagentContext,
    request: WorkflowRequest,
    startTime: number,
  ): Promise<SubagentResult> {
    if (!this.sarsAgent) {
      return {
        status: 'FAILED',
        agentType: 'sars-agent',
        error: 'SarsAgent not available',
        durationMs: Date.now() - startTime,
      };
    }

    const params = request.parameters;
    const escalations: SubagentResult['escalations'] = [];

    switch (context.stepId) {
      case 'paye': {
        const decision = await this.sarsAgent.calculatePayeForReview({
          tenantId: request.tenantId,
          grossIncomeCents: params.grossIncomeCents as number,
          payFrequency: params.payFrequency as
            | 'MONTHLY'
            | 'WEEKLY'
            | 'DAILY'
            | 'HOURLY',
          dateOfBirth: params.dateOfBirth as Date,
          medicalAidMembers: params.medicalAidMembers as number,
          period: params.period as string,
        });
        escalations.push({
          type: 'SARS_PAYE',
          reason: 'PAYE calculation requires human review',
          details: {
            amountCents: decision.calculatedAmountCents,
            period: decision.period,
          },
        });
        break;
      }
      case 'emp201': {
        const decision = await this.sarsAgent.generateEmp201ForReview({
          tenantId: request.tenantId,
          periodMonth: params.periodMonth as string,
        });
        escalations.push({
          type: 'SARS_EMP201',
          reason: 'EMP201 submission requires human review',
          details: {
            amountCents: decision.calculatedAmountCents,
            period: decision.period,
          },
        });
        break;
      }
      case 'vat201': {
        const decision = await this.sarsAgent.generateVat201ForReview({
          tenantId: request.tenantId,
          periodStart: new Date(params.periodStart as string),
          periodEnd: new Date(params.periodEnd as string),
        });
        escalations.push({
          type: 'SARS_VAT201',
          reason: 'VAT201 submission requires human review',
          details: {
            amountCents: decision.calculatedAmountCents,
            period: decision.period,
          },
        });
        break;
      }
      default:
        return {
          status: 'FAILED',
          agentType: 'sars-agent',
          error: `Unknown SARS step: ${context.stepId}`,
          durationMs: Date.now() - startTime,
        };
    }

    // SARS results are always escalated (L2_DRAFT)
    return {
      status: 'SUCCESS',
      agentType: 'sars-agent',
      processed: 1,
      autoApplied: 0,
      escalated: 1,
      errors: 0,
      escalations,
      durationMs: Date.now() - startTime,
    };
  }
}
