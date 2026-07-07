/**
 * Claude Client Service
 * TASK-SDK-005: Claude API Integration via Requesty Proxy
 *
 * @module agents/sdk/claude-client.service
 * @description HTTP client for calling Claude API via Requesty.ai proxy.
 * Uses the Anthropic Messages API format with configurable model routing.
 *
 * CRITICAL RULES:
 * - Temperature = 0 for financial operations (deterministic)
 * - All requests go through Requesty proxy for observability
 * - Fail fast on API errors (no silent fallbacks)
 * - Log all requests for debugging
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Message format for Claude API requests.
 *
 * `content` accepts either a plain string (single-turn chat) or an array of
 * content blocks — the latter is required to carry `tool_use` / `tool_result`
 * blocks in the multi-turn tool-use loop.
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

/**
 * Content block shapes accepted by the Anthropic Messages API. We keep the
 * union narrow to what our tool-use loop actually round-trips: text (both
 * directions), tool_use (LLM → us), tool_result (us → LLM).
 */
export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

/**
 * Anthropic tool definition (subset). Matches the shape emitted by
 * {@link AgentToolRegistry.getToolDefinitionsForAgent}.
 */
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Request options for Claude API calls.
 */
export interface ClaudeRequestOptions {
  /** System prompt for the conversation */
  systemPrompt: string;
  /** User message(s) */
  messages: ClaudeMessage[];
  /** Model identifier: 'haiku', 'sonnet', or full model name */
  model?: string;
  /** Maximum tokens in response (default: 1024) */
  maxTokens?: number;
  /** Temperature 0-1 (default: 0 for deterministic) */
  temperature?: number;
  /** Optional request metadata for logging */
  metadata?: Record<string, string>;
  /** Tool definitions for the LLM tool_use path */
  tools?: ClaudeToolDefinition[];
}

/**
 * Response from Claude API.
 */
export interface ClaudeResponse {
  /** The assistant's flattened text content (joined text blocks) */
  content: string;
  /** All content blocks from the response, in order — needed for the tool-use loop */
  contentBlocks: ClaudeContentBlock[];
  /** Model that was used */
  model: string;
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Stop reason */
  stopReason: string;
}

/**
 * Model name mapping from short names to full Anthropic model IDs.
 */
const MODEL_MAP: Record<string, string> = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
};

@Injectable()
export class ClaudeClientService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeClientService.name);
  private apiKey: string | undefined;
  private baseUrl: string;
  private defaultModel: string;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'ANTHROPIC_BASE_URL',
      'https://router.requesty.ai/v1',
    );
    this.defaultModel = this.configService.get<string>(
      'ANTHROPIC_MODEL',
      'claude-sonnet-4-20250514',
    );
  }

  onModuleInit(): void {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    if (!this.apiKey || this.apiKey === 'your-requesty-api-key') {
      this.logger.warn(
        'ANTHROPIC_API_KEY not configured - Claude API calls will fail',
      );
      return;
    }

    this.initialized = true;
    this.logger.log(
      `Claude client initialized (baseUrl=${this.baseUrl}, defaultModel=${this.defaultModel})`,
    );
  }

  /**
   * Check if the Claude client is available and configured.
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Resolve a short model name to full Anthropic model ID.
   */
  private resolveModel(model: string): string {
    return MODEL_MAP[model.toLowerCase()] ?? model;
  }

  /**
   * Send a message to Claude and get a response.
   *
   * @param options - Request options including system prompt and messages
   * @returns Claude's response
   * @throws Error if API call fails
   */
  async sendMessage(options: ClaudeRequestOptions): Promise<ClaudeResponse> {
    if (!this.initialized) {
      throw new Error(
        'Claude client not initialized. Check ANTHROPIC_API_KEY configuration.',
      );
    }

    const model = this.resolveModel(options.model ?? this.defaultModel);
    const maxTokens = options.maxTokens ?? 1024;
    const temperature = options.temperature ?? 0;

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: options.systemPrompt,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.debug(
      `[${requestId}] Sending request to Claude (model=${model}, messages=${String(options.messages.length)})`,
    );

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.error(
          `[${requestId}] Claude API error (${String(response.status)}) after ${String(durationMs)}ms: ${errorBody}`,
        );
        throw new Error(
          `Claude API request failed (${String(response.status)}): ${errorBody}`,
        );
      }

      // The Anthropic Messages API returns a mix of content-block types
      // (text + tool_use). We keep the raw blocks around so the tool-use
      // loop can round-trip them, and flatten just the text for the legacy
      // `content` string field.
      const data = (await response.json()) as {
        content: Array<Record<string, unknown>>;
        model: string;
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string;
      };

      const contentBlocks: ClaudeContentBlock[] = data.content
        .map((raw) => normaliseContentBlock(raw))
        .filter((b): b is ClaudeContentBlock => b !== null);

      const textContent = contentBlocks
        .filter(
          (b): b is Extract<ClaudeContentBlock, { type: 'text' }> =>
            b.type === 'text',
        )
        .map((b) => b.text)
        .join('\n');

      const result: ClaudeResponse = {
        content: textContent,
        contentBlocks,
        model: data.model,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
        stopReason: data.stop_reason,
      };

      this.logger.debug(
        `[${requestId}] Claude response received in ${String(durationMs)}ms ` +
          `(tokens: ${String(result.usage.inputTokens)}→${String(result.usage.outputTokens)}, stop=${result.stopReason})`,
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Re-throw if it's already our error
      if (errorMessage.includes('Claude API request failed')) {
        throw error;
      }

      this.logger.error(
        `[${requestId}] Claude request failed after ${String(durationMs)}ms: ${errorMessage}`,
      );
      throw new Error(`Claude API request failed: ${errorMessage}`);
    }
  }

  /**
   * Simple helper for single-turn conversations.
   *
   * @param systemPrompt - System prompt
   * @param userMessage - User's message
   * @param model - Optional model override
   * @returns Claude's response text
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    model?: string,
  ): Promise<string> {
    const response = await this.sendMessage({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      model,
    });
    return response.content;
  }
}

/**
 * Narrow a raw content block from the Anthropic response into a typed
 * {@link ClaudeContentBlock}. Unknown types are dropped (returned as null)
 * — the tool-use loop only cares about text and tool_use blocks.
 */
function normaliseContentBlock(
  raw: Record<string, unknown>,
): ClaudeContentBlock | null {
  const type = raw['type'];
  if (type === 'text' && typeof raw['text'] === 'string') {
    return { type: 'text', text: raw['text'] };
  }
  if (
    type === 'tool_use' &&
    typeof raw['id'] === 'string' &&
    typeof raw['name'] === 'string' &&
    typeof raw['input'] === 'object' &&
    raw['input'] !== null
  ) {
    return {
      type: 'tool_use',
      id: raw['id'],
      name: raw['name'],
      input: raw['input'] as Record<string, unknown>,
    };
  }
  return null;
}
