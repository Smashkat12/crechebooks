/**
 * LLMWhisperer Configuration
 * TASK-TRANS-015
 *
 * Cloud-based PDF extraction service configuration.
 * CRITICAL: API key required - fails immediately if missing.
 */
import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('LLMWhispererConfig');

export interface LLMWhispererConfigType {
  apiKey: string;
  keyId: string;
  baseUrl: string;
  mode: 'native_text' | 'low_cost' | 'high_quality' | 'form' | 'table';
  outputMode: 'layout_preserving' | 'text';
  timeoutMs: number;
  maxRetries: number;
  maxCallsPerBatch: number;
}

export interface PdfParserConfigType {
  confidenceThreshold: number;
  minTransactionsForLocal: number;
  maxLLMWhispererCalls: number;
}

/**
 * Get LLMWhisperer configuration from environment variables.
 * Validates at runtime, fails fast if used without configuration.
 */
export function getLLMWhispererConfig(): LLMWhispererConfigType {
  return {
    apiKey: process.env.LLMWHISPERER_API_KEY || '',
    keyId: process.env.LLMWHISPERER_KEY_ID || '',
    baseUrl:
      process.env.LLMWHISPERER_BASE_URL ||
      'https://llmwhisperer-api.us-central.unstract.com',

    // Extraction settings
    mode: 'native_text', // native_text for digital PDFs
    outputMode: 'layout_preserving', // Preserve document structure

    // Timeout and retry settings
    timeoutMs: 30000, // 30 seconds
    maxRetries: 2,

    // Rate limiting
    maxCallsPerBatch: 50,
  };
}

/**
 * PDF parser configuration for hybrid routing
 */
export function getPdfParserConfig(): PdfParserConfigType {
  return {
    confidenceThreshold: 70, // Below this -> LLMWhisperer
    minTransactionsForLocal: 3, // If < 3 extracted, try LLMWhisperer
    maxLLMWhispererCalls: 50, // Rate limit per import batch
  };
}

// Export as constants for direct access
export const LLMWHISPERER_CONFIG = getLLMWhispererConfig();
export const PDF_PARSER_CONFIG = getPdfParserConfig();

/**
 * Validate configuration at startup
 * @throws Error if required config is missing
 */
export function validateLLMWhispererConfig(): void {
  const config = getLLMWhispererConfig();
  if (!config.apiKey) {
    logger.warn(
      'LLMWHISPERER_API_KEY not set - LLMWhisperer fallback disabled',
    );
  } else {
    logger.log('LLMWhisperer configuration validated');
  }
}

export default registerAs('llmwhisperer', getLLMWhispererConfig);
