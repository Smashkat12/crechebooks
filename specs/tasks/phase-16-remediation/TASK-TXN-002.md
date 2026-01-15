<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-002</task_id>
    <title>Make Bank Fee Amounts Configurable</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Enhancement</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>4-6 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>configuration</tag>
      <tag>bank-fees</tag>
      <tag>multi-tenancy</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Bank fee amounts are currently hardcoded in the bank charge service (R14.70 for
      standard fees, R5.00 for basic fees). This prevents tenants from configuring their
      own bank fee structures and requires code changes whenever fee amounts change.
    </problem_statement>

    <current_behavior>
      - Hardcoded fee values: R14.70 (standard), R5.00 (basic)
      - Fee changes require code deployment
      - All tenants use same fee structure
      - No audit trail for fee configuration changes
    </current_behavior>

    <expected_behavior>
      - Bank fees configurable per tenant
      - Admin interface to manage fee configurations
      - Default values for new tenants
      - Audit trail for fee changes
      - Support for multiple fee types per bank
    </expected_behavior>

    <impact>
      - Operational flexibility for different tenant requirements
      - Reduced deployment frequency for fee updates
      - Better support for multi-bank environments
      - Improved maintainability
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/transactions/bank-charge.service.ts</path>
        <changes>Replace hardcoded values with configuration lookup</changes>
      </file>
      <file>
        <path>apps/api/src/config/tenant-settings.ts</path>
        <changes>Add bank fee configuration schema</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/transactions/bank-fee-config.service.ts</path>
        <purpose>Service for managing bank fee configurations</purpose>
      </file>
      <file>
        <path>apps/api/src/transactions/dto/bank-fee-config.dto.ts</path>
        <purpose>DTOs for bank fee configuration</purpose>
      </file>
      <file>
        <path>apps/api/src/transactions/__tests__/bank-fee-config.service.spec.ts</path>
        <purpose>Unit tests for configuration service</purpose>
      </file>
    </files_to_create>

    <database_changes>
      <migration>
        <name>add-bank-fee-configurations</name>
        <description>Create table for tenant bank fee configurations</description>
      </migration>
    </database_changes>

    <out_of_scope>
      <item>UI for bank fee management (separate task)</item>
      <item>Historical fee recalculation</item>
      <item>Bank API integration</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Create a bank fee configuration service that retrieves fee amounts from tenant
      settings. Implement a caching layer to avoid database lookups on every transaction.
      Provide sensible defaults for tenants without custom configurations.
    </approach>

    <data_model>
```typescript
interface BankFeeConfig {
  id: string;
  tenantId: string;
  bankCode: string;
  feeType: 'standard' | 'basic' | 'premium' | 'custom';
  amount: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// Default configuration
const DEFAULT_BANK_FEES: Record<string, number> = {
  standard: 14.70,
  basic: 5.00,
  premium: 25.00,
};
```
    </data_model>

    <pseudocode>
```typescript
@Injectable()
export class BankFeeConfigService {
  private cache = new Map<string, BankFeeConfig[]>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  async getFeeAmount(
    tenantId: string,
    bankCode: string,
    feeType: string
  ): Promise<number> {
    // Check cache first
    const cacheKey = `${tenantId}:${bankCode}`;
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isCacheExpired(cacheKey)) {
      const config = cached.find(c => c.feeType === feeType && c.isActive);
      if (config) return config.amount;
    }

    // Fetch from database
    const configs = await this.repository.find({
      where: { tenantId, bankCode, isActive: true },
    });

    this.cache.set(cacheKey, configs);

    // Find matching config or return default
    const config = configs.find(c => c.feeType === feeType);
    return config?.amount ?? DEFAULT_BANK_FEES[feeType] ?? DEFAULT_BANK_FEES.standard;
  }

  async updateFeeConfig(
    tenantId: string,
    config: UpdateBankFeeDto,
    userId: string
  ): Promise<BankFeeConfig> {
    // Validate fee amount
    if (config.amount < 0) {
      throw new BadRequestException('Fee amount cannot be negative');
    }

    // Create or update configuration
    const existing = await this.repository.findOne({
      where: { tenantId, bankCode: config.bankCode, feeType: config.feeType },
    });

    if (existing) {
      existing.amount = config.amount;
      existing.updatedAt = new Date();
      await this.repository.save(existing);

      // Audit log
      await this.auditService.log({
        action: 'BANK_FEE_UPDATED',
        tenantId,
        userId,
        oldValue: existing.amount,
        newValue: config.amount,
      });

      return existing;
    }

    // Create new config
    const newConfig = this.repository.create({
      ...config,
      tenantId,
      createdBy: userId,
    });

    return this.repository.save(newConfig);
  }

  invalidateCache(tenantId: string, bankCode?: string): void {
    if (bankCode) {
      this.cache.delete(`${tenantId}:${bankCode}`);
    } else {
      // Invalidate all caches for tenant
      for (const key of this.cache.keys()) {
        if (key.startsWith(tenantId)) {
          this.cache.delete(key);
        }
      }
    }
  }
}
```
    </pseudocode>

    <technical_notes>
      - Use caching to minimize database lookups
      - Implement cache invalidation on configuration updates
      - Support effective date ranges for scheduled fee changes
      - Log all configuration changes for audit purposes
      - Consider using Redis for distributed caching in production
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should return configured fee for tenant</name>
        <input>tenantId: 'tenant-1', bankCode: 'FNB', feeType: 'standard'</input>
        <expected_result>Returns tenant-specific configured amount</expected_result>
      </test_case>
      <test_case>
        <name>Should return default fee when no config exists</name>
        <input>tenantId: 'new-tenant', bankCode: 'ABSA', feeType: 'standard'</input>
        <expected_result>Returns R14.70 (default standard fee)</expected_result>
      </test_case>
      <test_case>
        <name>Should cache configuration lookups</name>
        <input>Multiple lookups for same tenant/bank combination</input>
        <expected_result>Database queried only once within cache TTL</expected_result>
      </test_case>
      <test_case>
        <name>Should invalidate cache on config update</name>
        <input>Update fee config then fetch</input>
        <expected_result>Returns new value after update</expected_result>
      </test_case>
      <test_case>
        <name>Should reject negative fee amounts</name>
        <input>amount: -5.00</input>
        <expected_result>BadRequestException thrown</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Create fee configuration for test tenant</step>
      <step>Process transaction and verify configured fee applied</step>
      <step>Update fee configuration and verify change reflected</step>
      <step>Verify audit log entries created</step>
      <step>Test with tenant without configuration (default fees)</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Bank fees retrieved from tenant configuration</criterion>
      <criterion>Default values used when no configuration exists</criterion>
      <criterion>Caching implemented with proper invalidation</criterion>
      <criterion>Audit logging for configuration changes</criterion>
      <criterion>Database migration created and tested</criterion>
      <criterion>Unit tests cover all scenarios</criterion>
      <criterion>Integration tests verify end-to-end flow</criterion>
      <criterion>Documentation updated with configuration options</criterion>
      <criterion>Backward compatible with existing transactions</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>Bank Charge Service</title>
      <path>apps/api/src/transactions/bank-charge.service.ts</path>
    </reference>
    <reference>
      <title>Tenant Settings Configuration</title>
      <path>apps/api/src/config/tenant-settings.ts</path>
    </reference>
  </references>
</task_specification>
