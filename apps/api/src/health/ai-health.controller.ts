/**
 * AI Health Check Controller
 * TASK-SDK-005: Claude API Integration Testing
 *
 * Provides endpoints to test the Claude AI integration via Requesty proxy.
 * All endpoints are public and skip throttling for testing purposes.
 *
 * Endpoints:
 * - GET /health/ai - Check if Claude client is configured
 * - POST /health/ai/test - Send a test message to Claude
 * - POST /health/ai/categorize - Test transaction categorization
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Logger,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../api/auth/decorators/public.decorator';
import { ClaudeClientService } from '../agents/sdk/claude-client.service';
import { SdkConfigService } from '../agents/sdk/sdk-config';

interface AiHealthResponse {
  status: 'available' | 'unavailable';
  configured: boolean;
  baseUrl?: string;
  defaultModel?: string;
  message?: string;
}

interface TestMessageDto {
  message: string;
  model?: string;
}

interface TestMessageResponse {
  success: boolean;
  response?: string;
  model?: string;
  durationMs: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

interface TestCategorizationDto {
  payeeName: string;
  description?: string;
  amountCents: number;
  isCredit: boolean;
}

interface TestCategorizationResponse {
  success: boolean;
  categorization?: {
    accountCode: string;
    accountName: string;
    vatType: string;
    confidence: number;
    reasoning: string;
  };
  model?: string;
  durationMs: number;
  error?: string;
}

@Controller('health/ai')
@Public()
@SkipThrottle()
export class AiHealthController {
  private readonly logger = new Logger(AiHealthController.name);

  constructor(
    @Optional()
    @Inject(ClaudeClientService)
    private readonly claudeClient?: ClaudeClientService,
    @Optional()
    @Inject(SdkConfigService)
    private readonly sdkConfig?: SdkConfigService,
  ) {}

  /**
   * Check if Claude AI client is configured and available.
   * GET /health/ai
   */
  @Get()
  checkAiHealth(): AiHealthResponse {
    const configured = this.sdkConfig?.hasApiKey() ?? false;
    const available = this.claudeClient?.isAvailable() ?? false;

    return {
      status: available ? 'available' : 'unavailable',
      configured,
      baseUrl: this.sdkConfig?.getBaseUrl() ?? 'not configured',
      defaultModel: 'claude-sonnet-4-20250514',
      message: available
        ? 'Claude client is ready'
        : configured
          ? 'Claude client configured but not initialized'
          : 'ANTHROPIC_API_KEY not configured',
    };
  }

  /**
   * Send a test message to Claude via Requesty proxy.
   * POST /health/ai/test
   */
  @Post('test')
  async testMessage(
    @Body() dto: TestMessageDto,
  ): Promise<TestMessageResponse> {
    const startTime = Date.now();

    if (!this.claudeClient?.isAvailable()) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: 'Claude client not available. Check ANTHROPIC_API_KEY.',
      };
    }

    try {
      const response = await this.claudeClient.sendMessage({
        systemPrompt: 'You are a helpful assistant. Respond concisely.',
        messages: [{ role: 'user', content: dto.message }],
        model: dto.model ?? 'haiku',
        maxTokens: 256,
        temperature: 0,
      });

      return {
        success: true,
        response: response.content,
        model: response.model,
        durationMs: Date.now() - startTime,
        usage: response.usage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Test message failed: ${errorMessage}`);

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Test transaction categorization via Claude.
   * POST /health/ai/categorize
   */
  @Post('categorize')
  async testCategorization(
    @Body() dto: TestCategorizationDto,
  ): Promise<TestCategorizationResponse> {
    const startTime = Date.now();

    if (!this.claudeClient?.isAvailable()) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: 'Claude client not available. Check ANTHROPIC_API_KEY.',
      };
    }

    const systemPrompt = `You are a South African bookkeeping categorization agent.
Categorize bank transactions into the correct chart-of-accounts codes with VAT classification.

VAT types: STANDARD (15%), ZERO_RATED (0% but claimable), EXEMPT (no VAT), NO_VAT (not a taxable supply)

Common SA account codes for creches/ECD centres:
- 4000: Tuition Fees (Income, EXEMPT)
- 4100: Other Income (Income, varies)
- 5000: Salaries & Wages (Expense, NO_VAT)
- 6000: Rent (Expense, EXEMPT or STANDARD)
- 6100: Utilities (Expense, STANDARD)
- 6200: Food & Catering (Expense, ZERO_RATED for basic foods)
- 7000: Educational Materials (Expense, STANDARD)
- 8100: Bank Charges (Expense, NO_VAT)

Return ONLY a JSON object with these fields:
{ "accountCode": "XXXX", "accountName": "Name", "vatType": "TYPE", "confidence": 0-100, "reasoning": "explanation" }`;

    const userMessage = `Categorize this bank transaction:
Payee: ${dto.payeeName}
Description: ${dto.description ?? 'N/A'}
Amount: ${dto.amountCents} cents (R${(dto.amountCents / 100).toFixed(2)})
Type: ${dto.isCredit ? 'CREDIT (income)' : 'DEBIT (expense)'}`;

    try {
      const response = await this.claudeClient.sendMessage({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        model: 'haiku',
        maxTokens: 512,
        temperature: 0,
      });

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*?"accountCode"[\s\S]*?\}/);
      if (!jsonMatch) {
        return {
          success: false,
          durationMs: Date.now() - startTime,
          error: `Could not parse categorization response: ${response.content.slice(0, 200)}`,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        accountCode: string;
        accountName: string;
        vatType: string;
        confidence: number;
        reasoning: string;
      };

      return {
        success: true,
        categorization: {
          accountCode: parsed.accountCode,
          accountName: parsed.accountName,
          vatType: parsed.vatType,
          confidence: Math.min(100, Math.max(0, parsed.confidence)),
          reasoning: parsed.reasoning,
        },
        model: response.model,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Test categorization failed: ${errorMessage}`);

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }
}
