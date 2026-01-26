/**
 * SDK Configuration Service
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/sdk-config
 * @description Centralised configuration for agent SDK integration.
 * Reads environment variables for model routing, API keys, and feature flags.
 *
 * CRITICAL RULES:
 * - Temperature = 0 for financial categorisation
 * - No fallback values for API keys (fail fast)
 * - Provider-per-agent routing via env vars
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Supported agent types in the SDK layer.
 */
export type AgentType =
  | 'categorizer'
  | 'matcher'
  | 'sars'
  | 'extraction'
  | 'orchestrator'
  | 'conversational';

/**
 * Supported model providers for multi-model routing.
 */
export type ModelProvider =
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'onnx-local';

/**
 * Default model assignments per agent type.
 * - haiku: High-volume, low-latency tasks (categorisation, matching, extraction)
 * - sonnet: Complex reasoning tasks (SARS compliance, orchestration, conversation)
 */
export const SDK_CONFIG_DEFAULTS: Record<
  AgentType,
  { model: string; provider: ModelProvider }
> = {
  categorizer: { model: 'haiku', provider: 'anthropic' },
  matcher: { model: 'haiku', provider: 'anthropic' },
  sars: { model: 'sonnet', provider: 'anthropic' },
  extraction: { model: 'haiku', provider: 'anthropic' },
  orchestrator: { model: 'sonnet', provider: 'anthropic' },
  conversational: { model: 'sonnet', provider: 'anthropic' },
};

@Injectable()
export class SdkConfigService {
  private readonly logger = new Logger(SdkConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the primary Anthropic API key.
   * @returns The API key or undefined if not set
   */
  getApiKey(): string | undefined {
    return this.configService.get<string>('ANTHROPIC_API_KEY');
  }

  /**
   * Check whether an Anthropic API key is configured.
   */
  hasApiKey(): boolean {
    const key = this.getApiKey();
    return key !== undefined && key !== '' && key !== 'your-requesty-api-key';
  }

  /**
   * Check whether the SDK is enabled.
   * SDK is enabled when:
   * 1. SDK_DISABLED is not 'true'
   * 2. An API key is present
   */
  isEnabled(): boolean {
    const disabled = this.configService.get<string>('SDK_DISABLED');
    if (disabled === 'true') {
      this.logger.debug('SDK explicitly disabled via SDK_DISABLED=true');
      return false;
    }
    return this.hasApiKey();
  }

  /**
   * Get the model provider for a specific agent type.
   * Reads SDK_PROVIDER_{TYPE} env var, falling back to defaults.
   * @param agentType - The agent type to get provider for
   * @returns The configured or default provider
   */
  getProviderForAgent(agentType: AgentType): ModelProvider {
    const envKey = `SDK_PROVIDER_${agentType.toUpperCase()}`;
    const envValue = this.configService.get<string>(envKey);

    if (envValue) {
      const validProviders: ModelProvider[] = [
        'anthropic',
        'google',
        'openrouter',
        'onnx-local',
      ];
      if (validProviders.includes(envValue as ModelProvider)) {
        return envValue as ModelProvider;
      }
      this.logger.warn(
        `Invalid provider "${envValue}" for ${envKey}, using default "${SDK_CONFIG_DEFAULTS[agentType].provider}"`,
      );
    }

    return SDK_CONFIG_DEFAULTS[agentType].provider;
  }

  /**
   * Get the model for a specific agent type.
   * Reads SDK_MODEL_{TYPE} env var, falling back to defaults.
   * @param agentType - The agent type to get model for
   * @returns The configured or default model identifier
   */
  getModelForAgent(agentType: AgentType): string {
    const envKey = `SDK_MODEL_${agentType.toUpperCase()}`;
    const envValue = this.configService.get<string>(envKey);

    if (envValue && envValue.trim() !== '') {
      return envValue;
    }

    return SDK_CONFIG_DEFAULTS[agentType].model;
  }

  /**
   * Get the API key for a specific provider.
   * @param provider - The model provider
   * @returns The API key or undefined
   */
  getApiKeyForProvider(provider: ModelProvider): string | undefined {
    switch (provider) {
      case 'anthropic':
        return this.configService.get<string>('ANTHROPIC_API_KEY');
      case 'google':
        return this.configService.get<string>('GOOGLE_AI_KEY');
      case 'openrouter':
        return this.configService.get<string>('OPENROUTER_API_KEY');
      case 'onnx-local':
        // Local ONNX models do not require an API key
        return 'local';
      default: {
        // Exhaustive check: this should never happen
        const _exhaustive: never = provider;
        this.logger.error(`Unknown provider: ${String(_exhaustive)}`);
        return undefined;
      }
    }
  }

  /**
   * Get the maximum tokens for SDK responses.
   * @returns Configured max tokens or default of 1024
   */
  getMaxTokens(): number {
    const value = this.configService.get<string>('SDK_MAX_TOKENS');
    if (value) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1024;
  }

  /**
   * Get the temperature for SDK responses.
   * Financial categorisation MUST use temperature = 0 for deterministic results.
   * @returns Configured temperature or default of 0
   */
  getTemperature(): number {
    const value = this.configService.get<string>('SDK_TEMPERATURE');
    if (value) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return 0;
  }

  /**
   * Get the Anthropic base URL for proxy routing.
   * @returns Configured base URL or undefined for direct API access
   */
  getBaseUrl(): string | undefined {
    return this.configService.get<string>('ANTHROPIC_BASE_URL');
  }
}
