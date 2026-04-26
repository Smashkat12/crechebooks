---
name: mental-model
description: How to maintain the per-agent expertise YAML — what to update, what to leave out, how to keep it scannable.
when-to-use: Always. Read at task start. Update after closing a task with anything you learned.
---

# Mental Model

## Purpose

Your `expertise/<your-name>-mental-model.yaml` is your working memory across
sessions. Read it at task start; update it after completing work. Compounding
this file is the difference between an agent who learns and one who restarts
from scratch every turn.

## Instructions

When to update:

- **When your understanding changes** — update stale entries, don't just append.
- **When you observe team dynamics** — note who handles what well, who gets stuck where.
- **When you find a pattern** — record the shape so a future you (or another agent
  reading the file) can recognize it next time without re-deriving.
- **After a task closes** — capture the conclusion, not the journey.

How to structure:

- Don't be rigid. Let the structure emerge from your work.
- Keep it scannable enough that you can reload it in seconds.
- Prefer YAML keys you can grep.

What NOT to write:

- Don't copy-paste entire files — reference them by path.
- Don't store conversation history — that's what `{{CONVERSATION_LOG}}` is for.
- Don't restate facts you can rebuild from `git log` or by reading a file.
- Don't be prescriptive about your own categories — let them evolve.

Discipline:

- The mental model is yours alone. Nobody curates it for you.
- If it grows past the configured `max-lines`, prune the least-load-bearing
  entries before adding new ones. A bloated file is a file nobody reads.

## Examples

A good shape:

```yaml
arch_layers:
  api:
    pattern: "REST with WebSocket for real-time"
    key_files:
      - path: apps/server/routes.ts
        notes: "All endpoints, ~400 lines"
    decisions:
      - "Chose Express over Fastify for ecosystem maturity"

observations:
  - date: "2026-04-26"
    note: "Engineering team handles scope-heavy requests better when given explicit constraints"

open_questions:
  - "(unresolved) Can we split the auth module? It's growing fast."
```
