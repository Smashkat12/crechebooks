/**
 * SDK Agent Interfaces
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/interfaces/sdk-agent.interface
 * @description TypeScript interfaces for SDK-enhanced agents.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Temperature = 0 for financial categorization
 * - No backwards compatibility - fail fast
 * - Tenant isolation on ALL queries
 */

/**
 * Agent definition structure matching the Claude Agent SDK pattern.
 * Defined locally since @anthropic-ai/claude-agent-sdk may not be available.
 */
export interface AgentDefinition {
  /** Human-readable description of the agent's purpose */
  description: string;
  /** System prompt defining agent behaviour, domain knowledge, and constraints */
  prompt: string;
  /** List of MCP tool names the agent is allowed to use */
  tools: string[];
  /** Model identifier (e.g., 'haiku', 'sonnet') */
  model: string;
}

/**
 * Contract for SDK-enhanced agents.
 * Any agent that integrates with the Claude Agent SDK must implement this interface.
 */
export interface SdkAgentInterface {
  /**
   * Returns the agent's full definition including prompt, tools, and model.
   * @param tenantId - Tenant ID for tenant-specific prompt customisation
   * @returns The agent definition configured for the given tenant
   */
  getAgentDefinition(tenantId: string): AgentDefinition;

  /**
   * Checks whether the SDK is available and enabled for use.
   * @returns true if SDK is available and API key is configured
   */
  isSdkAvailable(): boolean;

  /**
   * Executes the primary function via SDK, falling back to a secondary function on failure.
   * @param sdkFn - Primary SDK-powered function
   * @param fallbackFn - Fallback function if SDK is unavailable or fails
   * @returns Execution result with source tracking
   */
  executeWithFallback<T>(
    sdkFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
  ): Promise<SdkExecutionResult<T>>;
}

/**
 * Generic result wrapper for SDK execution with source tracking.
 */
export interface SdkExecutionResult<T> {
  /** The result data */
  data: T;
  /** Whether the result came from SDK or fallback logic */
  source: 'SDK' | 'FALLBACK';
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Model used for SDK execution (only present when source is SDK) */
  model?: string;
}

/**
 * Result of SDK-powered transaction categorisation.
 * All monetary values are CENTS (integers).
 */
export interface SdkCategorizationResult {
  /** SA chart-of-accounts code (e.g., '4100', '8100') */
  accountCode: string;
  /** Human-readable account name */
  accountName: string;
  /** VAT classification for SA tax compliance */
  vatType: string;
  /** Confidence score 0-100 */
  confidence: number;
}

/**
 * Result of SDK-powered payment matching.
 */
export interface SdkMatchResult {
  /** ID of the matched invoice */
  invoiceId: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** How the match was determined (e.g., 'EXACT_AMOUNT', 'REFERENCE', 'FUZZY') */
  matchType: string;
}

/**
 * Result of SDK-powered document validation.
 */
export interface SdkValidationResult {
  /** Whether the document passed all validation checks */
  isValid: boolean;
  /** List of validation error messages (empty if valid) */
  errors: string[];
  /** Overall confidence in the validation result 0-100 */
  confidence: number;
}
