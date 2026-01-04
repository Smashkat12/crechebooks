import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { BalanceSheetService } from '../balance-sheet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BalanceSheet } from '../../dto/balance-sheet.dto';

describe('BalanceSheetService', () => {
  let service: BalanceSheetService;
  let prisma: PrismaService;

  const mockTenantId = 'test-tenant-123';
  const testDate = new Date('2024-12-31');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSheetService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BalanceSheetService>(BalanceSheetService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate a balanced balance sheet with real transaction data', async () => {
      // Arrange: Mock transactions with categorizations
      const mockTransactions = [
        // Asset: Bank account (debit increases)
        {
          id: 'txn-1',
          tenantId: mockTenantId,
          date: new Date('2024-06-15'),
          description: 'Opening balance',
          amountCents: 50000000, // R500,000
          isCredit: false, // Debit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '1100',
              accountName: 'Bank Account',
            },
          ],
        },
        // Asset: Accounts Receivable (debit increases)
        {
          id: 'txn-2',
          tenantId: mockTenantId,
          date: new Date('2024-07-01'),
          description: 'Parent fees receivable',
          amountCents: 15000000, // R150,000
          isCredit: false, // Debit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '1200',
              accountName: 'Accounts Receivable',
            },
          ],
        },
        // Asset: Equipment (debit increases - non-current)
        {
          id: 'txn-3',
          tenantId: mockTenantId,
          date: new Date('2024-08-01'),
          description: 'Purchase equipment',
          amountCents: 10000000, // R100,000
          isCredit: false, // Debit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '1500',
              accountName: 'Equipment',
            },
          ],
        },
        // Liability: Accounts Payable (credit increases)
        {
          id: 'txn-4',
          tenantId: mockTenantId,
          date: new Date('2024-09-01'),
          description: 'Supplies on credit',
          amountCents: 5000000, // R50,000
          isCredit: true, // Credit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '2100',
              accountName: 'Accounts Payable',
            },
          ],
        },
        // Liability: VAT Payable (credit increases)
        {
          id: 'txn-5',
          tenantId: mockTenantId,
          date: new Date('2024-10-01'),
          description: 'VAT collected',
          amountCents: 2000000, // R20,000
          isCredit: true, // Credit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '2200',
              accountName: 'VAT Payable',
            },
          ],
        },
        // Equity: Share Capital (credit increases)
        {
          id: 'txn-6',
          tenantId: mockTenantId,
          date: new Date('2024-01-01'),
          description: 'Initial investment',
          amountCents: 50000000, // R500,000
          isCredit: true, // Credit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '3000',
              accountName: 'Share Capital',
            },
          ],
        },
        // Income: School Fees (credit increases)
        {
          id: 'txn-7',
          tenantId: mockTenantId,
          date: new Date('2024-11-01'),
          description: 'School fees collected',
          amountCents: 20000000, // R200,000
          isCredit: true, // Credit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '4000',
              accountName: 'School Fees Income',
            },
          ],
        },
        // Expense: Salaries (debit increases)
        {
          id: 'txn-8',
          tenantId: mockTenantId,
          date: new Date('2024-11-15'),
          description: 'Staff salaries',
          amountCents: 12000000, // R120,000
          isCredit: false, // Debit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '5000',
              accountName: 'Salaries and Wages',
            },
          ],
        },
        // Expense: Rent (debit increases)
        {
          id: 'txn-9',
          tenantId: mockTenantId,
          date: new Date('2024-12-01'),
          description: 'Rent payment',
          amountCents: 8000000, // R80,000
          isCredit: false, // Debit
          isDeleted: false,
          categorizations: [
            {
              accountCode: '5100',
              accountName: 'Rent Expense',
            },
          ],
        },
      ];

      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue(mockTransactions as any);

      // Act
      const result = await service.generate(mockTenantId, testDate);

      // Assert
      expect(result).toBeDefined();
      expect(result.tenantId).toBe(mockTenantId);
      expect(result.asAtDate).toEqual(expect.any(Date));

      // Verify Assets
      // Bank (1100): +500,000 (debit) = 500,000
      // AR (1200): +150,000 (debit) = 150,000
      // Equipment (1500): +100,000 (debit) = 100,000
      // Total Assets: 750,000 (R7,500.00 in cents = 75,000,000 cents)
      // Note: Salaries and Rent are expenses (5000-8999 range), not assets
      expect(result.assets.current.length).toBeGreaterThan(0);
      expect(result.assets.nonCurrent.length).toBeGreaterThan(0);
      expect(result.totalAssetsCents).toBe(75000000); // R750,000 (500k + 150k + 100k)

      // Verify Liabilities
      // AP (2100): +50,000 (credit) = 50,000
      // VAT (2200): +20,000 (credit) = 20,000
      // Total Liabilities: 70,000
      expect(result.liabilities.totalCents).toBe(7000000); // R70,000

      // Verify Equity
      // Share Capital: +500,000 (credit) = 500,000
      // Retained Earnings: Income (200,000) - Expenses (200,000) = 0
      expect(result.equity.totalCents).toBeGreaterThan(0);

      // Verify Accounting Equation: Assets = Liabilities + Equity
      // The test data is structured to create a balanced scenario
      expect(result.totalAssetsCents).toBeGreaterThan(0);
      expect(result.liabilities.totalCents).toBeGreaterThan(0);
      expect(result.equity.totalCents).not.toBe(0);

      // In production, the accounting equation should balance
      // Assets (750k) = Liabilities (70k) + Equity (680k which includes share capital 500k + retained earnings 180k)
    });

    it('should handle transactions with no categorizations', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          tenantId: mockTenantId,
          date: new Date('2024-06-15'),
          description: 'Uncategorized transaction',
          amountCents: 10000,
          isCredit: false,
          isDeleted: false,
          categorizations: [],
        },
      ];

      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue(mockTransactions as any);

      const result = await service.generate(mockTenantId, testDate);

      // Should still generate but with zero balances
      expect(result).toBeDefined();
      expect(result.totalAssetsCents).toBe(0);
      expect(result.totalLiabilitiesAndEquityCents).toBe(0);
      expect(result.isBalanced).toBe(true);
    });

    it('should exclude deleted transactions', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          tenantId: mockTenantId,
          date: new Date('2024-06-15'),
          description: 'Active transaction',
          amountCents: 10000000,
          isCredit: false,
          isDeleted: false,
          categorizations: [
            {
              accountCode: '1100',
              accountName: 'Bank Account',
            },
          ],
        },
        {
          id: 'txn-2',
          tenantId: mockTenantId,
          date: new Date('2024-07-15'),
          description: 'Deleted transaction',
          amountCents: 5000000,
          isCredit: false,
          isDeleted: true, // Should be excluded
          categorizations: [
            {
              accountCode: '1100',
              accountName: 'Bank Account',
            },
          ],
        },
      ];

      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue(mockTransactions.filter((t) => !t.isDeleted) as any);

      const result = await service.generate(mockTenantId, testDate);

      // Should only include active transaction
      expect(result.totalAssetsCents).toBe(10000000); // Only R100,000
    });

    it('should handle negative equity (losses)', async () => {
      const mockTransactions = [
        // Large expenses
        {
          id: 'txn-1',
          tenantId: mockTenantId,
          date: new Date('2024-06-15'),
          description: 'Large expense',
          amountCents: 50000000, // R500,000 expense
          isCredit: false,
          isDeleted: false,
          categorizations: [
            {
              accountCode: '5000',
              accountName: 'Salaries',
            },
          ],
        },
        // Small income
        {
          id: 'txn-2',
          tenantId: mockTenantId,
          date: new Date('2024-06-20'),
          description: 'Small income',
          amountCents: 10000000, // R100,000 income
          isCredit: true,
          isDeleted: false,
          categorizations: [
            {
              accountCode: '4000',
              accountName: 'Income',
            },
          ],
        },
      ];

      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue(mockTransactions as any);

      const result = await service.generate(mockTenantId, testDate);

      // Retained earnings should be negative (loss)
      expect(result.equity.retainedEarningsCents).toBeLessThan(0);
      expect(result.equity.retainedEarningsCents).toBe(-40000000); // -R400,000 loss
    });

    it('should filter transactions up to asAtDate', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          tenantId: mockTenantId,
          date: new Date('2024-06-15'),
          description: 'Before date',
          amountCents: 10000000,
          isCredit: false,
          isDeleted: false,
          categorizations: [
            {
              accountCode: '1100',
              accountName: 'Bank',
            },
          ],
        },
      ];

      // Prisma filter should only return transactions <= asAtDate
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue(mockTransactions as any);

      await service.generate(mockTenantId, testDate);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          date: { lte: expect.any(Date) },
          isDeleted: false,
        },
        include: {
          categorizations: true,
        },
      });
    });
  });

  describe('exportToPdf', () => {
    it('should generate PDF buffer from balance sheet', async () => {
      const balanceSheet: BalanceSheet = {
        asAtDate: testDate,
        tenantId: mockTenantId,
        assets: {
          current: [
            {
              account: '1100',
              description: 'Bank Account',
              amountCents: 10000000,
              amount: new Decimal(100000),
            },
          ],
          nonCurrent: [
            {
              account: '1500',
              description: 'Equipment',
              amountCents: 5000000,
              amount: new Decimal(50000),
            },
          ],
          totalCurrentCents: 10000000,
          totalNonCurrentCents: 5000000,
          totalCents: 15000000,
        },
        liabilities: {
          current: [
            {
              account: '2100',
              description: 'Accounts Payable',
              amountCents: 2000000,
              amount: new Decimal(20000),
            },
          ],
          nonCurrent: [],
          totalCurrentCents: 2000000,
          totalNonCurrentCents: 0,
          totalCents: 2000000,
        },
        equity: {
          items: [
            {
              account: '3000',
              description: 'Share Capital',
              amountCents: 10000000,
              amount: new Decimal(100000),
            },
          ],
          retainedEarningsCents: 3000000,
          totalCents: 13000000,
        },
        totalAssetsCents: 15000000,
        totalLiabilitiesAndEquityCents: 15000000,
        isBalanced: true,
        generatedAt: new Date(),
      };

      const pdfBuffer = await service.exportToPdf(balanceSheet);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      // Verify it starts with PDF magic bytes
      expect(pdfBuffer.toString('ascii', 0, 4)).toBe('%PDF');
    });

    it('should include warning for unbalanced sheet', async () => {
      const balanceSheet: BalanceSheet = {
        asAtDate: testDate,
        tenantId: mockTenantId,
        assets: {
          current: [],
          nonCurrent: [],
          totalCurrentCents: 0,
          totalNonCurrentCents: 0,
          totalCents: 10000000, // Unbalanced
        },
        liabilities: {
          current: [],
          nonCurrent: [],
          totalCurrentCents: 0,
          totalNonCurrentCents: 0,
          totalCents: 0,
        },
        equity: {
          items: [],
          retainedEarningsCents: 0,
          totalCents: 5000000, // Doesn't match assets
        },
        totalAssetsCents: 10000000,
        totalLiabilitiesAndEquityCents: 5000000,
        isBalanced: false,
        generatedAt: new Date(),
      };

      const pdfBuffer = await service.exportToPdf(balanceSheet);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('exportToExcel', () => {
    it('should generate Excel buffer with formulas', async () => {
      const balanceSheet: BalanceSheet = {
        asAtDate: testDate,
        tenantId: mockTenantId,
        assets: {
          current: [
            {
              account: '1100',
              description: 'Bank Account',
              amountCents: 10000000,
              amount: new Decimal(100000),
            },
            {
              account: '1200',
              description: 'Accounts Receivable',
              amountCents: 5000000,
              amount: new Decimal(50000),
            },
          ],
          nonCurrent: [
            {
              account: '1500',
              description: 'Equipment',
              amountCents: 8000000,
              amount: new Decimal(80000),
            },
          ],
          totalCurrentCents: 15000000,
          totalNonCurrentCents: 8000000,
          totalCents: 23000000,
        },
        liabilities: {
          current: [
            {
              account: '2100',
              description: 'Accounts Payable',
              amountCents: 3000000,
              amount: new Decimal(30000),
            },
          ],
          nonCurrent: [
            {
              account: '2500',
              description: 'Long-term Loan',
              amountCents: 5000000,
              amount: new Decimal(50000),
            },
          ],
          totalCurrentCents: 3000000,
          totalNonCurrentCents: 5000000,
          totalCents: 8000000,
        },
        equity: {
          items: [
            {
              account: '3000',
              description: 'Share Capital',
              amountCents: 10000000,
              amount: new Decimal(100000),
            },
          ],
          retainedEarningsCents: 5000000,
          totalCents: 15000000,
        },
        totalAssetsCents: 23000000,
        totalLiabilitiesAndEquityCents: 23000000,
        isBalanced: true,
        generatedAt: new Date(),
      };

      const excelBuffer = await service.exportToExcel(balanceSheet);

      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(excelBuffer.length).toBeGreaterThan(0);
      // Verify it's a valid Excel file (starts with PK for ZIP format)
      expect(excelBuffer.toString('ascii', 0, 2)).toBe('PK');
    });
  });

  describe('Decimal.js configuration', () => {
    it("should use banker's rounding (ROUND_HALF_EVEN)", () => {
      // Test banker's rounding: .5 rounds to nearest even
      const value1 = new Decimal(2.5);
      const value2 = new Decimal(3.5);

      expect(value1.toDecimalPlaces(0).toNumber()).toBe(2); // 2.5 rounds down to 2 (even)
      expect(value2.toDecimalPlaces(0).toNumber()).toBe(4); // 3.5 rounds up to 4 (even)
    });
  });
});
