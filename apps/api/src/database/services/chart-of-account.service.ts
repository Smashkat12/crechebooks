/**
 * Chart of Accounts Service
 * TASK-ACCT-001: Native Chart of Accounts Foundation
 *
 * @module database/services/chart-of-account
 * @description Manages the chart of accounts for tenants.
 * Provides CRUD operations, default account seeding for creches,
 * and SA tax compliance (Section 12(h) education exemption).
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: Account codes follow standard SA accounting conventions.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ChartOfAccount,
  AccountType,
  AccountSubType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

/**
 * Default chart of accounts for creches
 * Based on standard SA accounting and creche-specific requirements
 */
export const DEFAULT_CRECHE_ACCOUNTS: Omit<
  ChartOfAccount,
  'id' | 'tenantId' | 'createdAt' | 'updatedAt'
>[] = [
  // ===== ASSETS (1xxx) =====
  {
    code: '1000',
    name: 'Bank Account',
    type: 'ASSET' as AccountType,
    subType: 'BANK' as AccountSubType,
    description: 'Primary business bank account',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1100',
    name: 'Accounts Receivable',
    type: 'ASSET' as AccountType,
    subType: 'CURRENT_ASSET' as AccountSubType,
    description: 'Outstanding parent balances',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1200',
    name: 'Petty Cash',
    type: 'ASSET' as AccountType,
    subType: 'CURRENT_ASSET' as AccountSubType,
    description: 'Cash on hand for small expenses',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1300',
    name: 'Prepaid Expenses',
    type: 'ASSET' as AccountType,
    subType: 'CURRENT_ASSET' as AccountSubType,
    description: 'Expenses paid in advance',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1500',
    name: 'Fixed Assets',
    type: 'ASSET' as AccountType,
    subType: 'FIXED_ASSET' as AccountSubType,
    description: 'Equipment, furniture, playground',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1510',
    name: 'Furniture & Fixtures',
    type: 'ASSET' as AccountType,
    subType: 'FIXED_ASSET' as AccountSubType,
    description: 'Tables, chairs, shelving',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1520',
    name: 'Computer Equipment',
    type: 'ASSET' as AccountType,
    subType: 'FIXED_ASSET' as AccountSubType,
    description: 'Computers, tablets, printers',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1530',
    name: 'Playground Equipment',
    type: 'ASSET' as AccountType,
    subType: 'FIXED_ASSET' as AccountSubType,
    description: 'Outdoor play structures',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '1590',
    name: 'Accumulated Depreciation',
    type: 'ASSET' as AccountType,
    subType: 'FIXED_ASSET' as AccountSubType,
    description: 'Contra asset for depreciation',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },

  // ===== LIABILITIES (2xxx) =====
  {
    code: '2000',
    name: 'Accounts Payable',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'Amounts owed to suppliers',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2100',
    name: 'Deposits Received',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'Registration and advance deposits from parents',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2200',
    name: 'PAYE Payable',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'Employee tax withholding',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2210',
    name: 'UIF Payable',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'UIF contributions payable',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2220',
    name: 'SDL Payable',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'Skills Development Levy payable',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2300',
    name: 'VAT Payable',
    type: 'LIABILITY' as AccountType,
    subType: 'CURRENT_LIABILITY' as AccountSubType,
    description: 'VAT collected on taxable supplies',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '2500',
    name: 'Long-term Loan',
    type: 'LIABILITY' as AccountType,
    subType: 'LONG_TERM_LIABILITY' as AccountSubType,
    description: 'Business loans and financing',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },

  // ===== EQUITY (3xxx) =====
  {
    code: '3000',
    name: "Owner's Equity",
    type: 'EQUITY' as AccountType,
    subType: 'OWNER_EQUITY' as AccountSubType,
    description: 'Owner capital and drawings',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    type: 'EQUITY' as AccountType,
    subType: 'RETAINED_EARNINGS' as AccountSubType,
    description: 'Accumulated profits/losses',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },

  // ===== REVENUE (4xxx) - Many are VAT Exempt per Section 12(h) =====
  {
    code: '4100',
    name: 'Fee Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'Monthly childcare fees - VAT Exempt Section 12(h)',
    parentId: null,
    isEducationExempt: true,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4200',
    name: 'Registration Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'New enrollment registration fees - VAT Exempt',
    parentId: null,
    isEducationExempt: true,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4300',
    name: 'After-Care Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'After-school care fees - VAT Exempt',
    parentId: null,
    isEducationExempt: true,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4400',
    name: 'Extra-Mural Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'Extra-curricular activities - VAT Exempt',
    parentId: null,
    isEducationExempt: true,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4500',
    name: 'Uniform Sales',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'School uniform sales - VAT Applicable',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4600',
    name: 'Book Sales',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'Learning materials - VAT Applicable',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4700',
    name: 'Meal Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'Meal plan revenue - VAT Applicable',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4800',
    name: 'Transport Income',
    type: 'REVENUE' as AccountType,
    subType: 'OPERATING_REVENUE' as AccountSubType,
    description: 'School transport fees - VAT Applicable',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '4900',
    name: 'Other Income',
    type: 'REVENUE' as AccountType,
    subType: 'OTHER_REVENUE' as AccountSubType,
    description: 'Sundry revenue items',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },

  // ===== EXPENSES (5xxx) =====
  {
    code: '5000',
    name: 'Salaries & Wages',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Staff salaries and wages',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5100',
    name: 'Employer Contributions',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'UIF, SDL employer portions',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5200',
    name: 'Rent',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Property rental expenses',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5300',
    name: 'Utilities',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Electricity, water, gas',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5400',
    name: 'Food & Groceries',
    type: 'EXPENSE' as AccountType,
    subType: 'COST_OF_SALES' as AccountSubType,
    description: 'Meal preparation costs',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5500',
    name: 'Educational Materials',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Learning toys, books, craft supplies',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5600',
    name: 'Cleaning & Maintenance',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Cleaning supplies, minor repairs',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5700',
    name: 'Insurance',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Business and liability insurance',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5800',
    name: 'Bank Charges',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Bank fees and charges',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '5900',
    name: 'Depreciation',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Asset depreciation',
    parentId: null,
    isEducationExempt: false,
    isSystem: true,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '6000',
    name: 'Professional Fees',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Accounting, legal services',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '6100',
    name: 'Marketing & Advertising',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Promotional expenses',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '6200',
    name: 'Telecommunications',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Phone, internet, software',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '6300',
    name: 'Travel & Transport',
    type: 'EXPENSE' as AccountType,
    subType: 'OPERATING_EXPENSE' as AccountSubType,
    description: 'Vehicle costs, transport expenses',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
  {
    code: '6900',
    name: 'Sundry Expenses',
    type: 'EXPENSE' as AccountType,
    subType: 'OTHER_EXPENSE' as AccountSubType,
    description: 'Miscellaneous expenses',
    parentId: null,
    isEducationExempt: false,
    isSystem: false,
    isActive: true,
    xeroAccountId: null,
  },
];

export interface CreateChartOfAccountDto {
  code: string;
  name: string;
  type: AccountType;
  subType?: AccountSubType;
  description?: string;
  parentId?: string;
  isEducationExempt?: boolean;
  xeroAccountId?: string;
}

export interface UpdateChartOfAccountDto {
  name?: string;
  description?: string;
  subType?: AccountSubType;
  parentId?: string | null;
  isEducationExempt?: boolean;
  isActive?: boolean;
  xeroAccountId?: string | null;
}

@Injectable()
export class ChartOfAccountService {
  private readonly logger = new Logger(ChartOfAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Seeds default chart of accounts for a new tenant
   * Called during tenant onboarding
   */
  async seedDefaults(
    tenantId: string,
    userId: string,
  ): Promise<ChartOfAccount[]> {
    this.logger.log(`Seeding default chart of accounts for tenant ${tenantId}`);

    // Check if accounts already exist
    const existingCount = await this.prisma.chartOfAccount.count({
      where: { tenantId },
    });

    if (existingCount > 0) {
      this.logger.warn(
        `Tenant ${tenantId} already has ${existingCount} accounts, skipping seed`,
      );
      return this.prisma.chartOfAccount.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
      });
    }

    // Create all default accounts
    const accounts = await this.prisma.$transaction(
      DEFAULT_CRECHE_ACCOUNTS.map((account) =>
        this.prisma.chartOfAccount.create({
          data: {
            ...account,
            tenantId,
          },
        }),
      ),
    );

    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'ChartOfAccount',
      entityId: 'SEED',
      afterValue: {
        count: accounts.length,
        message: `Seeded ${accounts.length} default accounts`,
      },
    });

    this.logger.log(
      `Seeded ${accounts.length} default accounts for tenant ${tenantId}`,
    );
    return accounts;
  }

  /**
   * Creates a new chart of account
   */
  async create(
    tenantId: string,
    userId: string,
    data: CreateChartOfAccountDto,
  ): Promise<ChartOfAccount> {
    // Validate unique code within tenant
    const existing = await this.prisma.chartOfAccount.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });

    if (existing) {
      throw new Error(`Account code ${data.code} already exists`);
    }

    // Validate parent exists if specified
    if (data.parentId) {
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: data.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent account ${data.parentId} not found`,
        );
      }
    }

    const account = await this.prisma.chartOfAccount.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        type: data.type,
        subType: data.subType,
        description: data.description,
        parentId: data.parentId,
        isEducationExempt: data.isEducationExempt ?? false,
        xeroAccountId: data.xeroAccountId,
        isSystem: false,
      },
    });

    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'ChartOfAccount',
      entityId: account.id,
      afterValue: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        isEducationExempt: account.isEducationExempt,
      },
    });

    return account;
  }

  /**
   * Updates an existing chart of account
   * System accounts have limited update options
   */
  async update(
    tenantId: string,
    userId: string,
    accountId: string,
    data: UpdateChartOfAccountDto,
  ): Promise<ChartOfAccount> {
    const existing = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // System accounts cannot change code, type, or be deactivated
    if (existing.isSystem && data.isActive === false) {
      throw new Error('System accounts cannot be deactivated');
    }

    // Validate parent if changing
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === accountId) {
        throw new Error('Account cannot be its own parent');
      }
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: data.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent account ${data.parentId} not found`,
        );
      }
    }

    const account = await this.prisma.chartOfAccount.update({
      where: { id: accountId },
      data: {
        name: data.name,
        description: data.description,
        subType: data.subType,
        parentId: data.parentId,
        isEducationExempt: data.isEducationExempt,
        isActive: data.isActive,
        xeroAccountId: data.xeroAccountId,
      },
    });

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'ChartOfAccount',
      entityId: account.id,
      beforeValue: {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        isActive: existing.isActive,
        isEducationExempt: existing.isEducationExempt,
      },
      afterValue: {
        id: account.id,
        code: account.code,
        name: account.name,
        isActive: account.isActive,
        isEducationExempt: account.isEducationExempt,
      },
      changeSummary: `Updated account ${account.code} - ${account.name}`,
    });

    return account;
  }

  /**
   * Finds an account by ID
   */
  async findById(
    tenantId: string,
    accountId: string,
  ): Promise<ChartOfAccount | null> {
    return this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, tenantId },
      include: { parent: true, children: true },
    });
  }

  /**
   * Finds an account by code
   */
  async findByCode(
    tenantId: string,
    code: string,
  ): Promise<ChartOfAccount | null> {
    return this.prisma.chartOfAccount.findUnique({
      where: { tenantId_code: { tenantId, code } },
      include: { parent: true, children: true },
    });
  }

  /**
   * Lists all accounts for a tenant
   */
  async findAll(
    tenantId: string,
    options?: {
      type?: AccountType;
      isActive?: boolean;
      search?: string;
    },
  ): Promise<ChartOfAccount[]> {
    const where: Prisma.ChartOfAccountWhereInput = { tenantId };

    if (options?.type) {
      where.type = options.type;
    }
    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }
    if (options?.search) {
      where.OR = [
        { code: { contains: options.search, mode: 'insensitive' } },
        { name: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.chartOfAccount.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { parent: true },
    });
  }

  /**
   * Lists accounts by type
   */
  async findByType(
    tenantId: string,
    type: AccountType,
  ): Promise<ChartOfAccount[]> {
    return this.findAll(tenantId, { type, isActive: true });
  }

  /**
   * Gets education-exempt accounts (for VAT Section 12(h))
   */
  async findEducationExemptAccounts(
    tenantId: string,
  ): Promise<ChartOfAccount[]> {
    return this.prisma.chartOfAccount.findMany({
      where: {
        tenantId,
        isEducationExempt: true,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Gets a summary of accounts grouped by type
   */
  async getAccountSummary(tenantId: string): Promise<{
    assets: number;
    liabilities: number;
    equity: number;
    revenue: number;
    expenses: number;
    total: number;
  }> {
    const counts = await this.prisma.chartOfAccount.groupBy({
      by: ['type'],
      where: { tenantId, isActive: true },
      _count: true,
    });

    const summary = {
      assets: 0,
      liabilities: 0,
      equity: 0,
      revenue: 0,
      expenses: 0,
      total: 0,
    };

    for (const group of counts) {
      const count = group._count;
      switch (group.type) {
        case 'ASSET':
          summary.assets = count;
          break;
        case 'LIABILITY':
          summary.liabilities = count;
          break;
        case 'EQUITY':
          summary.equity = count;
          break;
        case 'REVENUE':
          summary.revenue = count;
          break;
        case 'EXPENSE':
          summary.expenses = count;
          break;
      }
      summary.total += count;
    }

    return summary;
  }

  /**
   * Links a chart of account to a Xero account
   */
  async linkToXero(
    tenantId: string,
    userId: string,
    accountId: string,
    xeroAccountId: string,
  ): Promise<ChartOfAccount> {
    return this.update(tenantId, userId, accountId, { xeroAccountId });
  }

  /**
   * Unlinks a chart of account from Xero
   */
  async unlinkFromXero(
    tenantId: string,
    userId: string,
    accountId: string,
  ): Promise<ChartOfAccount> {
    return this.update(tenantId, userId, accountId, { xeroAccountId: null });
  }

  /**
   * Deactivates an account (soft delete)
   * System accounts cannot be deactivated
   */
  async deactivate(
    tenantId: string,
    userId: string,
    accountId: string,
  ): Promise<ChartOfAccount> {
    const account = await this.findById(tenantId, accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    if (account.isSystem) {
      throw new Error('System accounts cannot be deactivated');
    }

    // Check if account has any transactions/balances
    // In a full implementation, we'd check opening balances, journal entries, etc.

    return this.update(tenantId, userId, accountId, { isActive: false });
  }

  /**
   * Reactivates a previously deactivated account
   */
  async reactivate(
    tenantId: string,
    userId: string,
    accountId: string,
  ): Promise<ChartOfAccount> {
    return this.update(tenantId, userId, accountId, { isActive: true });
  }
}
