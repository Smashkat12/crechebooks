-- TASK-ACCT-011: Atomic Employee Number Counter
-- Mirrors invoice_number_counters pattern for thread-safe employee number generation.

CREATE TABLE employee_number_counters (
    tenant_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, year),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
