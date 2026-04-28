# Prompt File Convention

How we write skill files, agent files, and command/prompt files in this repo.
Modeled on IndyDevDan's "templating your engineering" methodology
(see videos `_vpNQ6IwP9w`, `3_mwKbYvbUg`, `TqjmTZRL31E`).

## The principle

> "If you template your engineering, your agents can do exactly what you did."

Every prompt file (skill, agent, command) follows the same skeleton so that:
- Agents can read each other's prompts and know exactly where to find what they need.
- A meta-prompt can generate new prompts that immediately fit the system.
- A new contributor can read any file without re-learning a layout.

## The canonical body

Every agent / skill / prompt body uses these **six sections in this order**. Use
*only the sections you need to ship the file* — empty ones can be omitted, but
when present they must keep this order and these exact headings.

```markdown
# <Title>

## Purpose
1–3 sentences. What this thing is for. Who consults it.

## Variables
Static config and runtime placeholders.

## Instructions
What to do. Direct, imperative. The rules.

## Workflow
Step-by-step procedure. Numbered list, usually.

## Context (injected at runtime)
Runtime-loaded data paths + cross-references. The harness prepends a
`# Runtime context` block above the body; this section points at additional
files/paths the agent should pull when relevant.

## Report
Output shape. What the caller sees back. The contract.
```

The phrase **"injected at runtime"** in the Context heading is intentional and
matches what the harness does.

## Variable syntax

- **Static variables** — declared inline:
  ```
  - language: typescript
  - max_attempts: 3
  ```
- **Runtime variables** — `{{NAME}}` style placeholders. Substituted by the
  harness's `before_agent_start` / `buildRenderedSystemPrompt` step. The
  variables our harness populates are:
  - `{{AGENT_NAME}}` — the agent's own name (e.g. `engineering-lead`)
  - `{{CALLER}}` — who delegated to it this turn (e.g. `orchestrator`)
  - `{{SESSION_DIR}}` — absolute path to this session's dir
  - `{{CONVERSATION_LOG}}` — path to the shared `conversation.jsonl`
  - `{{REPO_ROOT}}` — project root

When a value is genuinely the same in every run, use a static variable.
When it changes per session/turn, use a runtime placeholder.

## Frontmatter

YAML between `---` markers at the top of every file. The fields differ by
file type.

### Agents (`.pi/multi-team/agents/<name>.md`)

```yaml
---
name: <lowercase-with-dashes>            # required
description: <one line>                  # required by our PI extension's loader
model: anthropic/claude-<opus|sonnet>-4-6   # required — which model runs this agent
expertise:                                # optional — per-agent mutable mental models
  - path: .pi/multi-team/expertise/<name>-mental-model.yaml
    use-when: "When this expertise is helpful."
    updatable: true
    max-lines: 10000
skills:                                   # optional — shared instruction blocks
  - path: .pi/multi-team/skills/<skill>.md
    use-when: "When to apply."
tools:                                    # required — comma-list or YAML list
  - read
  - delegate
domain:                                   # required — file-access scope (PI-specific)
  - path: .pi/multi-team/expertise/<name>-mental-model.yaml
    read: true
    update: true
    delete: false
---
```

### Skills (`.pi/multi-team/skills/<name>.md`)

```yaml
---
name: <skill-name>                # required
description: <one line>           # required
when-to-use: <trigger phrasing>   # required — semantic trigger description
---
```

Skills are inlined into agent system prompts by the harness; the body should be
short, opinionated, and self-contained.

### Commands / prompts (`.claude/commands/*.md` style — future)

When we add slash commands, they get:

```yaml
---
name: <command>                                       # required
description: <one line, used in /help>                # required
argument-hint: <"<arg1> [<arg2>]" — visible to user>  # optional but recommended
allowed-tools: read, grep, find                       # optional — restrict tool use
---
```

## Context-passing patterns

These are the techniques we apply consistently. They aren't optional.

1. **Pre-load before doing.** Open the conversation log + own expertise file at
   task start. Listed under `## Workflow` step 1.

2. **Required brief sections.** When delegating to an agent, the message should
   include: situation, stakes, constraints, what "done" looks like. (No
   automated validator yet — this is a discipline.)

3. **Cite, don't restate.** Reference earlier turns by `agent + timestamp` from
   the conversation log; don't paste prior content.

4. **Mental-model durability.** Each agent's `expertise/<name>-mental-model.yaml`
   accumulates over sessions. Update before completing a turn.

5. **Reread-the-conversation discipline.** Every agent's `## Workflow` step 1
   says "read the conversation log first." This is non-negotiable — it's the
   `active-listener` skill.

## Naming conventions

- Files use `lowercase-with-dashes.md`.
- Frontmatter `name:` is the same string as the filename stem.
- Agent names are role-based (`backend-dev`, not `dan`); roles outlast people.
- Meta-generators are prefixed `meta-` (`meta-prompt`, `meta-skill`, `meta-agent`).

## What this convention is *not*

- Not a sandbox. Sections are organizing tools; the agent's actual safety comes
  from `domain:` and the harness's tool_call enforcement.
- Not a strict schema validated by code. We discipline ourselves to keep the
  shape consistent so prompts compose cleanly. (A schema validator is future
  work.)
- Not a substitute for clear thinking. A perfectly-structured prompt with
  vague Instructions still produces vague output.

## Reference: the methodology source

These are the IndyDevDan videos that informed this convention:

- `_vpNQ6IwP9w` — The Library Meta-Skill (skill packaging, cookbook layout).
- `3_mwKbYvbUg` — One Prompt Every Agentic Codebase Should Have (prompt body conventions).
- `TqjmTZRL31E` — Pi CEO Agents (agent frontmatter + multi-agent assembly).
- `M30gp1315Y4` — One Agent Is Not Enough (the multi-team setup we replicated).

Local cache: `/tmp/yt-cache/<id>/` (transcript + key frames).
