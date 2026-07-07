/**
 * Agent Tool Registry
 *
 * @module agents/sdk/tools/tool-registry.service
 * @description NestJS-provided registry of real, callable {@link AgentTool}s.
 * Replaces the decorative string tools previously declared on {@link SdkAgentFactory}.
 *
 * Responsibilities:
 *   - Hold the canonical tool set (read + mutation).
 *   - Expose Anthropic-shaped tool definitions per agent type ({@link getToolDefinitionsForAgent}).
 *   - Execute a tool by name with a tenant-scoped {@link AgentToolContext} ({@link execute}).
 *
 * Agent → tool mapping:
 *   - categorizer:     read+mutation, transaction/COA-focused.
 *   - matcher:         read+mutation, invoice/payment/transaction-focused.
 *   - orchestrator:    broad read set, no mutations.
 *   - conversational:  broad read set only.
 *   - sars, extraction: no tools yet (require SARS + extraction-specific tools).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { AgentType } from '../sdk-config';
import type {
  AgentTool,
  AgentToolContext,
  AgentToolInputSchema,
  AgentToolResult,
} from './interfaces/agent-tool.interface';
import { AgentToolError } from './interfaces/agent-tool.interface';

// Read tools
import { listInvoicesTool } from './read/list-invoices.tool';
import { listPaymentsTool } from './read/list-payments.tool';
import { listTransactionsTool } from './read/list-transactions.tool';
import { getArrearsSummaryTool } from './read/get-arrears-summary.tool';
import { getDashboardMetricsTool } from './read/get-dashboard-metrics.tool';
import { listChildrenTool } from './read/list-children.tool';
import { listParentsTool } from './read/list-parents.tool';
import { listStaffTool } from './read/list-staff.tool';
import { getTenantTool } from './read/get-tenant.tool';

// Mutation tools
import { generateInvoicesTool } from './mutation/generate-invoices.tool';
import { allocatePaymentTool } from './mutation/allocate-payment.tool';
import { runPaymentMatchingTool } from './mutation/run-payment-matching.tool';
import { categorizeTransactionsTool } from './mutation/categorize-transactions.tool';

/**
 * Anthropic Messages API `tool` shape. Used verbatim in the request body.
 */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: AgentToolInputSchema;
}

/**
 * Agent → allowed tool names. Adding a new tool here does NOT change agent
 * behaviour on its own — the agent must also feed the tool definitions into
 * the LLM request (via {@link getToolDefinitionsForAgent}).
 */
const TOOLS_BY_AGENT: Record<AgentType, string[]> = {
  categorizer: [
    // read
    'list_transactions',
    'get_tenant',
    // mutation
    'categorize_transactions',
  ],
  matcher: [
    // read
    'list_invoices',
    'list_payments',
    'list_transactions',
    // mutation
    'allocate_payment',
    'run_payment_matching',
  ],
  sars: [
    // read only for now — SARS-specific tools require the sars module.
    'get_tenant',
    'get_dashboard_metrics',
  ],
  extraction: [
    // read only for now — extraction-specific tools live outside this registry.
    'get_tenant',
  ],
  orchestrator: [
    // broad read + all mutations (the orchestrator dispatches to specialists).
    'list_invoices',
    'list_payments',
    'list_transactions',
    'get_arrears_summary',
    'get_dashboard_metrics',
    'list_children',
    'list_parents',
    'list_staff',
    'get_tenant',
    'generate_invoices',
    'run_payment_matching',
    'allocate_payment',
    'categorize_transactions',
  ],
  conversational: [
    // read-only across the whole domain.
    'list_invoices',
    'list_payments',
    'list_transactions',
    'get_arrears_summary',
    'get_dashboard_metrics',
    'list_children',
    'list_parents',
    'list_staff',
    'get_tenant',
  ],
};

@Injectable()
export class AgentToolRegistry {
  private readonly logger = new Logger(AgentToolRegistry.name);
  private readonly tools = new Map<string, AgentTool>();

  constructor(private readonly prisma: PrismaService) {
    this.registerAll([
      // read
      listInvoicesTool,
      listPaymentsTool,
      listTransactionsTool,
      getArrearsSummaryTool,
      getDashboardMetricsTool,
      listChildrenTool,
      listParentsTool,
      listStaffTool,
      getTenantTool,
      // mutation
      generateInvoicesTool,
      allocatePaymentTool,
      runPaymentMatchingTool,
      categorizeTransactionsTool,
    ]);
  }

  private registerAll(tools: AgentTool[]): void {
    for (const t of tools) {
      if (this.tools.has(t.name)) {
        throw new Error(`AgentToolRegistry: duplicate tool name "${t.name}"`);
      }
      this.tools.set(t.name, t);
    }
    this.logger.debug(
      `Registered ${String(this.tools.size)} agent tools (${Array.from(this.tools.keys()).join(', ')})`,
    );
  }

  /** All tool names the registry knows about. */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Tool by name, or undefined if unregistered. */
  get(toolName: string): AgentTool | undefined {
    return this.tools.get(toolName);
  }

  /** Tool names allowed for a given agent type. */
  getToolNamesForAgent(agent: AgentType): string[] {
    return [...(TOOLS_BY_AGENT[agent] ?? [])];
  }

  /** Anthropic-shaped tool definitions for a given agent type. */
  getToolDefinitionsForAgent(agent: AgentType): AnthropicToolDefinition[] {
    return this.getToolNamesForAgent(agent).flatMap((name) => {
      const t = this.tools.get(name);
      if (!t) {
        this.logger.warn(
          `AgentToolRegistry: agent "${agent}" references unknown tool "${name}"`,
        );
        return [];
      }
      return [
        {
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        },
      ];
    });
  }

  /**
   * Execute a tool by name. Builds the runtime context here so tenant isolation
   * is enforced by the registry, not by the caller.
   *
   * @throws AgentToolError if the tool is unknown or the agent isn't allowed
   *   to call it.
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    ctx: Omit<AgentToolContext, 'prisma' | 'logger'>,
  ): Promise<AgentToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new AgentToolError(`unknown tool "${toolName}"`, 'UNKNOWN_TOOL');
    }
    if (!ctx.tenantId) {
      throw new AgentToolError(
        `tenantId is required to execute tool "${toolName}"`,
        'MISSING_TENANT',
      );
    }
    const fullCtx: AgentToolContext = {
      ...ctx,
      prisma: this.prisma,
      logger: this.logger,
    };
    return tool.handler(input, fullCtx);
  }

  /**
   * Guarded execute: also checks the tool is on the agent's allowlist. Callers
   * from the tool-use loop use this to prevent the LLM from calling a tool it
   * wasn't declared for.
   */
  async executeForAgent(
    agent: AgentType,
    toolName: string,
    input: Record<string, unknown>,
    ctx: Omit<AgentToolContext, 'prisma' | 'logger'>,
  ): Promise<AgentToolResult> {
    if (!this.getToolNamesForAgent(agent).includes(toolName)) {
      throw new AgentToolError(
        `agent "${agent}" is not allowed to call tool "${toolName}"`,
        'TOOL_NOT_ALLOWED',
      );
    }
    return this.execute(toolName, input, ctx);
  }
}
