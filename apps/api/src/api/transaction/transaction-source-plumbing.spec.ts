/**
 * Transaction categorizer source field plumbing tests
 *
 * Asserts that the agent's fine-grained `source` values ('PATTERN', 'FALLBACK',
 * 'HISTORICAL', 'LLM') flow through the service's `CategorizationItemResult`
 * and reach the `results[].source` field on the HTTP response built by
 * `TransactionController.batchCategorize()`.
 *
 * We mock `CategorizationService.categorizeTransactions` to return controlled
 * results (including `agentSource`) and verify the controller maps them to the
 * wire correctly.
 */

import { TransactionController } from './transaction.controller';
import { CategorizationService } from '../../database/services/categorization.service';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { TransactionImportService } from '../../database/services/transaction-import.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CategorizationSource } from '../../database/entities/categorization.entity';
import type { IUser } from '../../database/entities/user.entity';
import type { BatchCategorizeRequestDto } from './dto/batch-categorize.dto';
import type { CategorizationBatchResult } from '../../database/dto/categorization-service.dto';

const makeUser = (): IUser =>
  ({
    id: 'user-001',
    tenantId: 'tenant-001',
    tenantRoles: [{ tenantId: 'tenant-001', role: 'OWNER' }],
  }) as unknown as IUser;

const makeBatchResult = (
  agentSource: 'PATTERN' | 'HISTORICAL' | 'FALLBACK' | 'LLM',
): CategorizationBatchResult => ({
  totalProcessed: 1,
  autoCategorized: 1,
  reviewRequired: 0,
  failed: 0,
  results: [
    {
      transactionId: 'tx-001',
      status: 'AUTO_APPLIED',
      accountCode: '5100',
      accountName: 'Groceries & Supplies',
      confidenceScore: 85,
      source: CategorizationSource.AI_AUTO,
      agentSource,
    },
  ],
  statistics: { avgConfidence: 85, patternMatchRate: 0 },
});

describe('TransactionController — source field plumbing (batch)', () => {
  let controller: TransactionController;
  let categorizationServiceMock: jest.Mocked<
    Pick<CategorizationService, 'categorizeTransactions'>
  >;
  let transactionRepoMock: jest.Mocked<
    Pick<TransactionRepository, 'findByTenant'>
  >;

  beforeEach(() => {
    categorizationServiceMock = {
      categorizeTransactions: jest.fn(),
    };

    // findByTenant returns empty so controller uses the dto ids directly
    transactionRepoMock = {
      findByTenant: jest.fn().mockResolvedValue({
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      }),
    };

    controller = new TransactionController(
      transactionRepoMock as unknown as TransactionRepository,
      {} as unknown as CategorizationRepository,
      {} as unknown as InvoiceRepository,
      {} as unknown as TransactionImportService,
      categorizationServiceMock as unknown as CategorizationService,
      {} as unknown as PaymentAllocationService,
      {} as unknown as PrismaService,
    );
  });

  it('Test 1: agentSource "FALLBACK" flows to results[].source', async () => {
    categorizationServiceMock.categorizeTransactions.mockResolvedValue(
      makeBatchResult('FALLBACK'),
    );

    const dto: BatchCategorizeRequestDto = { transaction_ids: ['tx-001'] };
    const result = await controller.batchCategorize(dto, makeUser());

    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].source).toBe('FALLBACK');
  });

  it('Test 2: agentSource "PATTERN" flows to results[].source', async () => {
    categorizationServiceMock.categorizeTransactions.mockResolvedValue(
      makeBatchResult('PATTERN'),
    );

    const dto: BatchCategorizeRequestDto = { transaction_ids: ['tx-001'] };
    const result = await controller.batchCategorize(dto, makeUser());

    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].source).toBe('PATTERN');
  });

  it('Test 3: agentSource "LLM" flows to results[].source', async () => {
    categorizationServiceMock.categorizeTransactions.mockResolvedValue(
      makeBatchResult('LLM'),
    );

    const dto: BatchCategorizeRequestDto = { transaction_ids: ['tx-001'] };
    const result = await controller.batchCategorize(dto, makeUser());

    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].source).toBe('LLM');
  });

  it('Test 4: when agentSource is absent, DB source value is used', async () => {
    const resultNoAgent: CategorizationBatchResult = {
      totalProcessed: 1,
      autoCategorized: 1,
      reviewRequired: 0,
      failed: 0,
      results: [
        {
          transactionId: 'tx-001',
          status: 'AUTO_APPLIED',
          accountCode: '5100',
          accountName: 'Groceries & Supplies',
          confidenceScore: 90,
          source: CategorizationSource.RULE_BASED,
          // agentSource deliberately absent
        },
      ],
      statistics: { avgConfidence: 90, patternMatchRate: 100 },
    };
    categorizationServiceMock.categorizeTransactions.mockResolvedValue(
      resultNoAgent,
    );

    const dto: BatchCategorizeRequestDto = { transaction_ids: ['tx-001'] };
    const result = await controller.batchCategorize(dto, makeUser());

    expect(result.data.results[0].source).toBe(CategorizationSource.RULE_BASED);
  });
});
