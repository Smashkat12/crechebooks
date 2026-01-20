/**
 * Bank Import Stream Service Tests
 * TASK-PERF-103: Stream-based CSV import
 *
 * Tests streaming CSV parsing with:
 * - Real CSV test data (not mocks)
 * - Batch accumulation
 * - Progress reporting
 * - Error handling for malformed rows
 * - Cancellation via AbortSignal
 */
import { Readable } from 'stream';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import {
  BankImportStreamService,
  StreamImportOptions,
  ImportProgress,
  BatchWriteResult,
} from '../bank-import-stream.service';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { Transaction } from '@prisma/client';

// Helper to create a readable stream from a string
function stringToStream(str: string): Readable {
  const stream = new Readable();
  stream.push(str);
  stream.push(null);
  return stream;
}

// Helper to collect all values from an async generator
async function collectGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

// Helper to get the last value from an async generator
async function getLastValue<T>(gen: AsyncGenerator<T>): Promise<T | undefined> {
  let lastValue: T | undefined;
  for await (const item of gen) {
    lastValue = item;
  }
  return lastValue;
}

describe('BankImportStreamService', () => {
  let service: BankImportStreamService;
  let transactionRepo: jest.Mocked<TransactionRepository>;

  // Sample CSV data for testing (amounts in Rands, will be converted to cents)
  const sampleCSV = `date,description,payee_name,reference,amount,is_credit
2024-01-05,WOOLWORTHS SANDTON,WOOLWORTHS,POS001,450.00,false
2024-01-06,SALARY PAYMENT ABC CORP,ABC CORP,SAL-2024-01,50000.00,true
2024-01-07,CHECKERS ROSEBANK,CHECKERS,POS002,320.00,false
2024-01-08,BANK CHARGES,FNB,BC001,150.00,false
2024-01-09,PICK N PAY HYDE PARK,PICK N PAY,POS003,280.00,false`;

  // CSV with malformed rows
  const csvWithErrors = `date,description,payee_name,reference,amount,is_credit
2024-01-05,WOOLWORTHS SANDTON,WOOLWORTHS,POS001,45000,false
invalid_date,INVALID ROW,VENDOR,REF,1000,false
2024-01-07,CHECKERS ROSEBANK,CHECKERS,POS002,32000,false
2024-01-08,,FNB,BC001,15000,false
2024-01-09,PICK N PAY HYDE PARK,PICK N PAY,POS003,28000,false`;

  // CSV with different column formats (amounts in Rands)
  const csvWithDebitCredit = `date,description,reference,debit,credit
2024-01-05,WOOLWORTHS SANDTON,POS001,450.00,
2024-01-06,SALARY PAYMENT,SAL-2024-01,,50000.00
2024-01-07,CHECKERS ROSEBANK,POS002,320.00,`;

  beforeEach(async () => {
    // Create mock repository
    const mockCreateMany = jest
      .fn()
      .mockImplementation(async (dtos: unknown[]) => {
        // Simulate successful creation
        return (
          dtos as Array<{
            tenantId: string;
            bankAccount: string;
            date: Date;
            description: string;
            payeeName?: string;
            reference?: string;
            amountCents: number;
            isCredit: boolean;
            source: string;
            importBatchId: string;
          }>
        ).map(
          (dto, index) =>
            ({
              id: `tx-${index}`,
              ...dto,
              createdAt: new Date(),
              updatedAt: new Date(),
              xeroTransactionId: null,
              status: 'PENDING',
              isReconciled: false,
              reconciledAt: null,
              isDeleted: false,
              deletedAt: null,
              isReversal: false,
              reversesTransactionId: null,
            }) as Transaction,
        );
      });

    transactionRepo = {
      createMany: mockCreateMany,
    } as unknown as jest.Mocked<TransactionRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankImportStreamService,
        {
          provide: TransactionRepository,
          useValue: transactionRepo,
        },
      ],
    }).compile();

    service = module.get<BankImportStreamService>(BankImportStreamService);
  });

  describe('parseCSVStreamSafe', () => {
    it('should parse valid CSV rows as transactions', async () => {
      const stream = stringToStream(sampleCSV);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      // Filter out errors
      const transactions = results.filter(
        (
          r,
        ): r is {
          transaction: {
            date: Date;
            description: string;
            amountCents: number;
            isCredit: boolean;
            payeeName: string | null;
            reference: string | null;
          };
          rowNumber: number;
        } => 'transaction' in r,
      );

      expect(transactions).toHaveLength(5);
      expect(transactions[0].transaction.description).toBe(
        'WOOLWORTHS SANDTON',
      );
      expect(transactions[0].transaction.amountCents).toBe(45000); // R450.00 = 45000 cents
      expect(transactions[0].transaction.isCredit).toBe(false);
      expect(transactions[0].rowNumber).toBe(2);

      expect(transactions[1].transaction.description).toBe(
        'SALARY PAYMENT ABC CORP',
      );
      expect(transactions[1].transaction.amountCents).toBe(5000000); // R50000.00 = 5000000 cents
      expect(transactions[1].transaction.isCredit).toBe(true);
    });

    it('should handle malformed rows as errors', async () => {
      const stream = stringToStream(csvWithErrors);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter((r) => 'transaction' in r);
      const errors = results.filter((r) => 'error' in r);

      // 3 valid rows, 2 errors (invalid date, missing description)
      expect(transactions).toHaveLength(3);
      expect(errors).toHaveLength(2);
    });

    it('should parse CSV with separate debit/credit columns', async () => {
      const stream = stringToStream(csvWithDebitCredit);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter(
        (
          r,
        ): r is {
          transaction: {
            date: Date;
            description: string;
            amountCents: number;
            isCredit: boolean;
            payeeName: string | null;
            reference: string | null;
          };
          rowNumber: number;
        } => 'transaction' in r,
      );

      expect(transactions).toHaveLength(3);
      expect(transactions[0].transaction.isCredit).toBe(false); // Debit
      expect(transactions[0].transaction.amountCents).toBe(45000); // R450.00 = 45000 cents
      expect(transactions[1].transaction.isCredit).toBe(true); // Credit
      expect(transactions[1].transaction.amountCents).toBe(5000000); // R50000.00 = 5000000 cents
    });

    it('should correct fee transactions marked as credit', async () => {
      const csvWithWrongFee = `date,description,reference,amount,is_credit
2024-01-08,BANK CHARGES,BC001,15000,true
2024-01-09,SERVICE FEE,SF001,5000,true`;

      const stream = stringToStream(csvWithWrongFee);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter(
        (
          r,
        ): r is {
          transaction: {
            date: Date;
            description: string;
            amountCents: number;
            isCredit: boolean;
            payeeName: string | null;
            reference: string | null;
          };
          rowNumber: number;
        } => 'transaction' in r,
      );

      // Both fee transactions should be corrected to debit (isCredit: false)
      expect(transactions).toHaveLength(2);
      expect(transactions[0].transaction.isCredit).toBe(false);
      expect(transactions[1].transaction.isCredit).toBe(false);
    });
  });

  describe('processBatches', () => {
    it('should accumulate rows and flush in batches', async () => {
      const stream = stringToStream(sampleCSV);
      const rows = service.parseCSVStreamSafe(stream);
      const batches = await collectGenerator(
        service.processBatches(rows, 'tenant-1', 'account-1', 'batch-1', 2),
      );

      // 5 rows with batch size 2 = 3 batches (2, 2, 1)
      expect(batches).toHaveLength(3);
      expect(batches[0].imported).toBe(2);
      expect(batches[1].imported).toBe(2);
      expect(batches[2].imported).toBe(1);
    });

    it('should include errors from parsing in batch results', async () => {
      const stream = stringToStream(csvWithErrors);
      const rows = service.parseCSVStreamSafe(stream);
      const batches = await collectGenerator(
        service.processBatches(rows, 'tenant-1', 'account-1', 'batch-1', 10),
      );

      // All in one batch
      expect(batches).toHaveLength(1);
      expect(batches[0].imported).toBe(3); // 3 valid rows
      expect(batches[0].errors).toHaveLength(2); // 2 parsing errors
    });

    it('should handle empty input', async () => {
      const emptyCSV = `date,description,reference,amount,is_credit`;
      const stream = stringToStream(emptyCSV);
      const rows = service.parseCSVStreamSafe(stream);
      const batches = await collectGenerator(
        service.processBatches(rows, 'tenant-1', 'account-1', 'batch-1', 10),
      );

      expect(batches).toHaveLength(0);
    });
  });

  describe('importFromStream', () => {
    it('should emit progress updates during import', async () => {
      const stream = stringToStream(sampleCSV);
      const options: StreamImportOptions = {
        batchSize: 2,
        progressInterval: 2,
      };

      const progressUpdates = await collectGenerator(
        service.importFromStream(stream, 'account-1', 'tenant-1', options),
      );

      // Should have at least one progress update and final completed status
      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);

      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate.status).toBe('completed');
      expect(finalUpdate.importedCount).toBe(5);
      expect(finalUpdate.processedRows).toBe(5);
      expect(finalUpdate.importBatchId).toBeDefined();
    });

    it('should support cancellation via AbortSignal', async () => {
      // Create a larger CSV for testing cancellation
      const largeCSV = [
        'date,description,reference,amount,is_credit',
        ...Array.from(
          { length: 100 },
          (_, i) =>
            `2024-01-${String((i % 28) + 1).padStart(2, '0')},Transaction ${i},REF${i},${(i + 1) * 1000},false`,
        ),
      ].join('\n');

      const abortController = new AbortController();
      const stream = stringToStream(largeCSV);
      const options: StreamImportOptions = {
        batchSize: 5,
        progressInterval: 10,
        signal: abortController.signal,
      };

      // Abort after first batch
      let batchCount = 0;
      const progressUpdates: ImportProgress[] = [];
      for await (const update of service.importFromStream(
        stream,
        'account-1',
        'tenant-1',
        options,
      )) {
        progressUpdates.push(update);
        batchCount++;
        if (batchCount >= 2) {
          abortController.abort();
        }
      }

      // Should have received cancellation status
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.status).toBe('cancelled');
      expect(lastUpdate.processedRows).toBeLessThan(100);
    });

    it('should handle repository errors gracefully', async () => {
      transactionRepo.createMany.mockRejectedValueOnce(
        new Error('Database error'),
      );

      const stream = stringToStream(sampleCSV);
      const finalUpdate = await getLastValue(
        service.importFromStream(stream, 'account-1', 'tenant-1', {
          batchSize: 10,
        }),
      );

      expect(finalUpdate?.status).toBe('completed'); // Continues despite batch failure
      expect(finalUpdate?.errors?.length).toBeGreaterThan(0);
    });

    it('should enforce tenant isolation in database writes', async () => {
      const stream = stringToStream(sampleCSV);
      await getLastValue(
        service.importFromStream(stream, 'account-1', 'tenant-specific-id', {
          batchSize: 10,
        }),
      );

      expect(transactionRepo.createMany).toHaveBeenCalled();
      const createManyCall = transactionRepo.createMany.mock.calls[0][0];

      // All DTOs should have the correct tenantId
      expect(
        createManyCall.every(
          (dto: { tenantId: string }) => dto.tenantId === 'tenant-specific-id',
        ),
      ).toBe(true);
    });
  });

  describe('writeBatch', () => {
    it('should create transactions with correct DTOs', async () => {
      const transactions = [
        {
          date: new Date('2024-01-05'),
          description: 'Test Transaction',
          payeeName: 'Test Payee',
          reference: 'REF001',
          amountCents: 10000,
          isCredit: false,
        },
      ];

      const result = await service.writeBatch(
        transactions,
        'tenant-1',
        'account-1',
        'batch-1',
      );

      expect(result.imported).toBe(1);
      expect(transactionRepo.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          tenantId: 'tenant-1',
          bankAccount: 'account-1',
          importBatchId: 'batch-1',
          description: 'Test Transaction',
          amountCents: 10000,
          source: 'CSV_IMPORT',
        }),
      ]);
    });

    it('should return error result on repository failure', async () => {
      transactionRepo.createMany.mockRejectedValueOnce(new Error('DB Error'));

      const result = await service.writeBatch(
        [
          {
            date: new Date(),
            description: 'Test',
            payeeName: null,
            reference: null,
            amountCents: 1000,
            isCredit: false,
          },
        ],
        'tenant-1',
        'account-1',
        'batch-1',
      );

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle empty transaction array', async () => {
      const result = await service.writeBatch(
        [],
        'tenant-1',
        'account-1',
        'batch-1',
      );

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(transactionRepo.createMany).not.toHaveBeenCalled();
    });
  });

  describe('integration with real test fixture', () => {
    it('should import from real test CSV file', async () => {
      const fixturesPath = path.join(
        __dirname,
        '../../../../tests/fixtures/bank-statements/test-statement.csv',
      );

      // Skip if fixture doesn't exist
      if (!fs.existsSync(fixturesPath)) {
        console.log('Skipping: test fixture not found at', fixturesPath);
        return;
      }

      const fileStream = fs.createReadStream(fixturesPath);
      const finalUpdate = await getLastValue(
        service.importFromStream(fileStream, 'account-1', 'tenant-1', {
          batchSize: 25,
          progressInterval: 50,
        }),
      );

      expect(finalUpdate?.status).toBe('completed');
      expect(finalUpdate?.importedCount).toBeGreaterThan(0);
      expect(finalUpdate?.errorCount).toBe(0);
    });
  });

  describe('memory efficiency', () => {
    it('should process large files without memory issues', async () => {
      // Generate a large CSV (1000 rows) to test streaming
      const rows = ['date,description,reference,amount,is_credit'];
      for (let i = 0; i < 1000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
        rows.push(
          `2024-${month}-${day},Transaction ${i},REF${i},${(i + 1) * 100},${i % 2 === 0}`,
        );
      }

      const largeCSV = rows.join('\n');
      const stream = stringToStream(largeCSV);

      // Track memory before
      const memBefore = process.memoryUsage().heapUsed;

      const finalUpdate = await getLastValue(
        service.importFromStream(stream, 'account-1', 'tenant-1', {
          batchSize: 50,
          progressInterval: 200,
        }),
      );

      // Track memory after
      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = (memAfter - memBefore) / 1024 / 1024; // MB

      expect(finalUpdate?.status).toBe('completed');
      expect(finalUpdate?.importedCount).toBe(1000);

      // Memory increase should be reasonable (less than 50MB for 1000 rows)
      // Note: This is a rough check, actual memory depends on runtime
      expect(memDiff).toBeLessThan(50);
    });
  });

  describe('edge cases', () => {
    it('should handle CSV with only headers', async () => {
      const csvOnlyHeaders = 'date,description,reference,amount,is_credit';
      const stream = stringToStream(csvOnlyHeaders);

      const finalUpdate = await getLastValue(
        service.importFromStream(stream, 'account-1', 'tenant-1'),
      );

      expect(finalUpdate?.status).toBe('completed');
      expect(finalUpdate?.importedCount).toBe(0);
      expect(finalUpdate?.processedRows).toBe(0);
    });

    it('should handle CSV with various date formats', async () => {
      const csvWithDates = `date,description,reference,amount,is_credit
2024-01-15,ISO Date,REF1,1000,false
15/01/2024,SA Date,REF2,2000,false
15-01-2024,Dash Date,REF3,3000,false`;

      const stream = stringToStream(csvWithDates);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter((r) => 'transaction' in r);
      expect(transactions).toHaveLength(3);
    });

    it('should handle CSV with currency symbols', async () => {
      const csvWithCurrency = `date,description,reference,amount,is_credit
2024-01-15,With R,REF1,R1000.00,false
2024-01-16,With Space,REF2,R 2000.00,false
2024-01-17,Negative,REF3,-R3000.00,false`;

      const stream = stringToStream(csvWithCurrency);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter(
        (r): r is { transaction: { amountCents: number }; rowNumber: number } =>
          'transaction' in r,
      );

      expect(transactions).toHaveLength(3);
      expect(transactions[0].transaction.amountCents).toBe(100000);
      expect(transactions[1].transaction.amountCents).toBe(200000);
      expect(transactions[2].transaction.amountCents).toBe(300000);
    });

    it('should handle CSV with type column', async () => {
      const csvWithType = `date,description,reference,amount,type
2024-01-15,Debit TX,REF1,1000,Debit
2024-01-16,Credit TX,REF2,2000,Credit
2024-01-17,DR TX,REF3,3000,DR
2024-01-18,CR TX,REF4,4000,CR`;

      const stream = stringToStream(csvWithType);
      const results = await collectGenerator(
        service.parseCSVStreamSafe(stream),
      );

      const transactions = results.filter(
        (r): r is { transaction: { isCredit: boolean }; rowNumber: number } =>
          'transaction' in r,
      );

      expect(transactions).toHaveLength(4);
      expect(transactions[0].transaction.isCredit).toBe(false);
      expect(transactions[1].transaction.isCredit).toBe(true);
      expect(transactions[2].transaction.isCredit).toBe(false);
      expect(transactions[3].transaction.isCredit).toBe(true);
    });
  });
});
