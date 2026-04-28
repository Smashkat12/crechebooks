---
name: operator-helpers
description: How operators interact with the live CrecheBooks system safely — cb-api.sh, cb-db.sh, environment selection, mutation policy.
when-to-use: Always. Every operator (financial-ops, tax-ops, comms-ops, data-ops) reads this at task start before invoking any helper.
---

# Operator helpers

You don't write source code. You drive the running system using two helpers:

- `.claude/helpers/cb-api.sh` — CrecheBooks REST API (`/api/v1/*`)
- `.claude/helpers/cb-db.sh` — direct PostgreSQL access (read-only by convention)

Both respect `CB_ENVIRONMENT` (default: `staging`).

## Environment selection

```bash
# Default: staging
.claude/helpers/cb-api.sh GET /dashboard/summary
.claude/helpers/cb-db.sh "SELECT id FROM tenants LIMIT 1"

# Production (explicit, only when the brief authorises it)
CB_ENVIRONMENT=production .claude/helpers/cb-api.sh GET /dashboard/summary
CB_ENVIRONMENT=production .claude/helpers/cb-db.sh "SELECT ..."
```

**Default to staging.** Touch production only when the brief explicitly says
"production" and only after confirming the environment in your `Done:` line.

## cb-api.sh policy

- Reads (`GET`) — fine in any environment.
- Writes (`POST`/`PUT`/`PATCH`/`DELETE`) — fine *if* the brief authorised the
  mutation, the endpoint has audit logging, and you state the impact in your
  report.
- **Comms endpoints** are never safe in staging — staging holds real parent
  data and there is no kill-switch for sends. See `comms-engineer-mental-model`
  for the full danger list. If your task involves any of:
  - `POST /invoices/send`
  - `POST /communications/broadcast`
  - any `/delivery` or `/reminder` endpoint
  ... and you are not on production with explicit authorisation: **do not run.
  Report blocked.**

## cb-db.sh policy

- Default: **read-only**. SELECT only.
- Never run raw `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `DROP`. Mutations go
  through `cb-api.sh` so the audit-log trail catches them.
- Schema changes (`ALTER TABLE`, `CREATE TABLE`, `DROP COLUMN`) are
  `schema-guardian`'s job, NOT yours. Refuse and route back via your lead.

## Tenant scoping

Most queries need a tenant filter. The helpers expose `$TENANT` (set in
`.claude/settings.json`):

```bash
.claude/helpers/cb-db.sh "SELECT count(*) FROM invoices WHERE tenant_id = '\$TENANT' AND deleted_at IS NULL"
```

Always include `deleted_at IS NULL` on business-data reads — soft-delete is the
norm.

## Output discipline

- Don't paste raw helper output into your report — summarise.
- Numbers and counts are the unit of operator work. Report counts (e.g.
  "matched 14, unmatched 3"), date windows, environment, and any anomaly.
- For long output, redirect to a file under `{{SESSION_DIR}}/` and reference
  the path. Don't dump.

## When something looks wrong

Operators don't fix code. If a helper response is malformed, an endpoint 500s,
or a query returns surprising data:

1. Capture the evidence (status code, error body, query output).
2. Report `Blocked:` with the evidence.
3. Route back to your lead for engineering-lead handoff.

Never retry-with-different-args to make a problem disappear.
