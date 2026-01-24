-- Migration: Fix Demo Tenant ID
-- Changes the literal string 'DEMO_TENANT_ID' to a proper UUID
-- This must update the tenant first, then all child tables that reference it

-- The new proper UUID for Elle Elephant Creche
-- Old ID: 'DEMO_TENANT_ID' (invalid - not a UUID)
-- New ID: 'ee937a14-3c81-4e74-ab10-8d2936c5bc2e' (valid UUID)

DO $$
DECLARE
    old_id TEXT := 'DEMO_TENANT_ID';
    new_id TEXT := 'ee937a14-3c81-4e74-ab10-8d2936c5bc2e';
    tenant_exists BOOLEAN;
    new_tenant_exists BOOLEAN;
BEGIN
    -- Check if the old tenant ID exists
    SELECT EXISTS(SELECT 1 FROM tenants WHERE id = old_id) INTO tenant_exists;

    -- Check if the new tenant ID already exists
    SELECT EXISTS(SELECT 1 FROM tenants WHERE id = new_id) INTO new_tenant_exists;

    IF tenant_exists AND NOT new_tenant_exists THEN
        RAISE NOTICE 'Migrating tenant ID from % to %', old_id, new_id;

        -- Step 1: Create a copy of the tenant with the new ID
        INSERT INTO tenants (
            id, name, trading_name, email, phone, address_line1, address_line2,
            city, province, postal_code, country, website, logo_url, tax_number,
            tax_status, subscription_status, subscription_tier, trial_ends_at,
            created_at, updated_at
        )
        SELECT
            new_id, name, trading_name, email, phone, address_line1, address_line2,
            city, province, postal_code, country, website, logo_url, tax_number,
            tax_status, subscription_status, subscription_tier, trial_ends_at,
            created_at, updated_at
        FROM tenants
        WHERE id = old_id;

        -- Step 2: Update all foreign key references in child tables
        -- Users
        UPDATE users SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Parents
        UPDATE parents SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Children
        UPDATE children SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Staff
        UPDATE staff SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Fee structures
        UPDATE fee_structures SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Enrollments
        UPDATE enrollments SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Invoices
        UPDATE invoices SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Payments
        UPDATE payments SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Transactions
        UPDATE transactions SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Categories
        UPDATE categories SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Audit logs
        UPDATE audit_logs SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Bank accounts
        UPDATE bank_accounts SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Subsidies
        UPDATE subsidies SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Tax periods
        UPDATE tax_periods SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Revenue forecasts
        UPDATE revenue_forecasts SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Invoice templates
        UPDATE invoice_templates SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Email templates
        UPDATE email_templates SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Webhook logs
        UPDATE webhook_logs SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Xero connections
        UPDATE xero_connections SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Xero token mappings
        UPDATE xero_token_mappings SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Xero invoice mappings
        UPDATE xero_invoice_mappings SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Xero contact mappings
        UPDATE xero_contact_mappings SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Xero transaction splits
        UPDATE xero_transaction_splits SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Bank statement matches
        UPDATE bank_statement_matches SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Manual match history
        UPDATE manual_match_history SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Duplicate resolutions
        UPDATE duplicate_resolutions SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Feature flags
        UPDATE feature_flags SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Tenant public keys
        UPDATE tenant_public_keys SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Tenant webhook configs
        UPDATE tenant_webhook_configs SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Broadcast messages
        UPDATE broadcast_messages SET tenant_id = new_id WHERE tenant_id = old_id;

        -- Impersonation sessions (target tenant)
        UPDATE impersonation_sessions SET target_tenant_id = new_id WHERE target_tenant_id = old_id;

        -- Step 3: Delete the old tenant record
        DELETE FROM tenants WHERE id = old_id;

        RAISE NOTICE 'Migration complete: Tenant ID updated from % to %', old_id, new_id;

    ELSIF new_tenant_exists THEN
        RAISE NOTICE 'New tenant ID % already exists, skipping migration', new_id;

        -- If old tenant still exists, clean it up by moving any remaining references
        IF tenant_exists THEN
            RAISE NOTICE 'Old tenant % still exists, migrating any remaining references', old_id;

            -- Update any remaining references
            UPDATE users SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE parents SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE children SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE staff SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE fee_structures SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE enrollments SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE invoices SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE payments SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE transactions SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE categories SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE audit_logs SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE bank_accounts SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE subsidies SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE tax_periods SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE revenue_forecasts SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE invoice_templates SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE email_templates SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE webhook_logs SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE xero_connections SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE xero_token_mappings SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE xero_invoice_mappings SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE xero_contact_mappings SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE xero_transaction_splits SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE bank_statement_matches SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE manual_match_history SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE duplicate_resolutions SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE feature_flags SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE tenant_public_keys SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE tenant_webhook_configs SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE broadcast_messages SET tenant_id = new_id WHERE tenant_id = old_id;
            UPDATE impersonation_sessions SET target_tenant_id = new_id WHERE target_tenant_id = old_id;

            -- Delete old tenant
            DELETE FROM tenants WHERE id = old_id;
            RAISE NOTICE 'Old tenant % deleted', old_id;
        END IF;

    ELSE
        RAISE NOTICE 'Old tenant ID % not found, no migration needed', old_id;
    END IF;
END $$;
