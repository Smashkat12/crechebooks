<task_spec id="TASK-SDK-001" version="2.0">

<metadata>
  <title>Claude Agent SDK TypeScript Integration Setup</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>foundation</layer>
  <sequence>701</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-SDK-FOUNDATION</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies — this is the foundation task -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks agents are currently rule-based with no LLM inference. The redesign
  requires integrating `agentic-flow` (v2.0.2-alpha) as the primary SDK dependency,
  which includes `@anthropic-ai/claude-agent-sdk ^0.1.5` transitively plus 66 built-in
  agents, 213 MCP tools, multi-model routing (100+ LLM providers: Claude, Gemini,
  OpenRouter, local ONNX), ReasoningBank, and AgentDB (6 cognitive memory patterns).
  Additionally, `ruvector` (v0.1.96) provides Rust-native vector database capabilities
  with HNSW indexing, ONNX WASM embeddings (all-MiniLM-L6-v2, 384d), and PostgreSQL
  extension with 77+ SQL functions for vector-based pattern search and agent routing.
  No SDK dependency exists in the project yet. Without this foundation, no agent can
  be migrated to use LLM inference.

  **Gap Analysis:**
  - No `agentic-flow` or `ruvector` dependency in `apps/api/package.json`
  - No SDK configuration or wrapper classes anywhere in the codebase
  - No agent definition factory for creating SDK subagent definitions
  - No permission model configuration for CrecheBooks agents
  - No environment variables for Anthropic API access (`ANTHROPIC_API_KEY`) or
    optional multi-model providers (Google AI, OpenRouter)
  - No abstract base class to standardize SDK integration across agents
  - No fallback mechanism to gracefully degrade when SDK is unavailable
  - No vector service for embedding generation, similarity search, or agent routing

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm (NEVER npm)
  - Language: TypeScript (strict mode)
  - Testing: Jest
  - Existing agents: `apps/api/src/agents/{transaction-categorizer,payment-matcher,sars-agent,orchestrator,extraction-validator}/`
  - Existing MCP server: `apps/api/src/mcp/xero-mcp/`
  - All monetary values: integers (cents)

  **Files to Create:**
  - `apps/api/src/agents/sdk/sdk-agent.module.ts`
  - `apps/api/src/agents/sdk/sdk-agent.factory.ts`
  - `apps/api/src/agents/sdk/sdk-config.ts`
  - `apps/api/src/agents/sdk/interfaces/sdk-agent.interface.ts`
  - `apps/api/src/agents/sdk/base-sdk-agent.ts`
  - `apps/api/src/agents/sdk/ruvector.service.ts`
  - `apps/api/src/agents/sdk/index.ts`
  - `tests/agents/sdk/sdk-agent-factory.spec.ts`
  - `tests/agents/sdk/base-sdk-agent.spec.ts`
  - `tests/agents/sdk/ruvector-service.spec.ts`

  **Files to Modify:**
  - `apps/api/package.json` — ADD `agentic-flow` and `ruvector` dependencies
    (agentic-flow includes `@anthropic-ai/claude-agent-sdk` transitively)
  - `apps/api/src/agents/orchestrator/orchestrator.module.ts` — IMPORT `SdkAgentModule`
  - `.env.example` — ADD `ANTHROPIC_API_KEY`, optional multi-model keys, SDK model config vars
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm add agentic-flow                        # Primary SDK (includes @anthropic-ai/claude-agent-sdk transitively)
  pnpm add ruvector                            # Vector database for embeddings & similarity search
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. NestJS Module Pattern
  All new modules MUST follow NestJS conventions:
  ```typescript
  import { Module } from '@nestjs/common';
  import { ConfigModule } from '@nestjs/config';

  @Module({
    imports: [ConfigModule],
    providers: [SdkAgentFactory, SdkConfigService, RuvectorService],
    exports: [SdkAgentFactory, SdkConfigService, RuvectorService],
  })
  export class SdkAgentModule {}
  ```

  ### 3. SDK AgentDefinition Factory Pattern
  Each agent type gets a dedicated factory method returning an `AgentDefinition`.
  The factory optionally uses agentic-flow's agent execution engine for multi-model
  routing, but CrecheBooks-specific prompts and SA accounting knowledge remain custom:
  ```typescript
  import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
  import type { ModelProvider } from './sdk-config';

  export class SdkAgentFactory {
    constructor(private readonly configService: SdkConfigService) {}

    createCategorizerAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Categorizes bank transactions to SA accounting codes',
        prompt: this.buildCategorizerPrompt(tenantId),
        tools: [
          'mcp__crechebooks__get_patterns',
          'mcp__crechebooks__get_history',
        ],
        model: this.configService.getModelForAgent('categorizer'),
      };
    }

    createMatcherAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Matches bank transactions to outstanding invoices',
        prompt: this.buildMatcherPrompt(tenantId),
        tools: [
          'mcp__crechebooks__get_invoices',
          'mcp__crechebooks__query_transactions',
        ],
        model: this.configService.getModelForAgent('matcher'),
      };
    }

    createSarsAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Validates SA tax compliance for financial transactions',
        prompt: this.buildSarsPrompt(tenantId),
        tools: [
          'mcp__crechebooks__get_reports',
          'mcp__crechebooks__query_transactions',
        ],
        model: this.configService.getModelForAgent('sars'),
      };
    }

    createExtractionValidatorAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Validates extracted document data against source documents',
        prompt: this.buildExtractionPrompt(tenantId),
        tools: [
          'mcp__crechebooks__query_transactions',
        ],
        model: this.configService.getModelForAgent('extraction'),
      };
    }

    createOrchestratorAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Orchestrates multi-agent workflows for CrecheBooks',
        prompt: this.buildOrchestratorPrompt(tenantId),
        tools: [
          'mcp__crechebooks__get_patterns',
          'mcp__crechebooks__get_history',
          'mcp__crechebooks__get_invoices',
          'mcp__crechebooks__query_transactions',
          'mcp__crechebooks__get_reports',
        ],
        model: this.configService.getModelForAgent('orchestrator'),
      };
    }

    createConversationalAgent(tenantId: string): AgentDefinition {
      return {
        description: 'Handles natural language queries about CrecheBooks financial data',
        prompt: this.buildConversationalPrompt(tenantId),
        tools: [
          'mcp__crechebooks__get_reports',
          'mcp__crechebooks__query_transactions',
          'mcp__crechebooks__get_invoices',
        ],
        model: this.configService.getModelForAgent('conversational'),
      };
    }
  }
  ```

  ### 4. Base SDK Agent with Fallback
  The abstract base class MUST provide an `executeWithFallback` method so every
  SDK-enhanced agent gracefully degrades to rule-based logic:
  ```typescript
  import { Logger } from '@nestjs/common';

  export abstract class BaseSdkAgent {
    protected readonly logger = new Logger(this.constructor.name);
    protected readonly factory: SdkAgentFactory;
    protected readonly config: SdkConfigService;

    constructor(factory: SdkAgentFactory, config: SdkConfigService) {
      this.factory = factory;
      this.config = config;
    }

    /**
     * Returns the SDK AgentDefinition for this agent type.
     * Each concrete agent MUST implement this.
     */
    abstract getAgentDefinition(tenantId: string): AgentDefinition;

    /**
     * Check if SDK is available (API key configured, not disabled).
     */
    isSdkAvailable(): boolean {
      return this.config.isEnabled() && this.config.hasApiKey();
    }

    /**
     * Execute an SDK operation with automatic fallback to rule-based logic.
     * If the SDK call throws or SDK is disabled, fallbackFn is invoked instead.
     *
     * @param sdkFn - async function using SDK inference
     * @param fallbackFn - async function using existing rule-based logic
     * @returns result from whichever path succeeds
     */
    async executeWithFallback<T>(
      sdkFn: () => Promise<T>,
      fallbackFn: () => Promise<T>,
    ): Promise<T> {
      if (!this.isSdkAvailable()) {
        this.logger.debug('SDK not available, using fallback');
        return fallbackFn();
      }

      try {
        return await sdkFn();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`SDK execution failed, falling back to rule-based: ${message}`);
        return fallbackFn();
      }
    }
  }
  ```

  ### 5. SDK Configuration with Multi-Model Routing
  Configuration MUST be loaded from environment variables via NestJS ConfigService,
  with sensible defaults. Supports multi-model routing via agentic-flow (100+ LLM
  providers: Claude, Gemini, OpenRouter, local ONNX):
  ```typescript
  import { Injectable } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';

  export type AgentType =
    | 'categorizer'
    | 'matcher'
    | 'sars'
    | 'extraction'
    | 'orchestrator'
    | 'conversational';

  /** Supported model providers via agentic-flow multi-model routing */
  export type ModelProvider = 'anthropic' | 'google' | 'openrouter' | 'onnx-local';

  export const SDK_CONFIG_DEFAULTS = {
    defaultModel: 'haiku',
    defaultProvider: 'anthropic' as ModelProvider,
    models: {
      categorizer: 'haiku',       // High-volume, fast + cheap
      matcher: 'haiku',           // High-volume, fast + cheap
      sars: 'sonnet',             // Complex reasoning needed
      extraction: 'haiku',        // Validation checks, fast
      orchestrator: 'sonnet',     // Complex coordination
      conversational: 'sonnet',   // Natural language understanding
    } as Record<AgentType, string>,
    maxTokens: 1024,
    temperature: 0,               // Deterministic outputs for financial data
    enabled: true,
  } as const;

  @Injectable()
  export class SdkConfigService {
    constructor(private readonly configService: ConfigService) {}

    getApiKey(): string | undefined {
      return this.configService.get<string>('ANTHROPIC_API_KEY');
    }

    hasApiKey(): boolean {
      return !!this.getApiKey();
    }

    isEnabled(): boolean {
      const disabled = this.configService.get<string>('SDK_DISABLED');
      return disabled !== 'true' && this.hasApiKey();
    }

    /** Returns the configured model provider for an agent type (default: anthropic) */
    getProviderForAgent(agentType: AgentType): ModelProvider {
      const envKey = `SDK_PROVIDER_${agentType.toUpperCase()}`;
      return (
        (this.configService.get<string>(envKey) as ModelProvider | undefined) ??
        SDK_CONFIG_DEFAULTS.defaultProvider
      );
    }

    getModelForAgent(agentType: AgentType): string {
      const envKey = `SDK_MODEL_${agentType.toUpperCase()}`;
      return (
        this.configService.get<string>(envKey) ??
        SDK_CONFIG_DEFAULTS.models[agentType] ??
        SDK_CONFIG_DEFAULTS.defaultModel
      );
    }

    /** Returns API key for the given provider (falls back to ANTHROPIC_API_KEY) */
    getApiKeyForProvider(provider: ModelProvider): string | undefined {
      switch (provider) {
        case 'google':
          return this.configService.get<string>('GOOGLE_AI_KEY');
        case 'openrouter':
          return this.configService.get<string>('OPENROUTER_API_KEY');
        case 'onnx-local':
          return 'local'; // No API key needed for local ONNX models
        case 'anthropic':
        default:
          return this.getApiKey();
      }
    }

    getMaxTokens(): number {
      const val = this.configService.get<string>('SDK_MAX_TOKENS');
      return val ? parseInt(val, 10) : SDK_CONFIG_DEFAULTS.maxTokens;
    }

    getTemperature(): number {
      const val = this.configService.get<string>('SDK_TEMPERATURE');
      return val ? parseFloat(val) : SDK_CONFIG_DEFAULTS.temperature;
    }
  }
  ```

  ### 5b. RuvectorService (Vector Operations)
  A NestJS injectable service wrapping ruvector for embedding generation, similarity
  search, and agent routing:
  ```typescript
  import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';

  @Injectable()
  export class RuvectorService implements OnModuleInit {
    private readonly logger = new Logger(RuvectorService.name);
    private initialized = false;

    constructor(private readonly configService: ConfigService) {}

    async onModuleInit(): Promise<void> {
      try {
        // Initialize ruvector with ONNX WASM embeddings (all-MiniLM-L6-v2, 384d)
        // Uses PostgreSQL extension when available, falls back to in-memory HNSW
        this.initialized = true;
        this.logger.log('RuvectorService initialized');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`RuvectorService init failed (non-fatal): ${message}`);
        this.initialized = false;
      }
    }

    isAvailable(): boolean {
      return this.initialized;
    }

    /** Generate embedding vector (384d) for a text input */
    async generateEmbedding(text: string): Promise<number[]> {
      // Delegates to ruvector ONNX WASM embedding model
      throw new Error('Not implemented — see TASK-SDK-001 implementation');
    }

    /** Find similar items by vector similarity (cosine) */
    async searchSimilar(
      embedding: number[],
      collection: string,
      limit?: number,
    ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
      throw new Error('Not implemented — see TASK-SDK-001 implementation');
    }
  }
  ```

  ### 6. TypeScript Strict Typing
  ```typescript
  // CORRECT — explicit types everywhere
  interface SdkExecutionResult<T> {
    data: T;
    source: 'SDK' | 'FALLBACK';
    durationMs: number;
    model?: string;
  }

  // WRONG — never use `any`
  // const result: any = await sdkCall();  // NEVER DO THIS
  ```

  ### 7. Environment Variables
  Add these to `.env.example`:
  ```bash
  # ── Agent SDK (via agentic-flow) ─────────────────────────────────────
  ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
  SDK_DISABLED=false
  SDK_MODEL_CATEGORIZER=haiku
  SDK_MODEL_MATCHER=haiku
  SDK_MODEL_SARS=sonnet
  SDK_MODEL_EXTRACTION=haiku
  SDK_MODEL_ORCHESTRATOR=sonnet
  SDK_MODEL_CONVERSATIONAL=sonnet
  SDK_MAX_TOKENS=1024
  SDK_TEMPERATURE=0

  # ── Optional Multi-Model Routing (agentic-flow) ─────────────────────
  # GOOGLE_AI_KEY=AIza...                       # Optional: Gemini models
  # OPENROUTER_API_KEY=sk-or-...                # Optional: OpenRouter models
  # SDK_PROVIDER_CATEGORIZER=anthropic           # Optional: override provider per agent
  # SDK_PROVIDER_MATCHER=anthropic
  # SDK_PROVIDER_SARS=anthropic
  # SDK_PROVIDER_EXTRACTION=anthropic
  # SDK_PROVIDER_ORCHESTRATOR=anthropic
  # SDK_PROVIDER_CONVERSATIONAL=anthropic

  # ── Ruvector (Vector Database) ───────────────────────────────────────
  # RUVECTOR_ENABLED=true                        # Enable/disable vector features
  # RUVECTOR_PG_EXTENSION=false                  # Use PostgreSQL extension (requires install)
  ```

  ### 8. Barrel Export Pattern
  ```typescript
  // apps/api/src/agents/sdk/index.ts
  export { SdkAgentModule } from './sdk-agent.module';
  export { SdkAgentFactory } from './sdk-agent.factory';
  export { SdkConfigService, SDK_CONFIG_DEFAULTS } from './sdk-config';
  export type { AgentType, ModelProvider } from './sdk-config';
  export { BaseSdkAgent } from './base-sdk-agent';
  export { RuvectorService } from './ruvector.service';
  export type {
    SdkAgentInterface,
    SdkExecutionResult,
    SdkCategorizationResult,
    SdkMatchResult,
    SdkValidationResult,
  } from './interfaces/sdk-agent.interface';
  ```

  ### 9. Decision Logging
  All SDK-sourced decisions MUST be logged to `.claude/logs/decisions.jsonl`:
  ```typescript
  // The decision logger already exists. When SDK agents log decisions, they
  // MUST include the `source` field:
  {
    timestamp: new Date().toISOString(),
    agentType: 'categorizer',
    source: 'LLM',           // NEW FIELD: 'LLM' | 'PATTERN' | 'HISTORICAL' | 'FALLBACK'
    model: 'haiku',           // NEW FIELD: which model was used
    tenantId: '...',
    transactionId: '...',
    result: { ... },
    confidence: 92,
    durationMs: 340,
  }
  ```

  ### 10. Testing Pattern
  Tests MUST mock the SDK, never make real API calls:
  ```typescript
  describe('SdkAgentFactory', () => {
    let factory: SdkAgentFactory;
    let configService: SdkConfigService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [SdkAgentFactory, SdkConfigService],
      }).compile();

      factory = module.get(SdkAgentFactory);
      configService = module.get(SdkConfigService);
    });

    it('should create categorizer agent definition', () => {
      const def = factory.createCategorizerAgent('tenant-123');
      expect(def.description).toContain('Categorizes');
      expect(def.tools).toContain('mcp__crechebooks__get_patterns');
      expect(def.model).toBe('haiku');
    });

    it('should use environment override for model', () => {
      jest.spyOn(configService, 'getModelForAgent').mockReturnValue('sonnet');
      const def = factory.createCategorizerAgent('tenant-123');
      expect(def.model).toBe('sonnet');
    });
  });

  describe('BaseSdkAgent', () => {
    // Create a concrete test implementation
    class TestSdkAgent extends BaseSdkAgent {
      getAgentDefinition(tenantId: string): AgentDefinition {
        return this.factory.createCategorizerAgent(tenantId);
      }
    }

    it('should fallback when SDK is not available', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);
      const sdkFn = jest.fn();
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result).toBe('fallback-result');
      expect(sdkFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should fallback when SDK throws', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      const sdkFn = jest.fn().mockRejectedValue(new Error('API timeout'));
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result).toBe('fallback-result');
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should use SDK when available', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const fallbackFn = jest.fn();

      const result = await agent.executeWithFallback(sdkFn, fallbackFn);

      expect(result).toBe('sdk-result');
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).not.toHaveBeenCalled();
    });
  });
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  The platform currently has 5 rule-based agents handling:
  - Transaction categorization (~325 lines)
  - Payment matching
  - SARS (South African Revenue Service) compliance
  - Workflow orchestration
  - Document extraction validation

  These agents total ~4,300 lines of TypeScript. They work well for known patterns
  but fail on novel transactions, which fall through to generic defaults.

  The Claude Agent SDK integration enables LLM-powered inference while preserving
  the existing rule-based logic as fallback. This is a hybrid approach: fast/free
  heuristics first, LLM for edge cases.

  ## SA Compliance Notes
  - All monetary values are stored as integers (cents) — never floating-point
  - VAT types: STANDARD (15%), ZERO_RATED, EXEMPT (education under Section 12(h)), NO_VAT
  - SARS agent results ALWAYS require L2 human review (never auto-apply)
  - Confidence threshold for auto-apply: 80% (configurable per tenant)

  ## Architectural Decisions
  - SDK is isolated in `apps/api/src/agents/sdk/` — no SDK imports outside this directory
    except from agent modules that extend `BaseSdkAgent`
  - Factory pattern allows each agent to define its own tools, model, and prompt
  - `executeWithFallback` ensures 100% availability even when API is down
  - Temperature = 0 for deterministic financial categorization
  - Model selection: haiku for high-volume/simple tasks, sonnet for reasoning-heavy tasks
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Install `agentic-flow` package via pnpm (includes `@anthropic-ai/claude-agent-sdk` transitively)
    - Install `ruvector` package via pnpm for vector database capabilities
    - Create `SdkAgentModule` as a NestJS module with proper imports/exports
    - Create `SdkAgentFactory` with `createXxxAgent()` methods for all 6 agent types:
      categorizer, matcher, sars, extraction, orchestrator, conversational
    - Create `SdkAgentFactory` with optional agentic-flow agent execution engine integration
    - Create `BaseSdkAgent` abstract class with `executeWithFallback` pattern
    - Create `SdkConfigService` injectable with model selection per agent type and
      multi-model routing configuration (`ModelProvider` type for anthropic, google,
      openrouter, onnx-local)
    - Create `RuvectorService` as `@Injectable()` NestJS provider for vector operations
      (embedding generation, similarity search, agent routing)
    - Create `SDK_CONFIG_DEFAULTS` constant with default model assignments
    - Create TypeScript interfaces: `SdkAgentInterface`, `SdkExecutionResult<T>`,
      `SdkCategorizationResult`, `SdkMatchResult`, `SdkValidationResult`
    - Create barrel export (`index.ts`)
    - Add environment variables to `.env.example` (including optional multi-model keys)
    - Wire `SdkAgentModule` into `orchestrator.module.ts` imports
    - Create ruvector PostgreSQL extension migration script (non-destructive, idempotent)
    - Unit tests for `SdkAgentFactory` — all 6 factory methods, model overrides
    - Unit tests for `BaseSdkAgent` — SDK success, SDK failure fallback, SDK disabled fallback
    - Unit tests for `SdkConfigService` — env var loading, defaults, isEnabled logic,
      multi-model provider selection
    - Unit tests for `RuvectorService` — initialization, availability check, graceful degradation
    - All tests use mocks — zero real API calls
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing 1536 tests still pass
  </in_scope>

  <out_of_scope>
    - Actual agent migrations (TASK-SDK-003 through TASK-SDK-007 handle these)
    - CrecheBooks MCP server / tools (TASK-SDK-002)
    - ConversationalAgent implementation (TASK-SDK-008 — only factory method here)
    - Agentic-flow orchestration integration (TASK-SDK-010)
    - AgentDB / learning layer (TASK-SDK-010)
    - Accuracy comparison / benchmarking framework (TASK-SDK-012)
    - Production deployment configuration
    - Rate limiting or cost tracking (future task)
    - Any changes to existing agent logic
    - Ruvector cluster/Raft consensus setup (single-node is sufficient for CrecheBooks)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify dependencies installed
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
cat apps/api/package.json | grep "agentic-flow"
cat apps/api/package.json | grep "ruvector"

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run SDK-specific tests
pnpm test -- --testPathPattern="agents/sdk" --runInBand

# 4. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 5. Lint check
pnpm run lint

# 6. Verify module structure exists
ls -la apps/api/src/agents/sdk/
ls -la apps/api/src/agents/sdk/interfaces/
ls -la tests/agents/sdk/

# 7. Verify .env.example updated
grep "ANTHROPIC_API_KEY" .env.example
grep "SDK_MODEL_CATEGORIZER" .env.example

# 8. Verify orchestrator module imports SdkAgentModule
grep "SdkAgentModule" apps/api/src/agents/orchestrator/orchestrator.module.ts

# 9. TypeScript strict check (no `any` usage)
grep -rn ": any" apps/api/src/agents/sdk/ && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"

# 10. Verify agentic-flow and ruvector are importable
cd apps/api && node -e "require('agentic-flow'); console.log('agentic-flow OK')"
cd apps/api && node -e "require('ruvector'); console.log('ruvector OK')"

# 11. Verify RuvectorService exists
grep "RuvectorService" apps/api/src/agents/sdk/ruvector.service.ts
grep "RuvectorService" apps/api/src/agents/sdk/sdk-agent.module.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `agentic-flow` installed in `apps/api/package.json` via pnpm (includes `@anthropic-ai/claude-agent-sdk` transitively)
  - [ ] `ruvector` installed in `apps/api/package.json` via pnpm
  - [ ] `SdkAgentModule` created as NestJS module with proper providers and exports (including `RuvectorService`)
  - [ ] `SdkAgentFactory` with `createXxxAgent()` methods for all 6 agent types (categorizer, matcher, sars, extraction, orchestrator, conversational)
  - [ ] `SdkAgentFactory` optionally integrates agentic-flow's agent execution engine
  - [ ] Each factory method returns an `AgentDefinition` with description, prompt, tools, and model
  - [ ] `BaseSdkAgent` abstract class created with `executeWithFallback<T>()` method
  - [ ] `BaseSdkAgent.isSdkAvailable()` checks both API key presence and enabled flag
  - [ ] `SdkConfigService` injectable with `getModelForAgent()`, `getProviderForAgent()`, `getApiKeyForProvider()`, `getApiKey()`, `isEnabled()`, `getMaxTokens()`, `getTemperature()`
  - [ ] `ModelProvider` type exported: `'anthropic' | 'google' | 'openrouter' | 'onnx-local'`
  - [ ] Multi-model routing configuration in `SdkConfigService` (provider per agent type)
  - [ ] `RuvectorService` created as `@Injectable()` NestJS provider with `onModuleInit`, `isAvailable()`, `generateEmbedding()`, `searchSimilar()`
  - [ ] `SDK_CONFIG_DEFAULTS` exported with default model per agent type and default provider
  - [ ] TypeScript interfaces: `SdkAgentInterface`, `SdkExecutionResult<T>`, `SdkCategorizationResult`, `SdkMatchResult`, `SdkValidationResult`
  - [ ] Barrel export `index.ts` exports all public classes, types, interfaces, and `RuvectorService`
  - [ ] Environment variables added to `.env.example` (ANTHROPIC_API_KEY, optional GOOGLE_AI_KEY, optional OPENROUTER_API_KEY, SDK_DISABLED, SDK_MODEL_*, SDK_PROVIDER_*, SDK_MAX_TOKENS, SDK_TEMPERATURE, RUVECTOR_*)
  - [ ] `SdkAgentModule` imported in `orchestrator.module.ts`
  - [ ] Ruvector PostgreSQL extension migration script created (idempotent)
  - [ ] Unit tests for `SdkAgentFactory`: all 6 factory methods, model overrides via env vars
  - [ ] Unit tests for `BaseSdkAgent`: SDK available + success, SDK available + failure (fallback), SDK unavailable (fallback)
  - [ ] Unit tests for `SdkConfigService`: default values, env overrides, `isEnabled()` logic, multi-model provider selection
  - [ ] Unit tests for `RuvectorService`: initialization, availability check, graceful degradation when unavailable
  - [ ] Test coverage >= 90% for all SDK files
  - [ ] Zero `any` types in SDK code
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing 1536 tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER use `any` type** — use proper TypeScript types, generics, or `unknown` with type guards
  - **NEVER hardcode API keys** — always use environment variables via `ConfigService`
  - **NEVER make SDK the only execution path** — always provide `executeWithFallback` with a rule-based fallback
  - **NEVER use `npm`** — all commands must use `pnpm` (pnpm add, pnpm run build, pnpm test)
  - **NEVER import SDK classes in non-agent modules** — keep SDK isolated to `apps/api/src/agents/sdk/` and agent modules that extend `BaseSdkAgent`
  - **NEVER make real API calls in tests** — always mock the SDK and ConfigService
  - **NEVER use floating-point for monetary values** — always use integer cents
  - **NEVER skip decision logging** — all SDK-sourced results must be logged with `source: 'LLM'`
  - **NEVER store state in module-level variables** — use NestJS injectable services with proper scoping
  - **NEVER commit `.env` files** — only update `.env.example`
  - **NEVER use temperature > 0 for financial categorization** — deterministic outputs required
  - **NEVER auto-apply SARS agent results** — always require L2 human review regardless of confidence
  - **NEVER use agentic-flow's built-in agents directly for domain logic** — CrecheBooks-specific prompts and SA accounting knowledge must be custom; agentic-flow provides the execution engine and multi-model routing, not domain expertise
  - **NEVER bypass the abstraction layer to call agentic-flow internals directly** — always go through CrecheBooks service interfaces (`SdkConfigService`, `SdkAgentFactory`, `RuvectorService`); direct imports from `agentic-flow` internals couple the codebase to implementation details
</anti_patterns>

</task_spec>
