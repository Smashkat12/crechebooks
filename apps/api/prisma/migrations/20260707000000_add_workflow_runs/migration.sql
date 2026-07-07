-- Persist OrchestratorAgent workflow invocations + per-tenant month-end opt-in.
-- Additive, idempotent, backwards-compatible.
--
-- Why:
--   OrchestratorAgent.executeWorkflow previously left no persistent trace:
--   it appended a JSON line to .claude/logs/decisions.jsonl on the API
--   container filesystem, which is ephemeral on Railway and unreachable from
--   the API. Wiring the orchestrator to real triggers (admin endpoints, a
--   monthly cron) requires being able to query "what's running / what
--   escalated / what failed" from the database.
--
-- Shape:
--   1. WorkflowRunStatus enum: RUNNING | COMPLETED | FAILED | AWAITING_ESCALATION
--   2. workflow_runs row per executeWorkflow() call (created up-front, updated
--      as the workflow progresses).
--   3. tenants.orchestrator_month_end_enabled — per-tenant opt-in flag for the
--      monthly MONTH_END cron. Default FALSE, so nothing auto-runs in prod
--      until an operator flips it explicitly.
--
-- Rollback: DROP TABLE workflow_runs; DROP TYPE "WorkflowRunStatus";
--          ALTER TABLE tenants DROP COLUMN orchestrator_month_end_enabled;
--          (All fields are additive, no reads outside orchestrator code.)

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE "WorkflowRunStatus" AS ENUM (
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'AWAITING_ESCALATION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. workflow_runs table
CREATE TABLE IF NOT EXISTS workflow_runs (
  id             TEXT                NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id      TEXT                NOT NULL,
  workflow_type  VARCHAR(50)         NOT NULL,
  status         "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
  triggered_by   VARCHAR(30)         NOT NULL,
  current_step   VARCHAR(80),
  input          JSONB,
  output         JSONB,
  error          TEXT,
  escalated_to   VARCHAR(120),
  started_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,

  CONSTRAINT workflow_runs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_runs_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS workflow_runs_tenant_id_started_at_idx
  ON workflow_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_tenant_id_workflow_type_started_at_idx
  ON workflow_runs(tenant_id, workflow_type, started_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_status_started_at_idx
  ON workflow_runs(status, started_at DESC);

-- 3. tenants opt-in flag
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS orchestrator_month_end_enabled BOOLEAN NOT NULL DEFAULT FALSE;
