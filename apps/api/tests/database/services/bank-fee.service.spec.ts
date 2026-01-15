/**
 * Bank Fee Service Tests
 * TXN-002: Make Bank Fee Amounts Configurable
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  BankFeeService,
  BankFeeType,
  TransactionType,
  FeeRule,
} from '../../../src/database/services/bank-fee.service';
import { Tenant } from '@prisma/client';
import {
  NotFoundException,
  ValidationException,
} from '../../../src/shared/exceptions';

describe('BankFeeService', () => {
  let service: BankFeeService;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, BankFeeService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<BankFeeService>(BankFeeService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean up test data
    service.clearCache();

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche - Bank Fee',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '+27211234567',
        email: `test-bankfee-${Date.now()}@example.com`,
      },
    });
  });

  afterEach(async () => {
    // Clean up
    if (testTenant) {
      await prisma.tenant
        .delete({ where: { id: testTenant.id } })
        .catch(() => {});
    }
  });

  describe('getConfiguration', () => {
    it('should return default FNB fee configuration for new tenant', async () => {
      const config = await service.getConfiguration(testTenant.id);

      expect(config).toBeDefined();
      expect(config.tenantId).toBe(testTenant.id);
      expect(config.bankName).toBe('FNB');
      expect(config.isEnabled).toBe(true);
      expect(config.feeRules.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        service.getConfiguration('non-existent-tenant-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should cache configuration', async () => {
      const config1 = await service.getConfiguration(testTenant.id);
      const config2 = await service.getConfiguration(testTenant.id);

      expect(config1.updatedAt).toEqual(config2.updatedAt);
    });
  });

  describe('updateConfiguration', () => {
    it('should update bank fee configuration', async () => {
      const updated = await service.updateConfiguration(testTenant.id, {
        bankName: 'Standard Bank',
        isEnabled: false,
      });

      expect(updated.bankName).toBe('Standard Bank');
      expect(updated.isEnabled).toBe(false);
    });

    it('should validate fee rules on update', async () => {
      const invalidRule: FeeRule = {
        feeType: BankFeeType.TRANSACTION_FEE,
        transactionTypes: [], // Invalid - empty array
        fixedAmountCents: 100,
        isActive: true,
      };

      await expect(
        service.updateConfiguration(testTenant.id, {
          feeRules: [invalidRule],
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('addFeeRule', () => {
    it('should add custom fee rule', async () => {
      const newRule: FeeRule = {
        feeType: BankFeeType.TRANSACTION_FEE,
        transactionTypes: [TransactionType.EFT_CREDIT],
        fixedAmountCents: 250,
        percentageRate: 0.001, // 0.1%
        isActive: true,
        description: 'Custom EFT Credit fee',
      };

      const added = await service.addFeeRule(testTenant.id, newRule);

      expect(added.id).toBeDefined();
      expect(added.fixedAmountCents).toBe(250);
      expect(added.percentageRate).toBe(0.001);
    });

    it('should reject negative fee amounts', async () => {
      const invalidRule: FeeRule = {
        feeType: BankFeeType.TRANSACTION_FEE,
        transactionTypes: [TransactionType.CASH_DEPOSIT],
        fixedAmountCents: -100, // Invalid
        isActive: true,
      };

      await expect(
        service.addFeeRule(testTenant.id, invalidRule),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('removeFeeRule', () => {
    it('should remove a fee rule', async () => {
      const newRule: FeeRule = {
        feeType: BankFeeType.ATM_FEE,
        transactionTypes: [TransactionType.ATM_DEPOSIT],
        fixedAmountCents: 1000,
        isActive: true,
      };

      const added = await service.addFeeRule(testTenant.id, newRule);
      await service.removeFeeRule(testTenant.id, added.id!);

      const config = await service.getConfiguration(testTenant.id);
      const found = config.feeRules.find((r) => r.id === added.id);
      expect(found).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      await expect(
        service.removeFeeRule(testTenant.id, 'non-existent-rule'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculateFees', () => {
    it('should calculate fees for ADT deposit', async () => {
      const fees = await service.calculateFees(
        testTenant.id,
        TransactionType.ADT_DEPOSIT,
        50000, // R500
      );

      expect(fees.length).toBeGreaterThan(0);
      expect(fees[0].feeType).toBe(BankFeeType.ADT_DEPOSIT_FEE);
      expect(fees[0].feeAmountCents).toBe(1470); // R14.70
    });

    it('should calculate fees for cash deposit', async () => {
      const fees = await service.calculateFees(
        testTenant.id,
        TransactionType.CASH_DEPOSIT,
        100000, // R1000
      );

      expect(fees.length).toBeGreaterThan(0);
      expect(fees[0].feeAmountCents).toBe(1470); // R14.70
    });

    it('should return empty array when fees disabled', async () => {
      await service.updateConfiguration(testTenant.id, { isEnabled: false });

      const fees = await service.calculateFees(
        testTenant.id,
        TransactionType.CASH_DEPOSIT,
        100000,
      );

      expect(fees).toEqual([]);
    });

    it('should apply percentage rate correctly', async () => {
      const percentageRule: FeeRule = {
        feeType: BankFeeType.TRANSACTION_FEE,
        transactionTypes: [TransactionType.TRANSFER],
        fixedAmountCents: 0,
        percentageRate: 0.01, // 1%
        isActive: true,
      };

      await service.addFeeRule(testTenant.id, percentageRule);

      const fees = await service.calculateFees(
        testTenant.id,
        TransactionType.TRANSFER,
        100000, // R1000
      );

      const percentageFee = fees.find(
        (f) => f.appliedRule.percentageRate === 0.01,
      );
      expect(percentageFee).toBeDefined();
      expect(percentageFee!.feeAmountCents).toBe(1000); // 1% of R1000
    });

    it('should respect minimum amount threshold', async () => {
      const thresholdRule: FeeRule = {
        feeType: BankFeeType.TRANSACTION_FEE,
        transactionTypes: [TransactionType.EFT_CREDIT],
        fixedAmountCents: 500,
        minimumAmountCents: 50000, // Min R500
        isActive: true,
      };

      await service.addFeeRule(testTenant.id, thresholdRule);

      // Below threshold - should not apply
      const belowFees = await service.calculateFees(
        testTenant.id,
        TransactionType.EFT_CREDIT,
        10000, // R100
      );
      const belowThresholdFee = belowFees.find(
        (f) => f.appliedRule.minimumAmountCents === 50000,
      );
      expect(belowThresholdFee).toBeUndefined();

      // Above threshold - should apply
      const aboveFees = await service.calculateFees(
        testTenant.id,
        TransactionType.EFT_CREDIT,
        100000, // R1000
      );
      const aboveThresholdFee = aboveFees.find(
        (f) => f.appliedRule.minimumAmountCents === 50000,
      );
      expect(aboveThresholdFee).toBeDefined();
    });
  });

  describe('detectTransactionType', () => {
    it('should detect ADT deposit from description', () => {
      expect(service.detectTransactionType('ADT Cash Deposit 12345')).toBe(
        TransactionType.ADT_DEPOSIT,
      );

      expect(service.detectTransactionType('ADT DEP John Smith')).toBe(
        TransactionType.ADT_DEPOSIT,
      );
    });

    it('should detect ATM transactions', () => {
      expect(service.detectTransactionType('ATM Deposit Sandton')).toBe(
        TransactionType.ATM_DEPOSIT,
      );

      expect(service.detectTransactionType('ATM Withdrawal Cape Town')).toBe(
        TransactionType.ATM_WITHDRAWAL,
      );
    });

    it('should detect EFT transactions', () => {
      expect(service.detectTransactionType('EFT Credit ABC Company')).toBe(
        TransactionType.EFT_CREDIT,
      );

      expect(service.detectTransactionType('ACB DEBIT Insurance')).toBe(
        TransactionType.EFT_DEBIT,
      );
    });

    it('should detect debit orders', () => {
      expect(service.detectTransactionType('Debit Order - Insurance')).toBe(
        TransactionType.DEBIT_ORDER,
      );

      expect(service.detectTransactionType('MAGTAPE MONTHLY')).toBe(
        TransactionType.DEBIT_ORDER,
      );
    });

    it('should detect card transactions', () => {
      expect(service.detectTransactionType('POS Purchase Woolworths')).toBe(
        TransactionType.CARD_PURCHASE,
      );

      expect(service.detectTransactionType('MASTERCARD *1234')).toBe(
        TransactionType.CARD_PURCHASE,
      );
    });

    it('should return UNKNOWN for unrecognized transactions', () => {
      expect(service.detectTransactionType('Random transaction')).toBe(
        TransactionType.UNKNOWN,
      );
    });
  });

  describe('getTotalFeeForTransaction', () => {
    it('should calculate total fees from description', async () => {
      const totalFee = await service.getTotalFeeForTransaction(
        testTenant.id,
        'ADT Cash Deposit Parent Name',
        50000, // R500
      );

      expect(totalFee).toBe(1470); // R14.70 ADT fee
    });

    it('should return 0 for unknown transaction types', async () => {
      const totalFee = await service.getTotalFeeForTransaction(
        testTenant.id,
        'Unknown transaction type',
        50000,
      );

      expect(totalFee).toBe(0);
    });
  });

  describe('getDefaultFeeRules', () => {
    it('should return FNB defaults', () => {
      const fnbRules = service.getDefaultFeeRules('FNB');
      expect(fnbRules.length).toBeGreaterThan(0);

      const adtRule = fnbRules.find(
        (r) => r.feeType === BankFeeType.ADT_DEPOSIT_FEE,
      );
      expect(adtRule).toBeDefined();
      expect(adtRule!.fixedAmountCents).toBe(1470);
    });

    it('should return generic defaults for unknown banks', () => {
      const genericRules = service.getDefaultFeeRules('Unknown Bank');
      expect(genericRules.length).toBe(1);
      expect(genericRules[0].feeType).toBe(BankFeeType.TRANSACTION_FEE);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific tenant', async () => {
      await service.getConfiguration(testTenant.id);
      service.clearCache(testTenant.id);

      // Should refetch on next call
      const config = await service.getConfiguration(testTenant.id);
      expect(config).toBeDefined();
    });

    it('should clear all cache', async () => {
      await service.getConfiguration(testTenant.id);
      service.clearCache();

      // Should refetch on next call
      const config = await service.getConfiguration(testTenant.id);
      expect(config).toBeDefined();
    });
  });
});
