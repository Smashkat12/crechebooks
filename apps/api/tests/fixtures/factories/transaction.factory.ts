/**
 * Transaction Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { Transaction, TransactionStatus, ImportSource } from '@prisma/client';
import { generateUniqueId } from '../utils';

export interface TransactionFactoryOptions {
  tenantId: string;
  isCredit?: boolean;
  amountCents?: number;
  description?: string;
  payeeName?: string;
  reference?: string;
  date?: Date;
  status?: TransactionStatus;
  source?: ImportSource;
  bankAccount?: string;
}

/**
 * Create a test transaction with sensible defaults
 */
export async function createTransaction(
  prisma: PrismaService,
  opts: TransactionFactoryOptions,
): Promise<Transaction> {
  const uniqueId = generateUniqueId();

  return prisma.transaction.create({
    data: {
      tenantId: opts.tenantId,
      isCredit: opts.isCredit ?? true, // Default to income (credit)
      amountCents: opts.amountCents ?? 300000, // R3,000
      description: opts.description ?? `Test Payment ${uniqueId}`,
      payeeName: opts.payeeName ?? `Parent ${uniqueId.slice(0, 5)}`,
      reference: opts.reference ?? `REF-${uniqueId.slice(0, 8).toUpperCase()}`,
      date: opts.date ?? new Date(),
      status: opts.status ?? 'PENDING',
      source: opts.source ?? 'MANUAL',
      bankAccount: opts.bankAccount ?? 'MAIN',
    },
  });
}

/**
 * Create income transaction (typical parent payment - credit)
 */
export async function createIncomeTransaction(
  prisma: PrismaService,
  opts: Omit<TransactionFactoryOptions, 'isCredit'>,
): Promise<Transaction> {
  return createTransaction(prisma, {
    ...opts,
    isCredit: true,
  });
}

/**
 * Create expense transaction (debit)
 */
export async function createExpenseTransaction(
  prisma: PrismaService,
  opts: Omit<TransactionFactoryOptions, 'isCredit'>,
): Promise<Transaction> {
  return createTransaction(prisma, {
    ...opts,
    isCredit: false,
    description: opts.description ?? 'Test Expense',
    payeeName: opts.payeeName ?? 'Supplier',
  });
}

/**
 * Create multiple income transactions for a parent
 */
export async function createParentPayments(
  prisma: PrismaService,
  count: number,
  opts: TransactionFactoryOptions & { parentName: string },
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  for (let i = 0; i < count; i++) {
    const tx = await createTransaction(prisma, {
      ...opts,
      isCredit: true,
      payeeName: opts.parentName,
      description: `Payment ${i + 1} from ${opts.parentName}`,
    });
    transactions.push(tx);
  }

  return transactions;
}
