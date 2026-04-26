---
name: active-listener
description: Read the shared session conversation log before every response so you know what the user actually asked, what other agents already said, and what's still unresolved.
when-to-use: Always, at the start of every turn — before forming a reply or calling tools.
---

# Active Listener

## Purpose

Every team session has a shared conversation log at `{{CONVERSATION_LOG}}`. It
is the canonical record of every turn this session — orchestrator, leads,
workers, you. Reading it first is non-negotiable: it's how you avoid answering
a question that's been refined since, contradicting yourself, or restating what
another agent already established.

## Instructions

When to read:

- At the start of every turn — before forming your reply, before any other tool.

How to read:

- Use `read` on `{{CONVERSATION_LOG}}`. If the log is long, tail-only is fine
  (last ~50 entries).

What to extract:

- **What the user actually asked.** The original prompt may have been refined
  by intermediate turns. Don't answer the original if it's been superseded.
- **What other agents said.** If `engineering-lead` already gave a verdict,
  reference it ("Engineering reports X — Validation finds Y consistent with
  that.") — don't restate from scratch.
- **What you said previously.** If you contradict yourself the user notices.
  When you change your mind, say so explicitly and explain why.
- **Open threads.** A question another agent asked that nobody answered yet is
  often the most useful thing to address.

What not to do:

- **Don't paste the log back.** Internalize it. The user and orchestrator can
  read it themselves. Cite ("As `qa-engineer` noted earlier"), don't reproduce.

When the log is empty:

- First turn of the session. Skip the read; respond from your system prompt
  and expertise alone.

## Examples

Entry schema:

```json
{
  "ts":      "<ISO 8601 UTC timestamp>",
  "role":    "orchestrator" | "lead" | "worker" | "user" | "system",
  "agent":   "<agent name, e.g. 'engineering-lead'>",
  "type":    "delegate-request" | "delegate-response" | "user-input" | "system-event",
  "target":  "<only on delegate-request: who is being delegated to>",
  "from":    "<only on delegate-response: who originally asked>",
  "content": "<the actual message text>"
}
```

Real session lines:

```json
{"ts":"2026-04-26T14:00:01Z","role":"orchestrator","agent":"orchestrator","type":"delegate-request","target":"engineering-lead","content":"Add a /healthz endpoint."}
{"ts":"2026-04-26T14:00:05Z","role":"lead","agent":"engineering-lead","type":"delegate-request","target":"platform-engineer","content":"Implement /healthz at apps/api/src/health/health.controller.ts returning {ok:true}."}
{"ts":"2026-04-26T14:00:18Z","role":"worker","agent":"platform-engineer","type":"delegate-response","from":"engineering-lead","content":"Done: apps/api/src/health/health.controller.ts. Returns 200 {ok:true}."}
{"ts":"2026-04-26T14:00:21Z","role":"lead","agent":"engineering-lead","type":"delegate-response","from":"orchestrator","content":"platform-engineer added /healthz at apps/api/src/health/health.controller.ts."}
```

Trace logic:

- A `delegate-request` from agent X to target Y is paired with a later
  `delegate-response` from Y to X.
- `system-event` entries (compaction, retries, circuit breakers) never come
  from an agent — they're harness metadata.
- `user-input` entries are direct messages from the user to the orchestrator.
