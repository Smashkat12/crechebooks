/**
 * Agent Tool Interfaces
 *
 * @module agents/sdk/tools/interfaces/agent-tool.interface
 * @description Real, callable agent tools that replace the decorative string tools
 * previously declared in {@link SdkAgentFactory}. Each tool ships a JSON-schema
 * input contract plus an executable handler. The tool registry binds these
 * to the LLM path so the model's `tool_use` blocks actually run domain code.
 *
 * CRITICAL RULES:
 * - Every handler MUST enforce tenant isolation via {@link AgentToolContext.tenantId}
 * - Mutation handlers MUST audit-log via {@link AgentToolContext.prisma} auditLog
 * - Handlers NEVER contact parents (no email/WhatsApp/SMS). Delivery stays out of
 *   the LLM path; it is triggered per-caller by explicit endpoints.
 * - Monetary values are cents (integers). Handlers must not silently coerce to
 *   floats.
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../../database/prisma/prisma.service';

/**
 * JSON-schema shape accepted by the Anthropic Messages API for a tool
 * `input_schema`. We keep this narrow so the registry can round-trip it as-is.
 */
export interface AgentToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Runtime context injected into every tool handler. Built by the caller
 * (typically {@link BaseSdkAgent.runWithTools}) so tenant isolation is enforced
 * from the outside — handlers cannot forge a tenant id.
 */
export interface AgentToolContext {
  /** Tenant ID scope. All DB reads/writes MUST filter by this. */
  tenantId: string;
  /** Optional acting user for audit-log attribution. */
  userId?: string;
  /** Agent that triggered this tool call — for audit-log attribution. */
  agentId?: string;
  /** Global Prisma client (tenant-globally scoped). */
  prisma: PrismaService;
  /** Nest-flavoured logger for handler diagnostics. */
  logger: Logger;
}

/**
 * Handler result. Tools may return arbitrary JSON-serialisable data; the
 * registry stringifies it for the LLM `tool_result` block. Handlers should NOT
 * throw — errors bubble to the loop via {@link AgentToolError}.
 */
export type AgentToolResult = unknown;

/**
 * A callable tool with a schema, description, and handler. Registered with
 * {@link AgentToolRegistry} and referenced by name from the agent factory.
 *
 * The handler signature is intentionally loose (`Record<string, unknown>`)
 * because inputs arrive from the LLM as free-form JSON — each tool
 * implementation narrows the shape internally after validation. This keeps
 * the registry storage covariant so a heterogeneous array of tools has one
 * type.
 */
export interface AgentTool {
  /** Snake_case name used by the LLM (`list_invoices`, `allocate_payment`, …). */
  readonly name: string;
  /** Human-readable description surfaced to the LLM. Keep to one line. */
  readonly description: string;
  /** JSON schema for the tool's input, verbatim to the Anthropic API. */
  readonly inputSchema: AgentToolInputSchema;
  /**
   * Whether this tool mutates state. Mutation tools MUST audit-log and MUST
   * NOT contact parents.
   */
  readonly mutation: boolean;
  /**
   * Execute the tool. Called by {@link AgentToolRegistry.execute} with the
   * LLM-supplied input plus the registry-built context.
   */
  handler(
    input: Record<string, unknown>,
    ctx: AgentToolContext,
  ): Promise<AgentToolResult>;
}

/**
 * Recoverable error surfaced back to the LLM as a `tool_result` with
 * `is_error: true`. Handlers should throw this for expected failures
 * (bad input, not-found, tenant mismatch) so the LLM can self-correct.
 */
export class AgentToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'TOOL_ERROR',
  ) {
    super(message);
    this.name = 'AgentToolError';
  }
}
