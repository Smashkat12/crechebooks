/**
 * Base SDK Agent
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/base-sdk-agent
 * @description Abstract base class for SDK-enhanced agents.
 * Provides common SDK availability checking and fallback execution logic.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS OR FALLBACKS that silently swallow errors
 * - executeWithFallback logs source clearly for debugging
 * - Fail fast if SDK is expected but broken
 */

import { Logger } from '@nestjs/common';
import { SdkAgentFactory } from './sdk-agent.factory';
import { AgentType, SdkConfigService } from './sdk-config';
import {
  AgentDefinition,
  SdkAgentInterface,
  SdkExecutionResult,
} from './interfaces/sdk-agent.interface';
import type {
  ClaudeClientService,
  ClaudeContentBlock,
  ClaudeMessage,
  ClaudeResponse,
} from './claude-client.service';
import type { AgentToolRegistry } from './tools/tool-registry.service';
import { AgentToolError } from './tools/interfaces/agent-tool.interface';

/**
 * Result of {@link BaseSdkAgent.runWithTools} — an LLM turn that may have
 * dispatched one or more tool calls.
 */
export interface ToolLoopResult {
  /** Final `end_turn` assistant text, or the last tool_use turn's text. */
  content: string;
  /** Number of full tool-use iterations executed. */
  toolCalls: number;
  /** Stop reason on the terminal turn. */
  stopReason: string;
  /** Raw content blocks of the final assistant turn. */
  finalBlocks: ClaudeContentBlock[];
}

/**
 * Options for {@link BaseSdkAgent.runWithTools}.
 */
export interface RunWithToolsOptions {
  /** Which agent's tool allowlist to enforce. */
  agentType: AgentType;
  /** Tenant scope for tool handlers. */
  tenantId: string;
  /** Optional acting user for audit-log attribution. */
  userId?: string;
  /** Optional agent identifier for audit-log attribution. */
  agentId?: string;
  /** System prompt (defaults to the agent definition's prompt). */
  systemPrompt?: string;
  /** Initial user message. */
  userMessage: string;
  /** Model name (default: agent's configured model). */
  model?: string;
  /** Hard cap on tool-use iterations (default 5) to avoid runaway loops. */
  maxIterations?: number;
  /** Max tokens per turn (forwarded to Claude API). */
  maxTokensPerTurn?: number;
}

/**
 * Abstract base class for all SDK-enhanced agents.
 * Subclasses must implement getAgentDefinition to provide their specific
 * agent configuration (prompt, tools, model).
 */
export abstract class BaseSdkAgent implements SdkAgentInterface {
  protected readonly logger: Logger;
  protected readonly factory: SdkAgentFactory;
  protected readonly config: SdkConfigService;

  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    agentName: string,
  ) {
    this.factory = factory;
    this.config = config;
    this.logger = new Logger(agentName);
  }

  /**
   * Returns the agent definition for a given tenant.
   * Must be implemented by each concrete agent subclass.
   * @param tenantId - Tenant ID for tenant-specific configuration
   */
  abstract getAgentDefinition(tenantId: string): AgentDefinition;

  /**
   * Checks whether the Claude Agent SDK is available and enabled.
   * @returns true if SDK is enabled and API key is present
   */
  isSdkAvailable(): boolean {
    const available = this.config.isEnabled();
    this.logger.debug(`SDK available: ${String(available)}`);
    return available;
  }

  /**
   * Executes the primary SDK function, falling back to the secondary function
   * if the SDK is unavailable or the primary function throws.
   *
   * This method:
   * 1. Checks if SDK is available
   * 2. If available, runs sdkFn and returns result with source='SDK'
   * 3. If SDK unavailable OR sdkFn throws, runs fallbackFn with source='FALLBACK'
   * 4. Always logs execution source, duration, and errors
   *
   * @param sdkFn - Primary SDK-powered function
   * @param fallbackFn - Fallback function if SDK is unavailable or fails
   * @returns Execution result with source tracking and timing
   */
  async executeWithFallback<T>(
    sdkFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
  ): Promise<SdkExecutionResult<T>> {
    const startTime = Date.now();

    if (!this.isSdkAvailable()) {
      this.logger.debug('SDK not available, executing fallback directly');
      const data = await fallbackFn();
      return {
        data,
        source: 'FALLBACK',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      this.logger.debug('Executing via SDK');
      const data = await sdkFn();
      const durationMs = Date.now() - startTime;
      this.logger.debug(`SDK execution completed in ${String(durationMs)}ms`);
      return {
        data,
        source: 'SDK',
        durationMs,
        model: this.config.getModelForAgent('categorizer'), // Will be overridden by subclass context
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `SDK execution failed after ${String(durationMs)}ms: ${errorMessage}`,
      );
      this.logger.warn('Falling back to non-SDK execution path');

      const fallbackStartTime = Date.now();
      const data = await fallbackFn();
      return {
        data,
        source: 'FALLBACK',
        durationMs: Date.now() - fallbackStartTime,
      };
    }
  }

  /**
   * Run a multi-turn LLM conversation with real tool bindings.
   *
   * The loop:
   *   1. Send the user message to Claude with the agent's tool definitions.
   *   2. If the response contains any `tool_use` blocks, execute each via the
   *      registry, append the assistant turn + a matching `tool_result` user
   *      turn to the message history, and loop.
   *   3. If the response's stop_reason is `end_turn` (or the iteration cap is
   *      reached), return the final text.
   *
   * Errors from tool handlers are surfaced back to the LLM as `tool_result`
   * blocks with `is_error: true` — the model can then self-correct or abort.
   * The registry enforces the per-agent tool allowlist; the LLM cannot call
   * a tool that wasn't declared for it.
   */
  async runWithTools(
    claude: ClaudeClientService,
    registry: AgentToolRegistry,
    options: RunWithToolsOptions,
  ): Promise<ToolLoopResult> {
    if (!claude.isAvailable()) {
      throw new Error(
        'Claude client not available. Check ANTHROPIC_API_KEY configuration.',
      );
    }
    const agentDef = this.getAgentDefinition(options.tenantId);
    const systemPrompt = options.systemPrompt ?? agentDef.prompt;
    const toolDefs = registry.getToolDefinitionsForAgent(options.agentType);
    const maxIterations = options.maxIterations ?? 5;

    const messages: ClaudeMessage[] = [
      { role: 'user', content: options.userMessage },
    ];

    let toolCalls = 0;
    let lastResponse: ClaudeResponse | undefined;

    for (let i = 0; i < maxIterations; i++) {
      const response = await claude.sendMessage({
        systemPrompt,
        messages,
        model: options.model ?? agentDef.model,
        tools: toolDefs,
        maxTokens: options.maxTokensPerTurn,
      });
      lastResponse = response;

      const toolUseBlocks = response.contentBlocks.filter(
        (b): b is Extract<ClaudeContentBlock, { type: 'tool_use' }> =>
          b.type === 'tool_use',
      );

      // Terminal: LLM did not request any tool.
      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') {
        return {
          content: response.content,
          toolCalls,
          stopReason: response.stopReason,
          finalBlocks: response.contentBlocks,
        };
      }

      // Assistant turn — full content blocks, so the model can see its own
      // tool_use ids on the next turn.
      messages.push({ role: 'assistant', content: response.contentBlocks });

      // Execute each tool_use, then feed all tool_results back in ONE user
      // turn (Anthropic requires results to be grouped together).
      const resultBlocks: ClaudeContentBlock[] = [];
      for (const use of toolUseBlocks) {
        toolCalls += 1;
        try {
          const result = await registry.executeForAgent(
            options.agentType,
            use.name,
            use.input,
            {
              tenantId: options.tenantId,
              userId: options.userId,
              agentId: options.agentId,
            },
          );
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: serialiseToolResult(result),
            is_error: false,
          });
        } catch (err) {
          const message =
            err instanceof AgentToolError
              ? `${err.code}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          this.logger.warn(
            `Tool "${use.name}" failed for agent "${options.agentType}": ${message}`,
          );
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: message,
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: resultBlocks });
    }

    // Iteration cap hit. Return whatever the last response said, plus a hint.
    this.logger.warn(
      `runWithTools hit iteration cap (${String(maxIterations)}) for agent "${options.agentType}"`,
    );
    return {
      content:
        lastResponse?.content ??
        `Tool-use loop exceeded ${String(maxIterations)} iterations without a final answer.`,
      toolCalls,
      stopReason: 'max_iterations',
      finalBlocks: lastResponse?.contentBlocks ?? [],
    };
  }
}

/**
 * Serialise a tool handler result for the LLM. Anthropic tool_result blocks
 * accept a string body — we JSON-stringify structured data and pass strings
 * through unchanged.
 */
function serialiseToolResult(result: unknown): string {
  if (result == null) return 'null';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    // JSON.stringify only throws on cyclic structures. Fall back to a fixed
    // marker rather than `String(result)`, which would flag as base-toString.
    return '[unserialisable tool result]';
  }
}
