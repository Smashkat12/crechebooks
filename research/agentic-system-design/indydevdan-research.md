# IndyDevDan (Dan Disler) -- Comprehensive Research on Agentic System Design

**Research Date**: 2026-03-04
**Subject**: Dan Disler, known as IndyDevDan (Indianapolis-based software engineer)
**Platforms**: YouTube (@IndyDevDan), GitHub (github.com/disler), agenticengineer.com, indydevdan.com
**Focus**: Agentic coding patterns, multi-agent orchestration, Claude Code mastery, systems that build systems

---

## Table of Contents

1. [Core Philosophy and Worldview](#1-core-philosophy-and-worldview)
2. [The Core Four Framework](#2-the-core-four-framework)
3. [The Compute Advantage Equation](#3-the-compute-advantage-equation)
4. [The Four-Layer Composable Architecture](#4-the-four-layer-composable-architecture)
5. [Claude Code Hooks System](#5-claude-code-hooks-system)
6. [Self-Validating Agents Pattern](#6-self-validating-agents-pattern)
7. [Multi-Agent Orchestration](#7-multi-agent-orchestration)
8. [Context Forking and Parallel Execution](#8-context-forking-and-parallel-execution)
9. [The Infinite Agentic Loop](#9-the-infinite-agentic-loop)
10. [Agent Sandboxes and Isolation](#10-agent-sandboxes-and-isolation)
11. [Beyond MCP: Progressive Disclosure](#11-beyond-mcp-progressive-disclosure)
12. [Damage Control and Safety Patterns](#12-damage-control-and-safety-patterns)
13. [Agentic Drop Zones](#13-agentic-drop-zones)
14. [Observability for Multi-Agent Systems](#14-observability-for-multi-agent-systems)
15. [CLAUDE.md and Configuration Patterns](#15-claudemd-and-configuration-patterns)
16. [The Tactical Agentic Coding Curriculum](#16-the-tactical-agentic-coding-curriculum)
17. [2026 Roadmap: Top 2% Agentic Engineering](#17-2026-roadmap-top-2-agentic-engineering)
18. [Single File Agents](#18-single-file-agents)
19. [Benchmarking and Evaluation](#19-benchmarking-and-evaluation)
20. [Cross-Provider Super Agents](#20-cross-provider-super-agents)
21. [Complete Repository Index](#21-complete-repository-index)
22. [Key Quotes and Principles](#22-key-quotes-and-principles)
23. [Sources](#23-sources)

---

## 1. Core Philosophy and Worldview

Dan Disler is a seasoned software engineer with over a decade of industry experience who has publicly stated he is "betting the next 10 years of his career on AGENTIC software." His core thesis can be summarized in a few key beliefs:

**The Prompt is the New Fundamental Unit of Programming.** He treats prompts with the same rigor and care as traditional code -- they are composable, testable, versionable artifacts that drive system behavior.

**Compute Advantage is the Defining Variable.** The central equation of his framework:

```
Compute Advantage = (Compute Scaling x Autonomy) / (Time + Effort + Monetary Cost)
```

Maximize the numerator (raw model intelligence + autonomous operation), minimize the denominator (calendar time, mental energy, financial expense).

**What > How.** Engineers should focus on objectives and specifications; AI agents handle implementation. This inverts traditional engineering training.

**The Agentic Engineer is a New Role.** Moving from "AI Coding" (human directs tool) to "Agentic Coding" (human directs agents that direct tools) is described as "not merely an evolution but a revolutionary leap."

**Living Software.** His tagline at agenticengineer.com is "Build LIVING software" -- software systems that can evolve, self-correct, and ship autonomously through agentic layers.

**Trust is the Limiting Factor (2026 Thesis).** Model capability is no longer the bottleneck. The limiting factor is how much you trust your agents. Speed increases with trust, enabling more iterations and greater impact.

---

## 2. The Core Four Framework

Every agentic system relies on four fundamental leverage points. This framework appears consistently across all of Dan's content:

| Element | Description | Scaling Dimension |
|---------|-------------|-------------------|
| **Context** | What the agent knows -- codebase structure, project rules, specifications | Depth and relevance of information |
| **Model** | The reasoning engine processing information | Intelligence, speed, cost tradeoffs |
| **Prompt** | Communication of intent, constraints, expectations | Precision, structure, templates |
| **Tools** | Actions enabling reasoning to produce real-world impact | Breadth and capability of operations |

All agentic paradigms compose these four elements differently. The framework is deliberately tool-agnostic -- it applies regardless of which AI coding assistant is being used.

---

## 3. The Compute Advantage Equation

From "State of AI Coding: Engineering with Exponentials":

The exponential curve is the dominant metaphor. At low compute values (x=5), returns seem modest. But doubling input from x=10 to x=20 multiplies output by 22,000x. This is not linear improvement -- it is a phase shift.

**Compressed Wisdom Hierarchy:**
- "Your value scales directly with compute harnessed, minimizing costs"
- "Manage compute, manage results"
- "Compute = Success"

**What is Depreciating:** Syntax memorization, boilerplate generation, line-by-line algorithm implementation, debugging -- now commoditized by compute.

**What is Appreciating:** Prompt engineering, system design with AI constraints, specification crafting, and leveraging compute effectively. The ability to "package requests at scale, quickly" is the core engineering competency.

**Tool Selection Criterion:** "Does this tool give me compute advantage?" Each tool decision weighs compute scaling against time, effort, and monetary costs. He advocates an "and" mindset -- use Claude Code AND Cursor AND custom MCP servers AND ChatGPT Pro AND Devin.

---

## 4. The Four-Layer Composable Architecture

Demonstrated most clearly in the **Bowser** project (agentic browser automation), this layered stack is Dan's primary architectural pattern for production agentic systems:

```
Layer 4: Justfile (Reusability)
  |-- Single-command entry point for entire workflows
  |-- Callable by humans, CI/CD, or other agents
  |
Layer 3: Commands (Orchestration)
  |-- .claude/commands/*.md
  |-- Discovers work items, spawns parallel agents, aggregates results
  |
Layer 2: Subagents (Scale)
  |-- .claude/agents/*.md
  |-- Isolated worker instances executing individual tasks
  |-- Separate context windows, parallel execution
  |
Layer 1: Skills (Capability)
  |-- .claude/skills/*/SKILL.md
  |-- Direct tool interaction (browser, file system, APIs)
  |-- Automatically discovered by Claude via SKILL.md descriptions
```

**Key Insight:** You can enter at any layer. Test a skill directly, spawn a single subagent, run a full orchestration command, or fire a one-liner from the justfile. Each layer is independently testable and composes upward.

**Directory Structure Pattern:**

```
.claude/
  commands/          # Slash commands (orchestration layer)
    workflow-name.md
  agents/            # Subagent definitions (scale layer)
    team/
      builder.md
      validator.md
  skills/            # Capability layer
    skill-name/
      SKILL.md       # Auto-discovered by Claude
      tools/         # Implementation scripts
      prompts/       # Context templates
      cookbook/       # Tool-specific instructions
  hooks/             # Lifecycle interceptors
    send_event.py
    pre_tool_use.py
    post_tool_use.py
    ...
  settings.json      # Hook configuration and permissions
justfile             # Top-level task runner
```

---

## 5. Claude Code Hooks System

Dan's `claude-code-hooks-mastery` repository is the definitive reference implementation for all 13 Claude Code hook lifecycle events. Hooks are described as "interceptor mechanisms enabling developers to control, monitor, and secure AI agent behavior."

### The 13 Hook Types

| Hook | When It Fires | Can Block? | Primary Use |
|------|---------------|-----------|-------------|
| **UserPromptSubmit** | Before Claude processes a prompt | Yes (exit 2) | Prompt validation, injection prevention |
| **PreToolUse** | Before any tool executes | Yes (exit 2) | Security: block dangerous commands |
| **PostToolUse** | After successful tool completion | No | Validation, logging, auto-formatting |
| **PostToolUseFailure** | After tool execution failure | No | Error logging, diagnostics |
| **Notification** | When Claude sends notifications | No | TTS alerts, user attention signals |
| **Stop** | When Claude finishes a response | Yes (exit 2) | Force continuation, final validation |
| **SubagentStop** | When a subagent finishes | Yes (exit 2) | Subagent lifecycle management |
| **SubagentStart** | When a subagent spawns | No | Logging, audio announcements |
| **PreCompact** | Before context compaction | No | Transcript backup |
| **SessionStart** | At session initialization | No | Context loading, setup |
| **SessionEnd** | At session termination | No | Cleanup, metrics export |
| **PermissionRequest** | When permission dialog appears | No | Audit, auto-allow read-only |
| **Setup** | Repository initialization | No | Context preparation |

### Implementation Pattern: UV Single-File Scripts

Each hook is a standalone Python script with embedded dependency declarations using `uv`. This provides:

- **Isolation:** Hook dependencies do not pollute project dependencies
- **Portability:** Each script declares requirements inline
- **Speed:** UV's dependency resolution is fast
- **Independence:** Hooks are modifiable separately

### Exit Code Protocol

- `0` -- Allow the operation
- `2` -- Block the operation (stderr message shown to Claude)
- JSON output -- Request user confirmation ("ask" pattern)

### Three Categories of Hook Usage

**1. Deterministic Control (Security)**
Block dangerous commands like `rm -rf`, prevent `.env` file access, enforce path-based access controls.

**2. Non-Deterministic Enhancement (Observability)**
Log events as JSON, send webhook notifications, trigger TTS alerts, broadcast to dashboards.

**3. Agent Orchestration (Validation)**
PostToolUse validators that automatically enforce code quality (linting, type checking) after every file operation. The "Team-Based Validation" pattern uses a Builder agent paired with a Validator agent.

---

## 6. Self-Validating Agents Pattern

From the **agentic-finance-review** project. This is one of Dan's most important architectural contributions:

**Core Principle:** "Focused Agent + Specialized Validation = Trusted Automation."

**Why Specialization Wins:** "A focused agent with one purpose outperforms an unfocused agent with many purposes." Specialized agents deliver "consistent, reliable, trustworthy" results; generalist agents "work sometimes, fail unpredictably."

### Three-Step Implementation

**Step 1: Focused Prompt (Slash Command)**
Each `.claude/commands/*.md` file defines a single responsibility, restricted tool access, model selection, and validation hooks.

**Step 2: Subagent Creation**
Each `.claude/agents/*.md` file enables parallelization (multiple agents run simultaneously), context isolation (separate memory windows), and tool restrictions for focus.

**Step 3: Deterministic Validators**
Python scripts in `.claude/hooks/validators/` that receive hook input via stdin (JSON), execute domain-specific checks, and return exit codes.

### Self-Correction Workflow Example

When a user requests "add $100 deposit to savings.csv":

1. Agent reads the file
2. PostToolUse hook validates CSV structure -- PASS
3. Agent adds row with balance update
4. PostToolUse hook detects balance mismatch -- FAIL
5. Agent reads the error in stderr, corrects calculation automatically
6. PostToolUse hook re-validates -- PASS
7. Task completes with valid output

The agent never needs to be told it made an error. The deterministic validator catches it and the agent self-corrects. This is the pattern that builds trust.

### Prompts vs Subagents (Key Distinction)

| Aspect | Prompt (Slash Command) | Subagent |
|--------|----------------------|----------|
| Execution | Current context window | Isolated context window |
| Parallelism | Sequential | Multiple simultaneous |
| Arguments | `$1`, `$2`, `$ARGUMENTS` | Inferred from prompt text |
| Invocation | `/csv-edit file.csv "request"` | "Use the csv-edit agent to..." |
| Memory | Shares conversation history | Fresh context per invocation |

---

## 7. Multi-Agent Orchestration

### The Orchestrator Pattern

From the Tactical Agentic Coding course (Lesson 12) and the 2026 roadmap:

The progression path is:
1. **Single agent** -- One Claude Code instance, human in the loop
2. **Custom agents** -- Specialized agents with targeted prompts and tools
3. **Multi-agent** -- 3, 5, 10+ agents working in parallel
4. **Orchestrator** -- A lead agent managing distributed agent teams

> "Stop talking to individual agents, start talking to your lead agent."

### Agent Team Pattern (Builder + Validator)

From the observability project, the team pattern defines:

- **Builder Agent** (`.claude/agents/team/builder.md`) -- Engineering agent executing one task at a time; includes PostToolUse hooks for validation
- **Validator Agent** (`.claude/agents/team/validator.md`) -- Read-only agent inspecting work without file modifications

Team planning uses `/plan_w_team "feature description"` to generate spec documents with task breakdowns, team assignments, dependencies, and acceptance criteria.

### Three Modes of Determinism

From the **install-and-maintain** project:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Deterministic (Hooks)** | Same script every time, no LLM variance | CI/CD pipelines |
| **Agentic (Supervised)** | Runs hook then agent analyzes logs | Failed setup diagnosis |
| **Interactive (Adaptive)** | Agent asks clarifying questions mid-workflow | New engineer onboarding |

**Key Principle:** "The script is the source of truth." Both hooks and prompts execute identical scripts. The distinction lies in oversight.

---

## 8. Context Forking and Parallel Execution

### Fork Repository Skill

The **fork-repository-skill** enables AI agents to spawn new terminal windows with other agentic coding tools running in parallel.

**Use Cases:**
- Offload context (delegate work to a fresh agent)
- Branch engineering tasks across multiple tools
- Run identical commands against different AI models simultaneously
- Parallelize work across Claude Code, Codex CLI, Gemini CLI

**Architecture:**

```
.claude/skills/fork-terminal/
  SKILL.md           # Master definition and trigger detection
  cookbook/           # Tool-specific instructions per agent type
    claude-code.md
    codex-cli.md
    gemini-cli.md
    cli-command.md
  prompts/           # Context handoff templates
    fork_summary_user_prompt.md
  tools/             # Terminal spawner script
    fork_terminal.py
```

**Workflow:**
1. Detection -- Claude identifies trigger phrases ("fork terminal," "new terminal")
2. Cookbook Selection -- Appropriate tool instructions load
3. Command Assembly -- Claude constructs commands with flags, model selections, permissions
4. Terminal Execution -- `fork_terminal.py` opens a new window and runs the command

**Context Handoff:** Users can pass conversation summaries to forked agents via `fork_summary_user_prompt.md`, enabling downstream agents to inherit project context without full conversation history.

**Supported Tools:**

| Tool | Default Model | Fast Model |
|------|---------------|-----------|
| Claude Code | opus | haiku |
| Codex CLI | gpt-5.1-codex-max | gpt-5.1-codex-mini |
| Gemini CLI | gemini-3-pro-preview | gemini-2.5-flash |
| Raw CLI | N/A | N/A |

---

## 9. The Infinite Agentic Loop

From the **infinite-agentic-loop** project -- an experimental system demonstrating continuous agentic generation:

**Concept:** A two-prompt system where Claude Code orchestrates multiple AI agents in parallel to generate evolving iterations of themed components based on specifications.

**Architecture:**
- `.claude/commands/infinite.md` -- Main orchestrator command
- `.claude/commands/prime.md` -- Secondary command
- `.claude/settings.json` -- Permissions (Write, MultiEdit, Edit, Bash)

**Generation Process (5-Step Pattern):**
1. Specification Analysis
2. Directory Reconnaissance (scan existing iterations)
3. Parallel Sub-Agent Deployment
4. Wave-Based Generation (progressive sophistication in infinite mode)
5. Context Management optimization

**Execution Variants:**
```
/project:infinite specs/spec.md src 1       # Single generation
/project:infinite specs/spec.md src_new 5   # Small batch (5)
/project:infinite specs/spec.md src_new 20  # Large batch (20)
/project:infinite specs/spec.md dir/ infinite  # Infinite mode
```

**Key Pattern:** Sub-agents receive complete context with unique creative assignments. Task tool manages parallel execution with count-optimized batches. Progressive sophistication strategy ensures each wave builds on the last.

---

## 10. Agent Sandboxes and Isolation

From the **agent-sandbox-skill** project:

**Three Key Capabilities:**
1. **Isolation** -- Fully isolated gated sandboxes via E2B cloud infrastructure
2. **Scale** -- Multiple independent agent forks running simultaneously
3. **Agency** -- Agents have full control over the sandbox environment

**Reprogrammed Commands:**
- `\sandbox <prompt>` -- Ad-hoc operations with minimal compute
- `\agent-sandboxes:plan-full-stack` -- Detailed implementation planning
- `\agent-sandboxes:build` -- Execute build plans within sandboxes
- `\agent-sandboxes:host` -- Expose ports and generate public URLs
- `\agent-sandboxes:test` -- Validation testing including browser UI workflows
- `\agent-sandboxes:plan-build-host-test` -- Complete lifecycle orchestration

**Best-of-N Pattern:** From the 2026 roadmap, sandboxes enable running the same task N times in isolated environments, then selecting the best result. This defers trust until merge points.

**Architecture:**
```
.claude/skills/agent-sandboxes/
  SKILL.md                    # Capability contract
  sandbox_cli/                # Python CLI (click + e2b + rich)
  prompts/
    very-easy/ through very-hard/  # Difficulty-graded templates
    claude/ gemini/ codex/         # Model-specific variants
```

---

## 11. Beyond MCP: Progressive Disclosure

From the **beyond-mcp** project. This is Dan's most nuanced take on tooling architecture:

**The Central Problem:** "MCP Servers come with a massive cost -- instant context loss." Each tool invocation resets conversational history, becoming increasingly problematic at scale with multiple agents and contexts.

### Four Alternative Architectures

| Approach | Context Cost | Best For |
|----------|-------------|----------|
| **MCP Server** | High (full schema per call) | External tools, multi-client compatibility |
| **CLI with Direct HTTP** | ~50% reduction vs MCP | Control, caching (pandas-based 6h TTL) |
| **File System Scripts** | Progressive (load only what's needed) | Isolation, portability (~200-300 lines each) |
| **Claude Code Skills** | Lowest (auto-discovered on demand) | Git-based collaboration, context preservation |

### The Progressive Disclosure Pattern

The central insight: tools should be incremental rather than monolithic. Instead of exposing all 15 operations simultaneously (MCP), agents read only needed scripts, minimizing token expenditure.

### Dan's Decision Framework

**For external tools:** 80% MCP (simplicity), 15% CLI (control), 5% Scripts/Skills (serious context preservation).

**For new tools being built:** 80% CLI + prompts, 10% wrapped MCP at scale, 10% Scripts/Skills for ecosystem reuse.

---

## 12. Damage Control and Safety Patterns

From the **claude-code-damage-control** project:

**Philosophy:** Defense-in-depth protection through PreToolUse hooks that intercept tool calls before execution.

### Three Protection Tiers (patterns.yaml)

| Tier | Access Level | Example Paths |
|------|-------------|---------------|
| **zeroAccessPaths** | No access at all | `~/.ssh/`, `~/.aws/`, `~/.gnupg/` |
| **readOnlyPaths** | Read allowed, modifications blocked | `/etc/`, `~/.bashrc` |
| **noDeletePaths** | All operations except delete | `.claude/hooks/`, important project files |

### Bash Pattern Blocking

```yaml
bashToolPatterns:
  - pattern: "rm -rf"
    action: block
  - pattern: "SQL DELETE without WHERE"
    action: block
  - pattern: "SQL DELETE with WHERE id ="
    action: ask        # Confirmation dialog
    ask: true
```

### Parallel Hook Execution

Global (`~/.claude/`) and project-level (`.claude/`) hooks run in parallel -- either can block execution. This means organization-wide safety rules compose with project-specific rules.

---

## 13. Agentic Drop Zones

From the **agentic-drop-zones** project:

**Concept:** An automated file processing pipeline that monitors directories and triggers AI agents when files arrive. File system as the interface to agentic workflows.

### Configuration (drops.yaml)

Each drop zone defines:
- `name` -- Zone identifier
- `file_patterns` -- Glob patterns to monitor (e.g., `*.txt`, `*.csv`)
- `reusable_prompt` -- Path to markdown prompt template
- `zone_dirs` -- Directories to watch
- `events` -- Trigger types (`created`, `modified`, `deleted`, `moved`)
- `agent` -- Which agent to invoke (`claude_code`, `gemini_cli`, `codex_cli`)
- `model` -- Specific model version
- `mcp_server_file` -- Optional MCP tools configuration

### Pre-configured Workflows

| Zone | Input | Processing | Output |
|------|-------|-----------|--------|
| **Image Generation** | `*.txt`, `*.md` | Text-to-image via Replicate | Generated images |
| **Image Edit** | `*.txt`, `*.md`, `*.json` | Edit existing images | Modified images |
| **Training Data** | `*.csv`, `*.jsonl` | Analyze sample + generate synthetic data | Extended datasets |
| **Morning Debrief** | `*.mp3`, `*.wav`, `*.m4a` | Whisper transcription + priority extraction | Structured markdown reports |

**Architecture:** Single-file Python script (`sfs_agentic_drop_zone.py`) using watchdog for monitoring, rich for console output, async streaming for real-time responses.

---

## 14. Observability for Multi-Agent Systems

From the **claude-code-hooks-multi-agent-observability** project. This is the most comprehensive observability system for Claude Code agents in the ecosystem.

### Data Flow Pipeline

```
Claude Agents --> Hook Scripts --> HTTP POST --> Bun Server --> SQLite --> WebSocket --> Vue Client
```

### Architecture

**Hook Layer** (`.claude/hooks/`): 12 Python hook scripts + universal event sender (`send_event.py`) supporting all hook types with optional chat history inclusion via `--add-chat` flag.

**Server Layer** (`apps/server/`): Bun + TypeScript backend with SQLite (WAL mode), automatic schema migrations, event validation, WebSocket broadcast.

**Client Layer** (`apps/client/`): Vue 3 application with:
- Real-time WebSocket event display
- Multi-criteria filtering (app, session ID, event type)
- Live pulse chart with session-colored bars
- Time range selection (1m, 3m, 5m)
- Chat transcript viewer with syntax highlighting
- Auto-scroll with manual override
- Tool emoji system (Bash: terminal, Read: book, Write: pen, Edit: pencil, Task: robot, MCP: plug)

### Visual Design System

- Dual-color border system: app colors (left) + session colors (second border)
- Each concurrent agent session gets a unique color
- Dark/light theme support

### Event Color Coding

| Event | Purpose |
|-------|---------|
| PreToolUse | Before tool execution |
| PostToolUse | Tool completion |
| PostToolUseFailure | Execution failure |
| PermissionRequest | Permission needed |
| Notification | User interactions |
| Stop | Response completion |
| SubagentStart | Subagent initiation |
| SubagentStop | Subagent completion |
| PreCompact | Context compaction |
| UserPromptSubmit | User prompt submission |
| SessionStart | Session initiation |
| SessionEnd | Session termination |

### Quick Start

```bash
just start    # Launch server + client
# Open http://localhost:5173
# Events begin streaming from any Claude Code instance with configured .claude/ directory
```

---

## 15. CLAUDE.md and Configuration Patterns

### VSCode Snippet Templates

Dan published a Gist with four production-ready VSCode snippets for creating agentic configurations:

**1. Agentic Prompt Engineering (`agp` prefix)**
Full frontmatter with model, description, argument-hint, allowed-tools, context, agent settings, hooks. Body sections: Purpose, Variables, Codebase Structure, Instructions, Workflow, Report.

**2. Agentic Prompt (No Frontmatter) (`agpn` prefix)**
Same structure without YAML frontmatter. For simpler prompt creation.

**3. Agent Skill Template (`agsk` prefix)**
Frontmatter: name, description, allowed-tools, model, context, agent, hooks, user-invocable flags. Body: Skill Title, Purpose, Variables, Instructions, Workflow, Examples, Report.

**4. Agent Subagent Template (`agag` prefix)**
Frontmatter: name, description, tools, disallowedTools, model, permissionMode, skills list, hooks, color. Body: Agent Title, Purpose, Instructions, Workflow, Report.

All templates include hook configurations for PreToolUse, PostToolUse, and Stop events.

### Key Configuration Distinctions

From his content comparing MCP servers vs Skills vs Commands:

| Feature | MCP Server | Skill | Command |
|---------|-----------|-------|---------|
| Discovery | Explicit configuration | Auto-discovered via SKILL.md | Explicit `/command` invocation |
| Context Cost | High (full schema loaded) | Low (loaded on demand) | Medium (loaded when invoked) |
| Best For | External systems, APIs, databases | Automatic context-driven behaviors | Repeatable workflows |
| Collaboration | Shared via `.mcp.json` | Git-based via `.claude/skills/` | Git-based via `.claude/commands/` |

---

## 16. The Tactical Agentic Coding Curriculum

A paid course ($599) with 14 lessons across two offerings. The curriculum represents Dan's complete methodology:

### The 8 Core Tactics

**Lesson 1: Hello Agentic Coding (Beginner)**
Foundation for the paradigm shift. Introduction to the Core Four: Context, Model, Prompt, Tools.

**Lesson 2: The 12 Leverage Points (Beginner)**
In-agent and through-agent leverage points. Stacking standard output, types, tests, and architecture.

**Lesson 3: Success is Planned (Intermediate)**
"First came prompts, then came plans." Encoding engineering best practices into agent instructions. Plan-driven development where specs become code through agents.

**Lesson 4: AFK Agents (Intermediate)**
The **PITER framework** for autonomous operation. Moving from "in the loop" to fully autonomous systems. AFK = Away From Keyboard -- agents that work while you do not.

**Lesson 5: Close The Loops (Intermediate)**
Self-correcting systems with strategic feedback mechanisms. "Closed Loop Prompts" for agent self-validation. This maps directly to the self-validating agents pattern.

**Lesson 6: Let Your Agents Focus (Advanced)**
Specialized Review and Documentation agents. Distinction between testing and agent review.

**Lesson 7: ZTE -- The Secret (Advanced)**
**Zero Touch Engineering** -- the North Star. Progression: in-loop --> out-loop --> ZTE. The codebase self-ships.

**Lesson 8: The Agentic Layer (Advanced)**
The meta-tactic unifying all previous concepts. Building systems that build systems.

### Agentic Horizon (6 Extended Lessons)

**Lesson 9: Elite Context Engineering**
R&D Framework for context window optimization. 12 techniques for agent focus and performance.

**Lesson 10: Agentic Prompt Engineering**
7-level hierarchy from basic to self-improving prompts. Prompts as force multipliers.

**Lesson 11: Domain-Specific Agents**
Specialized agents for particular business logic. Domain constraint encoding.

**Lesson 12: Multi-Agent Orchestration**
The Orchestrator Agent pattern. CRUD operations and fleet management with real-time observability.

**Lesson 13: Agent Experts**
Addressing agent forgetfulness through learning workflows. **Act-Learn-Reuse** three-step pattern.

**Lesson 14: The Codebase Singularity**
Integration of all concepts toward autonomous codebases. Building the agentic layer systematically.

### Key Concepts from the Curriculum

**ADWs (AI Developer Workflows):** Combining deterministic code with non-deterministic agents to automate entire engineering work classes.

**Templates Over Coding:** Encode engineering practices once for infinite agent execution, rather than repeated manual work.

**The Difference Between Agentic Engineering and "Vibe Coding":** "You know the outcome your agent will generate by templating the format."

---

## 17. 2026 Roadmap: Top 2% Agentic Engineering

Dan's public roadmap for the year, organized as "10 Big Bets":

### The 10 Bets

| # | Bet | Summary |
|---|-----|---------|
| 1 | **Anthropic Becomes a Monster** | Focused execution on engineer-centric tools makes them dominant |
| 2 | **Tool Calling Is the Opportunity** | Only 15% of output tokens are tool calls -- enormous untapped potential |
| 3 | **Custom Agents Above All** | 50-line custom agent with 3 tools outperforms generic solutions |
| 4 | **Multi-Agent Orchestration** | Scaling to coordinated teams (3, 5, 10+ agents) multiplies impact |
| 5 | **Agent Sandboxes** | Isolation enables best-of-N pattern, defers trust to merge points |
| 6 | **In-Loop vs Out-Loop** | Maximize out-loop work, reserve in-loop for critical decisions |
| 7 | **Agentic Coding 2.0** | Lead agent delegates to command-level agents with specialized playbooks |
| 8 | **The Benchmark Breakdown** | Private evaluation systems beat public benchmarks |
| 9 | **Agents Are Eating SaaS** | "Agents are the interface" -- agent-first competitors disrupt UI-driven SaaS |
| 10 | **The Death of AGI Hype** | Focus on shipping useful agentic software with current technology |

### The Progression Path

1. **Base** -- Default out-of-box agentic coding experience
2. **Better** -- Enhanced through tools, prompts, context optimization
3. **More** -- Parallelization and multiple agents
4. **Custom** -- Specialized agents with tailored prompts and tools
5. **Orchestrator** -- Lead agent managing distributed agent teams

### 5-Step Implementation Roadmap

1. Build first custom agent (50 lines, 3 tools, focused prompt) using Claude Agent SDK
2. Add second agent; progress from planner to builder to reviewer
3. Move agents to sandboxes; implement best-of-N pattern
4. Build out-loop system; progressively migrate from in-loop as trust grows
5. Create orchestrator (lead agent) coordinating entire operation

---

## 18. Single File Agents

From the **single-file-agents** repository:

**Concept:** Pack single-purpose, powerful AI agents into a single Python file using `uv` for dependency management.

### Agent Inventory

**Database Query Agents:**
- DuckDB agents (OpenAI, Anthropic, Gemini implementations)
- SQLite agent (OpenAI)

**Data Processing:**
- Polars CSV agent (OpenAI) -- Generates and executes Polars transformations
- JQ Command agent (Gemini) -- Generates JSON query commands

**Development Automation:**
- Bash Editor agent (Anthropic) -- File editing and bash execution
- Codebase Context agents -- Repository structure examination
- File Editor agent -- Text file manipulation

**Specialized:**
- Web Scraper agent (OpenAI) -- Content extraction via Firecrawl
- Meta Prompt Generator (OpenAI) -- Builds structured prompts dynamically

### Design Patterns

- **Single responsibility** -- Each agent does exactly one thing
- **Iterative refinement loops** -- Configurable computation cycles (default: 10)
- **Provider diversity** -- Same pattern works across Anthropic, OpenAI, Gemini
- **Tool abstraction** -- Consistent function calling across providers
- **Error recovery** -- Agents retry on failed executions
- **UV inline dependencies** -- No requirements.txt, no virtual env setup

---

## 19. Benchmarking and Evaluation

### Benchy

A "chill, live benchmark tool" for side-by-side LLM comparison across specific use cases. Config-file-based, multi-provider, yes/no evaluation benchmarking.

### Nano Agent (Nested Agent Benchmarking)

An MCP server with a nested agent hierarchy:

```
Outer Agent (any MCP client)
  |-- prompt_nano_agent tool
      |-- Inner Agent (OpenAI-compatible)
          |-- read_file, write_file, edit_file, list_directory, get_file_info
          |-- Up to 20 autonomous loops
```

**HOP/LOP Framework:**
- **LOP files** -- Individual test specifications with prompts, expected outputs, grading rubrics
- **HOP orchestrator** -- Reads LOPs, spawns all 9 configured agents in parallel, generates ranked comparison tables

**Key Finding:** Smaller models (GPT-5-mini) often outperform larger variants when cost and speed factor in. No single model dominates all dimensions.

### Agentic Coding Tool Eval

Simple comparative framework for evaluating agentic coding tools. Manages 10+ individual agentic coding tools simultaneously.

---

## 20. Cross-Provider Super Agents

### Big 3 Super Agent

From the **big-3-super-agent** project -- a voice-orchestrated multi-provider system:

**Three Agent Types:**
1. **OpenAI Realtime Voice Agent** -- Primary orchestrator, natural language input
2. **Claude Code Agent** -- Software development, file operations
3. **Gemini Browser Agent** -- Web automation, visual validation

**Voice-Driven Dispatch Pattern:** The voice agent receives commands and dispatches work via tool calls (`create_agent()`, `command_agent()`, `list_agents()`, `browser_use()`, `check_agent_result()`).

**Observability Built In:** Claude Code Hooks automatically forward tool execution events, agent lifecycle events, browser actions with screenshots, and cost metrics to a centralized dashboard.

### Pi vs Claude Code

Comparative analysis of open-source Pi Agent vs closed-source Claude Code:

**Pi Advantages:** More granular event hooks (session_fork, session_switch, session_tree, agent_start, agent_end, turn_start), plugin-based extension system, multiple stacked extensions.

**Pi Multi-Agent Patterns:**
1. `/sub` -- Background agents with live progress widgets
2. `/team` -- Dispatcher pattern delegating to specialists
3. `/chain` -- Sequential pipeline where output feeds to next input

### Just-Prompt MCP Server

Unified interface to all major LLM providers via a single MCP server:

**CEO-and-Board Pattern:** Multiple "board member" models evaluate a prompt, then a "CEO" model synthesizes their responses into a final decision.

**Provider Prefix System:** `o:gpt-5` (OpenAI), `a:claude-opus-4` (Anthropic), `g:gemini-2.5-flash` (Google), etc.

---

## 21. Complete Repository Index

All repositories under `github.com/disler`:

| Repository | Description | Key Pattern |
|-----------|-------------|-------------|
| **pi-vs-claude-code** | Open vs closed source agent comparison | Hook lifecycle comparison |
| **bowser** | Agentic browser automation | 4-layer composable architecture |
| **claude-code-hooks-multi-agent-observability** | Real-time multi-agent monitoring | Event pipeline + Vue dashboard |
| **claude-code-hooks-mastery** | All 13 Claude Code hooks reference | UV single-file hook scripts |
| **install-and-maintain** | Deterministic + agentic install patterns | Three modes of determinism |
| **agentic-finance-review** | Self-validating finance agents | Focused Agent + Validation |
| **claude-code-damage-control** | Defense-in-depth safety | patterns.yaml + PreToolUse |
| **fork-repository-skill** | Context forking to parallel terminals | Multi-tool agent spawning |
| **agent-sandbox-skill** | E2B isolated execution environments | Sandbox lifecycle management |
| **beyond-mcp** | Progressive disclosure tooling | MCP vs CLI vs Skills comparison |
| **big-3-super-agent** | Voice + coding + browser multi-agent | Cross-provider orchestration |
| **agentic-drop-zones** | File-triggered agent automation | Watchdog + agent dispatch |
| **nano-agent** | Nested agent MCP server | HOP/LOP benchmarking |
| **just-prompt** | Unified multi-LLM MCP server | CEO-and-Board pattern |
| **infinite-agentic-loop** | Continuous parallel generation | Wave-based infinite mode |
| **claude-code-is-programmable** | CLI/programmatic Claude Code use | Language-agnostic invocation |
| **agentic-coding-tool-eval** | Agentic tool comparison framework | Multi-tool evaluation |
| **quick-data-mcp** | JSON/CSV analytics MCP server | Prompt-focused data analysis |
| **benchy** | Live LLM benchmarking | Config-based comparative eval |
| **single-file-agents** | One-file Python agents | UV inline deps, single responsibility |
| **indydevtools** | Agentic engineering toolbox | Prompts as programming |
| **agentic-drop-zones** | File-triggered agent pipelines | Drop zone automation |
| **pocket-pick** | Code snippet search agent | One-prompt code discovery |
| **marimo-prompt-library** | Reactive prompt engineering notebooks | Marimo + prompt templates |

---

## 22. Key Quotes and Principles

**On the paradigm shift:**
> "It's not about what we can do anymore, but what we can teach our agents to do."

**On prompts:**
> "Prompts are THE new fundamental unit of programming."
> "In the age of AI, prompts are the most powerful way to design, build, and engineer systems that can solve problems autonomously and should be treated with the same level of respect and care as any other fundamental unit of programming."

**On compute:**
> "Your value scales directly with compute harnessed, minimizing costs."
> "You'd spend money to save time any day of the week."

**On specialization:**
> "A focused agent with one purpose outperforms an unfocused agent with many purposes."
> "Focused Agent + Specialized Validation = Trusted Automation."

**On trust (2026):**
> "The limiting factor in agentic systems is not model capability but trust."
> "How much do you trust your agents?"

**On tool calling:**
> "With Claude Code, you can call ANY TOOL IN ANY ORDER IN NATURAL LANGUAGE."
> "Only 15% of output tokens are tool calls -- an enormous untapped opportunity."

**On the future:**
> "Stop talking to individual agents, start talking to your lead agent."
> "Agents are the interface."

**On vibe coding vs agentic engineering:**
> "This is the difference between agentic engineering and 'vibe coding' -- you know the outcome your agent will generate by templating the format."

**On the transition:**
> "The next crucial skill is not merely an evolution of AI Coding, but a revolutionary leap to Agentic Coding and an entirely new role: Agentic Engineering."

---

## 23. Sources

### GitHub Repositories
- [disler (IndyDevDan) -- GitHub Profile](https://github.com/disler)
- [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- [infinite-agentic-loop](https://github.com/disler/infinite-agentic-loop)
- [claude-code-is-programmable](https://github.com/disler/claude-code-is-programmable)
- [fork-repository-skill](https://github.com/disler/fork-repository-skill)
- [agent-sandbox-skill](https://github.com/disler/agent-sandbox-skill)
- [beyond-mcp](https://github.com/disler/beyond-mcp)
- [claude-code-damage-control](https://github.com/disler/claude-code-damage-control)
- [agentic-drop-zones](https://github.com/disler/agentic-drop-zones)
- [agentic-finance-review](https://github.com/disler/agentic-finance-review)
- [big-3-super-agent](https://github.com/disler/big-3-super-agent)
- [nano-agent](https://github.com/disler/nano-agent)
- [just-prompt](https://github.com/disler/just-prompt)
- [single-file-agents](https://github.com/disler/single-file-agents)
- [bowser](https://github.com/disler/bowser)
- [install-and-maintain](https://github.com/disler/install-and-maintain)
- [pi-vs-claude-code](https://github.com/disler/pi-vs-claude-code)
- [indydevtools](https://github.com/disler/indydevtools)
- [benchy](https://github.com/disler/benchy)

### Courses and Content
- [Principled AI Coding](https://agenticengineer.com/principled-ai-coding)
- [Tactical Agentic Coding](https://agenticengineer.com/tactical-agentic-coding)
- [State of AI Coding: Engineering with Exponentials](https://agenticengineer.com/state-of-ai-coding/engineering-with-exponentials)
- [Top 2% Agentic Engineering Roadmap](https://agenticengineer.com/top-2-percent-agentic-engineering)

### Blog and Social
- [IndyDevDan Blog](https://indydevdan.com/)
- [YouTube: @IndyDevDan](https://youtube.com/@IndyDevDan)
- [Twitter/X: @IndyDevDan](https://x.com/IndyDevDan)

### Video Summaries
- [Claude Code Hooks: Advanced Agentic Coding (Recapio transcript)](https://recapio.com/digest/im-hooked-on-claude-code-hooks-advanced-agentic-coding-by-indydevdan)

### VSCode Snippets
- [Skill, Subagent, and Slash Command Snippets (GitHub Gist)](https://gist.github.com/disler/d9f1285892b9faf573a0699aad70658f)

### Community References
- [The 4-Layer Agent Stack (Jon Roosevelt, referencing Bowser)](https://jonroosevelt.com/blog/agent-stack-layers)
- [Command-Agent-Skills Pattern (DeepWiki)](https://deepwiki.com/shanraisshan/claude-code-best-practice/6.1-command-agent-skills-pattern)
- [Claude Code Hooks Mastery (YUV.AI)](https://yuv.ai/blog/claude-code-hooks-mastery)
