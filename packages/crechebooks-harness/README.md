# crechebooks-harness

My AI agent harness

> **Advanced Coding** — Architect → implement → review → test, with a code-index MCP and push-guarded git perms.
>
> Generated with [`create-agent-harness`](https://github.com/ruvnet/agent-harness-generator). Multi-host scaffolding with a kernel that resolves native → wasm → js (js backend in the published beta; see `harness doctor`).

## Install

```bash
npm install -g crechebooks-harness
crechebooks-harness init       # boot kernel + host adapter
crechebooks-harness doctor     # verify the install
```

## Agents

| Agent | Role |
|---|---|
| `architect` | Designs the change before code is written. |
| `implementer` | Writes code that matches the surrounding style. |
| `reviewer` | Hunts correctness bugs in the diff. |
| `test-writer` | Adds the missing tests for the change. |

This harness ships with the **claude-code** adapter.

## MCP servers

Two zero-dependency stdio MCP servers (newline-delimited JSON-RPC 2.0), wired in
`.claude/settings.json` and dispatched through the kernel's capability-gated `ToolDispatcher`:

```bash
crechebooks-harness mcp start   # tools: kernel_info, harness_doctor, list_agents,
                                #        plan_change, review_diff, run_tests
crechebooks-harness mcp index   # read-only code search: search_code, list_files, read_file
crechebooks-harness mcp domain  # CrecheBooks finance — reads: tenant_info, dashboard_metrics,
                                #   list_invoices, list_payments, arrears_report, reconciliation_summary
                                # guarded writes: generate_invoices, match_payments, send_invoices
```

Reads are unconditional; **writes are guarded**: preview-default (nothing executes without
`confirm:true`), and parent-contacting operations (`send_invoices`) are hard-blocked on
staging and production-only. The client reads `CRECHEBOOKS_API_KEY` / `CB_API_URL` /
`CB_TENANT_ID` from the environment (defaults to staging) and never logs the key.

## Skills

- **`/library`** — meta-skill to catalog & redistribute private skills/agents/prompts across
  repos, devices, and agents via a `library.yaml` reference file (`add`/`use`/`push`/`list`/`search`/`sync`).
- **`/plan-change`** — minimal file-level plan before any code.
- **`/evolve`** — Darwin Mode self-improvement (`npm run evolve` / `evolve:dry`).

## Release gates

Zero-dependency provenance + audit (Node built-in `crypto` for Ed25519):

```bash
crechebooks-harness manifest    # refresh the integrity manifest (sha256 of every source file)
crechebooks-harness sbom        # SPDX-2.3 SBOM → .harness/sbom.spdx.json
crechebooks-harness sign        # Ed25519-sign the manifest → .harness/witness.json
crechebooks-harness verify      # check signature + source integrity
crechebooks-harness mcp-scan    # static security audit of the MCP tools
crechebooks-harness validate    # run all gates as one PASS/FAIL report
```

The Ed25519 private key lives in `.harness/keys/signing.key` and is gitignored; the public
key, witness, and SBOM are committed so anyone can verify a release.

## License

MIT
