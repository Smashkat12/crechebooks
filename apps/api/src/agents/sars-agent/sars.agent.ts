/**
 * SARS Calculation Agent
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * @module agents/sars-agent/sars.agent
 * @description Main agent that wraps SARS services with Claude Code agent capabilities.
 * ALWAYS drafts for human review (L2 autonomy - never auto-submit).
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - SARS submissions ALWAYS require human review
 * - Decimal.js with ROUND_HALF_EVEN for calculations
 * - Tenant isolation on ALL operations
 */

import { Injectable, Logger } from '@nestjs/common';
import { PayeService } from '../../database/services/paye.service';
import { UifService } from '../../database/services/uif.service';
import { Emp201Service } from '../../database/services/emp201.service';
import { Vat201Service } from '../../database/services/vat201.service';
import { SarsDecisionLogger } from './decision-logger';
import {
  SarsDecision,
  AgentPayeDto,
  AgentUifDto,
  AgentEmp201Dto,
  AgentVat201Dto,
} from './interfaces/sars.interface';
import { PayFrequency } from '@prisma/client';
import { SarsPayFrequencyException } from '../../api/sars/exceptions';

@Injectable()
export class SarsAgent {
  private readonly logger = new Logger(SarsAgent.name);

  constructor(
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
    private readonly emp201Service: Emp201Service,
    private readonly vat201Service: Vat201Service,
    private readonly decisionLogger: SarsDecisionLogger,
  ) {}

  /**
   * Calculate PAYE for review - ALWAYS requires human approval
   *
   * @param dto - PAYE calculation parameters
   * @returns SARS decision with DRAFT_FOR_REVIEW action
   */
  async calculatePayeForReview(dto: AgentPayeDto): Promise<SarsDecision> {
    const {
      tenantId,
      grossIncomeCents,
      payFrequency,
      dateOfBirth,
      medicalAidMembers,
      period,
    } = dto;

    this.logger.log(
      `SARS Agent: Calculating PAYE for tenant ${tenantId} period ${period}`,
    );

    // Map string pay frequency to enum
    const payFrequencyEnum = this.mapPayFrequency(payFrequency);

    // Calculate PAYE using underlying service
    const result = await this.payeService.calculatePaye({
      grossIncomeCents,
      payFrequency: payFrequencyEnum,
      dateOfBirth,
      medicalAidMembers,
    });

    const reasoning = this.buildPayeReasoning(
      grossIncomeCents,
      result.netPayeCents,
      result,
    );

    const decision: SarsDecision = {
      type: 'PAYE',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period,
      calculatedAmountCents: result.netPayeCents,
      requiresReview: true,
      reasoning,
      breakdown: {
        grossAmountCents: grossIncomeCents,
        taxBeforeRebatesCents: result.taxBeforeRebatesCents,
        totalRebatesCents: result.totalRebatesCents,
        medicalCreditsCents: result.medicalCreditsCents,
        payeCents: result.netPayeCents,
      },
    };

    // Log decision
    await this.decisionLogger.logDecision(
      tenantId,
      'PAYE',
      period,
      result.netPayeCents,
      reasoning,
    );

    // Log escalation - SARS always requires review
    await this.decisionLogger.logEscalation(
      tenantId,
      'PAYE',
      period,
      'PAYE calculation requires human review before submission',
      result.netPayeCents,
    );

    return decision;
  }

  /**
   * Calculate UIF for review - ALWAYS requires human approval
   *
   * @param dto - UIF calculation parameters
   * @returns SARS decision with DRAFT_FOR_REVIEW action
   */
  async calculateUifForReview(dto: AgentUifDto): Promise<SarsDecision> {
    const { tenantId, grossRemunerationCents, period } = dto;

    this.logger.log(
      `SARS Agent: Calculating UIF for tenant ${tenantId} period ${period}`,
    );

    // Calculate UIF using underlying service
    const result = await this.uifService.calculateUif(grossRemunerationCents);

    const reasoning =
      `UIF total contribution R${(result.totalContributionCents / 100).toFixed(2)} ` +
      `(Employee R${(result.employeeContributionCents / 100).toFixed(2)}, ` +
      `Employer R${(result.employerContributionCents / 100).toFixed(2)})` +
      (result.isAboveCap ? ' - capped at maximum' : '');

    const decision: SarsDecision = {
      type: 'UIF',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period,
      calculatedAmountCents: result.totalContributionCents,
      requiresReview: true,
      reasoning,
      breakdown: {
        grossAmountCents: grossRemunerationCents,
        uifCents: result.totalContributionCents,
      },
    };

    // Log decision
    await this.decisionLogger.logDecision(
      tenantId,
      'UIF',
      period,
      result.totalContributionCents,
      reasoning,
    );

    // Log escalation - SARS always requires review
    await this.decisionLogger.logEscalation(
      tenantId,
      'UIF',
      period,
      'UIF calculation requires human review before submission',
      result.totalContributionCents,
    );

    return decision;
  }

  /**
   * Generate EMP201 for review - ALWAYS requires human approval
   *
   * @param dto - EMP201 generation parameters
   * @returns SARS decision with DRAFT_FOR_REVIEW action
   */
  async generateEmp201ForReview(dto: AgentEmp201Dto): Promise<SarsDecision> {
    const { tenantId, periodMonth } = dto;

    this.logger.log(
      `SARS Agent: Generating EMP201 for tenant ${tenantId} period ${periodMonth}`,
    );

    // Generate EMP201 using underlying service
    const submission = await this.emp201Service.generateEmp201({
      tenantId,
      periodMonth,
    });

    // Parse the document to get summary data
    const document = submission.documentData as {
      summary?: {
        totalPayeCents?: number;
        totalUifCents?: number;
        totalSdlCents?: number;
        totalPayableCents?: number;
        employeeCount?: number;
      };
    };

    const summary = document?.summary || {};
    const totalPayeCents = summary.totalPayeCents || 0;
    const totalUifCents = summary.totalUifCents || 0;
    const totalSdlCents = summary.totalSdlCents || 0;
    const totalPayableCents =
      summary.totalPayableCents ||
      totalPayeCents + totalUifCents + totalSdlCents;
    const employeeCount = summary.employeeCount || 0;

    const reasoning =
      `EMP201 for ${periodMonth}: ` +
      `${employeeCount} employees, ` +
      `PAYE R${(totalPayeCents / 100).toFixed(2)}, ` +
      `UIF R${(totalUifCents / 100).toFixed(2)}, ` +
      `SDL R${(totalSdlCents / 100).toFixed(2)}, ` +
      `Total R${(totalPayableCents / 100).toFixed(2)}`;

    const decision: SarsDecision = {
      type: 'EMP201',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period: periodMonth,
      calculatedAmountCents: totalPayableCents,
      requiresReview: true,
      reasoning,
      breakdown: {
        payeCents: totalPayeCents,
        uifCents: totalUifCents,
        sdlCents: totalSdlCents,
      },
    };

    // Log decision
    await this.decisionLogger.logDecision(
      tenantId,
      'EMP201',
      periodMonth,
      totalPayableCents,
      reasoning,
    );

    // Log escalation - SARS always requires review
    await this.decisionLogger.logEscalation(
      tenantId,
      'EMP201',
      periodMonth,
      'EMP201 submission requires human review and approval before filing with SARS',
      totalPayableCents,
    );

    return decision;
  }

  /**
   * Generate VAT201 for review - ALWAYS requires human approval
   *
   * @param dto - VAT201 generation parameters
   * @returns SARS decision with DRAFT_FOR_REVIEW action
   */
  async generateVat201ForReview(dto: AgentVat201Dto): Promise<SarsDecision> {
    const { tenantId, periodStart, periodEnd } = dto;

    this.logger.log(
      `SARS Agent: Generating VAT201 for tenant ${tenantId} ` +
        `from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Generate VAT201 using underlying service
    const submission = await this.vat201Service.generateVat201({
      tenantId,
      periodStart,
      periodEnd,
    });

    // Parse the document to get VAT data
    const document = submission.documentData as {
      fields?: {
        outputVatDueOnSalesCents?: number;
        inputVatClaimableCents?: number;
        netVatPayableCents?: number;
      };
    };

    const fields = document?.fields || {};
    const outputVatCents = fields.outputVatDueOnSalesCents || 0;
    const inputVatCents = fields.inputVatClaimableCents || 0;
    const netVatCents =
      fields.netVatPayableCents || outputVatCents - inputVatCents;

    const periodStr = `${periodStart.toISOString().slice(0, 7)} to ${periodEnd.toISOString().slice(0, 7)}`;

    const reasoning =
      `VAT201 for ${periodStr}: ` +
      `Output VAT R${(outputVatCents / 100).toFixed(2)}, ` +
      `Input VAT R${(inputVatCents / 100).toFixed(2)}, ` +
      `Net ${netVatCents >= 0 ? 'Payable' : 'Refund'} R${(Math.abs(netVatCents) / 100).toFixed(2)}`;

    const decision: SarsDecision = {
      type: 'VAT201',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period: periodStr,
      calculatedAmountCents: netVatCents,
      requiresReview: true,
      reasoning,
      breakdown: {
        outputVatCents,
        inputVatCents,
      },
    };

    // Log decision
    await this.decisionLogger.logDecision(
      tenantId,
      'VAT201',
      periodStr,
      netVatCents,
      reasoning,
    );

    // Log escalation - SARS always requires review
    await this.decisionLogger.logEscalation(
      tenantId,
      'VAT201',
      periodStr,
      'VAT201 submission requires human review and approval before filing with SARS',
      netVatCents,
    );

    return decision;
  }

  /**
   * Map string pay frequency to enum
   *
   * @param frequency - Pay frequency string
   * @returns PayFrequency enum value
   * @throws SarsPayFrequencyException if frequency is invalid
   */
  private mapPayFrequency(frequency: string): PayFrequency {
    switch (frequency.toUpperCase()) {
      case 'MONTHLY':
        return PayFrequency.MONTHLY;
      case 'WEEKLY':
        return PayFrequency.WEEKLY;
      case 'DAILY':
        return PayFrequency.DAILY;
      case 'HOURLY':
        return PayFrequency.HOURLY;
      default:
        throw new SarsPayFrequencyException(frequency);
    }
  }

  /**
   * Build detailed reasoning for PAYE calculation
   */
  private buildPayeReasoning(
    grossCents: number,
    netPayeCents: number,
    result: {
      annualizedIncomeCents: number;
      taxBeforeRebatesCents: number;
      totalRebatesCents: number;
      medicalCreditsCents: number;
      effectiveRatePercent: number;
      bracketIndex: number;
    },
  ): string {
    return (
      `PAYE calculation: ` +
      `Gross R${(grossCents / 100).toFixed(2)}, ` +
      `Annualized R${(result.annualizedIncomeCents / 100).toFixed(2)}, ` +
      `Tax before rebates R${(result.taxBeforeRebatesCents / 100 / 12).toFixed(2)}/month, ` +
      `Rebates R${(result.totalRebatesCents / 100 / 12).toFixed(2)}/month, ` +
      `Medical credits R${(result.medicalCreditsCents / 100).toFixed(2)}, ` +
      `Net PAYE R${(netPayeCents / 100).toFixed(2)} ` +
      `(${result.effectiveRatePercent.toFixed(1)}% effective rate, bracket ${result.bracketIndex + 1})`
    );
  }
}
