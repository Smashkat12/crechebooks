import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import {
  CreateCategorizationDto,
  ReviewCategorizationDto,
} from '../../../src/database/dto/categorization.dto';
import {
  VatType,
  CategorizationSource,
} from '../../../src/database/entities/categorization.entity';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';
import { Tenant, User, Transaction } from '@prisma/client';

describe('CategorizationRepository', () => {
  let repository: CategorizationRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;
  let testTransaction: Transaction;

  // Real test data - South African creche categorization
  const testCategorizationData: CreateCategorizationDto = {
    transactionId: '', // Will be set in beforeEach
    accountCode: '4100',
    accountName: 'Fee Income',
    confidenceScore: 95.5,
    reasoning: 'Matched payee pattern SMITH with high confidence',
    source: CategorizationSource.AI_AUTO,
    isSplit: false,
    vatType: VatType.EXEMPT,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, CategorizationRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<CategorizationRepository>(CategorizationRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    // Create test user (for reviewer)
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|test${Date.now()}`,
        email: `user${Date.now()}@test.co.za`,
        name: 'Test Reviewer',
        role: 'ADMIN',
      },
    });

    // Create test transaction
    testTransaction = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB Cheque',
        date: new Date('2024-01-15'),
        description: 'EFT PAYMENT: SMITH J - Monthly Fees',
        payeeName: 'SMITH J',
        amountCents: 250000, // R2,500.00
        isCredit: true,
        source: ImportSource.BANK_FEED,
      },
    });

    // Update test data with the created transaction ID
    testCategorizationData.transactionId = testTransaction.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a categorization with all fields', async () => {
      const categorization = await repository.create(testCategorizationData);

      expect(categorization.id).toBeDefined();
      expect(categorization.transactionId).toBe(testTransaction.id);
      expect(categorization.accountCode).toBe(testCategorizationData.accountCode);
      expect(categorization.accountName).toBe(testCategorizationData.accountName);
      expect(Number(categorization.confidenceScore)).toBeCloseTo(95.5, 1);
      expect(categorization.reasoning).toBe(testCategorizationData.reasoning);
      expect(categorization.source).toBe(CategorizationSource.AI_AUTO);
      expect(categorization.isSplit).toBe(false);
      expect(categorization.splitAmountCents).toBeNull();
      expect(categorization.vatAmountCents).toBeNull();
      expect(categorization.vatType).toBe(VatType.EXEMPT);
      expect(categorization.reviewedBy).toBeNull();
      expect(categorization.reviewedAt).toBeNull();
      expect(categorization.createdAt).toBeInstanceOf(Date);
      expect(categorization.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a categorization with minimum required fields', async () => {
      const minimalData: CreateCategorizationDto = {
        transactionId: testTransaction.id,
        accountCode: '5000',
        accountName: 'Expenses',
        confidenceScore: 80,
        source: CategorizationSource.RULE_BASED,
        isSplit: false,
        vatType: VatType.NO_VAT,
      };

      const categorization = await repository.create(minimalData);

      expect(categorization.id).toBeDefined();
      expect(categorization.reasoning).toBeNull();
      expect(categorization.splitAmountCents).toBeNull();
      expect(categorization.vatAmountCents).toBeNull();
    });

    it('should create a split transaction categorization', async () => {
      const splitData: CreateCategorizationDto = {
        transactionId: testTransaction.id,
        accountCode: '4100',
        accountName: 'Fee Income',
        confidenceScore: 90,
        source: CategorizationSource.AI_AUTO,
        isSplit: true,
        splitAmountCents: 125000, // R1,250.00 (half of transaction)
        vatType: VatType.EXEMPT,
      };

      const categorization = await repository.create(splitData);

      expect(categorization.isSplit).toBe(true);
      expect(categorization.splitAmountCents).toBe(125000);
    });

    it('should create a categorization with VAT', async () => {
      const vatData: CreateCategorizationDto = {
        transactionId: testTransaction.id,
        accountCode: '5100',
        accountName: 'Office Supplies',
        confidenceScore: 85,
        source: CategorizationSource.AI_AUTO,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 3261, // 15% VAT on R21.74
      };

      const categorization = await repository.create(vatData);

      expect(categorization.vatType).toBe(VatType.STANDARD);
      expect(categorization.vatAmountCents).toBe(3261);
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      const invalidData = {
        ...testCategorizationData,
        transactionId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when isSplit=true but splitAmountCents missing', async () => {
      const invalidSplit: CreateCategorizationDto = {
        transactionId: testTransaction.id,
        accountCode: '4100',
        accountName: 'Fee Income',
        confidenceScore: 90,
        source: CategorizationSource.AI_AUTO,
        isSplit: true,
        vatType: VatType.EXEMPT,
        // splitAmountCents is missing!
      };

      await expect(repository.create(invalidSplit)).rejects.toThrow(BusinessException);
    });

    it('should throw BusinessException when vatType=STANDARD but vatAmountCents missing', async () => {
      const invalidVat: CreateCategorizationDto = {
        transactionId: testTransaction.id,
        accountCode: '5100',
        accountName: 'Office Supplies',
        confidenceScore: 85,
        source: CategorizationSource.AI_AUTO,
        isSplit: false,
        vatType: VatType.STANDARD,
        // vatAmountCents is missing!
      };

      await expect(repository.create(invalidVat)).rejects.toThrow(BusinessException);
    });
  });

  describe('findById', () => {
    it('should find categorization by id', async () => {
      const created = await repository.create(testCategorizationData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.accountCode).toBe(testCategorizationData.accountCode);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByTransaction', () => {
    it('should find all categorizations for a transaction', async () => {
      // Create multiple categorizations for the same transaction (split scenario)
      await repository.create(testCategorizationData);
      await repository.create({
        ...testCategorizationData,
        accountCode: '5000',
        accountName: 'Expenses',
        confidenceScore: 85,
      });

      const categorizations = await repository.findByTransaction(testTransaction.id);

      expect(categorizations).toHaveLength(2);
      expect(categorizations[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        categorizations[1].createdAt.getTime(),
      ); // ordered by createdAt desc
    });

    it('should return empty array for transaction with no categorizations', async () => {
      const categorizations = await repository.findByTransaction(testTransaction.id);
      expect(categorizations).toHaveLength(0);
    });
  });

  describe('findPendingReview', () => {
    it('should find categorizations pending review', async () => {
      // Create AI_SUGGESTED categorization (needs review)
      await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });

      // Create AI_AUTO categorization (doesn't need review)
      await repository.create({
        ...testCategorizationData,
        accountCode: '5000',
        accountName: 'Expenses',
        source: CategorizationSource.AI_AUTO,
      });

      const pending = await repository.findPendingReview(testTenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].source).toBe(CategorizationSource.AI_SUGGESTED);
    });

    it('should not include reviewed categorizations', async () => {
      // Create and review a categorization
      const created = await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });
      await repository.review(created.id, { reviewedBy: testUser.id });

      const pending = await repository.findPendingReview(testTenant.id);

      expect(pending).toHaveLength(0);
    });
  });

  describe('findWithFilters', () => {
    it('should return paginated results', async () => {
      // Create 5 categorizations
      for (let i = 0; i < 5; i++) {
        await repository.create({
          ...testCategorizationData,
          accountCode: `400${i}`,
          accountName: `Account ${i}`,
        });
      }

      const result = await repository.findWithFilters(testTenant.id, {
        page: 1,
        limit: 3,
      });

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.totalPages).toBe(2);
    });

    it('should filter by source', async () => {
      await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_AUTO,
      });
      await repository.create({
        ...testCategorizationData,
        accountCode: '5000',
        source: CategorizationSource.RULE_BASED,
      });

      const result = await repository.findWithFilters(testTenant.id, {
        source: CategorizationSource.RULE_BASED,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe(CategorizationSource.RULE_BASED);
    });

    it('should filter by vatType', async () => {
      await repository.create({
        ...testCategorizationData,
        vatType: VatType.EXEMPT,
      });
      await repository.create({
        ...testCategorizationData,
        accountCode: '5100',
        vatType: VatType.STANDARD,
        vatAmountCents: 1000,
      });

      const result = await repository.findWithFilters(testTenant.id, {
        vatType: VatType.STANDARD,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].vatType).toBe(VatType.STANDARD);
    });

    it('should filter by needsReview', async () => {
      await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });
      await repository.create({
        ...testCategorizationData,
        accountCode: '5000',
        source: CategorizationSource.AI_AUTO,
      });

      const result = await repository.findWithFilters(testTenant.id, {
        needsReview: true,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe(CategorizationSource.AI_SUGGESTED);
    });
  });

  describe('review', () => {
    it('should mark categorization as reviewed', async () => {
      const created = await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });

      const beforeReview = new Date();
      const reviewed = await repository.review(created.id, {
        reviewedBy: testUser.id,
      });

      expect(reviewed.reviewedBy).toBe(testUser.id);
      expect(reviewed.reviewedAt).toBeInstanceOf(Date);
      expect(reviewed.reviewedAt!.getTime()).toBeGreaterThanOrEqual(beforeReview.getTime());
      expect(reviewed.source).toBe(CategorizationSource.USER_OVERRIDE);
    });

    it('should allow overriding account code during review', async () => {
      const created = await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });

      const reviewed = await repository.review(created.id, {
        reviewedBy: testUser.id,
        accountCode: '4200',
        accountName: 'Other Income',
      });

      expect(reviewed.accountCode).toBe('4200');
      expect(reviewed.accountName).toBe('Other Income');
    });

    it('should allow overriding VAT type during review', async () => {
      const created = await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
        vatType: VatType.EXEMPT,
      });

      const reviewed = await repository.review(created.id, {
        reviewedBy: testUser.id,
        vatType: VatType.STANDARD,
        vatAmountCents: 3750, // 15% VAT on R25
      });

      expect(reviewed.vatType).toBe(VatType.STANDARD);
      expect(reviewed.vatAmountCents).toBe(3750);
    });

    it('should throw NotFoundException for non-existent categorization', async () => {
      const reviewDto: ReviewCategorizationDto = {
        reviewedBy: testUser.id,
      };

      await expect(
        repository.review('00000000-0000-0000-0000-000000000000', reviewDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent reviewer', async () => {
      const created = await repository.create({
        ...testCategorizationData,
        source: CategorizationSource.AI_SUGGESTED,
      });

      await expect(
        repository.review(created.id, {
          reviewedBy: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update categorization fields', async () => {
      const created = await repository.create(testCategorizationData);

      const updated = await repository.update(created.id, {
        accountCode: '4200',
        accountName: 'Updated Account',
        confidenceScore: 99,
      });

      expect(updated.accountCode).toBe('4200');
      expect(updated.accountName).toBe('Updated Account');
      expect(Number(updated.confidenceScore)).toBeCloseTo(99, 0);
      expect(updated.transactionId).toBe(testTransaction.id); // unchanged
    });

    it('should throw NotFoundException for non-existent categorization', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          accountCode: '4200',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when updating to isSplit=true without splitAmountCents', async () => {
      const created = await repository.create(testCategorizationData);

      await expect(
        repository.update(created.id, {
          isSplit: true,
          // splitAmountCents is missing!
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('delete', () => {
    it('should delete categorization', async () => {
      const created = await repository.create(testCategorizationData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent categorization', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
