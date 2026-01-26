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
import { SdkConfigService } from './sdk-config';
import {
  AgentDefinition,
  SdkAgentInterface,
  SdkExecutionResult,
} from './interfaces/sdk-agent.interface';

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
}
