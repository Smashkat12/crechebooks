<task_spec id="TASK-XERO-006" version="2.0">

<metadata>
  <title>Chart of Accounts Database Sync</title>
  <status>DONE</status>
  <phase>9</phase>
  <layer>logic</layer>
  <sequence>182</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-XERO-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-XERO-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-09</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Chart of Accounts State

  **Static CoA File (apps/api/.claude/context/chart_of_accounts.json):**
  ```json
  {
    "accounts": [
      { "code": "1000", "name": "Business Account", "type": "BANK" },
      { "code": "4000", "name": "Fee Income", "type": "REVENUE" },
      { "code": "5100", "name": "Groceries & Supplies", "type": "EXPENSE" },
      // ...
    ]
  }
  ```

  **Current XeroSyncService.syncChartOfAccounts():**
  ```typescript
  async syncChartOfAccounts(tenantId: string): Promise<CategorySyncResult> {
    const accounts = await getAccounts(client, xeroTenantId);
    // Returns accounts but doesn't save to DB
    return {
      accountsFetched: accounts.length,
      newAccounts: accounts.map(a => `${a.code}: ${a.name}`),
      errors: [],
    };
  }
  ```

  **GAP ANALYSIS:**
  - Chart of Accounts is a static JSON file
  - No validation that account codes exist in Xero
  - XeroSyncService.syncChartOfAccounts() exists but only returns data, doesn't store
  - If accounts are added/renamed/archived in Xero, CrecheBooks doesn't know

  **Benefits of Database Storage:**
  - Validation before sync (account code exists?)
  - Track changes over time
  - Alert users to Xero account changes
  - Support account code mapping/aliases (future)
  - Prevent pushing to archived accounts

  **Xero Account Types:**
  - BANK, CURRENT, CURRLIAB, DEPRECIATN, DIRECTCOSTS
  - EQUITY, EXPENSE, FIXED, INVENTORY, LIABILITY
  - NONCURRENT, OTHERINCOME, OVERHEADS, PREPAYMENT
  - REVENUE, SALES, TERMLIAB, PAYGLIABILITY, SUPERANNUATIONEXPENSE
  - SUPERANNUATIONLIABILITY, WAGESEXPENSE

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Prisma Schema Pattern
  ```prisma
  model XeroAccount {
    id            String   @id @default(uuid())
    tenantId      String   @map("tenant_id")
    accountCode   String   @map("account_code")
    // ... fields ...

    tenant        Tenant   @relation(fields: [tenantId], references: [id])

    @@unique([tenantId, accountCode])
    @@index([tenantId])
    @@map("xero_accounts")
  }
  ```

  ### 3. Entity Interface Pattern (src/database/entities/*.entity.ts)
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values: `ACTIVE = 'ACTIVE'` (string value matches key)

  ### 4. Repository Pattern
  ```typescript
  @Injectable()
  export class XeroAccountRepository {
    private readonly logger = new Logger(XeroAccountRepository.name);
    constructor(private readonly prisma: PrismaService) {}

    // Every method has try/catch with:
    // 1. this.logger.error() with full context
    // 2. Re-throw custom exception (NEVER swallow errors)
  }
  ```

  ### 5. Upsert Pattern for Sync
  ```typescript
  await this.prisma.xeroAccount.upsert({
    where: { tenantId_accountCode: { tenantId, accountCode } },
    create: { tenantId, accountCode, name, type, ... },
    update: { name, type, status: 'ACTIVE', lastSyncedAt: now },
  });
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements database storage for Xero Chart of Accounts to enable:
1. Validation that account codes exist before pushing categorizations
2. Tracking account changes over time
3. Alerting if local accounts diverge from Xero
4. Preventing sync to archived accounts

**Xero API Endpoint:**
- GET /Accounts - Returns all accounts from Xero

**MCP Tool (src/mcp/xero-mcp/tools/get-accounts.ts):**
```typescript
export async function getAccounts(
  client: XeroClient,
  xeroTenantId: string,
): Promise<Array<{
  accountID: string;
  code: string;
  name: string;
  type: string;
  taxType?: string;
  status: string;
}>>;
```

**Sync Logic:**
- Fetch all accounts from Xero
- Upsert each account into database
- Mark accounts not in Xero as ARCHIVED (soft delete)
- Track last sync timestamp
- Create audit log for sync operation
</context>

<scope>
  <in_scope>
    - XeroAccount database entity
    - Migration for xero_accounts table
    - XeroAccountRepository
    - Sync accounts from Xero to database
    - Validation service for account codes
    - API endpoint to trigger CoA sync
    - Update XeroSyncService.syncChartOfAccountsToDb()
  </in_scope>
  <out_of_scope>
    - UI for account management
    - Account mapping/aliases
    - Scheduled auto-refresh (use manual trigger)
    - Account code suggestions in categorization UI
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- XERO API REFERENCE                          -->
<!-- ============================================ -->

<xero_api_reference>
## Xero Accounts API

### GET /Accounts
Returns array of account objects:
```json
{
  "Accounts": [
    {
      "AccountID": "uuid",
      "Code": "200",
      "Name": "Sales",
      "Type": "REVENUE",
      "TaxType": "OUTPUT",
      "Status": "ACTIVE",
      "Class": "REVENUE",
      "EnablePaymentsToAccount": false,
      "ShowInExpenseClaims": false
    }
  ]
}
```

### Account Status Values
- ACTIVE - Account is active and usable
- ARCHIVED - Account is archived (cannot be used for new transactions)

### Common Account Types
- BANK - Bank accounts
- REVENUE - Income accounts
- EXPENSE - Expense accounts
- DIRECTCOSTS - Cost of goods sold
- OVERHEADS - Operating expenses
- FIXED - Fixed assets
- LIABILITY - Liabilities
- EQUITY - Equity accounts
</xero_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE/MODIFY        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER XeroToken model)

```prisma
// TASK-XERO-006: Chart of Accounts Sync
enum XeroAccountStatus {
  ACTIVE
  ARCHIVED
}

model XeroAccount {
  id            String             @id @default(uuid())
  tenantId      String             @map("tenant_id")
  accountCode   String             @map("account_code")
  name          String             @db.VarChar(255)
  type          String             @db.VarChar(50)
  taxType       String?            @map("tax_type") @db.VarChar(50)
  status        XeroAccountStatus  @default(ACTIVE)
  xeroAccountId String?            @map("xero_account_id")
  lastSyncedAt  DateTime           @map("last_synced_at")
  createdAt     DateTime           @default(now()) @map("created_at")
  updatedAt     DateTime           @updatedAt @map("updated_at")

  tenant        Tenant             @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, accountCode])
  @@index([tenantId])
  @@index([tenantId, status])
  @@map("xero_accounts")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  xeroAccounts          XeroAccount[]         // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/xero-account.entity.ts

```typescript
/**
 * Xero Account Entity Types
 * TASK-XERO-006: Chart of Accounts Database Sync
 */

export enum XeroAccountStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface IXeroAccount {
  id: string;
  tenantId: string;
  accountCode: string;
  name: string;
  type: string;
  taxType: string | null;
  status: XeroAccountStatus;
  xeroAccountId: string | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Xero account types (from Xero API)
 */
export type XeroAccountType =
  | 'BANK'
  | 'CURRENT'
  | 'CURRLIAB'
  | 'DEPRECIATN'
  | 'DIRECTCOSTS'
  | 'EQUITY'
  | 'EXPENSE'
  | 'FIXED'
  | 'INVENTORY'
  | 'LIABILITY'
  | 'NONCURRENT'
  | 'OTHERINCOME'
  | 'OVERHEADS'
  | 'PREPAYMENT'
  | 'REVENUE'
  | 'SALES'
  | 'TERMLIAB'
  | 'PAYGLIABILITY'
  | 'SUPERANNUATIONEXPENSE'
  | 'SUPERANNUATIONLIABILITY'
  | 'WAGESEXPENSE';

/**
 * Chart of Accounts sync result
 */
export interface CoaSyncResult {
  created: number;
  updated: number;
  archived: number;
  unchanged: number;
  accounts: IXeroAccount[];
}

/**
 * Account validation result
 */
export interface AccountValidationResult {
  valid: boolean;
  account?: IXeroAccount;
  error?: string;
}
```
</entity_files>

<dto_files>
## src/database/dto/xero-account.dto.ts

```typescript
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { XeroAccountStatus } from '../entities/xero-account.entity';

export class CreateXeroAccountDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Account code', example: '200' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  accountCode!: string;

  @ApiProperty({ description: 'Account name', example: 'Sales' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Account type', example: 'REVENUE' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  type!: string;

  @ApiPropertyOptional({ description: 'Tax type', example: 'OUTPUT' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxType?: string;

  @ApiPropertyOptional({ description: 'Xero Account ID (UUID)' })
  @IsOptional()
  @IsString()
  xeroAccountId?: string;
}

export class UpdateXeroAccountDto {
  @ApiPropertyOptional({ description: 'Account name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Account type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ description: 'Tax type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxType?: string;

  @ApiPropertyOptional({ description: 'Account status', enum: XeroAccountStatus })
  @IsOptional()
  @IsEnum(XeroAccountStatus)
  status?: XeroAccountStatus;
}

export class XeroAccountFilterDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: XeroAccountStatus })
  @IsOptional()
  @IsEnum(XeroAccountStatus)
  status?: XeroAccountStatus;

  @ApiPropertyOptional({ description: 'Filter by type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Search by name or code' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class XeroAccountResponseDto {
  @ApiProperty()
  accountCode!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: string;

  @ApiPropertyOptional()
  taxType?: string;

  @ApiProperty({ enum: XeroAccountStatus })
  status!: XeroAccountStatus;

  @ApiProperty()
  lastSyncedAt!: Date;
}

export class SyncAccountsResponseDto {
  @ApiProperty({ description: 'Number of accounts created' })
  created!: number;

  @ApiProperty({ description: 'Number of accounts updated' })
  updated!: number;

  @ApiProperty({ description: 'Number of accounts archived' })
  archived!: number;

  @ApiProperty({ description: 'Number of accounts unchanged' })
  unchanged!: number;

  @ApiProperty({ description: 'List of synced accounts', type: [XeroAccountResponseDto] })
  accounts!: XeroAccountResponseDto[];
}

export class ValidateAccountCodeResponseDto {
  @ApiProperty({ description: 'Whether the account code is valid' })
  valid!: boolean;

  @ApiPropertyOptional({ description: 'Account details if valid' })
  account?: XeroAccountResponseDto;

  @ApiPropertyOptional({ description: 'Error message if invalid' })
  error?: string;
}
```
</dto_files>

<repository_file>
## src/database/repositories/xero-account.repository.ts

```typescript
/**
 * Xero Account Repository
 * TASK-XERO-006: Chart of Accounts Database Sync
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XeroAccount, XeroAccountStatus } from '@prisma/client';
import {
  CreateXeroAccountDto,
  UpdateXeroAccountDto,
  XeroAccountFilterDto,
} from '../dto/xero-account.dto';
import { NotFoundException } from '../../shared/exceptions';

@Injectable()
export class XeroAccountRepository {
  private readonly logger = new Logger(XeroAccountRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Xero account
   */
  async create(dto: CreateXeroAccountDto): Promise<XeroAccount> {
    try {
      return await this.prisma.xeroAccount.create({
        data: {
          tenantId: dto.tenantId,
          accountCode: dto.accountCode,
          name: dto.name,
          type: dto.type,
          taxType: dto.taxType,
          xeroAccountId: dto.xeroAccountId,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create Xero account: ${dto.accountCode}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Find account by tenant and code
   */
  async findByCode(
    tenantId: string,
    accountCode: string,
  ): Promise<XeroAccount | null> {
    return await this.prisma.xeroAccount.findUnique({
      where: { tenantId_accountCode: { tenantId, accountCode } },
    });
  }

  /**
   * Find account by ID
   */
  async findById(id: string): Promise<XeroAccount | null> {
    return await this.prisma.xeroAccount.findUnique({
      where: { id },
    });
  }

  /**
   * Find all accounts for tenant
   */
  async findByTenant(
    tenantId: string,
    filter?: XeroAccountFilterDto,
  ): Promise<XeroAccount[]> {
    const where: any = { tenantId };

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { accountCode: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return await this.prisma.xeroAccount.findMany({
      where,
      orderBy: { accountCode: 'asc' },
    });
  }

  /**
   * Find active accounts for tenant
   */
  async findActiveByTenant(tenantId: string): Promise<XeroAccount[]> {
    return await this.prisma.xeroAccount.findMany({
      where: { tenantId, status: XeroAccountStatus.ACTIVE },
      orderBy: { accountCode: 'asc' },
    });
  }

  /**
   * Update account
   */
  async update(id: string, dto: UpdateXeroAccountDto): Promise<XeroAccount> {
    try {
      return await this.prisma.xeroAccount.update({
        where: { id },
        data: {
          ...dto,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update Xero account: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Upsert account (for sync)
   */
  async upsert(
    tenantId: string,
    accountCode: string,
    data: {
      name: string;
      type: string;
      taxType?: string;
      xeroAccountId?: string;
    },
  ): Promise<{ account: XeroAccount; created: boolean }> {
    const existing = await this.findByCode(tenantId, accountCode);
    const now = new Date();

    if (existing) {
      // Update existing
      const updated = await this.prisma.xeroAccount.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          type: data.type,
          taxType: data.taxType,
          status: XeroAccountStatus.ACTIVE,
          lastSyncedAt: now,
        },
      });
      return { account: updated, created: false };
    } else {
      // Create new
      const created = await this.prisma.xeroAccount.create({
        data: {
          tenantId,
          accountCode,
          name: data.name,
          type: data.type,
          taxType: data.taxType,
          xeroAccountId: data.xeroAccountId,
          lastSyncedAt: now,
        },
      });
      return { account: created, created: true };
    }
  }

  /**
   * Archive account (soft delete)
   */
  async archive(id: string): Promise<XeroAccount> {
    return await this.prisma.xeroAccount.update({
      where: { id },
      data: {
        status: XeroAccountStatus.ARCHIVED,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Archive all accounts not in the provided codes list
   */
  async archiveNotInCodes(
    tenantId: string,
    activeCodes: string[],
  ): Promise<number> {
    const result = await this.prisma.xeroAccount.updateMany({
      where: {
        tenantId,
        accountCode: { notIn: activeCodes },
        status: XeroAccountStatus.ACTIVE,
      },
      data: {
        status: XeroAccountStatus.ARCHIVED,
        lastSyncedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Delete account (hard delete - use sparingly)
   */
  async delete(id: string): Promise<void> {
    await this.prisma.xeroAccount.delete({
      where: { id },
    });
  }

  /**
   * Validate account code exists and is active
   */
  async validateAccountCode(
    tenantId: string,
    accountCode: string,
  ): Promise<{
    valid: boolean;
    account?: XeroAccount;
    error?: string;
  }> {
    const account = await this.findByCode(tenantId, accountCode);

    if (!account) {
      return {
        valid: false,
        error: `Account code ${accountCode} not found. Please sync Chart of Accounts.`,
      };
    }

    if (account.status !== XeroAccountStatus.ACTIVE) {
      return {
        valid: false,
        account,
        error: `Account ${accountCode} (${account.name}) is archived in Xero.`,
      };
    }

    return { valid: true, account };
  }
}
```
</repository_file>

<service_file>
## Modify src/database/services/xero-sync.service.ts

### Add method syncChartOfAccountsToDb:

```typescript
/**
 * Sync Chart of Accounts from Xero to database
 * TASK-XERO-006: Stores accounts in DB for validation
 */
async syncChartOfAccountsToDb(
  tenantId: string,
): Promise<CoaSyncResult> {
  this.logger.log(
    `Syncing Chart of Accounts to database for tenant ${tenantId}`,
  );

  const { client, xeroTenantId } = await this.getAuthenticatedClient(tenantId);

  // Fetch all accounts from Xero
  const xeroAccounts = await getAccounts(client, xeroTenantId);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const syncedAccounts: IXeroAccount[] = [];
  const now = new Date();
  const activeCodes: string[] = [];

  // Upsert each Xero account
  for (const xeroAccount of xeroAccounts) {
    activeCodes.push(xeroAccount.code);

    const existing = await this.prisma.xeroAccount.findUnique({
      where: {
        tenantId_accountCode: {
          tenantId,
          accountCode: xeroAccount.code,
        },
      },
    });

    if (existing) {
      // Check if changed
      const hasChanges =
        existing.name !== xeroAccount.name ||
        existing.type !== xeroAccount.type ||
        existing.taxType !== xeroAccount.taxType ||
        existing.status !== 'ACTIVE';

      if (hasChanges) {
        const updatedAccount = await this.prisma.xeroAccount.update({
          where: { id: existing.id },
          data: {
            name: xeroAccount.name,
            type: xeroAccount.type,
            taxType: xeroAccount.taxType,
            status: 'ACTIVE',
            lastSyncedAt: now,
          },
        });
        updated++;
        syncedAccounts.push(updatedAccount as unknown as IXeroAccount);
      } else {
        unchanged++;
        syncedAccounts.push(existing as unknown as IXeroAccount);
      }
    } else {
      // Create new
      const newAccount = await this.prisma.xeroAccount.create({
        data: {
          tenantId,
          accountCode: xeroAccount.code,
          name: xeroAccount.name,
          type: xeroAccount.type,
          taxType: xeroAccount.taxType,
          xeroAccountId: xeroAccount.accountID,
          lastSyncedAt: now,
        },
      });
      created++;
      syncedAccounts.push(newAccount as unknown as IXeroAccount);
    }
  }

  // Archive accounts deleted in Xero
  const archivedResult = await this.prisma.xeroAccount.updateMany({
    where: {
      tenantId,
      accountCode: { notIn: activeCodes },
      status: 'ACTIVE',
    },
    data: {
      status: 'ARCHIVED',
      lastSyncedAt: now,
    },
  });
  const archived = archivedResult.count;

  // Audit log
  await this.auditLogService.logAction({
    tenantId,
    entityType: 'XeroAccount',
    entityId: 'bulk-sync',
    action: AuditAction.UPDATE,
    afterValue: { created, updated, archived, unchanged },
    changeSummary: `Chart of Accounts sync: ${created} created, ${updated} updated, ${archived} archived`,
  });

  this.logger.log(
    `CoA sync complete: ${created} created, ${updated} updated, ${archived} archived, ${unchanged} unchanged`,
  );

  return {
    created,
    updated,
    archived,
    unchanged,
    accounts: syncedAccounts,
  };
}

/**
 * Validate account code exists and is active in Xero
 */
async validateAccountCode(
  tenantId: string,
  accountCode: string,
): Promise<AccountValidationResult> {
  const account = await this.prisma.xeroAccount.findUnique({
    where: {
      tenantId_accountCode: { tenantId, accountCode },
    },
  });

  if (!account) {
    return {
      valid: false,
      error: `Account code ${accountCode} not found. Please sync Chart of Accounts.`,
    };
  }

  if (account.status !== 'ACTIVE') {
    return {
      valid: false,
      account: account as unknown as IXeroAccount,
      error: `Account ${accountCode} (${account.name}) is archived in Xero.`,
    };
  }

  return {
    valid: true,
    account: account as unknown as IXeroAccount,
  };
}
```

### Add imports at top of xero-sync.service.ts:
```typescript
import {
  IXeroAccount,
  CoaSyncResult,
  AccountValidationResult,
} from '../entities/xero-account.entity';
```
</service_file>

<controller_additions>
## Add to src/integrations/xero/xero.controller.ts

```typescript
/**
 * Sync Chart of Accounts from Xero
 * POST /xero/sync-accounts
 */
@Post('sync-accounts')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({
  summary: 'Sync Chart of Accounts from Xero',
  description: 'Fetches all accounts from Xero and stores them in the database for validation.',
})
@ApiResponse({
  status: 200,
  description: 'Accounts synced successfully',
  type: SyncAccountsResponseDto,
})
@ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async syncAccounts(
  @CurrentUser() user: IUser,
): Promise<SyncAccountsResponseDto> {
  const tenantId = user.tenantId;

  // Check connection
  const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
  if (!hasConnection) {
    throw new BusinessException(
      'No valid Xero connection. Please connect to Xero first.',
      'XERO_NOT_CONNECTED',
    );
  }

  this.logger.log(`Syncing Chart of Accounts for tenant ${tenantId}`);

  const result = await this.xeroSyncService.syncChartOfAccountsToDb(tenantId);

  return {
    created: result.created,
    updated: result.updated,
    archived: result.archived,
    unchanged: result.unchanged,
    accounts: result.accounts.map(a => ({
      accountCode: a.accountCode,
      name: a.name,
      type: a.type,
      taxType: a.taxType ?? undefined,
      status: a.status,
      lastSyncedAt: a.lastSyncedAt,
    })),
  };
}

/**
 * Validate account code
 * GET /xero/validate-account/:code
 */
@Get('validate-account/:code')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({
  summary: 'Validate account code exists in Xero',
  description: 'Checks if an account code exists and is active.',
})
@ApiParam({ name: 'code', description: 'Account code to validate', example: '200' })
@ApiResponse({
  status: 200,
  description: 'Validation result',
  type: ValidateAccountCodeResponseDto,
})
async validateAccountCode(
  @Param('code') code: string,
  @CurrentUser() user: IUser,
): Promise<ValidateAccountCodeResponseDto> {
  const result = await this.xeroSyncService.validateAccountCode(
    user.tenantId,
    code,
  );

  return {
    valid: result.valid,
    account: result.account ? {
      accountCode: result.account.accountCode,
      name: result.account.name,
      type: result.account.type,
      taxType: result.account.taxType ?? undefined,
      status: result.account.status,
      lastSyncedAt: result.account.lastSyncedAt,
    } : undefined,
    error: result.error,
  };
}

/**
 * Get all accounts
 * GET /xero/accounts
 */
@Get('accounts')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({
  summary: 'Get synced Xero accounts',
  description: 'Returns all accounts synced from Xero.',
})
@ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED'] })
@ApiQuery({ name: 'type', required: false, description: 'Filter by account type' })
@ApiQuery({ name: 'search', required: false, description: 'Search by name or code' })
@ApiResponse({
  status: 200,
  description: 'Accounts retrieved',
})
async getAccounts(
  @CurrentUser() user: IUser,
  @Query('status') status?: string,
  @Query('type') type?: string,
  @Query('search') search?: string,
): Promise<{ accounts: XeroAccountResponseDto[] }> {
  const accounts = await this.prisma.xeroAccount.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status && { status: status as XeroAccountStatus }),
      ...(type && { type }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { accountCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { accountCode: 'asc' },
  });

  return {
    accounts: accounts.map(a => ({
      accountCode: a.accountCode,
      name: a.name,
      type: a.type,
      taxType: a.taxType ?? undefined,
      status: a.status as XeroAccountStatus,
      lastSyncedAt: a.lastSyncedAt,
    })),
  };
}
```

### Add imports to controller:
```typescript
import {
  SyncAccountsResponseDto,
  ValidateAccountCodeResponseDto,
  XeroAccountResponseDto,
} from './dto/xero.dto';
import { XeroAccountStatus } from '@prisma/client';
```
</controller_additions>

<index_updates>
## Update src/database/entities/index.ts
Add at end:
```typescript
export * from './xero-account.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './xero-account.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './xero-account.repository';
```
</index_updates>

<test_cleanup_update>
## UPDATE ALL EXISTING TEST FILES

Add this line at the TOP of the beforeEach cleanup (in FK order):

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.xeroAccount.deleteMany({});  // ADD THIS LINE
  // ... all other existing deleteMany calls ...
});
```

Files to update (search for `deleteMany` in tests/):
- All repository spec files
- All service spec files
- All controller spec files
</test_cleanup_update>

<test_requirements>
## Test Files Required

### tests/database/repositories/xero-account.repository.spec.ts (12+ tests)

Test scenarios:
1. create - creates account with all fields
2. findByCode - returns account when exists
3. findByCode - returns null when not found
4. findByTenant - returns all accounts for tenant
5. findByTenant - filters by status
6. findByTenant - filters by type
7. findByTenant - searches by name/code
8. findActiveByTenant - returns only active accounts
9. upsert - creates new account
10. upsert - updates existing account
11. archive - sets status to ARCHIVED
12. archiveNotInCodes - archives accounts not in list
13. validateAccountCode - returns valid for active account
14. validateAccountCode - returns invalid for archived account
15. validateAccountCode - returns invalid for missing account

### tests/database/services/xero-coa-sync.service.spec.ts (10+ tests)

Test scenarios:
1. syncChartOfAccountsToDb - creates new accounts
2. syncChartOfAccountsToDb - updates changed accounts
3. syncChartOfAccountsToDb - archives deleted accounts
4. syncChartOfAccountsToDb - handles unchanged accounts
5. syncChartOfAccountsToDb - creates audit log
6. validateAccountCode - returns valid for existing active account
7. validateAccountCode - returns invalid for archived account
8. validateAccountCode - returns invalid for missing account

### tests/integrations/xero/xero-accounts.controller.spec.ts (8+ tests)

Test scenarios:
1. POST /xero/sync-accounts - syncs accounts from Xero
2. POST /xero/sync-accounts - throws when not connected
3. GET /xero/validate-account/:code - validates active account
4. GET /xero/validate-account/:code - invalidates archived account
5. GET /xero/accounts - returns all accounts
6. GET /xero/accounts - filters by status
7. GET /xero/accounts - filters by type
8. GET /xero/accounts - searches by name/code

Test data:
```typescript
const testXeroAccount = {
  tenantId: '', // set in beforeEach
  accountCode: '200',
  name: 'Sales',
  type: 'REVENUE',
  taxType: 'OUTPUT',
  xeroAccountId: 'xero-account-uuid',
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with XeroAccount model

# 2. Run migration
npx prisma migrate dev --name create_xero_accounts

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/xero-account.entity.ts

# 5. Create DTO file
# Create src/database/dto/xero-account.dto.ts

# 6. Create repository file
# Create src/database/repositories/xero-account.repository.ts

# 7. Update service file
# Update src/database/services/xero-sync.service.ts

# 8. Update controller file
# Add endpoints to src/integrations/xero/xero.controller.ts

# 9. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 10. Update existing test files (ALL of them)
# Add xeroAccount.deleteMany to cleanup

# 11. Create test files
# Create tests/database/repositories/xero-account.repository.spec.ts
# Create tests/database/services/xero-coa-sync.service.spec.ts
# Create tests/integrations/xero/xero-accounts.controller.spec.ts

# 12. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 400+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Only sync accounts for connected Xero tenants
    - Archive accounts deleted in Xero (don't hard delete)
    - Track last sync timestamp per account
    - Validate account codes before pushing categorizations
    - Rate limit: respect Xero 60 req/min
    - Audit log sync operations
    - Must use UUID for primary keys
    - Must include tenantId FK on XeroAccount
    - Must NOT break existing categorization flow
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 400+ tests passing
    - Migration applies and can be reverted
    - Accounts synced from Xero to database
    - New accounts created correctly
    - Updated accounts reflected
    - Deleted accounts marked as ARCHIVED
    - Validation prevents invalid account codes
    - Audit trail created for sync operations
    - Tenant isolation enforced on all queries
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Hard delete accounts (always soft delete/archive)
  - Import enums from `@prisma/client` in DTOs (import from entity file)
  - Use `string?` in interfaces (use `string | null`)
  - Run tests without `--runInBand` flag
  - Skip updating existing test cleanup order
  - Create mock/stub implementations for database tests
  - Sync accounts without checking Xero connection first
  - Skip the npx prisma generate step
  - Forget to add tenant relation to Prisma schema
</anti_patterns>

</task_spec>
