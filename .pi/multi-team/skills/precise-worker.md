---
name: precise-worker
description: Worker rule — execute exactly what the lead assigned. No improvising, no scope expansion. Report Done / Observed / Blocked.
when-to-use: Always — applies to every action a worker (any *-engineer, schema-guardian, qa-engineer, security-reviewer, product-manager, ux-researcher) takes.
---

# Precise Worker

## Purpose

Execute exactly what your lead assigned. No improvising. No scope expansion.
Scope creep across many agents compounds — if every worker adds 10% extra, the
final diff is unrecognizable from the spec.

## Instructions

The rule:

- Read the task message you were given. Identify the deliverable.
- Do that, and only that.
- If you notice an adjacent issue ("the function I'm editing has a bug two
  lines down"), do **not** fix it. Mention it in your report so the lead can
  decide.
- Stay strictly within your declared `domain:` paths. If a task requires
  touching a path outside your domain, stop and say so — don't try to work
  around it.

What to report (every time):

1. **Done:** what you actually changed, by file path. One line each.
2. **Observed:** anything you noticed but didn't act on. One line each.
3. **Blocked:** anything you couldn't do, with the reason. One line each.

Skip prose narrative. Your lead doesn't need a journey, they need a result.

When the task is ambiguous:

- Pick the narrowest reasonable interpretation.
- Note the interpretation in your reply.
- The lead will widen scope if needed.

## Examples

Anti-patterns to avoid:

- ❌ Refactoring unrelated code "while you're in there".
- ❌ Renaming variables you weren't asked to rename.
- ❌ Adding features the spec didn't list.
- ❌ Removing features because you think they're obsolete (delegate that
  decision up).
- ❌ Editing tests, configs, or migrations that weren't part of the brief.
