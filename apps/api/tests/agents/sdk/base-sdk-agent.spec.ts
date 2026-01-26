/**
 * Base SDK Agent Tests
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * Tests the BaseSdkAgent abstract class through a concrete test implementation.
 * Covers: SDK available + success, SDK available + failure (fallback), SDK unavailable.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BaseSdkAgent } from '../../../src/agents/sdk/base-sdk-agent';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import { AgentDefinition } from '../../../src/agents/sdk/interfaces/sdk-agent.interface';

/**
 * Concrete test implementation of BaseSdkAgent for testing purposes.
 */
class TestSdkAgent extends BaseSdkAgent {
  constructor(factory: SdkAgentFactory, config: SdkConfigService) {
    super(factory, config, 'TestSdkAgent');
  }

  getAgentDefinition(tenantId: string): AgentDefinition {
    return this.factory.createCategorizerAgent(tenantId);
  }
}

describe('BaseSdkAgent', () => {
  const tenantId = 'test-tenant-001';

  /**
   * Create a test module with the given environment config
   */
  async function createTestModule(envConfig: Record<string, string>): Promise<{
    agent: TestSdkAgent;
    config: SdkConfigService;
  }> {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => envConfig],
        }),
      ],
      providers: [SdkAgentFactory, SdkConfigService],
    }).compile();

    const factory = module.get<SdkAgentFactory>(SdkAgentFactory);
    const config = module.get<SdkConfigService>(SdkConfigService);
    const agent = new TestSdkAgent(factory, config);

    return { agent, config };
  }

  describe('isSdkAvailable', () => {
    it('should return true when API key is present and SDK is not disabled', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
      });

      expect(agent.isSdkAvailable()).toBe(true);
    });

    it('should return false when SDK is explicitly disabled', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'true',
      });

      expect(agent.isSdkAvailable()).toBe(false);
    });

    it('should return false when API key is missing', async () => {
      const { agent } = await createTestModule({
        SDK_DISABLED: 'false',
      });

      expect(agent.isSdkAvailable()).toBe(false);
    });

    it('should return false when API key is placeholder value', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'your-requesty-api-key',
        SDK_DISABLED: 'false',
      });

      expect(agent.isSdkAvailable()).toBe(false);
    });
  });

  describe('getAgentDefinition', () => {
    it('should return a valid agent definition', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
      });

      const def = agent.getAgentDefinition(tenantId);
      expect(def).toBeDefined();
      expect(def.description).toBeDefined();
      expect(def.prompt).toContain(tenantId);
      expect(def.tools).toBeDefined();
      expect(def.model).toBeDefined();
    });
  });

  describe('executeWithFallback', () => {
    it('should execute SDK function when SDK is available', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
      });

      const sdkFn = jest.fn().mockResolvedValue({ result: 'sdk-data' });
      const fallbackFn = jest
        .fn()
        .mockResolvedValue({ result: 'fallback-data' });

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.source).toBe('SDK');
      expect(result.data).toEqual({ result: 'sdk-data' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it('should execute fallback when SDK function throws', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
      });

      const sdkFn = jest.fn().mockRejectedValue(new Error('SDK API timeout'));
      const fallbackFn = jest
        .fn()
        .mockResolvedValue({ result: 'fallback-data' });

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.source).toBe('FALLBACK');
      expect(result.data).toEqual({ result: 'fallback-data' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should skip SDK function when SDK is unavailable', async () => {
      const { agent } = await createTestModule({
        SDK_DISABLED: 'true',
      });

      const sdkFn = jest.fn().mockResolvedValue({ result: 'sdk-data' });
      const fallbackFn = jest
        .fn()
        .mockResolvedValue({ result: 'fallback-data' });

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.source).toBe('FALLBACK');
      expect(result.data).toEqual({ result: 'fallback-data' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(sdkFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should propagate error when both SDK and fallback fail', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
      });

      const sdkFn = jest.fn().mockRejectedValue(new Error('SDK failed'));
      const fallbackFn = jest
        .fn()
        .mockRejectedValue(new Error('Fallback also failed'));

      await expect(
        agent.executeWithFallback(sdkFn, fallbackFn),
      ).rejects.toThrow('Fallback also failed');
    });

    it('should include model in result when SDK execution succeeds', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
        SDK_MODEL_CATEGORIZER: 'haiku',
      });

      const sdkFn = jest.fn().mockResolvedValue({ result: 'data' });
      const fallbackFn = jest.fn().mockResolvedValue({ result: 'fallback' });

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.source).toBe('SDK');
      expect(result.model).toBeDefined();
    });

    it('should NOT include model in result when fallback is used', async () => {
      const { agent } = await createTestModule({
        SDK_DISABLED: 'true',
      });

      const sdkFn = jest.fn().mockResolvedValue({ result: 'data' });
      const fallbackFn = jest.fn().mockResolvedValue({ result: 'fallback' });

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.source).toBe('FALLBACK');
      expect(result.model).toBeUndefined();
    });

    it('should track duration accurately', async () => {
      const { agent } = await createTestModule({
        ANTHROPIC_API_KEY: 'test-key-12345',
        SDK_DISABLED: 'false',
      });

      const sdkFn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ result: 'data' }), 50),
            ),
        );
      const fallbackFn = jest.fn();

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result.durationMs).toBeGreaterThanOrEqual(40); // Allow some variance
    });
  });
});
