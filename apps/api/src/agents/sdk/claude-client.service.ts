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
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
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
}

/**
 * Response from Claude API.
 */
export interface ClaudeResponse {
  /** The assistant's response text */
  content: string;
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

    const requestBody = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: options.systemPrompt,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

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

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        model: string;
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string;
      };

      // Extract text content from response
      const textContent = data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const result: ClaudeResponse = {
        content: textContent,
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
