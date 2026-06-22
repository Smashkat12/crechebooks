---
name: library
description: "One meta-skill to catalog and redistribute your private skills, agents, and prompts across repos, devices, and agents — via a reference file, not copies. Use when asked to add/use/push/list/search/sync agentics, share a skill between projects, or set up the library."
---

# library — the meta-skill that unlocks the others

The problem this solves: once you operate across many repos, devices, and agents,
your **skills**, **agents**, and **commands** sprawl — duplicated, out of sync, hard
to coordinate. The library fixes that with a **single reference file** (`library.yaml`)
that points at where each piece actually lives (a private/public GitHub repo or a
local path). Like `package.json` for your agentics: you store *references*, never copies.

This is a **pure-agentic application** — there is no code, only this `SKILL.md` plus
`library.yaml` and the `cookbook/`. You (the agent) execute the workflows with Bash
(`git`, `cp`, `mkdir`) and file edits.

## The four primitives (use the right one)

| Primitive | What it's for | Lives in |
|---|---|---|
| **skill** | a raw capability (`SKILL.md` + supporting files) | `.claude/skills/<name>/` |
| **agent** | scale & parallelism (a subagent definition) | `.claude/agents/<name>.md` |
| **command** | one-off orchestration (a slash command / prompt) | `.claude/commands/<name>.md` |
| (justfile) | optional human-facing entry on top | `justfile` |

> Don't overload skills. If a thing is really an agent or a one-off prompt, catalog it
> as that primitive — that's how it stays composable.

## The workflow: Build → Catalog → Distribute → Use

You build agentics natively inside the value-generating repo. Then:

| Command | Cookbook | What it does |
|---|---|---|
| `library add <name…> from <repo-or-path>` | `cookbook/add.md` | Catalog a reference (no copy) |
| `library use <name…> [globally\|locally\|into <path>]` | `cookbook/use.md` | Install from a reference into a target |
| `library push <name>` | `cookbook/push.md` | Push a local edit back to the source repo |
| `library list` | `cookbook/list.md` | List everything in the catalog (pulls latest first) |
| `library search <term>` | `cookbook/search.md` | Find references by name/tag/path |
| `library sync` | `cookbook/sync.md` | Refresh the catalog **and** the referenced code |

When the user invokes `/library <command> …`, read the matching `cookbook/<command>.md`
and follow it exactly. Always **pull the source first** before any read or write so you
act on the latest version, and **never** install from an unreviewed public source.

## Safety (the 2026 trust rule)

- Know exactly what you run. Read a referenced skill/agent before installing it.
- Private agentics belong in **private** repos; the `library.yaml` may be public, the
  referenced repos need not be.
- Never run `rm -rf`; move/copy explicitly and confirm destructive steps with the user.

## The catalog file

`library.yaml` (next to this file) holds `defaults` (where each primitive installs by
default) and three lists — `skills`, `agents`, `commands` — of `{ name, source, path, tags }`
references. See the seeded examples in that file.
