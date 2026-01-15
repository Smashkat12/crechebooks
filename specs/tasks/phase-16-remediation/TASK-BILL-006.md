<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-006</task_id>
    <title>Remove Hardcoded Xero Account Codes</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>3-4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>xero</tag>
      <tag>integration</tag>
      <tag>configuration</tag>
      <tag>account-codes</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Xero account codes are hardcoded in the integration source code. This
      prevents organizations from using their own chart of accounts and requires
      code changes for any account mapping updates.
    </problem_statement>

    <business_impact>
      - Organizations cannot customize account mappings
      - Code deployment required for account changes
      - Mismatch with organization's Xero chart of accounts
      - Integration failures when account codes don't exist in Xero
      - Reduced flexibility for accountants
    </business_impact>

    <root_cause>
      Account codes were hardcoded during initial integration development as a
      quick solution. No configuration or database lookup mechanism was
      implemented for organization-specific mappings.
    </root_cause>

    <affected_users>
      - All organizations using Xero integration
      - Finance teams with custom chart of accounts
      - New organizations onboarding with different account structures
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Extract hardcoded account codes to configuration</item>
      <item>Create database table for account mappings</item>
      <item>Add admin UI for account mapping management</item>
      <item>Implement organization-level account overrides</item>
      <item>Add default account fallback mechanism</item>
    </in_scope>

    <out_of_scope>
      <item>Xero OAuth integration changes</item>
      <item>Xero API version updates</item>
      <item>Automatic account synchronization from Xero</item>
      <item>Multi-currency account handling</item>
    </out_of_scope>

    <affected_files>
      <file>apps/api/src/integrations/xero/xero.service.ts</file>
      <file>apps/api/src/integrations/xero/xero-invoice.service.ts</file>
      <file>apps/api/src/integrations/xero/xero-payment.service.ts</file>
      <file>apps/api/src/integrations/xero/xero-mapping.service.ts</file>
      <file>apps/api/src/integrations/xero/config/xero-accounts.config.ts</file>
      <file>prisma/schema.prisma</file>
    </affected_files>

    <dependencies>
      <dependency type="api">Xero API account endpoints</dependency>
      <dependency type="feature">Admin settings UI</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Create a flexible account mapping system that supports default system
      mappings with organization-level overrides. Store mappings in database
      with caching for performance.
    </approach>

    <steps>
      <step order="1">
        <description>Identify all hardcoded account codes</description>
        <details>
          - Search codebase for hardcoded Xero account codes
          - Document purpose of each account code
          - Categorize by transaction type (sales, payments, VAT, etc.)
        </details>
        <code_snippet>
```typescript
// Current hardcoded examples to find and replace:

// In xero-invoice.service.ts
const SALES_ACCOUNT = '200';      // Revenue account
const VAT_ACCOUNT = '820';        // VAT liability
const DISCOUNT_ACCOUNT = '310';   // Discounts given

// In xero-payment.service.ts
const BANK_ACCOUNT = '090';       // Bank account
const RECEIVABLES_ACCOUNT = '610'; // Accounts receivable

// In xero.service.ts
const ROUNDING_ACCOUNT = '860';   // Rounding adjustments
```
        </code_snippet>
      </step>

      <step order="2">
        <description>Create database schema for account mappings</description>
        <details>
          - Add XeroAccountMapping table
          - Support organization-level overrides
          - Include validation fields
        </details>
        <code_snippet>
```prisma
// prisma/schema.prisma

model XeroAccountMapping {
  id              String   @id @default(cuid())
  organizationId  String?  // Null = system default
  accountType     String   // SALES, VAT, BANK, RECEIVABLES, etc.
  accountCode     String   // Xero account code
  accountName     String   // Human readable name
  description     String?  // Usage description
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization    Organization? @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, accountType])
  @@index([organizationId])
  @@index([accountType])
}

enum XeroAccountType {
  SALES_REVENUE
  SALES_DISCOUNT
  VAT_OUTPUT
  VAT_INPUT
  BANK
  ACCOUNTS_RECEIVABLE
  ACCOUNTS_PAYABLE
  ROUNDING
  BAD_DEBT
  CREDIT_NOTE
}
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Implement account mapping service</description>
        <details>
          - Create service for account code retrieval
          - Implement caching for performance
          - Support fallback to defaults
        </details>
        <code_snippet>
```typescript
// apps/api/src/integrations/xero/xero-mapping.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache.service';

export enum XeroAccountType {
  SALES_REVENUE = 'SALES_REVENUE',
  SALES_DISCOUNT = 'SALES_DISCOUNT',
  VAT_OUTPUT = 'VAT_OUTPUT',
  VAT_INPUT = 'VAT_INPUT',
  BANK = 'BANK',
  ACCOUNTS_RECEIVABLE = 'ACCOUNTS_RECEIVABLE',
  ACCOUNTS_PAYABLE = 'ACCOUNTS_PAYABLE',
  ROUNDING = 'ROUNDING',
  BAD_DEBT = 'BAD_DEBT',
  CREDIT_NOTE = 'CREDIT_NOTE',
}

interface AccountMapping {
  accountCode: string;
  accountName: string;
  isDefault: boolean;
}

@Injectable()
export class XeroMappingService {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Get account code for a specific type and organization
   * Falls back to system default if no org-specific mapping
   */
  async getAccountCode(
    accountType: XeroAccountType,
    organizationId: string
  ): Promise<string> {
    const mapping = await this.getAccountMapping(accountType, organizationId);
    return mapping.accountCode;
  }

  async getAccountMapping(
    accountType: XeroAccountType,
    organizationId: string
  ): Promise<AccountMapping> {
    const cacheKey = `xero_account:${organizationId}:${accountType}`;

    // Check cache first
    const cached = await this.cache.get<AccountMapping>(cacheKey);
    if (cached) return cached;

    // Try organization-specific mapping
    let mapping = await this.prisma.xeroAccountMapping.findUnique({
      where: {
        organizationId_accountType: {
          organizationId,
          accountType,
        },
      },
    });

    // Fall back to system default
    if (!mapping) {
      mapping = await this.prisma.xeroAccountMapping.findUnique({
        where: {
          organizationId_accountType: {
            organizationId: null, // System default has null orgId
            accountType,
          },
        },
      });
    }

    // Ultimate fallback to hardcoded defaults
    if (!mapping) {
      const defaultCode = this.getHardcodedDefault(accountType);
      return {
        accountCode: defaultCode,
        accountName: `Default ${accountType}`,
        isDefault: true,
      };
    }

    const result: AccountMapping = {
      accountCode: mapping.accountCode,
      accountName: mapping.accountName,
      isDefault: mapping.organizationId === null,
    };

    // Cache the result
    await this.cache.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * Get all account mappings for an organization
   */
  async getOrganizationMappings(
    organizationId: string
  ): Promise<Map<XeroAccountType, AccountMapping>> {
    const mappings = new Map<XeroAccountType, AccountMapping>();

    for (const accountType of Object.values(XeroAccountType)) {
      const mapping = await this.getAccountMapping(accountType, organizationId);
      mappings.set(accountType, mapping);
    }

    return mappings;
  }

  /**
   * Set or update organization account mapping
   */
  async setAccountMapping(
    organizationId: string,
    accountType: XeroAccountType,
    accountCode: string,
    accountName: string
  ): Promise<void> {
    await this.prisma.xeroAccountMapping.upsert({
      where: {
        organizationId_accountType: {
          organizationId,
          accountType,
        },
      },
      create: {
        organizationId,
        accountType,
        accountCode,
        accountName,
      },
      update: {
        accountCode,
        accountName,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    const cacheKey = `xero_account:${organizationId}:${accountType}`;
    await this.cache.delete(cacheKey);
  }

  /**
   * Reset organization mapping to use system default
   */
  async resetToDefault(
    organizationId: string,
    accountType: XeroAccountType
  ): Promise<void> {
    await this.prisma.xeroAccountMapping.delete({
      where: {
        organizationId_accountType: {
          organizationId,
          accountType,
        },
      },
    });

    // Invalidate cache
    const cacheKey = `xero_account:${organizationId}:${accountType}`;
    await this.cache.delete(cacheKey);
  }

  /**
   * Hardcoded fallback defaults - should rarely be used
   */
  private getHardcodedDefault(accountType: XeroAccountType): string {
    const defaults: Record<XeroAccountType, string> = {
      [XeroAccountType.SALES_REVENUE]: '200',
      [XeroAccountType.SALES_DISCOUNT]: '310',
      [XeroAccountType.VAT_OUTPUT]: '820',
      [XeroAccountType.VAT_INPUT]: '821',
      [XeroAccountType.BANK]: '090',
      [XeroAccountType.ACCOUNTS_RECEIVABLE]: '610',
      [XeroAccountType.ACCOUNTS_PAYABLE]: '800',
      [XeroAccountType.ROUNDING]: '860',
      [XeroAccountType.BAD_DEBT]: '684',
      [XeroAccountType.CREDIT_NOTE]: '200',
    };

    return defaults[accountType] || '999';
  }
}
```
        </code_snippet>
      </step>

      <step order="4">
        <description>Refactor Xero services to use mapping service</description>
        <details>
          - Replace all hardcoded account codes
          - Inject mapping service into Xero services
          - Update unit tests
        </details>
        <code_snippet>
```typescript
// apps/api/src/integrations/xero/xero-invoice.service.ts

@Injectable()
export class XeroInvoiceService {
  constructor(
    private xeroClient: XeroClient,
    private mappingService: XeroMappingService,
  ) {}

  async createInvoice(
    invoice: Invoice,
    organizationId: string
  ): Promise<XeroInvoice> {
    // Get account codes from mapping service
    const salesAccount = await this.mappingService.getAccountCode(
      XeroAccountType.SALES_REVENUE,
      organizationId
    );
    const vatAccount = await this.mappingService.getAccountCode(
      XeroAccountType.VAT_OUTPUT,
      organizationId
    );

    const xeroInvoice = {
      Type: 'ACCREC',
      Contact: { ContactID: invoice.xeroContactId },
      LineItems: invoice.lineItems.map(item => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitPrice,
        AccountCode: salesAccount,  // Now configurable
        TaxType: item.isVatExempt ? 'NONE' : 'OUTPUT2',
      })),
    };

    return this.xeroClient.invoices.create(xeroInvoice);
  }
}

// apps/api/src/integrations/xero/xero-payment.service.ts

@Injectable()
export class XeroPaymentService {
  constructor(
    private xeroClient: XeroClient,
    private mappingService: XeroMappingService,
  ) {}

  async recordPayment(
    payment: Payment,
    organizationId: string
  ): Promise<XeroPayment> {
    const bankAccount = await this.mappingService.getAccountCode(
      XeroAccountType.BANK,
      organizationId
    );

    const xeroPayment = {
      Invoice: { InvoiceID: payment.xeroInvoiceId },
      Account: { Code: bankAccount },  // Now configurable
      Amount: payment.amount,
      Date: payment.date,
    };

    return this.xeroClient.payments.create(xeroPayment);
  }
}
```
        </code_snippet>
      </step>

      <step order="5">
        <description>Create admin UI for account mapping</description>
        <details>
          - Add settings page for Xero account mappings
          - Show current mappings (default or custom)
          - Allow override and reset to default
          - Validate account codes exist in Xero
        </details>
        <code_snippet>
```typescript
// apps/api/src/integrations/xero/xero-mapping.controller.ts

@Controller('api/integrations/xero/mappings')
@UseGuards(AuthGuard, OrgAdminGuard)
export class XeroMappingController {
  constructor(private mappingService: XeroMappingService) {}

  @Get()
  async getMappings(
    @Org() organization: Organization
  ): Promise<AccountMappingDto[]> {
    const mappings = await this.mappingService.getOrganizationMappings(
      organization.id
    );

    return Array.from(mappings.entries()).map(([type, mapping]) => ({
      accountType: type,
      accountCode: mapping.accountCode,
      accountName: mapping.accountName,
      isDefault: mapping.isDefault,
    }));
  }

  @Put(':accountType')
  async updateMapping(
    @Org() organization: Organization,
    @Param('accountType') accountType: XeroAccountType,
    @Body() dto: UpdateMappingDto
  ): Promise<void> {
    // Validate account exists in Xero
    await this.validateXeroAccount(organization.id, dto.accountCode);

    await this.mappingService.setAccountMapping(
      organization.id,
      accountType,
      dto.accountCode,
      dto.accountName
    );
  }

  @Delete(':accountType')
  async resetMapping(
    @Org() organization: Organization,
    @Param('accountType') accountType: XeroAccountType
  ): Promise<void> {
    await this.mappingService.resetToDefault(organization.id, accountType);
  }

  private async validateXeroAccount(
    organizationId: string,
    accountCode: string
  ): Promise<void> {
    // Call Xero API to verify account exists
    const accounts = await this.xeroService.getAccounts(organizationId);
    const exists = accounts.some(a => a.Code === accountCode);

    if (!exists) {
      throw new BadRequestException(
        `Account code ${accountCode} not found in Xero`
      );
    }
  }
}
```
        </code_snippet>
      </step>

      <step order="6">
        <description>Seed default account mappings</description>
        <details>
          - Create migration to add default system mappings
          - Document each mapping purpose
          - Ensure no null organization mappings exist
        </details>
        <code_snippet>
```typescript
// prisma/seed/xero-defaults.ts

const DEFAULT_MAPPINGS = [
  {
    accountType: 'SALES_REVENUE',
    accountCode: '200',
    accountName: 'Sales Revenue',
    description: 'Revenue from invoice sales',
  },
  {
    accountType: 'SALES_DISCOUNT',
    accountCode: '310',
    accountName: 'Discounts Given',
    description: 'Discounts and credits applied to invoices',
  },
  {
    accountType: 'VAT_OUTPUT',
    accountCode: '820',
    accountName: 'VAT Liability',
    description: 'VAT collected on sales',
  },
  {
    accountType: 'BANK',
    accountCode: '090',
    accountName: 'Business Bank Account',
    description: 'Main bank account for payments',
  },
  {
    accountType: 'ACCOUNTS_RECEIVABLE',
    accountCode: '610',
    accountName: 'Accounts Receivable',
    description: 'Outstanding customer invoices',
  },
  // ... other defaults
];

async function seedXeroDefaults(prisma: PrismaClient) {
  for (const mapping of DEFAULT_MAPPINGS) {
    await prisma.xeroAccountMapping.upsert({
      where: {
        organizationId_accountType: {
          organizationId: null, // System default
          accountType: mapping.accountType,
        },
      },
      create: {
        organizationId: null,
        ...mapping,
      },
      update: mapping,
    });
  }
}
```
        </code_snippet>
      </step>
    </steps>

    <technical_notes>
      - Cache invalidation critical when mappings change
      - Validate account codes against Xero API before saving
      - Consider lazy-loading mappings for performance
      - Log when falling back to hardcoded defaults
      - Support environment variable overrides for defaults
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Organization-specific mapping used when set</description>
        <preconditions>Organization has custom SALES_REVENUE mapping</preconditions>
        <expected_result>Custom account code used in Xero invoice</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>System default used when no org mapping</description>
        <preconditions>Organization has no custom mappings</preconditions>
        <expected_result>System default account codes used</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>Invalid account code rejected</description>
        <preconditions>Attempt to set account code not in Xero</preconditions>
        <expected_result>Validation error returned</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Reset to default removes org mapping</description>
        <preconditions>Organization has custom mapping</preconditions>
        <expected_result>Mapping deleted, system default used</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Cache invalidation on mapping update</description>
        <preconditions>Cached mapping exists</preconditions>
        <expected_result>New mapping used immediately after update</expected_result>
      </test_case>
    </test_cases>

    <manual_testing>
      <step>Configure custom account mapping in admin UI</step>
      <step>Create invoice and verify correct account in Xero</step>
      <step>Reset mapping and verify default used</step>
      <step>Test validation against Xero chart of accounts</step>
    </manual_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>No hardcoded account codes in Xero integration services</criterion>
      <criterion>Database table for account mappings created</criterion>
      <criterion>System defaults seeded in database</criterion>
      <criterion>Organization-level override working</criterion>
      <criterion>Admin UI for mapping management</criterion>
      <criterion>Account code validation against Xero</criterion>
      <criterion>Cache implemented with proper invalidation</criterion>
      <criterion>All existing Xero integration tests passing</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">Hardcoded account codes identified and documented</item>
      <item checked="false">Database schema for mappings created</item>
      <item checked="false">XeroMappingService implemented</item>
      <item checked="false">Xero services refactored to use mapping service</item>
      <item checked="false">Admin API endpoints created</item>
      <item checked="false">Admin UI for mapping management</item>
      <item checked="false">Default mappings seeded</item>
      <item checked="false">Unit tests for mapping service</item>
      <item checked="false">Integration tests updated</item>
      <item checked="false">Documentation for account mapping</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="api">Xero Chart of Accounts API</reference>
    <reference type="documentation">Xero Account Types</reference>
    <reference type="issue">Feature request - configurable account codes</reference>
  </references>
</task_specification>
