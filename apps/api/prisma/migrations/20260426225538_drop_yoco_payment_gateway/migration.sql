-- Drop Yoco payment gateway artefacts (Phase 1 audit, Bucket C cleanup follow-up).
-- Both tables verified EMPTY in staging and production (2026-04-27).
-- Order: child constraints first, child table, parent table, then enums.

ALTER TABLE IF EXISTS "payment_gateway_transactions"
    DROP CONSTRAINT IF EXISTS "payment_gateway_transactions_payment_link_id_fkey";

DROP TABLE IF EXISTS "payment_gateway_transactions";
DROP TABLE IF EXISTS "payment_links";

DROP TYPE IF EXISTS "PaymentLinkStatus";
DROP TYPE IF EXISTS "PaymentLinkType";
DROP TYPE IF EXISTS "PaymentGatewayStatus";
