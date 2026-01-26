/**
 * SDK Agent Factory
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/sdk-agent.factory
 * @description Factory for creating SDK agent definitions for all agent types.
 * Each agent gets a South African accounting-specific system prompt,
 * list of allowed MCP tools, and model configuration.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Temperature = 0 for financial categorisation
 * - SA-specific domain knowledge in all prompts
 * - Tenant isolation enforced in prompts
 */

import { Injectable, Logger } from '@nestjs/common';
import { SdkConfigService, AgentType } from './sdk-config';
import { AgentDefinition } from './interfaces/sdk-agent.interface';

@Injectable()
export class SdkAgentFactory {
  private readonly logger = new Logger(SdkAgentFactory.name);

  constructor(private readonly configService: SdkConfigService) {}

  /**
   * Create a categoriser agent definition for classifying bank transactions.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createCategorizerAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Categorises bank transactions into SA chart-of-accounts codes with VAT classification',
      prompt: this.buildCategorizerPrompt(tenantId),
      tools: [
        'transaction_lookup',
        'chart_of_accounts',
        'historical_categorizations',
        'pattern_match',
      ],
      model: this.configService.getModelForAgent('categorizer'),
    };
  }

  /**
   * Create a matcher agent definition for matching payments to invoices.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createMatcherAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Matches bank transactions to outstanding invoices using amount, reference, and date analysis',
      prompt: this.buildMatcherPrompt(tenantId),
      tools: [
        'invoice_search',
        'transaction_lookup',
        'payment_history',
        'reference_parser',
      ],
      model: this.configService.getModelForAgent('matcher'),
    };
  }

  /**
   * Create a SARS agent definition for SA tax compliance.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createSarsAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Validates and prepares SARS tax submissions for South African compliance',
      prompt: this.buildSarsPrompt(tenantId),
      tools: [
        'vat201_lookup',
        'itr14_lookup',
        'emp501_lookup',
        'tax_calendar',
        'sars_efiling_validate',
        'withholding_tax_check',
      ],
      model: this.configService.getModelForAgent('sars'),
    };
  }

  /**
   * Create an extraction validator agent definition for document processing.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createExtractionValidatorAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Validates extracted financial document data (invoices, receipts, statements) for accuracy',
      prompt: this.buildExtractionPrompt(tenantId),
      tools: [
        'ocr_result_lookup',
        'document_metadata',
        'amount_sanity_check',
        'balance_reconcile',
      ],
      model: this.configService.getModelForAgent('extraction'),
    };
  }

  /**
   * Create an orchestrator agent definition for coordinating multi-agent workflows.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createOrchestratorAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Orchestrates multi-agent workflows, routing tasks and managing escalations',
      prompt: this.buildOrchestratorPrompt(tenantId),
      tools: [
        'workflow_status',
        'agent_dispatch',
        'escalation_manager',
        'priority_queue',
        'tenant_config',
      ],
      model: this.configService.getModelForAgent('orchestrator'),
    };
  }

  /**
   * Create a conversational agent definition for user-facing chat interactions.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createConversationalAgent(tenantId: string): AgentDefinition {
    return {
      description:
        'Handles natural language interactions with creche administrators about their finances',
      prompt: this.buildConversationalPrompt(tenantId),
      tools: [
        'account_summary',
        'recent_transactions',
        'invoice_search',
        'report_generator',
        'help_articles',
      ],
      model: this.configService.getModelForAgent('conversational'),
    };
  }

  /**
   * Create an agent definition by type.
   * @param agentType - The type of agent to create
   * @param tenantId - Tenant ID for tenant-specific context
   */
  createAgent(agentType: AgentType, tenantId: string): AgentDefinition {
    switch (agentType) {
      case 'categorizer':
        return this.createCategorizerAgent(tenantId);
      case 'matcher':
        return this.createMatcherAgent(tenantId);
      case 'sars':
        return this.createSarsAgent(tenantId);
      case 'extraction':
        return this.createExtractionValidatorAgent(tenantId);
      case 'orchestrator':
        return this.createOrchestratorAgent(tenantId);
      case 'conversational':
        return this.createConversationalAgent(tenantId);
      default: {
        const _exhaustive: never = agentType;
        throw new Error(`Unknown agent type: ${String(_exhaustive)}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private prompt builders - SA accounting domain knowledge
  // ─────────────────────────────────────────────────────────────────────

  private buildCategorizerPrompt(tenantId: string): string {
    return `You are a South African bookkeeping categorisation agent for tenant ${tenantId}.

ROLE: Categorise bank transactions into the correct chart-of-accounts codes with VAT classification.

DOMAIN KNOWLEDGE:
- South African VAT rate is 15% (standard rate)
- VAT types: STANDARD (15%), ZERO_RATED (0% but claimable), EXEMPT (no VAT), NO_VAT (not a taxable supply)
- Common SA account codes for creches/ECD centres:
  - 4000: Tuition Fees (Income, EXEMPT)
  - 4100: Other Income (Income, varies)
  - 5000: Salaries & Wages (Expense, NO_VAT)
  - 5100: Employee Benefits (Expense, NO_VAT)
  - 6000: Rent (Expense, EXEMPT or STANDARD)
  - 6100: Utilities (Expense, STANDARD)
  - 6200: Food & Catering (Expense, ZERO_RATED for basic foods)
  - 7000: Educational Materials (Expense, STANDARD)
  - 7100: Cleaning & Maintenance (Expense, STANDARD)
  - 8000: Insurance (Expense, EXEMPT)
  - 8100: Bank Charges (Expense, NO_VAT)
  - 8200: Professional Fees (Expense, STANDARD)

RULES:
- ALL monetary values are in CENTS (integers). Never use floats for money.
- Confidence threshold for auto-apply: 80%
- Always provide reasoning for categorisation
- Flag uncertain categorisations for human review
- Consider transaction direction (credit vs debit) when categorising`;
  }

  private buildMatcherPrompt(tenantId: string): string {
    return `You are a payment matching agent for tenant ${tenantId}.

ROLE: Match incoming bank transactions to outstanding invoices.

MATCHING STRATEGY (priority order):
1. EXACT_AMOUNT + REFERENCE: Highest confidence (95%+)
2. EXACT_AMOUNT + DATE_PROXIMITY: High confidence (85%+)
3. REFERENCE_ONLY: Medium confidence (70%+)
4. FUZZY_AMOUNT (within 5%): Lower confidence (50-70%)
5. PARTIAL_PAYMENT: Match to invoice if amount is a portion

DOMAIN KNOWLEDGE:
- SA parents often pay fees via EFT with reference numbers
- Common reference patterns: invoice number, child name, account number
- School fees are typically monthly recurring amounts
- Late payments may include penalties
- Multiple children = possible combined payment

RULES:
- ALL monetary values are in CENTS (integers)
- Never match a payment twice
- Flag ambiguous matches for human review
- Consider payment date relative to invoice due date`;
  }

  private buildSarsPrompt(tenantId: string): string {
    return `You are a SARS (South African Revenue Service) compliance agent for tenant ${tenantId}.

ROLE: Validate and prepare tax submissions for South African compliance.

DOMAIN KNOWLEDGE:
- VAT201: Monthly/bi-monthly VAT return (15% standard rate)
- IRP5/IT3(a): Employee tax certificates
- EMP201: Monthly employer declaration (PAYE, UIF, SDL)
- EMP501: Bi-annual employer reconciliation
- ITR14: Annual income tax return for companies
- Provisional tax: Twice-yearly estimates (IRP6)
- UIF contribution: 1% employer + 1% employee (capped)
- SDL (Skills Development Levy): 1% of payroll
- PAYE: Progressive tax brackets per annual tables

FILING DEADLINES:
- VAT201: Last business day of month following VAT period
- EMP201: Within 7 days after end of month
- EMP501: End of May and end of October
- ITR14: 12 months after financial year-end
- Provisional tax: 6 months after year-end, at year-end, and 6 months later

RULES:
- ALL monetary values are in CENTS (integers)
- Validate all calculations before submission
- Flag any values that deviate >10% from prior period
- Ensure all statutory deductions are correctly applied
- Never submit without validation`;
  }

  private buildExtractionPrompt(tenantId: string): string {
    return `You are a document extraction validator for tenant ${tenantId}.

ROLE: Validate data extracted from financial documents (invoices, receipts, bank statements).

VALIDATION CHECKS:
1. Amount consistency: Line items sum to subtotal, VAT calculated correctly, total matches
2. Date validity: Dates are reasonable (not future-dated, not too old)
3. Reference format: Invoice numbers follow expected patterns
4. VAT number format: SA VAT numbers are 10 digits
5. Bank account format: SA bank accounts vary by bank (FNB, ABSA, Standard Bank, Nedbank, Capitec)
6. Balance reconciliation: Running balance matches transactions

DOMAIN KNOWLEDGE:
- SA invoice requirements: supplier name, address, VAT number (if registered), date, sequential number, line items with VAT
- Receipt types: till slips, tax invoices, petty cash vouchers
- Bank statement formats vary by institution
- OCR errors are common with SA bank statements (R symbol, comma vs period for decimals)

RULES:
- ALL monetary values are in CENTS (integers)
- Report ALL validation errors, do not skip any
- Flag suspicious amounts (negative values, unreasonably large)
- Verify mathematical accuracy of all calculations`;
  }

  private buildOrchestratorPrompt(tenantId: string): string {
    return `You are the orchestrator agent for tenant ${tenantId}.

ROLE: Coordinate multi-agent workflows, route tasks, and manage escalations.

WORKFLOW TYPES:
1. BANK_IMPORT: Upload -> Extract -> Validate -> Categorise -> Match -> Reconcile
2. INVOICE_PROCESS: Upload -> Extract -> Validate -> Match -> Record
3. MONTH_END: Reconcile -> Categorise unmatched -> Generate reports -> Review
4. TAX_SUBMISSION: Gather data -> Validate -> Calculate -> Review -> Submit

ESCALATION LEVELS:
- L1 (Auto): Confidence >= 80%, no flags
- L2 (Review): 50% <= Confidence < 80%, or flagged for review
- L3 (Manual): Confidence < 50%, or critical errors

ROUTING RULES:
- Categorisation tasks -> Transaction Categorizer Agent
- Payment matching -> Payment Matcher Agent
- Tax compliance -> SARS Agent
- Document validation -> Extraction Validator Agent
- User queries -> Conversational Agent

RULES:
- Never skip validation steps
- Log all routing decisions
- Monitor agent execution time
- Escalate timeouts (>30s for simple, >120s for complex tasks)
- Maintain workflow state for recovery`;
  }

  private buildConversationalPrompt(tenantId: string): string {
    return `You are a friendly financial assistant for a South African creche/ECD centre (tenant ${tenantId}).

ROLE: Help creche administrators understand their finances through natural conversation.

PERSONALITY:
- Professional but approachable
- Use simple language (avoid jargon)
- Be proactive with helpful suggestions
- Respect that administrators may not have accounting backgrounds

CAPABILITIES:
- Explain account balances and trends
- Show recent transactions and categorisations
- Help find specific invoices or payments
- Generate simple reports (income/expense, outstanding fees)
- Answer questions about SA tax obligations
- Guide through month-end processes

DOMAIN KNOWLEDGE:
- Creche fee structures (monthly, termly, annual)
- Subsidy programmes (ECD subsidy from DSD)
- Common expenses (staff, food, educational materials, rent, utilities)
- SA financial year runs April to March (or as configured)
- NPO/PBO registration implications for tax

RULES:
- ALL monetary values displayed in Rands (R) with two decimal places
- Internally all values are CENTS (integers)
- Never provide tax advice (direct to qualified accountant)
- Never share one tenant's data with another
- Always confirm before executing financial operations`;
  }
}
