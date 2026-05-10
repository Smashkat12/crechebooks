/**
 * Regression test for TransactionRepository.updateCategorization.
 *
 * Bug: the categorize service used to call updateStatus, which only wrote
 * the status column. xero_account_code stayed NULL even after a transaction
 * was categorised, so the income statement / GL / trial balance never saw
 * the categorisation. updateCategorization writes both fields together.
 */
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';

interface FakePrismaTx {
  findFirst: jest.Mock;
  update: jest.Mock;
}

function makeFakePrisma(): { transaction: FakePrismaTx } {
  return {
    transaction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('TransactionRepository.updateCategorization', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const TX = '22222222-2222-2222-2222-222222222222';

  it('writes both status AND xero_account_code in a single update', async () => {
    const fake = makeFakePrisma();
    fake.transaction.findFirst.mockResolvedValue({
      id: TX,
      tenantId: TENANT,
      isDeleted: false,
    });
    fake.transaction.update.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: TX, ...(data as object) }),
    );

    const repo = new TransactionRepository(
      fake as unknown as ConstructorParameters<typeof TransactionRepository>[0],
      {} as unknown as ConstructorParameters<typeof TransactionRepository>[1],
    );

    const result = await repo.updateCategorization(
      TENANT,
      TX,
      'CATEGORIZED',
      '4110',
    );

    expect(fake.transaction.update).toHaveBeenCalledWith({
      where: { id: TX },
      data: { status: 'CATEGORIZED', xeroAccountCode: '4110' },
    });
    expect(result).toEqual(
      expect.objectContaining({ status: 'CATEGORIZED', xeroAccountCode: '4110' }),
    );
  });

  it('passes null xero_account_code through for split categorisations', async () => {
    const fake = makeFakePrisma();
    fake.transaction.findFirst.mockResolvedValue({
      id: TX,
      tenantId: TENANT,
      isDeleted: false,
    });
    fake.transaction.update.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: TX, ...(data as object) }),
    );

    const repo = new TransactionRepository(
      fake as unknown as ConstructorParameters<typeof TransactionRepository>[0],
      {} as unknown as ConstructorParameters<typeof TransactionRepository>[1],
    );

    await repo.updateCategorization(TENANT, TX, 'CATEGORIZED', null);

    expect(fake.transaction.update).toHaveBeenCalledWith({
      where: { id: TX },
      data: { status: 'CATEGORIZED', xeroAccountCode: null },
    });
  });

  it('throws NotFoundException when transaction does not belong to tenant', async () => {
    const fake = makeFakePrisma();
    fake.transaction.findFirst.mockResolvedValue(null);

    const repo = new TransactionRepository(
      fake as unknown as ConstructorParameters<typeof TransactionRepository>[0],
      {} as unknown as ConstructorParameters<typeof TransactionRepository>[1],
    );

    await expect(
      repo.updateCategorization(TENANT, TX, 'CATEGORIZED', '4110'),
    ).rejects.toThrow(/not found/i);
    expect(fake.transaction.update).not.toHaveBeenCalled();
  });
});
