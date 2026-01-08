/**
 * Xero Account Mapping Service
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * Maps CrecheBooks payroll components to Xero chart of accounts.
 * Provides:
 * - CRUD operations for account mappings
 * - Xero account fetching and caching
 * - Auto-suggestion of mappings based on account names
 * - Validation of required mappings
 */

import { Injectable, Logger } from '@nestjs/common';
import { XeroAccountType, XeroAccountMapping } from '@prisma/client';
import { XeroClient } from 'xero-node';
import { PrismaService } from '../prisma/prisma.service';
import { XeroPayrollJournalRepository } from '../repositories/xero-payroll-journal.repository';
import { XeroSyncService } from './xero-sync.service';
import { AuditLogService } from './audit-log.service';
import { XeroAccount } from '../entities/xero-payroll-journal.entity';
import { AuditAction } from '../entities/audit-log.entity';
import {
  UpsertAccountMappingDto,
  AccountMappingValidationResult,
  SuggestedMapping,
  AccountMappingSummary,
} from '../dto/xero-payroll-journal.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import { RateLimiter } from '../../mcp/xero-mcp/utils/rate-limiter';

// Required account types for payroll journal creation
const REQUIRED_ACCOUNT_TYPES: XeroAccountType[] = [
  'SALARY_EXPENSE',
  'PAYE_PAYABLE',
  'UIF_PAYABLE',
  'NET_PAY_CLEARING',
];

// All account types with their descriptions
const ALL_ACCOUNT_TYPES: Record<XeroAccountType, string> = {
  SALARY_EXPENSE: 'Salaries & Wages Expense',
  UIF_EMPLOYER_EXPENSE: 'UIF Employer Contribution Expense',
  SDL_EXPENSE: 'Skills Development Levy Expense',
  PENSION_EXPENSE: 'Pension/Retirement Fund Expense',
  PAYE_PAYABLE: 'PAYE Tax Payable',
  UIF_PAYABLE: 'UIF Payable',
  SDL_PAYABLE: 'SDL Payable',
  PENSION_PAYABLE: 'Pension Payable',
  NET_PAY_CLEARING: 'Net Pay Clearing/Salaries Payable',
  BONUS_EXPENSE: 'Bonus Expense',
  OVERTIME_EXPENSE: 'Overtime Expense',
  OTHER_DEDUCTION: 'Other Deductions',
};

// SA Payroll account name patterns for auto-suggestion
const ACCOUNT_NAME_PATTERNS: Record<XeroAccountType, string[]> = {
  SALARY_EXPENSE: [
    'salaries',
    'wages',
    'salary',
    'wage',
    'payroll expense',
    'staff costs',
  ],
  UIF_EMPLOYER_EXPENSE: [
    'uif employer',
    'uif contribution',
    'unemployment insurance employer',
  ],
  SDL_EXPENSE: ['sdl', 'skills development', 'skills levy', 'training levy'],
  PENSION_EXPENSE: [
    'pension employer',
    'retirement fund employer',
    'provident fund employer',
  ],
  PAYE_PAYABLE: [
    'paye',
    'pay as you earn',
    'tax payable',
    'income tax payable',
  ],
  UIF_PAYABLE: [
    'uif payable',
    'uif liability',
    'unemployment insurance payable',
  ],
  SDL_PAYABLE: ['sdl payable', 'skills levy payable'],
  PENSION_PAYABLE: [
    'pension payable',
    'pension liability',
    'retirement payable',
  ],
  NET_PAY_CLEARING: [
    'net pay',
    'salaries payable',
    'wages payable',
    'clearing',
    'salary control',
  ],
  BONUS_EXPENSE: ['bonus', 'bonuses', 'incentive', '13th cheque'],
  OVERTIME_EXPENSE: ['overtime', 'ot expense'],
  OTHER_DEDUCTION: ['other deduction', 'deductions', 'garnishee'],
};

@Injectable()
export class XeroAccountMappingService {
  private readonly logger = new Logger(XeroAccountMappingService.name);
  private readonly tokenManager: TokenManager;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalRepo: XeroPayrollJournalRepository,
    private readonly xeroSyncService: XeroSyncService,
    private readonly auditLogService: AuditLogService,
  ) {
    // Initialize TokenManager with PrismaService (extends PrismaClient)
    this.tokenManager = new TokenManager(this.prisma);
    // Rate limiter: 60 requests per minute as per Xero API limits
    this.rateLimiter = new RateLimiter(60, 60000);
  }

  /**
   * Get all account mappings for a tenant
   */
  async getMappings(tenantId: string): Promise<XeroAccountMapping[]> {
    return this.journalRepo.findMappingsByTenant(tenantId);
  }

  /**
   * Get a specific account mapping by type
   */
  async getMappingByType(
    tenantId: string,
    accountType: XeroAccountType,
  ): Promise<XeroAccountMapping | null> {
    return this.journalRepo.findMappingByType(tenantId, accountType);
  }

  /**
   * Create or update an account mapping
   */
  async upsertMapping(
    tenantId: string,
    dto: UpsertAccountMappingDto,
    userId?: string,
  ): Promise<XeroAccountMapping> {
    this.logger.log(`Upserting mapping for ${dto.accountType}`);

    // Check if mapping exists for audit trail
    const existing = await this.journalRepo.findMappingByType(
      tenantId,
      dto.accountType,
    );

    const mapping = await this.journalRepo.upsertAccountMapping(tenantId, dto);

    // Log audit trail
    if (existing) {
      await this.auditLogService.logUpdate({
        tenantId,
        userId,
        entityType: 'XeroAccountMapping',
        entityId: mapping.id,
        beforeValue: {
          xeroAccountId: existing.xeroAccountId,
          xeroAccountCode: existing.xeroAccountCode,
          xeroAccountName: existing.xeroAccountName,
        },
        afterValue: {
          xeroAccountId: dto.xeroAccountId,
          xeroAccountCode: dto.xeroAccountCode,
          xeroAccountName: dto.xeroAccountName,
        },
        changeSummary: `Updated ${dto.accountType} mapping to ${dto.xeroAccountCode}`,
      });
    } else {
      await this.auditLogService.logCreate({
        tenantId,
        userId,
        entityType: 'XeroAccountMapping',
        entityId: mapping.id,
        afterValue: {
          accountType: dto.accountType,
          xeroAccountId: dto.xeroAccountId,
          xeroAccountCode: dto.xeroAccountCode,
          xeroAccountName: dto.xeroAccountName,
        },
      });
    }

    return mapping;
  }

  /**
   * Bulk create or update account mappings
   */
  async bulkUpsertMappings(
    tenantId: string,
    mappings: UpsertAccountMappingDto[],
    userId?: string,
  ): Promise<XeroAccountMapping[]> {
    this.logger.log(`Bulk upserting ${mappings.length} mappings`);

    const results = await this.journalRepo.bulkUpsertAccountMappings(
      tenantId,
      mappings,
    );

    // Log audit trail for bulk operation
    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'XeroAccountMapping',
      entityId: 'BULK',
      action: AuditAction.UPDATE,
      afterValue: {
        count: mappings.length,
        accountTypes: mappings.map((m) => m.accountType),
      },
      changeSummary: `Bulk updated ${mappings.length} account mappings`,
    });

    return results;
  }

  /**
   * Delete an account mapping
   */
  async deleteMapping(
    tenantId: string,
    accountType: XeroAccountType,
    userId?: string,
  ): Promise<void> {
    const existing = await this.journalRepo.findMappingByType(
      tenantId,
      accountType,
    );
    if (!existing) {
      throw new NotFoundException('XeroAccountMapping', accountType);
    }

    await this.journalRepo.deleteMapping(tenantId, accountType);

    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'XeroAccountMapping',
      entityId: existing.id,
      action: AuditAction.DELETE,
      beforeValue: {
        accountType,
        xeroAccountCode: existing.xeroAccountCode,
        xeroAccountName: existing.xeroAccountName,
      },
      changeSummary: `Deleted ${accountType} mapping`,
    });

    this.logger.log(`Deleted mapping for ${accountType}`);
  }

  /**
   * Fetch available accounts from Xero chart of accounts
   * Uses xero-node SDK with rate limiting
   */
  async fetchXeroAccounts(tenantId: string): Promise<XeroAccount[]> {
    // Check Xero connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    this.logger.log(`Fetching Xero accounts for tenant ${tenantId}`);

    try {
      // Get authenticated Xero client
      const accessToken = await this.tokenManager.getAccessToken(tenantId);
      const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

      const client = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID ?? '',
        clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
        redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
        scopes: [
          'openid',
          'profile',
          'email',
          'accounting.transactions',
          'accounting.settings',
        ],
      });

      client.setTokenSet({
        access_token: accessToken,
        token_type: 'Bearer',
      });

      // Apply rate limiting
      await this.rateLimiter.acquire();

      // Fetch accounts from Xero
      // Only get EXPENSE and LIABILITY accounts (relevant for payroll)
      const response = await client.accountingApi.getAccounts(
        xeroTenantId,
        undefined, // modifiedSince
        'Type=="EXPENSE",Type=="CURRLIAB"', // where clause for expense and current liability
        undefined, // order
      );

      const accounts = response.body.accounts ?? [];

      this.logger.log(`Fetched ${accounts.length} accounts from Xero`);

      // Map to our XeroAccount interface
      // Cast enum values to strings for our interface compatibility
      return accounts.map(
        (account): XeroAccount => ({
          accountId: account.accountID ?? '',
          code: account.code ?? '',
          name: account.name ?? '',
          type: String(account.type ?? ''),
          class: String(account._class ?? ''),
          status: String(account.status ?? ''),
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch Xero accounts: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // If Xero API call fails, return default SA payroll accounts
      // This allows the feature to work in development/testing without Xero connection
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(
          'Returning mock accounts for non-production environment',
        );
        return this.getMockSAPayrollAccounts();
      }

      throw new BusinessException(
        'Failed to fetch accounts from Xero. Please try again.',
        'XERO_FETCH_FAILED',
      );
    }
  }

  /**
   * Get mock SA payroll accounts for development/testing
   * Aligned with actual Xero Chart of Accounts (Think M8 ECD export Jan 2026)
   */
  private getMockSAPayrollAccounts(): XeroAccount[] {
    return [
      // Salary Expense Accounts (5110-5135 by role)
      {
        accountId: 'xero-5110',
        code: '5110',
        name: 'Principal Salary',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5115',
        code: '5115',
        name: 'Teacher Salaries',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5120',
        code: '5120',
        name: 'Assistant Teacher Salaries',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5125',
        code: '5125',
        name: 'Administrative Staff Salaries',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5130',
        code: '5130',
        name: 'Kitchen Staff Salaries',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5135',
        code: '5135',
        name: 'Cleaning Staff Salaries',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      // Employer Contribution Expenses
      {
        accountId: 'xero-5220',
        code: '5220',
        name: 'UIF Contributions',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5230',
        code: '5230',
        name: 'SDL Contributions',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5215',
        code: '5215',
        name: 'Pension Fund Contributions',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5225',
        code: '5225',
        name: 'WCA Contributions',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5100',
        code: '5100',
        name: 'Overtime Pay',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-5240',
        code: '5240',
        name: 'Staff Bonuses',
        type: 'EXPENSE',
        class: 'EXPENSE',
        status: 'ACTIVE',
      },
      // Payroll Liability Accounts
      {
        accountId: 'xero-2210',
        code: '2210',
        name: 'PAYE Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-2215',
        code: '2215',
        name: 'UIF Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-2220',
        code: '2220',
        name: 'SDL Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-2225',
        code: '2225',
        name: 'WCA Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-2415',
        code: '2415',
        name: 'Staff Pension Fund Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
      {
        accountId: 'xero-803',
        code: '803',
        name: 'Wages Payable',
        type: 'CURRLIAB',
        class: 'LIABILITY',
        status: 'ACTIVE',
      },
    ];
  }

  /**
   * Get suggested mappings based on Xero account names
   * Uses pattern matching to suggest the best account for each type
   */
  suggestMappings(xeroAccounts: XeroAccount[]): SuggestedMapping[] {
    const suggestions: SuggestedMapping[] = [];

    for (const accountType of Object.keys(
      ACCOUNT_NAME_PATTERNS,
    ) as XeroAccountType[]) {
      const patterns = ACCOUNT_NAME_PATTERNS[accountType];
      let bestMatch: {
        account: XeroAccount;
        confidence: number;
        matchedPattern: string;
      } | null = null;

      for (const account of xeroAccounts) {
        // Skip inactive accounts
        if (account.status !== 'ACTIVE') continue;

        const nameLower = account.name.toLowerCase();
        for (const pattern of patterns) {
          if (nameLower.includes(pattern)) {
            // Calculate confidence based on pattern match quality
            const confidence = pattern.length / nameLower.length;
            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = { account, confidence, matchedPattern: pattern };
            }
          }
        }
      }

      const isRequired = REQUIRED_ACCOUNT_TYPES.includes(accountType);
      const description = ALL_ACCOUNT_TYPES[accountType];

      suggestions.push({
        accountType,
        suggestedAccount: bestMatch
          ? {
              accountId: bestMatch.account.accountId,
              code: bestMatch.account.code,
              name: bestMatch.account.name,
            }
          : null,
        confidence: bestMatch?.confidence || 0,
        reason: bestMatch
          ? `Matched pattern "${bestMatch.matchedPattern}" in account name`
          : isRequired
            ? `No matching account found. ${description} is required.`
            : `No matching account found for ${description}.`,
      });
    }

    // Sort by required first, then by confidence
    suggestions.sort((a, b) => {
      const aRequired = REQUIRED_ACCOUNT_TYPES.includes(a.accountType);
      const bRequired = REQUIRED_ACCOUNT_TYPES.includes(b.accountType);
      if (aRequired && !bRequired) return -1;
      if (!aRequired && bRequired) return 1;
      return b.confidence - a.confidence;
    });

    return suggestions;
  }

  /**
   * Validate that all required mappings exist
   */
  async validateMappings(
    tenantId: string,
  ): Promise<AccountMappingValidationResult> {
    const mappings = await this.journalRepo.findMappingsByTenant(tenantId);
    const mappedTypes = new Set(mappings.map((m) => m.accountType));
    const missingMappings = REQUIRED_ACCOUNT_TYPES.filter(
      (type) => !mappedTypes.has(type),
    );

    return {
      isValid: missingMappings.length === 0,
      missingMappings,
      mappedAccounts: mappings.length,
      requiredAccounts: REQUIRED_ACCOUNT_TYPES.length,
    };
  }

  /**
   * Get complete mapping summary including all account types
   */
  async getMappingSummary(tenantId: string): Promise<AccountMappingSummary> {
    const mappings = await this.journalRepo.findMappingsByTenant(tenantId);
    const mappingsByType = new Map(mappings.map((m) => [m.accountType, m]));

    const allTypes = Object.keys(ALL_ACCOUNT_TYPES) as XeroAccountType[];

    return {
      totalRequired: REQUIRED_ACCOUNT_TYPES.length,
      totalMapped: mappings.length,
      isComplete: REQUIRED_ACCOUNT_TYPES.every((type) =>
        mappingsByType.has(type),
      ),
      mappings: allTypes.map((accountType) => {
        const mapping = mappingsByType.get(accountType);
        return {
          accountType,
          isMapped: !!mapping,
          accountCode: mapping?.xeroAccountCode,
          accountName: mapping?.xeroAccountName,
        };
      }),
    };
  }

  /**
   * Auto-configure mappings from Xero accounts
   * Fetches accounts and applies best suggestions for unmapped types
   */
  async autoConfigureMappings(
    tenantId: string,
    overwriteExisting: boolean = false,
    userId?: string,
  ): Promise<{
    applied: number;
    skipped: number;
    suggestions: SuggestedMapping[];
  }> {
    this.logger.log(
      `Auto-configuring mappings for tenant ${tenantId} (overwrite: ${overwriteExisting})`,
    );

    // Fetch Xero accounts
    const xeroAccounts = await this.fetchXeroAccounts(tenantId);

    // Get suggestions
    const suggestions = this.suggestMappings(xeroAccounts);

    // Get existing mappings
    const existingMappings =
      await this.journalRepo.findMappingsByTenant(tenantId);
    const existingTypes = new Set(existingMappings.map((m) => m.accountType));

    // Apply suggestions
    let applied = 0;
    let skipped = 0;

    for (const suggestion of suggestions) {
      if (!suggestion.suggestedAccount) {
        skipped++;
        continue;
      }

      const hasExisting = existingTypes.has(suggestion.accountType);
      if (hasExisting && !overwriteExisting) {
        skipped++;
        continue;
      }

      await this.upsertMapping(
        tenantId,
        {
          accountType: suggestion.accountType,
          xeroAccountId: suggestion.suggestedAccount.accountId,
          xeroAccountCode: suggestion.suggestedAccount.code,
          xeroAccountName: suggestion.suggestedAccount.name,
          isActive: true,
        },
        userId,
      );
      applied++;
    }

    this.logger.log(
      `Auto-configure complete: ${applied} applied, ${skipped} skipped`,
    );

    return { applied, skipped, suggestions };
  }

  /**
   * Get list of required account types with descriptions
   */
  getRequiredAccountTypes(): Array<{
    type: XeroAccountType;
    description: string;
  }> {
    return REQUIRED_ACCOUNT_TYPES.map((type) => ({
      type,
      description: ALL_ACCOUNT_TYPES[type],
    }));
  }

  /**
   * Get list of all account types with descriptions
   */
  getAllAccountTypes(): Array<{
    type: XeroAccountType;
    description: string;
    isRequired: boolean;
  }> {
    return (Object.keys(ALL_ACCOUNT_TYPES) as XeroAccountType[]).map(
      (type) => ({
        type,
        description: ALL_ACCOUNT_TYPES[type],
        isRequired: REQUIRED_ACCOUNT_TYPES.includes(type),
      }),
    );
  }
}
