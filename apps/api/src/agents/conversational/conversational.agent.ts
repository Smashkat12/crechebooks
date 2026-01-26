/**
 * Conversational Agent
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/conversational.agent
 * @description Main agent for answering natural language financial queries.
 * Uses SDK for LLM-powered answers, falls back to template-based responses.
 *
 * CRITICAL RULES:
 * - STRICTLY READ-ONLY: Only findMany, aggregate, count operations
 * - ALL monetary values are CENTS (integers) internally
 * - Tenant isolation on ALL database queries
 * - Never provide tax advice - redirect to SARS agent
 * - Always filter with isDeleted: false
 */

import {
  Injectable,
  Optional,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { BaseSdkAgent } from '../sdk/base-sdk-agent';
import { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import { SdkConfigService } from '../sdk/sdk-config';
import { RuvectorService } from '../sdk/ruvector.service';
import type { AgentDefinition } from '../sdk/interfaces/sdk-agent.interface';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueryValidator } from './query-validator';
import type {
  ConversationalResponse,
  QueryType,
} from './interfaces/conversational.interface';
import {
  formatCents,
  classifyQueryComplexity,
  routeModel,
} from './conversational-prompt';
import { randomUUID } from 'crypto';

@Injectable()
export class ConversationalAgent extends BaseSdkAgent {
  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvectorService?: RuvectorService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(QueryValidator)
    private readonly queryValidator?: QueryValidator,
  ) {
    super(factory, config, 'ConversationalAgent');
  }

  /**
   * Returns the agent definition for a given tenant.
   * @param tenantId - Tenant ID for tenant-specific configuration
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return this.factory.createConversationalAgent(tenantId);
  }

  /**
   * Answer a natural language question about the tenant's financial data.
   * Uses SDK for LLM-powered answers, falls back to template-based responses.
   * STRICTLY READ-ONLY.
   *
   * @param question - The user's natural language question
   * @param tenantId - Tenant ID for data isolation
   * @param conversationId - Optional conversation thread ID for multi-turn context
   * @returns Conversational response with answer, metadata, and conversation ID
   * @throws BadRequestException if the query fails validation
   */
  async ask(
    question: string,
    tenantId: string,
    conversationId?: string,
  ): Promise<ConversationalResponse> {
    const startTime = Date.now();
    const resolvedConversationId = conversationId ?? randomUUID();

    // 1. Validate query
    if (this.queryValidator) {
      const validation = this.queryValidator.validate(question, tenantId);
      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }
      question = validation.sanitizedQuestion ?? question;
    }

    // 2. Classify query type and complexity
    const queryType = this.classifyQueryType(question);
    const complexity = classifyQueryComplexity(question, queryType);
    const model = routeModel(complexity);

    // 3. Execute with SDK fallback
    const result = await this.executeWithFallback<string>(
      // SDK path - would use LLM for natural language generation
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        // SDK path not yet implemented - will be wired when SDK is available
        throw new Error('SDK not yet wired for conversational agent');
      },
      // Fallback path - use Prisma directly for template-based responses
      async () => {
        return this.executeQuery(queryType, tenantId, question);
      },
    );

    const durationMs = Date.now() - startTime;

    return {
      answer: result.data,
      conversationId: resolvedConversationId,
      metadata: {
        queryType,
        source: result.source,
        model: result.source === 'SDK' ? model : undefined,
        durationMs,
        dataSourcesQueried: this.getDataSourcesForQueryType(queryType),
      },
    };
  }

  /**
   * Classify the type of financial query based on question keywords.
   * @param question - The user's question
   * @returns The classified query type
   */
  private classifyQueryType(question: string): QueryType {
    const lower = question.toLowerCase();

    // Tax-related keywords
    if (
      lower.includes('tax') ||
      lower.includes('vat') ||
      lower.includes('sars') ||
      lower.includes('paye') ||
      lower.includes('uif')
    ) {
      return 'TAX';
    }

    // Revenue/income keywords
    if (
      lower.includes('revenue') ||
      lower.includes('income') ||
      lower.includes('earn') ||
      lower.includes('fee') ||
      lower.includes('tuition')
    ) {
      return 'REVENUE';
    }

    // Expense keywords
    if (
      lower.includes('expense') ||
      lower.includes('spend') ||
      lower.includes('spent') ||
      lower.includes('cost') ||
      lower.includes('paid out') ||
      lower.includes('debit')
    ) {
      return 'EXPENSE';
    }

    // Invoice keywords
    if (
      lower.includes('invoice') ||
      lower.includes('bill') ||
      lower.includes('outstanding') ||
      lower.includes('overdue')
    ) {
      return 'INVOICE';
    }

    // Payment keywords
    if (
      lower.includes('payment') ||
      lower.includes('received') ||
      lower.includes('paid') ||
      lower.includes('credit')
    ) {
      return 'PAYMENT';
    }

    // Enrollment keywords
    if (
      lower.includes('enrol') ||
      lower.includes('child') ||
      lower.includes('student') ||
      lower.includes('learner')
    ) {
      return 'ENROLLMENT';
    }

    // Summary keywords
    if (
      lower.includes('summary') ||
      lower.includes('overview') ||
      lower.includes('dashboard') ||
      lower.includes('how are we doing') ||
      lower.includes('status')
    ) {
      return 'SUMMARY';
    }

    return 'GENERAL';
  }

  /**
   * Execute a read-only query based on the classified query type.
   * @param queryType - The classified query type
   * @param tenantId - Tenant ID for data isolation
   * @param question - The original question (for GENERAL fallback)
   * @returns A formatted answer string
   */
  private async executeQuery(
    queryType: QueryType,
    tenantId: string,
    question: string,
  ): Promise<string> {
    switch (queryType) {
      case 'REVENUE':
        return this.buildRevenueAnswer(tenantId);
      case 'EXPENSE':
        return this.buildExpenseAnswer(tenantId);
      case 'INVOICE':
        return this.buildInvoiceAnswer(tenantId);
      case 'PAYMENT':
        return this.buildPaymentAnswer(tenantId);
      case 'TAX':
        return this.buildTaxRedirectAnswer();
      case 'ENROLLMENT':
        return this.buildEnrollmentAnswer(tenantId);
      case 'SUMMARY':
        return this.buildSummaryAnswer(tenantId);
      case 'GENERAL':
      default:
        return this.buildGeneralAnswer(tenantId, question);
    }
  }

  /**
   * Build a revenue summary answer.
   * READ-ONLY: Uses aggregate and count only.
   */
  private async buildRevenueAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Financial data is not available at the moment. Please try again later.';
    }

    const revenueAgg = await this.prisma.transaction.aggregate({
      where: { tenantId, isDeleted: false, isCredit: true },
      _sum: { amountCents: true },
      _count: true,
    });

    const totalCents = revenueAgg._sum.amountCents ?? 0;
    const count = revenueAgg._count ?? 0;

    if (count === 0) {
      return 'No revenue transactions have been recorded yet. Once parents make payments, you will see your revenue summary here.';
    }

    return `Your total revenue is ${formatCents(totalCents)} across ${String(count)} transaction${count !== 1 ? 's' : ''}. This includes all credit transactions recorded in your account.`;
  }

  /**
   * Build an expense summary answer.
   * READ-ONLY: Uses aggregate and count only.
   */
  private async buildExpenseAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Financial data is not available at the moment. Please try again later.';
    }

    const expenseAgg = await this.prisma.transaction.aggregate({
      where: { tenantId, isDeleted: false, isCredit: false },
      _sum: { amountCents: true },
      _count: true,
    });

    const totalCents = expenseAgg._sum.amountCents ?? 0;
    const count = expenseAgg._count ?? 0;

    if (count === 0) {
      return 'No expense transactions have been recorded yet.';
    }

    return `Your total expenses are ${formatCents(totalCents)} across ${String(count)} transaction${count !== 1 ? 's' : ''}. This includes all debit transactions recorded in your account.`;
  }

  /**
   * Build an invoice status answer.
   * READ-ONLY: Uses findMany only.
   */
  private async buildInvoiceAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Invoice data is not available at the moment. Please try again later.';
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, isDeleted: false },
      select: { status: true, totalCents: true, amountPaidCents: true },
    });

    if (invoices.length === 0) {
      return 'No invoices have been created yet. Once you generate invoices for parents, you will see your invoice summary here.';
    }

    let totalCents = 0;
    let paidCents = 0;
    let outstandingCount = 0;

    for (const inv of invoices) {
      totalCents += inv.totalCents ?? 0;
      paidCents += inv.amountPaidCents ?? 0;
      if (inv.status !== 'PAID' && inv.status !== 'VOID') {
        outstandingCount++;
      }
    }

    const outstandingCents = totalCents - paidCents;

    return (
      `You have ${String(invoices.length)} invoice${invoices.length !== 1 ? 's' : ''} totalling ${formatCents(totalCents)}. ` +
      `${formatCents(paidCents)} has been paid so far. ` +
      `${String(outstandingCount)} invoice${outstandingCount !== 1 ? 's are' : ' is'} still outstanding ` +
      `with ${formatCents(outstandingCents)} remaining.`
    );
  }

  /**
   * Build a payment summary answer.
   * READ-ONLY: Uses aggregate and count only.
   */
  private async buildPaymentAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Payment data is not available at the moment. Please try again later.';
    }

    const paymentAgg = await this.prisma.transaction.aggregate({
      where: { tenantId, isDeleted: false, isCredit: true },
      _sum: { amountCents: true },
      _count: true,
    });

    const totalCents = paymentAgg._sum.amountCents ?? 0;
    const count = paymentAgg._count ?? 0;

    if (count === 0) {
      return 'No payments have been received yet.';
    }

    return `You have received ${String(count)} payment${count !== 1 ? 's' : ''} totalling ${formatCents(totalCents)}.`;
  }

  /**
   * Build a tax redirect answer.
   * NEVER provides tax advice - redirects to SARS agent or accountant.
   */
  private buildTaxRedirectAnswer(): string {
    return (
      'I am not able to provide tax advice. For tax-related questions such as PAYE, UIF, VAT, or SARS submissions, ' +
      'please use the SARS agent which is specifically designed for South African tax compliance, ' +
      'or consult a qualified accountant. ' +
      'I can help you with general financial queries like revenue, expenses, invoices, and payments.'
    );
  }

  /**
   * Build an enrollment summary answer.
   * READ-ONLY: Uses count only.
   */
  private async buildEnrollmentAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Enrollment data is not available at the moment. Please try again later.';
    }

    const childCount = await this.prisma.child.count({
      where: { tenantId, deletedAt: null },
    });

    if (childCount === 0) {
      return 'No children are currently enrolled. Once you add children to the system, you will see enrollment numbers here.';
    }

    return `You currently have ${String(childCount)} child${childCount !== 1 ? 'ren' : ''} enrolled in your creche.`;
  }

  /**
   * Build a financial summary answer combining key metrics.
   * READ-ONLY: Uses aggregate and count only.
   */
  private async buildSummaryAnswer(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Financial data is not available at the moment. Please try again later.';
    }

    // Revenue (credits)
    const revenueAgg = await this.prisma.transaction.aggregate({
      where: { tenantId, isDeleted: false, isCredit: true },
      _sum: { amountCents: true },
      _count: true,
    });

    // Expenses (debits)
    const expenseAgg = await this.prisma.transaction.aggregate({
      where: { tenantId, isDeleted: false, isCredit: false },
      _sum: { amountCents: true },
      _count: true,
    });

    // Children enrolled
    const childCount = await this.prisma.child.count({
      where: { tenantId, deletedAt: null },
    });

    // Outstanding invoices
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, isDeleted: false },
      select: { status: true, totalCents: true, amountPaidCents: true },
    });

    const revenueCents = revenueAgg._sum.amountCents ?? 0;
    const expenseCents = expenseAgg._sum.amountCents ?? 0;
    const netCents = revenueCents - expenseCents;

    let outstandingCents = 0;
    for (const inv of invoices) {
      if (inv.status !== 'PAID' && inv.status !== 'VOID') {
        outstandingCents += (inv.totalCents ?? 0) - (inv.amountPaidCents ?? 0);
      }
    }

    const parts: string[] = [
      `Here is your financial summary:`,
      `- Total revenue: ${formatCents(revenueCents)}`,
      `- Total expenses: ${formatCents(expenseCents)}`,
      `- Net position: ${formatCents(netCents)}`,
      `- Children enrolled: ${String(childCount)}`,
      `- Outstanding invoice amount: ${formatCents(outstandingCents)}`,
    ];

    if (netCents >= 0) {
      parts.push(
        `\nYour creche is currently in a positive financial position.`,
      );
    } else {
      parts.push(
        `\nYour expenses currently exceed your revenue. Consider reviewing outstanding invoices and following up on unpaid fees.`,
      );
    }

    return parts.join('\n');
  }

  /**
   * Build a general answer for unclassified questions.
   * Provides helpful guidance on what the agent can answer.
   */
  private buildGeneralAnswer(_tenantId: string, question: string): string {
    return (
      `I received your question: "${question}"\n\n` +
      `I can help you with the following types of financial queries:\n` +
      `- Revenue and income summaries\n` +
      `- Expense breakdowns\n` +
      `- Invoice status and outstanding amounts\n` +
      `- Payment tracking\n` +
      `- Enrollment numbers\n` +
      `- Financial overviews and summaries\n\n` +
      `Try asking something like "What is my total revenue?" or "How many invoices are outstanding?"`
    );
  }

  /**
   * Get the list of data sources queried for a given query type.
   * @param queryType - The classified query type
   * @returns List of data source names
   */
  private getDataSourcesForQueryType(queryType: QueryType): string[] {
    switch (queryType) {
      case 'REVENUE':
        return ['transactions'];
      case 'EXPENSE':
        return ['transactions'];
      case 'INVOICE':
        return ['invoices'];
      case 'PAYMENT':
        return ['transactions'];
      case 'TAX':
        return [];
      case 'ENROLLMENT':
        return ['children'];
      case 'SUMMARY':
        return ['transactions', 'invoices', 'children'];
      case 'GENERAL':
      default:
        return [];
    }
  }
}
