# crechebooks-harness

My AI agent harness

> Advanced Coding harness · domain: `software-engineering`. Generated with [create-agent-harness](https://github.com/ruvnet/agent-harness-generator).

## Behavioral rules

- Use the harness's MCP tools (`mcp__crechebooks-harness__*`) for orchestration
- Memory and routing are handled by the kernel — you don't need to learn them
- Defer destructive operations to the user

## Agents

| Agent | Tier | Role |
|---|---|---|
| `architect` | opus | Designs the change before code is written. |
| `implementer` | sonnet | Writes code that matches the surrounding style. |
| `reviewer` | opus | Hunts correctness bugs in the diff. |
| `test-writer` | sonnet | Adds the missing tests for the change. |
| `bookkeeper` | opus | Answers CrecheBooks finance questions via the read-only domain tools. |
## MCP tools

Two stdio MCP servers ship with the harness (wired in `.claude/settings.json`):

**`crechebooks-harness` server** (`mcp start`) — `mcp__crechebooks-harness__*`:

| Tool | What it does |
|---|---|
| `kernel_info` | Resolved kernel backend (native/wasm/js) + version + diagnostics |
| `harness_doctor` | End-to-end health check |
| `list_agents` | The agent roster (name, tier, role) |
| `plan_change` | Minimal file-level plan for a change request |
| `review_diff` | The current git diff (read-only) for review |
| `run_tests` | Run the project's own `pnpm/npm test` |

**`code_index` server** (`mcp index`) — `mcp__code_index__*`:
`search_code` · `list_files` · `read_file` — read-only, confined to the working directory.

**`crechebooks` server** (`mcp domain`) — `mcp__crechebooks__*` — the **product surface**:

| Tool | What it does |
|---|---|
| `tenant_info` | Current creche details (`GET /tenants/me`) |
| `dashboard_metrics` | Revenue invoiced vs collected, arrears, enrollment |
| `list_invoices` | Invoices by status |
| `list_payments` | Payments (e.g. UNALLOCATED) |
| `arrears_report` | Outstanding arrears with aging |
| `reconciliation_summary` | Bank reconciliation status per period |
| `generate_invoices` ✎ | Generate DRAFT invoices (no send) — preview-default, confirm to write |
| `match_payments` ✎ | AI-allocate payments to invoices — preview-default, confirm to write |
| `send_invoices` ✎⚠ | Send to parents — **hard-blocked on staging**, production-only, confirm |

Reads use a thin zero-dep HTTPS client (`CRECHEBOOKS_API_KEY` / `CB_API_URL` / `CB_TENANT_ID`
from env, defaults to **staging**); the key is never logged or returned.

**Write safety (✎ tools), safe by construction:**
1. **Preview-default** — without `confirm:true`, a write returns a dry preview and calls nothing.
2. **Parent-contact ops (`send_invoices`) are hard-blocked on staging** — they can never fire
   against the staging tenant's real parent data, even with `confirm:true`. Production-only.
3. `send_invoices` is intentionally **not** in the pre-authorized allow-list, so it also needs
   per-use approval in Claude Code.

Tool calls are dispatched through `@metaharness/kernel`'s `ToolDispatcher` (capability-claim
gated). Every tool is read-only or runs the project's declared test script — there is no
arbitrary-shell tool.

## Skills

- `/plan-change` — Turn a feature request into a minimal, file-level implementation plan before any code.
- `/library` — Meta-skill: catalog & redistribute private skills/agents/prompts across repos, devices, and agents via a `library.yaml` reference file (`add`/`use`/`push`/`list`/`search`/`sync`). See `.claude/skills/library/`.
- `/evolve` — Darwin Mode self-improvement (frozen model, evolving harness).

## Commands

- `doctor` — Health-check the harness: kernel load, MCP wiring, memory backend, host adapter.
- `review-diff` — Review the current working diff for correctness, security, and reuse.
- `library` — Slash entry to the library meta-skill.

## Release gates

Zero-dependency provenance + audit gates (Node's built-in `crypto` for Ed25519). Run
`crechebooks-harness validate` before shipping:

| Command | Gate |
|---|---|
| `manifest` | Refresh `.harness/manifest.json` — sha256 of every source file + a sidecar hash |
| `sbom` | Emit an SPDX-2.3 SBOM to `.harness/sbom.spdx.json` |
| `sign` | Ed25519-sign the manifest → `.harness/witness.json` (keypair in `.harness/keys/`; `signing.key` is gitignored) |
| `verify` | Verify the witness signature **and** re-check source integrity against the manifest |
| `mcp-scan` | Static audit of the MCP surface (wildcard grants, missing secret denies, `exec`/`eval`/`shell:true`/network in tool code); fails on HIGH |
| `validate` | Run all of the above as one PASS/FAIL report |

Integrity and signature are layered: changing a source file without re-signing fails
`verify` on **integrity**; changing it and re-running `manifest` fails on **signature**
(the witness no longer matches). Either way, tampering is caught.

## Architecture

This harness uses [@metaharness/kernel](https://www.npmjs.com/package/@metaharness/kernel) — a Rust-compiled WASM module with a NAPI-RS native fallback — so the same code runs identically on every platform.
