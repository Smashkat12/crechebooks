<task_spec id="TASK-FIX-005" version="2.0">

<metadata>
  <title>Bank Fee Configuration - Multi-Bank Support</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>305</sequence>
  <implements>
    <requirement_ref>REQ-TXN-BANKFEE-001</requirement_ref>
    <requirement_ref>REQ-TXN-BANKFEE-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-TXN-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/services/bank-fee.service.ts` (add bank presets)
  - `apps/api/prisma/schema.prisma` (add bank_fee_config to Tenant)

  **Files to Create:**
  - `apps/api/src/api/settings/bank-fees.controller.ts` (NEW - API endpoints)
  - `apps/api/src/api/settings/dto/bank-fee.dto.ts` (NEW - DTOs)
  - `apps/web/src/app/(dashboard)/settings/bank-fees/page.tsx` (NEW - UI)
  - `apps/web/src/components/settings/bank-fee-config.tsx` (NEW - config form)
  - `apps/web/src/hooks/use-bank-fees.ts` (NEW - React hooks)

  **Current Problem:**
  The `BankFeeService` has TODO comments for additional bank support:
  ```typescript
  // TODO: Add bank_fee_config column to tenant table
  // TODO: Add support for other SA banks (Standard Bank, Nedbank, ABSA, Capitec)
  ```

  And `getConfiguration()` only returns hardcoded FNB defaults:
  ```typescript
  async getConfiguration(tenantId: string): Promise<BankFeeConfiguration> {
    // Check cache first
    const cached = this.configCache.get(tenantId);
    // ...

    // TODO: Add bank_fee_config column to tenant table or create separate table

    // Return default configuration with FNB fees
    const config: BankFeeConfiguration = {
      tenantId,
      bankName: 'FNB',
      feeRules: [...DEFAULT_FNB_FEES],
      defaultTransactionFeeCents: 500,
      isEnabled: true,
      updatedAt: new Date(),
    };
    // ...
  }
  ```

  **Existing Infrastructure:**
  - Service has in-memory cache with 5-minute TTL
  - FeeRule interface and BankFeeConfiguration interface defined
  - Transaction type detection already implemented
  - Fee calculation logic complete

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Schema Update
  ```prisma
  // apps/api/prisma/schema.prisma
  model Tenant {
    // ... existing fields ...

    // TASK-FIX-005: Bank fee configuration
    bankFeeConfig Json? @map("bank_fee_config")

    // ... rest of model
  }
  ```

  ### 3. Bank Fee Presets
  ```typescript
  // Add to apps/api/src/database/services/bank-fee.service.ts

  /**
   * Supported South African banks
   */
  export enum SouthAfricanBank {
    FNB = 'FNB',
    STANDARD_BANK = 'STANDARD_BANK',
    NEDBANK = 'NEDBANK',
    ABSA = 'ABSA',
    CAPITEC = 'CAPITEC',
  }

  /**
   * Standard Bank fees (as of 2024)
   */
  const DEFAULT_STANDARD_BANK_FEES: FeeRule[] = [
    {
      feeType: BankFeeType.CASH_DEPOSIT_FEE,
      transactionTypes: [TransactionType.CASH_DEPOSIT, TransactionType.ADT_DEPOSIT],
      fixedAmountCents: 1350, // R13.50
      isActive: true,
      description: 'Standard Bank Cash Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_DEPOSIT],
      fixedAmountCents: 450, // R4.50
      isActive: true,
      description: 'Standard Bank ATM Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_WITHDRAWAL],
      fixedAmountCents: 1100, // R11.00
      isActive: true,
      description: 'Standard Bank ATM Withdrawal fee',
    },
    {
      feeType: BankFeeType.EFT_DEBIT_FEE,
      transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
      fixedAmountCents: 450, // R4.50
      isActive: true,
      description: 'Standard Bank EFT Debit fee',
    },
    {
      feeType: BankFeeType.EFT_CREDIT_FEE,
      transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
      fixedAmountCents: 850, // R8.50
      isActive: true,
      description: 'Standard Bank EFT Credit fee',
    },
    {
      feeType: BankFeeType.CARD_TRANSACTION_FEE,
      transactionTypes: [TransactionType.CARD_PURCHASE],
      fixedAmountCents: 500, // R5.00
      isActive: true,
      description: 'Standard Bank Card Transaction fee',
    },
  ];

  /**
   * Nedbank fees (as of 2024)
   */
  const DEFAULT_NEDBANK_FEES: FeeRule[] = [
    {
      feeType: BankFeeType.CASH_DEPOSIT_FEE,
      transactionTypes: [TransactionType.CASH_DEPOSIT, TransactionType.ADT_DEPOSIT],
      fixedAmountCents: 1400, // R14.00
      isActive: true,
      description: 'Nedbank Cash Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_DEPOSIT],
      fixedAmountCents: 500, // R5.00
      isActive: true,
      description: 'Nedbank ATM Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_WITHDRAWAL],
      fixedAmountCents: 1150, // R11.50
      isActive: true,
      description: 'Nedbank ATM Withdrawal fee',
    },
    {
      feeType: BankFeeType.EFT_DEBIT_FEE,
      transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
      fixedAmountCents: 500, // R5.00
      isActive: true,
      description: 'Nedbank EFT Debit fee',
    },
    {
      feeType: BankFeeType.EFT_CREDIT_FEE,
      transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
      fixedAmountCents: 900, // R9.00
      isActive: true,
      description: 'Nedbank EFT Credit fee',
    },
    {
      feeType: BankFeeType.CARD_TRANSACTION_FEE,
      transactionTypes: [TransactionType.CARD_PURCHASE],
      fixedAmountCents: 525, // R5.25
      isActive: true,
      description: 'Nedbank Card Transaction fee',
    },
  ];

  /**
   * ABSA fees (as of 2024)
   */
  const DEFAULT_ABSA_FEES: FeeRule[] = [
    {
      feeType: BankFeeType.CASH_DEPOSIT_FEE,
      transactionTypes: [TransactionType.CASH_DEPOSIT, TransactionType.ADT_DEPOSIT],
      fixedAmountCents: 1450, // R14.50
      isActive: true,
      description: 'ABSA Cash Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_DEPOSIT],
      fixedAmountCents: 550, // R5.50
      isActive: true,
      description: 'ABSA ATM Deposit fee',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_WITHDRAWAL],
      fixedAmountCents: 1200, // R12.00
      isActive: true,
      description: 'ABSA ATM Withdrawal fee',
    },
    {
      feeType: BankFeeType.EFT_DEBIT_FEE,
      transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
      fixedAmountCents: 475, // R4.75
      isActive: true,
      description: 'ABSA EFT Debit fee',
    },
    {
      feeType: BankFeeType.EFT_CREDIT_FEE,
      transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
      fixedAmountCents: 925, // R9.25
      isActive: true,
      description: 'ABSA EFT Credit fee',
    },
    {
      feeType: BankFeeType.CARD_TRANSACTION_FEE,
      transactionTypes: [TransactionType.CARD_PURCHASE],
      fixedAmountCents: 550, // R5.50
      isActive: true,
      description: 'ABSA Card Transaction fee',
    },
  ];

  /**
   * Capitec fees (as of 2024) - typically lower fees
   */
  const DEFAULT_CAPITEC_FEES: FeeRule[] = [
    {
      feeType: BankFeeType.CASH_DEPOSIT_FEE,
      transactionTypes: [TransactionType.CASH_DEPOSIT, TransactionType.ADT_DEPOSIT],
      fixedAmountCents: 0, // Free at Capitec ATMs
      isActive: true,
      description: 'Capitec Cash Deposit fee (free at Capitec ATMs)',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_DEPOSIT],
      fixedAmountCents: 0, // Free
      isActive: true,
      description: 'Capitec ATM Deposit fee (free)',
    },
    {
      feeType: BankFeeType.ATM_FEE,
      transactionTypes: [TransactionType.ATM_WITHDRAWAL],
      fixedAmountCents: 0, // Free at Capitec ATMs
      isActive: true,
      description: 'Capitec ATM Withdrawal fee (free at Capitec ATMs)',
    },
    {
      feeType: BankFeeType.EFT_DEBIT_FEE,
      transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
      fixedAmountCents: 0, // Free
      isActive: true,
      description: 'Capitec EFT Debit fee (free)',
    },
    {
      feeType: BankFeeType.EFT_CREDIT_FEE,
      transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
      fixedAmountCents: 0, // Free
      isActive: true,
      description: 'Capitec EFT Credit fee (free)',
    },
    {
      feeType: BankFeeType.CARD_TRANSACTION_FEE,
      transactionTypes: [TransactionType.CARD_PURCHASE],
      fixedAmountCents: 0, // Free
      isActive: true,
      description: 'Capitec Card Transaction fee (free)',
    },
  ];

  /**
   * Get default fee rules for a bank
   */
  getDefaultFeeRules(bankName: string = 'FNB'): FeeRule[] {
    const normalizedBank = bankName.toUpperCase().replace(/\s+/g, '_');

    switch (normalizedBank) {
      case 'FNB':
      case 'FIRST_NATIONAL_BANK':
        return [...DEFAULT_FNB_FEES];
      case 'STANDARD_BANK':
        return [...DEFAULT_STANDARD_BANK_FEES];
      case 'NEDBANK':
        return [...DEFAULT_NEDBANK_FEES];
      case 'ABSA':
        return [...DEFAULT_ABSA_FEES];
      case 'CAPITEC':
        return [...DEFAULT_CAPITEC_FEES];
      default:
        // Return generic defaults
        return [
          {
            feeType: BankFeeType.TRANSACTION_FEE,
            transactionTypes: Object.values(TransactionType),
            fixedAmountCents: 500, // R5.00
            isActive: true,
            description: 'Generic transaction fee',
          },
        ];
    }
  }

  /**
   * Get list of supported banks
   */
  getSupportedBanks(): { code: SouthAfricanBank; name: string }[] {
    return [
      { code: SouthAfricanBank.FNB, name: 'First National Bank (FNB)' },
      { code: SouthAfricanBank.STANDARD_BANK, name: 'Standard Bank' },
      { code: SouthAfricanBank.NEDBANK, name: 'Nedbank' },
      { code: SouthAfricanBank.ABSA, name: 'ABSA' },
      { code: SouthAfricanBank.CAPITEC, name: 'Capitec' },
    ];
  }
  ```

  ### 4. Updated getConfiguration with DB Support
  ```typescript
  /**
   * Get or create bank fee configuration for a tenant
   */
  async getConfiguration(tenantId: string): Promise<BankFeeConfiguration> {
    // Check cache first
    const cached = this.configCache.get(tenantId);
    if (cached && Date.now() - cached.updatedAt.getTime() < this.cacheTtlMs) {
      return cached;
    }

    // Load from tenant settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        bankName: true,
        bankFeeConfig: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // Check if there's stored configuration
    if (tenant.bankFeeConfig) {
      const storedConfig = tenant.bankFeeConfig as unknown as BankFeeConfiguration;
      storedConfig.tenantId = tenantId;
      storedConfig.updatedAt = new Date();
      this.configCache.set(tenantId, storedConfig);
      return storedConfig;
    }

    // Return default configuration based on tenant's bank
    const bankName = tenant.bankName || 'FNB';
    const config: BankFeeConfiguration = {
      tenantId,
      bankName,
      feeRules: this.getDefaultFeeRules(bankName),
      defaultTransactionFeeCents: 500,
      isEnabled: true,
      updatedAt: new Date(),
    };

    this.configCache.set(tenantId, config);
    return config;
  }

  /**
   * Save bank fee configuration for a tenant
   */
  async saveConfiguration(
    tenantId: string,
    config: Partial<BankFeeConfiguration>,
  ): Promise<BankFeeConfiguration> {
    const currentConfig = await this.getConfiguration(tenantId);
    const newConfig: BankFeeConfiguration = {
      ...currentConfig,
      ...config,
      tenantId,
      updatedAt: new Date(),
    };

    // Validate fee rules
    if (newConfig.feeRules) {
      this.validateFeeRules(newConfig.feeRules);
    }

    // Save to database
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        bankFeeConfig: newConfig as unknown as Prisma.JsonObject,
        ...(config.bankName && { bankName: config.bankName }),
      },
    });

    // Update cache
    this.configCache.set(tenantId, newConfig);

    this.logger.log(
      `Saved bank fee configuration for tenant ${tenantId}: ${newConfig.bankName}`,
    );

    return newConfig;
  }

  /**
   * Apply bank preset to tenant
   */
  async applyBankPreset(
    tenantId: string,
    bankCode: SouthAfricanBank,
  ): Promise<BankFeeConfiguration> {
    const bankName = this.getSupportedBanks().find(b => b.code === bankCode)?.name || bankCode;
    const feeRules = this.getDefaultFeeRules(bankCode);

    return this.saveConfiguration(tenantId, {
      bankName,
      feeRules,
      isEnabled: true,
    });
  }
  ```

  ### 5. API Controller
  ```typescript
  // apps/api/src/api/settings/bank-fees.controller.ts
  import {
    Controller,
    Get,
    Put,
    Post,
    Body,
    UseGuards,
    Request,
  } from '@nestjs/common';
  import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
  import { RolesGuard } from '../../shared/guards/roles.guard';
  import { Roles } from '../../shared/decorators/roles.decorator';
  import { BankFeeService, SouthAfricanBank } from '../../database/services/bank-fee.service';
  import { UpdateBankFeeConfigDto, ApplyBankPresetDto } from './dto/bank-fee.dto';

  @Controller('settings/bank-fees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class BankFeesController {
    constructor(private readonly bankFeeService: BankFeeService) {}

    @Get()
    async getConfiguration(@Request() req) {
      return {
        success: true,
        data: await this.bankFeeService.getConfiguration(req.user.tenantId),
      };
    }

    @Get('banks')
    async getSupportedBanks() {
      return {
        success: true,
        data: this.bankFeeService.getSupportedBanks(),
      };
    }

    @Get('banks/:bankCode/defaults')
    async getBankDefaults(@Param('bankCode') bankCode: string) {
      return {
        success: true,
        data: this.bankFeeService.getDefaultFeeRules(bankCode),
      };
    }

    @Put()
    @Roles('OWNER', 'ADMIN')
    async updateConfiguration(
      @Request() req,
      @Body() dto: UpdateBankFeeConfigDto,
    ) {
      return {
        success: true,
        data: await this.bankFeeService.saveConfiguration(req.user.tenantId, dto),
      };
    }

    @Post('apply-preset')
    @Roles('OWNER', 'ADMIN')
    async applyPreset(
      @Request() req,
      @Body() dto: ApplyBankPresetDto,
    ) {
      return {
        success: true,
        data: await this.bankFeeService.applyBankPreset(
          req.user.tenantId,
          dto.bankCode as SouthAfricanBank,
        ),
      };
    }
  }
  ```

  ### 6. Frontend Hook
  ```typescript
  // apps/web/src/hooks/use-bank-fees.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { apiClient, queryKeys } from '@/lib/api';

  interface Bank {
    code: string;
    name: string;
  }

  interface FeeRule {
    id?: string;
    feeType: string;
    transactionTypes: string[];
    fixedAmountCents: number;
    percentageRate?: number;
    minimumAmountCents?: number;
    maximumAmountCents?: number;
    isActive: boolean;
    description?: string;
  }

  interface BankFeeConfiguration {
    tenantId: string;
    bankName?: string;
    accountNumber?: string;
    feeRules: FeeRule[];
    defaultTransactionFeeCents: number;
    isEnabled: boolean;
    updatedAt: string;
  }

  export function useBankFeeConfig() {
    return useQuery<BankFeeConfiguration>({
      queryKey: ['settings', 'bank-fees'],
      queryFn: async () => {
        const { data } = await apiClient.get('/settings/bank-fees');
        return data.data;
      },
    });
  }

  export function useSupportedBanks() {
    return useQuery<Bank[]>({
      queryKey: ['settings', 'bank-fees', 'banks'],
      queryFn: async () => {
        const { data } = await apiClient.get('/settings/bank-fees/banks');
        return data.data;
      },
    });
  }

  export function useUpdateBankFeeConfig() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: async (config: Partial<BankFeeConfiguration>) => {
        const { data } = await apiClient.put('/settings/bank-fees', config);
        return data.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['settings', 'bank-fees'] });
      },
    });
  }

  export function useApplyBankPreset() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: async (bankCode: string) => {
        const { data } = await apiClient.post('/settings/bank-fees/apply-preset', {
          bankCode,
        });
        return data.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['settings', 'bank-fees'] });
      },
    });
  }
  ```

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task adds multi-bank support for bank fee configuration.

**South African Banking Context:**
- Big 4 banks: FNB, Standard Bank, Nedbank, ABSA
- Capitec is 5th largest and popular with SMEs (lower fees)
- Each bank has different fee structures
- Fees vary by account type (business vs personal)
- Cash deposits typically most expensive transaction type

**Business Value:**
- Creches can accurately track bank fees for reconciliation
- Proper fee allocation helps with budgeting
- Reduces manual fee entry and categorization
</context>

<scope>
  <in_scope>
    - Add bankFeeConfig JSON field to Tenant model
    - Add fee presets for Standard Bank, Nedbank, ABSA, Capitec
    - Save/load configuration from database
    - API endpoints for managing configuration
    - UI for selecting bank and customizing fees
    - Apply bank preset functionality
  </in_scope>
  <out_of_scope>
    - Automatic fee detection from statements
    - Bank API integrations
    - Historical fee tracking
    - Fee negotiation features
    - Bank account management
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Edit apps/api/prisma/schema.prisma (add bankFeeConfig to Tenant)

# 2. Generate migration
pnpm prisma:migrate dev --name add_bank_fee_config

# 3. Update bank fee service
# Edit apps/api/src/database/services/bank-fee.service.ts

# 4. Create API controller and DTOs
# Create apps/api/src/api/settings/bank-fees.controller.ts
# Create apps/api/src/api/settings/dto/bank-fee.dto.ts

# 5. Create frontend components
# Create apps/web/src/hooks/use-bank-fees.ts
# Create apps/web/src/app/(dashboard)/settings/bank-fees/page.tsx
# Create apps/web/src/components/settings/bank-fee-config.tsx

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Must support all Big 5 SA banks (FNB, Standard Bank, Nedbank, ABSA, Capitec)
    - Configuration must persist in database
    - Only OWNER and ADMIN can modify configuration
    - Fee rules must be validated before saving
    - Bank preset should apply all default rules at once
    - Custom rules can be added/modified after preset
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Can get configuration for tenant
    - Test: Can save configuration to database
    - Test: Can apply bank preset
    - Test: Fee rules are validated
    - Test: Cache is updated after save
    - Manual: Can select bank from dropdown
    - Manual: Preset fees load correctly
    - Manual: Can customize individual fees
    - Manual: Changes persist after page reload
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Allow non-admin users to modify configuration
  - Store configuration in code (use database)
  - Skip validation of fee rules
  - Forget to clear cache after updates
  - Hardcode bank-specific logic outside presets
  - Expose fee configurations across tenants
</anti_patterns>

</task_spec>
