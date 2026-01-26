# Architectural Impact Analysis: ruvector + agentic-flow vs claude-flow

**Date**: 2026-01-26
**Scope**: TASK-SDK-001 through TASK-SDK-012 (Phase 26: SDK Migration)
**Question**: How would replacing claude-flow with ruvector + agentic-flow impact the CrecheBooks SDK migration architecture?

---

## Executive Summary

The current TASK-SDK-001 through TASK-SDK-012 architecture is designed around `@anthropic-ai/claude-agent-sdk` as the LLM inference layer, with custom NestJS services for memory (Prisma), scoring, audit, and rollout. Replacing `claude-flow` with `ruvector` + `agentic-flow` directly affects the **integration and infrastructure layers** (TASK-SDK-009 through TASK-SDK-012) significantly, while the **foundation and agent migration layers** (TASK-SDK-001 through TASK-SDK-008) are impacted moderately. The core NestJS application architecture and SA compliance logic remain unaffected.

**Key insight:** `agentic-flow` IS the core SDK that `claude-flow` builds upon. So this is not a replacement -- it's going to the foundation layer directly, gaining more control but losing the higher-level orchestration abstractions that `claude-flow` provides.

---

## Package Research Summary

### ruvector (v0.1.96)

- Rust-native self-learning distributed vector database
- HNSW indexing (<0.5ms, 52K+ inserts/sec)
- GNN self-improving index
- ONNX WASM embeddings (all-MiniLM-L6-v2, 384d)
- Cypher graph queries
- Raft consensus
- MCP server with Claude Code hooks
- 0 external npm dependencies in core
- PostgreSQL extension with 77+ SQL functions including agent routing (`ruvector_route_query`, `ruvector_multi_agent_route`)

### agentic-flow (v2.0.2-alpha)

- Core SDK/engine that claude-flow builds upon
- 66 pre-built agents
- 213 MCP tools
- Multi-model routing across 100+ LLM providers (Claude, Gemini, OpenRouter, local ONNX)
- ReasoningBank persistent learning
- AgentDB with 6 cognitive memory patterns
- SONA (Self-Optimizing Neural Architecture) adaptive learning
- Key dependency: `@anthropic-ai/claude-agent-sdk ^0.1.5`

### claude-flow (v3.0.0-alpha.88) -- Current

- High-level orchestration platform built ON agentic-flow
- 87+ MCP tools
- Swarm management, hook system
- SQLite-backed AgentDB
- RuVector integration
- SONA

### Ecosystem Hierarchy

```
agentic-flow (core SDK)
  -> claude-flow (orchestration platform on top)
    -> ruv-swarm (swarm MCP tools)
      -> flow-nexus (cloud platform)

ruvector (shared vector/memory layer used by all)
```

---

## Per-Task Impact Analysis

### TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup

**Impact: MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| `@anthropic-ai/claude-agent-sdk` dependency | `agentic-flow` depends on `@anthropic-ai/claude-agent-sdk ^0.1.5` itself, so the SDK remains available |
| `SdkConfigService` with model per agent (haiku/sonnet) | agentic-flow provides **multi-model routing** across 100+ providers (Claude, Gemini, OpenRouter, local ONNX). `SdkConfigService` would gain model flexibility beyond just Anthropic |
| `SdkAgentFactory.createXxxAgent()` returns `AgentDefinition` | agentic-flow has 66 pre-built agent types; could use these instead of custom factory methods, but the CrecheBooks-specific prompts and tool bindings would still need custom definitions |
| `BaseSdkAgent.executeWithFallback()` pattern | agentic-flow's agent execution includes built-in error handling and retry, but the CrecheBooks fallback pattern (LLM -> heuristic) is domain-specific and would still need custom implementation |
| Environment: `ANTHROPIC_API_KEY` only | Would need multiple API keys if using multi-model routing (Google, OpenRouter, etc.) |

**Changes needed:**

- `SdkConfigService` could be extended to support agentic-flow's multi-model routing instead of single-provider Anthropic config
- `SdkAgentFactory` remains necessary for CrecheBooks-specific agent definitions -- agentic-flow's built-in agents don't understand SA creche accounting
- The `@anthropic-ai/claude-agent-sdk` dependency is still available as a transitive dep of agentic-flow
- New config vars for additional model providers if desired

---

### TASK-SDK-002: CrecheBooks In-Process MCP Server

**Impact: LOW-MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| `createSdkMcpServer` from Claude Agent SDK | agentic-flow provides 213 MCP tools + `fastmcp` for custom servers |
| 5 read-only tools: get_patterns, get_history, get_invoices, query_transactions, get_reports | These CrecheBooks-specific tools remain custom -- no off-the-shelf replacement |
| In-process transport for zero overhead | agentic-flow supports both stdio and in-process MCP; compatible |
| Prisma-backed queries with tenant isolation | No change -- ruvector/agentic-flow don't replace your Prisma layer |

**Changes needed:**

- The MCP server creation function might change from `createSdkMcpServer` to agentic-flow's `fastmcp` approach, but the tool implementations (Prisma queries) are identical
- ruvector could add **vector search tools** to the MCP server (e.g., `search_similar_transactions` using embeddings) -- this is a potential enhancement, not a replacement
- Tool namespace might change but the 5 core data access tools remain custom

---

### TASK-SDK-003: TransactionCategorizerAgent SDK Migration (Pilot)

**Impact: MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Single-model inference (haiku) | Multi-model routing: could route simple categorizations to cheaper/faster models and complex ones to sonnet |
| Pattern match -> LLM -> historical -> fallback | Same flow, but agentic-flow's **ReasoningBank** could cache LLM reasoning for reuse |
| JSON structured output parsing | agentic-flow may provide structured output helpers |
| `CATEGORIZER_SYSTEM_PROMPT` with SA accounting knowledge | Remains custom -- domain-specific, not replaceable by agentic-flow |

**Changes needed:**

- `SdkCategorizer.executeSdkInference()` would use agentic-flow's agent execution instead of raw Claude SDK calls
- agentic-flow's **multi-model routing** could dynamically select the cheapest model that meets accuracy requirements per categorization (potential cost savings)
- ruvector could power **semantic pattern search**: instead of exact string matching in `get_patterns`, use vector similarity to find semantically similar past transactions -- this is a meaningful enhancement
- The `CATEGORIZER_SYSTEM_PROMPT` and SA accounting domain knowledge remain unchanged

---

### TASK-SDK-004: PaymentMatcherAgent SDK Migration

**Impact: MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| 3-factor deterministic scoring + LLM for ambiguous cases | Same hybrid approach |
| Single-model (haiku) for fuzzy matching | Multi-model routing available |
| Reference matching via Levenshtein distance | ruvector's **vector embeddings** could provide semantic reference matching (e.g., "Inv 2024-001 partial" -> INV-2024-001 via embedding similarity) |

**Changes needed:**

- ruvector could replace or supplement Levenshtein-based reference matching with embedding-based similarity search
- The R50,000 high-value guard, tenant isolation, and decision logging remain unchanged
- Multi-model routing could optimize cost for high-volume matching

---

### TASK-SDK-005: SarsAgent SDK Enhancement (LLM Explanations)

**Impact: LOW**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| LLM explains, never calculates | Same -- no change to calculation logic |
| Always L2 (DRAFT_FOR_REVIEW) | Same -- compliance requirement unchanged |
| sonnet for nuanced explanations | Could use Gemini or other models for explanations via multi-model routing |

**Changes needed:**

- Minimal. The SARS agent's LLM integration is the simplest (explanation-only). The multi-model routing option is nice-to-have but not critical.
- ruvector/agentic-flow add no specific value here beyond what the current design provides.

---

### TASK-SDK-006: ExtractionValidatorAgent SDK Enhancement

**Impact: LOW**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| LLM semantic validation as 6th check (+5/-10 adjustment) | Same approach |
| PII sanitization before LLM | Same requirement |
| haiku for fast validation | Multi-model routing could optimize cost |

**Changes needed:**

- Minimal. The validation logic is domain-specific. ruvector/agentic-flow don't add meaningful capability here.

---

### TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration

**Impact: HIGH**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `SdkOrchestrator` with `Promise.allSettled` for parallel execution | agentic-flow provides **built-in agent orchestration** with 66 agent types and workflow definitions |
| Manual switch-based routing | agentic-flow has sophisticated task routing with dependency graphs |
| Custom `SubagentContext` isolation via `structuredClone` | agentic-flow provides native context isolation |
| Custom `WorkflowResult` format | Would need adaptor to map agentic-flow's result format to CrecheBooks' `WorkflowResult` |

**Changes needed:**

- The `SdkOrchestrator` could be substantially simplified by using agentic-flow's orchestration engine instead of custom `Promise.allSettled` + switch-statement routing
- agentic-flow's agent spawning with context isolation replaces custom `SubagentContext` management
- **However**: The `WorkflowResult` interface is a contract with downstream consumers and cannot change -- so an adaptor layer is needed
- SARS L2 enforcement remains a custom constraint that must be layered on top of agentic-flow's orchestration
- ruvector could provide the orchestrator with **agent routing**: `ruvector_route_query` and `ruvector_multi_agent_route` SQL functions could dynamically route work to the best agent based on learned patterns

---

### TASK-SDK-008: ConversationalAgent Implementation (NEW)

**Impact: MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `AgentDefinition` with MCP tools | agentic-flow has pre-built conversational agent patterns |
| sonnet model for NLU | Multi-model routing could optimize |
| Read-only queries via MCP tools | Same -- CrecheBooks MCP tools remain custom |
| Query validation, SA-specific financial context | Domain-specific, not replaceable |

**Changes needed:**

- Could leverage agentic-flow's conversational agent patterns as a base, then customize with CrecheBooks domain knowledge
- ruvector could enable **semantic search over financial data**: "show me all payments from Woolworths last quarter" could use vector search over transaction descriptions instead of exact SQL queries
- The SA financial context (ZAR, VAT 15%, tax year March-February) remains custom

---

### TASK-SDK-009: Hybrid Scoring System

**Impact: HIGH**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `HybridScorer` with configurable weights (60/40 default) | agentic-flow's **SONA (Self-Optimizing Neural Architecture)** provides adaptive scoring that learns optimal weights |
| Custom `AccuracyTracker` with Prisma database | agentic-flow's **AgentDB** has 6 cognitive memory patterns including accuracy tracking |
| Custom `ScoringRouter` with LLM_PRIMARY/HEURISTIC_PRIMARY/HYBRID modes | agentic-flow's multi-model routing includes dynamic model selection based on performance |
| Prisma model `AgentAccuracyRecord` | Could be replaced by ruvector-backed memory or agentic-flow's AgentDB |

**Changes needed:**

- **Major replacement opportunity**: agentic-flow's SONA adaptive learning could replace the custom `HybridScorer` + `AccuracyTracker` + `ScoringRouter` with a system that self-optimizes weights based on observed accuracy
- ruvector's **GNN self-improving index** aligns with the concept of learning optimal scoring patterns over time
- The Prisma model `AgentAccuracyRecord` could be supplemented with ruvector's vector storage for embedding-based pattern similarity
- **Risk**: agentic-flow's SONA is a general-purpose learning system; the CrecheBooks-specific scoring logic (LLM confidence weighting, SA accounting domain knowledge) may need careful integration to ensure the self-optimization doesn't compromise financial accuracy
- The 50+ sample recommendation threshold and recency-biased weighting would need to be replicated in agentic-flow's configuration

---

### TASK-SDK-010: AgentDB & Persistent Learning Memory

**Impact: HIGHEST**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `AgentMemoryService` with Prisma | agentic-flow's **AgentDB** provides 6 cognitive memory patterns out of the box |
| Custom `PatternLearner` (3+ corrections -> auto-create PayeePattern) | agentic-flow's learning system + ruvector's self-improving GNN index |
| Custom `CorrectionHandler` for human feedback | agentic-flow's correction/feedback loops built in |
| SHA-256 input hashing for deduplication | ruvector's HNSW indexing provides embedding-based deduplication (semantically similar inputs, not just exact hash matches) |
| Prisma models: `AgentDecision`, `CorrectionFeedback` | Could be replaced by agentic-flow AgentDB + ruvector vector storage |
| Non-blocking `.catch()` pattern for decision storage | Architecture pattern remains regardless of storage backend |

**Changes needed:**

- **Major architecture shift**: ruvector + agentic-flow provide a fundamentally richer memory/learning system than the Prisma-based custom implementation
- ruvector's **vector embeddings** enable semantic similarity search for decisions -- "find similar past decisions" goes from exact hash matching to embedding-based similarity (384-dimensional MiniLM-L6-v2)
- agentic-flow's **ReasoningBank** stores and retrieves reasoning chains, which aligns directly with the `AgentDecision` pattern but with richer context
- The `PatternLearner` (3+ corrections -> auto-create PayeePattern) could leverage ruvector's self-improving GNN to learn patterns organically rather than through explicit threshold rules
- **Critical consideration**: The existing `PayeePattern` Prisma model is used across the codebase (pattern-matcher.ts, MCP tools, etc.). Switching storage would require either a migration path or a dual-write approach
- The `@Optional() @Inject(AgentMemoryService)` backwards compatibility pattern would still be needed during transition

---

### TASK-SDK-011: Structured Audit Trail & Decision Hooks

**Impact: MODERATE-HIGH**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `AuditTrailService` with Prisma `AgentAuditLog` | agentic-flow's hooks system provides pre/post decision hooks natively |
| Custom `DecisionHooks` (preDecision, postDecision, postEscalation) | agentic-flow has a comprehensive hook system (pre-task, post-task, post-edit, etc.) |
| Backwards-compatible dual-write (JSONL + database) | ruvector could provide vector-indexed audit search instead of sequential JSONL |
| TypeScript const enums: `AgentType`, `EventType`, `DecisionSource` | These remain domain-specific |

**Changes needed:**

- agentic-flow's hook system could replace the custom `DecisionHooks` class, but the CrecheBooks-specific hook logic (tenant validation, duration tracking, escalation detection) would still need custom implementation within those hooks
- ruvector could enhance audit querying: "find all decisions similar to this one" via vector search, rather than filtering by exact fields
- The dual-write pattern (JSONL + Prisma) could be extended to triple-write (JSONL + Prisma + ruvector vector index) for enriched search capabilities
- The `AgentAuditLog` Prisma model is a compliance requirement and cannot be replaced -- it can only be supplemented

---

### TASK-SDK-012: SDK Integration Tests & Parallel Rollout

**Impact: MODERATE**

| Current Architecture | With ruvector + agentic-flow |
|---|---|
| Custom `FeatureFlagService` with Prisma `FeatureFlag` model | agentic-flow may have built-in feature flag or A/B testing capability |
| Custom `ShadowRunner` (DISABLED/SHADOW/PRIMARY modes) | agentic-flow's multi-model routing could provide similar A/B testing |
| No caching of flags (instant rollback) | Same design principle applies regardless of implementation |
| E2E tests across all 6 agents in all 3 modes | Test structure remains regardless of underlying infrastructure |

**Changes needed:**

- The `ShadowRunner` concept (run both heuristic and LLM, compare results) aligns with agentic-flow's multi-agent comparison capabilities but the CrecheBooks-specific implementation (per-tenant, per-agent flags, instant rollback) would still need custom code
- Test structure is independent of the infrastructure choice

---

## Cross-Cutting Impact Areas

### 1. Dependency Changes

| Package | Current | With ruvector + agentic-flow |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | Direct dependency | Transitive dep via agentic-flow |
| `agentic-flow` | Not present | NEW direct dependency (~v2.0.2-alpha) |
| `ruvector` | Not present | NEW direct dependency (~v0.1.96) |
| `claude-flow` | Dev/MCP tool only | REMOVED (replaced by agentic-flow) |
| `better-sqlite3` | Not present | Comes with agentic-flow (AgentDB) |
| `@google/genai` | Not present | Optional via agentic-flow (multi-model) |
| `fastmcp` | Not present | Comes with agentic-flow (MCP tools) |

### 2. MCP Tool Namespace Changes

- **Current**: `mcp__crechebooks__*` (5 custom tools) -- no change
- **Removed**: `mcp__claude-flow__*` (87 tools) -- only used for dev orchestration
- **Added**: `mcp__agentic-flow__*` (213 tools) -- available for coordination
- **Added**: `mcp__ruvector__*` -- vector search, embedding generation, agent routing

### 3. Database Impact

| Current (Prisma only) | Added (ruvector) |
|---|---|
| PostgreSQL via Prisma ORM | ruvector PostgreSQL extension (77+ SQL functions) |
| `AgentDecision`, `CorrectionFeedback`, `AgentAccuracyRecord`, `AgentAuditLog`, `FeatureFlag` models | ruvector tables for vector storage, embedding index, graph queries |
| Sequential/exact queries | + Vector similarity search, GNN-optimized retrieval |

**Important**: ruvector as a PostgreSQL extension operates in the SAME database as Prisma. This is architecturally clean -- no additional database servers needed. However, the Prisma schema and ruvector extension need to coexist without conflicts.

### 4. SA Compliance -- No Impact

The following compliance requirements are **completely unaffected** by this infrastructure change:

- SARS L2 (DRAFT_FOR_REVIEW) enforcement
- VAT Section 12(h) exemption logic
- Tenant isolation (tenantId on every query)
- Integer cents for monetary values
- POPI data protection requirements
- PII sanitization before LLM calls
- Decision audit trails (Prisma models)
- R50,000 high-value transaction guards

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| agentic-flow is alpha (v2.0.2-alpha) | **HIGH** | Pin exact version; wrap in abstraction layer; maintain fallback to direct Claude SDK |
| ruvector is early (v0.1.96) | **HIGH** | Use as supplementary layer; keep Prisma as primary storage; ruvector adds search capability, not replaces persistence |
| Breaking API changes in alpha packages | **MEDIUM** | Isolate dependencies behind CrecheBooks service interfaces (`SdkAgentFactory`, `AgentMemoryService`, etc.) |
| PostgreSQL extension conflicts with Prisma | **LOW** | ruvector extension uses separate schema/namespace; test migration compatibility |
| Multi-model routing exposes additional API keys | **MEDIUM** | Optional feature; start with Anthropic-only, add providers incrementally |
| Increased dependency tree (better-sqlite3, fastmcp, etc.) | **LOW** | Evaluate bundle size impact; tree-shake unused features |

---

## Recommendation Summary

| Task | Impact Level | Recommended Action |
|---|---|---|
| TASK-SDK-001 | Moderate | Extend `SdkConfigService` for multi-model; keep custom factory |
| TASK-SDK-002 | Low-Moderate | Keep custom MCP tools; optionally add ruvector vector search tool |
| TASK-SDK-003 | Moderate | Use agentic-flow execution; add ruvector semantic pattern search |
| TASK-SDK-004 | Moderate | ruvector embedding-based reference matching is a strong enhancement |
| TASK-SDK-005 | Low | Minimal change; multi-model optional |
| TASK-SDK-006 | Low | Minimal change |
| TASK-SDK-007 | High | Use agentic-flow orchestration engine; adaptor for WorkflowResult |
| TASK-SDK-008 | Moderate | Use agentic-flow conversational patterns + ruvector semantic search |
| TASK-SDK-009 | High | agentic-flow SONA could replace custom HybridScorer with careful validation |
| TASK-SDK-010 | **Highest** | Major architecture shift: AgentDB + ruvector replaces custom Prisma memory |
| TASK-SDK-011 | Moderate-High | Hook system replacement; keep Prisma audit for compliance |
| TASK-SDK-012 | Moderate | Feature flags remain custom; shadow running aligns with multi-agent comparison |

---

## Conclusion

The inclusion of ruvector + agentic-flow (instead of claude-flow) provides a richer foundational toolkit -- especially for memory/learning (TASK-SDK-010), scoring optimization (TASK-SDK-009), and orchestration (TASK-SDK-007). The trade-off is working with alpha-stage packages that require careful isolation behind stable interfaces. The domain-specific CrecheBooks logic (SA accounting, tenant isolation, SARS compliance, cents-based monetary values) is entirely unaffected.

The recommended approach is:

1. **Keep Prisma as primary persistence** -- ruvector supplements, does not replace
2. **Wrap agentic-flow behind CrecheBooks service interfaces** -- protect against alpha API changes
3. **Adopt incrementally** -- start with TASK-SDK-001 (multi-model config), then TASK-SDK-003 (semantic search), then TASK-SDK-010 (AgentDB)
4. **Maintain fallback paths** -- every LLM/agentic-flow integration falls back to heuristic logic
5. **SA compliance layer is independent** -- it sits above the infrastructure choice and is unaffected
