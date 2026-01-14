/**
 * XeroAccountRepository
 * TASK-XERO-006: Chart of Accounts Database Sync
 *
 * Repository for managing Xero Chart of Accounts in the local database.
 * Supports CRUD operations, upsert for sync, and validation.
 *
 * CRITICAL: All operations must filter by tenantId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { XeroAccount, Prisma, XeroAccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IXeroAccount,
  CreateXeroAccountInput,
  UpdateXeroAccountInput,
  XeroAccountFilterOptions,
  AccountValidationResult,
} from '../entities/xero-account.entity';

@Injectable()
export class XeroAccountRepository {
  private readonly logger = new Logger(XeroAccountRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Xero account record
   */
  async create(input: CreateXeroAccountInput): Promise<IXeroAccount> {
    this.logger.debug(
      `Creating Xero account: ${input.accountCode} for tenant ${input.tenantId}`,
    );

    const account = await this.prisma.xeroAccount.create({
      data: {
        tenantId: input.tenantId,
        accountCode: input.accountCode,
        name: input.name,
        type: input.type,
        taxType: input.taxType,
        status: input.status ?? XeroAccountStatus.ACTIVE,
        xeroAccountId: input.xeroAccountId,
        lastSyncedAt: input.lastSyncedAt ?? new Date(),
      },
    });

    return this.mapToEntity(account);
  }

  /**
   * Find account by account code
   */
  async findByCode(
    tenantId: string,
    accountCode: string,
  ): Promise<IXeroAccount | null> {
    const account = await this.prisma.xeroAccount.findUnique({
      where: {
        tenantId_accountCode: { tenantId, accountCode },
      },
    });

    return account ? this.mapToEntity(account) : null;
  }

  /**
   * Find account by ID
   */
  async findById(tenantId: string, id: string): Promise<IXeroAccount | null> {
    const account = await this.prisma.xeroAccount.findFirst({
      where: { id, tenantId },
    });

    return account ? this.mapToEntity(account) : null;
  }

  /**
   * Find all accounts for a tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    options?: XeroAccountFilterOptions & { limit?: number; offset?: number },
  ): Promise<{ accounts: IXeroAccount[]; total: number }> {
    const where: Prisma.XeroAccountWhereInput = { tenantId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.codePrefix) {
      where.accountCode = { startsWith: options.codePrefix };
    }

    if (options?.nameSearch) {
      where.name = { contains: options.nameSearch, mode: 'insensitive' };
    }

    const [accounts, total] = await Promise.all([
      this.prisma.xeroAccount.findMany({
        where,
        orderBy: { accountCode: 'asc' },
        take: options?.limit,
        skip: options?.offset,
      }),
      this.prisma.xeroAccount.count({ where }),
    ]);

    return {
      accounts: accounts.map((a) => this.mapToEntity(a)),
      total,
    };
  }

  /**
   * Find all active accounts for a tenant
   */
  async findActiveByTenant(tenantId: string): Promise<IXeroAccount[]> {
    const accounts = await this.prisma.xeroAccount.findMany({
      where: {
        tenantId,
        status: XeroAccountStatus.ACTIVE,
      },
      orderBy: { accountCode: 'asc' },
    });

    return accounts.map((a) => this.mapToEntity(a));
  }

  /**
   * Update an existing Xero account
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdateXeroAccountInput,
  ): Promise<IXeroAccount> {
    const account = await this.prisma.xeroAccount.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.taxType !== undefined && { taxType: input.taxType }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.xeroAccountId !== undefined && {
          xeroAccountId: input.xeroAccountId,
        }),
        lastSyncedAt: input.lastSyncedAt ?? new Date(),
      },
    });

    // Verify tenant ownership
    if (account.tenantId !== tenantId) {
      throw new Error('Unauthorized: Account does not belong to tenant');
    }

    return this.mapToEntity(account);
  }

  /**
   * Upsert a Xero account (create or update based on account code)
   * Used during Chart of Accounts sync
   */
  async upsert(input: CreateXeroAccountInput): Promise<{
    account: IXeroAccount;
    isNew: boolean;
  }> {
    const existing = await this.findByCode(input.tenantId, input.accountCode);

    if (existing) {
      const updated = await this.prisma.xeroAccount.update({
        where: {
          tenantId_accountCode: {
            tenantId: input.tenantId,
            accountCode: input.accountCode,
          },
        },
        data: {
          name: input.name,
          type: input.type,
          taxType: input.taxType,
          status: input.status ?? XeroAccountStatus.ACTIVE,
          xeroAccountId: input.xeroAccountId,
          lastSyncedAt: new Date(),
        },
      });

      return { account: this.mapToEntity(updated), isNew: false };
    }

    const created = await this.create(input);
    return { account: created, isNew: true };
  }

  /**
   * Archive an account (soft delete)
   */
  async archive(tenantId: string, id: string): Promise<IXeroAccount> {
    const account = await this.prisma.xeroAccount.update({
      where: { id },
      data: {
        status: XeroAccountStatus.ARCHIVED,
        lastSyncedAt: new Date(),
      },
    });

    // Verify tenant ownership
    if (account.tenantId !== tenantId) {
      throw new Error('Unauthorized: Account does not belong to tenant');
    }

    this.logger.debug(
      `Archived Xero account ${account.accountCode} for tenant ${tenantId}`,
    );

    return this.mapToEntity(account);
  }

  /**
   * Archive all accounts not in the given list of codes
   * Used during sync to mark accounts that were removed from Xero
   */
  async archiveNotInCodes(
    tenantId: string,
    activeCodes: string[],
  ): Promise<number> {
    if (activeCodes.length === 0) {
      return 0;
    }

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

    if (result.count > 0) {
      this.logger.log(
        `Archived ${result.count} accounts not found in Xero for tenant ${tenantId}`,
      );
    }

    return result.count;
  }

  /**
   * Validate an account code exists and is active
   */
  async validateAccountCode(
    tenantId: string,
    accountCode: string,
  ): Promise<AccountValidationResult> {
    const account = await this.findByCode(tenantId, accountCode);

    if (!account) {
      // Try to find similar account codes for suggestions
      const suggestions = await this.findSimilarCodes(tenantId, accountCode);

      return {
        isValid: false,
        error: `Account code '${accountCode}' not found in Chart of Accounts`,
        suggestions,
      };
    }

    if (account.status === XeroAccountStatus.ARCHIVED) {
      // Find active alternatives
      const alternatives = await this.prisma.xeroAccount.findMany({
        where: {
          tenantId,
          type: account.type,
          status: XeroAccountStatus.ACTIVE,
        },
        take: 5,
        orderBy: { accountCode: 'asc' },
      });

      return {
        isValid: false,
        account,
        error: `Account code '${accountCode}' is archived in Xero`,
        suggestions: alternatives.map((a) => `${a.accountCode}: ${a.name}`),
      };
    }

    return {
      isValid: true,
      account,
    };
  }

  /**
   * Find similar account codes for suggestions
   */
  private async findSimilarCodes(
    tenantId: string,
    code: string,
  ): Promise<string[]> {
    // Find accounts with similar prefix
    const prefix = code.slice(0, Math.min(2, code.length));

    const similar = await this.prisma.xeroAccount.findMany({
      where: {
        tenantId,
        status: XeroAccountStatus.ACTIVE,
        accountCode: { startsWith: prefix },
      },
      take: 5,
      orderBy: { accountCode: 'asc' },
    });

    return similar.map((a) => `${a.accountCode}: ${a.name}`);
  }

  /**
   * Get the last sync timestamp for a tenant
   */
  async getLastSyncTime(tenantId: string): Promise<Date | null> {
    const latest = await this.prisma.xeroAccount.findFirst({
      where: { tenantId },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    return latest?.lastSyncedAt ?? null;
  }

  /**
   * Count accounts by status
   */
  async countByStatus(
    tenantId: string,
  ): Promise<{ active: number; archived: number }> {
    const [active, archived] = await Promise.all([
      this.prisma.xeroAccount.count({
        where: { tenantId, status: XeroAccountStatus.ACTIVE },
      }),
      this.prisma.xeroAccount.count({
        where: { tenantId, status: XeroAccountStatus.ARCHIVED },
      }),
    ]);

    return { active, archived };
  }

  /**
   * Find accounts by type
   */
  async findByType(tenantId: string, type: string): Promise<IXeroAccount[]> {
    const accounts = await this.prisma.xeroAccount.findMany({
      where: {
        tenantId,
        type,
        status: XeroAccountStatus.ACTIVE,
      },
      orderBy: { accountCode: 'asc' },
    });

    return accounts.map((a) => this.mapToEntity(a));
  }

  /**
   * Map Prisma model to entity interface
   */
  private mapToEntity(account: XeroAccount): IXeroAccount {
    return {
      id: account.id,
      tenantId: account.tenantId,
      accountCode: account.accountCode,
      name: account.name,
      type: account.type,
      taxType: account.taxType,
      status: account.status,
      xeroAccountId: account.xeroAccountId,
      lastSyncedAt: account.lastSyncedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
