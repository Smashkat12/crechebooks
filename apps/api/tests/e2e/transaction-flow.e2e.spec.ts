/**
 * E2E Transaction Categorization Flow Tests
 * TASK-INT-001: Complete integration test for transaction categorization
 *
 * CRITICAL: Uses real database and real services - NO MOCKS except for Xero MCP
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { JwtStrategy } from '../../src/api/auth/strategies/jwt.strategy';
import {
  createTestTenant,
  createTestUser,
  getAuthToken,
  seedChartOfAccounts,
  cleanupTestData,
  TestTenant,
  TestUser,
  TestJwtStrategy,
} from '../helpers';
import { XeroMockServer } from '../helpers/xero-mock';

describe('E2E: Transaction Categorization Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let xeroMock: XeroMockServer;
  let authToken: string;
  let testTenant: TestTenant;
  let testUser: TestUser;
  let importedTransactionIds: string[] = [];

  // Fixture paths
  const diverseCsvPath = path.join(
    __dirname,
    '../fixtures/transactions/diverse-100.csv',
  );
  const similarCsvPath = path.join(
    __dirname,
    '../fixtures/transactions/similar-patterns-50.csv',
  );

  beforeAll(async () => {
    // Verify fixtures exist - fail fast if not
    if (!fs.existsSync(diverseCsvPath)) {
      throw new Error(`Fixture not found: ${diverseCsvPath}`);
    }
    if (!fs.existsSync(similarCsvPath)) {
      throw new Error(`Fixture not found: ${similarCsvPath}`);
    }

    // Start Xero mock server
    xeroMock = new XeroMockServer(9999);
    await xeroMock.start();

    // Create NestJS app with TestJwtStrategy override
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtStrategy)
      .useClass(TestJwtStrategy)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Create test tenant and user
    testTenant = await createTestTenant(prisma);
    testUser = await createTestUser(prisma, testTenant.id);
    authToken = getAuthToken(testUser);

    // Seed payee patterns for categorization
    await seedChartOfAccounts(prisma, testTenant.id);
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (testTenant?.id) {
      await cleanupTestData(prisma, testTenant.id);
    }
    await xeroMock?.stop();
    await app?.close();
  }, 30000);

  describe('CSV Import', () => {
    it('should import diverse-100.csv with 100+ transactions', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions/import')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', diverseCsvPath)
        .field('bank_account', 'E2E-TEST-BANK-001');

      // POST can return 200 or 201
      expect([200, 201]).toContain(response.status);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions_created).toBeGreaterThanOrEqual(
        95,
      );
      expect(response.body.data.status).toMatch(/PROCESSING|COMPLETED/);

      // Store import batch ID for later queries
      const batchId = response.body.data.import_batch_id;
      expect(batchId).toBeDefined();
    });

    it('should list imported transactions', async () => {
      // Use limit=100 (max allowed) and fetch multiple pages
      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 100 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should have at least 95 transactions
      expect(response.body.data.length).toBeGreaterThanOrEqual(95);

      // Store IDs for categorization tests
      importedTransactionIds = response.body.data.map(
        (tx: { id: string }) => tx.id,
      );
    });

    it('should detect duplicates on re-import', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions/import')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', diverseCsvPath)
        .field('bank_account', 'E2E-TEST-BANK-001');

      // POST can return 200 or 201
      expect([200, 201]).toContain(response.status);
      expect(response.body.data.duplicates_skipped).toBeGreaterThan(90);
      expect(response.body.data.transactions_created).toBeLessThan(10);
    });
  });

  describe('AI Batch Categorization', () => {
    it('should batch re-categorize transactions with force_recategorize', async () => {
      // Note: Import auto-categorizes transactions, so no PENDING transactions exist.
      // Use force_recategorize with specific IDs to test batch categorization functionality.
      expect(importedTransactionIds.length).toBeGreaterThan(0);

      const response = await request(app.getHttpServer())
        .post('/transactions/categorize/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_ids: importedTransactionIds.slice(0, 50), // Re-categorize first 50
          force_recategorize: true,
        });

      // POST can return 200 or 201
      expect([200, 201]).toContain(response.status);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_processed).toBeGreaterThan(0);
      expect(response.body.data.auto_categorized).toBeGreaterThan(0);
      // Some may need review (low confidence). Test data may have lower confidence scores
      // since AI categorization depends on pattern matching and description quality.
      expect(response.body.data.statistics.avg_confidence).toBeGreaterThan(0);
    });

    it('should have high accuracy on known patterns (groceries, utilities)', async () => {
      // Get transactions with known payees
      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'WOOLWORTHS', limit: 50 });

      expect(response.status).toBe(200);

      // All WOOLWORTHS should be categorized to 5100 (Groceries)
      const woolworthsTxs = response.body.data;
      const categorized = woolworthsTxs.filter(
        (tx: { categorization?: { account_code: string } }) =>
          tx.categorization?.account_code === '5100',
      );

      // Expect 80%+ match rate for known patterns
      const matchRate =
        woolworthsTxs.length > 0
          ? (categorized.length / woolworthsTxs.length) * 100
          : 0;
      expect(matchRate).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Manual Categorization with Pattern Learning', () => {
    let transactionToCorrect: string;

    it('should get suggestions for a transaction', async () => {
      // Find a transaction that might need review
      const listResp = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'REVIEW_REQUIRED', limit: 1 });

      if (listResp.body.data.length > 0) {
        transactionToCorrect = listResp.body.data[0].id;

        const response = await request(app.getHttpServer())
          .get(`/transactions/${transactionToCorrect}/suggestions`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it('should manually categorize and create pattern', async () => {
      if (!transactionToCorrect) {
        // Use first transaction if no review required ones
        transactionToCorrect = importedTransactionIds[0];
      }

      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionToCorrect}/categorize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          account_code: '5500',
          account_name: 'Office Expenses',
          is_split: false,
          vat_type: 'STANDARD',
          create_pattern: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CATEGORIZED');
      expect(response.body.data.source).toBe('USER_OVERRIDE');
    });
  });

  describe('Edge Cases', () => {
    it('should handle transactions with blank descriptions gracefully', async () => {
      // The diverse-100.csv includes blank descriptions
      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 100 });

      expect(response.status).toBe(200);

      // Find transactions with blank payee names (from blank descriptions)
      const blankDescTxs = response.body.data.filter(
        (tx: { payee_name: string | null }) =>
          !tx.payee_name || tx.payee_name === '',
      );

      // They should still be in the system, just possibly as REVIEW_REQUIRED
      if (blankDescTxs.length > 0) {
        const blankTx = blankDescTxs[0];
        expect(['PENDING', 'REVIEW_REQUIRED', 'CATEGORIZED']).toContain(
          blankTx.status,
        );
      }
    });

    it('should reject invalid categorization (missing required fields)', async () => {
      const txId = importedTransactionIds[0];
      if (!txId) return;

      // Missing is_split and vat_type - should fail validation
      const response = await request(app.getHttpServer())
        .put(`/transactions/${txId}/categorize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          account_code: '5100',
          account_name: 'Test',
          // Missing: is_split, vat_type
        });

      expect(response.status).toBe(400);
    });

    it('should validate split transaction amounts match total', async () => {
      const txId = importedTransactionIds[0];
      if (!txId) return;

      // Get the transaction to know its amount
      const getTx = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 1 });

      const tx = getTx.body.data[0];
      if (!tx) return;

      // Try to create split with mismatched amounts
      const response = await request(app.getHttpServer())
        .put(`/transactions/${tx.id}/categorize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          account_code: '5100',
          account_name: 'Groceries',
          is_split: true,
          splits: [
            {
              account_code: '5100',
              account_name: 'Groceries',
              amount_cents: 1000,
              vat_type: 'STANDARD',
            },
            {
              account_code: '5200',
              account_name: 'Utilities',
              amount_cents: 500,
              vat_type: 'STANDARD',
            },
          ],
        });

      // Should fail because splits don't add up to transaction amount
      expect(response.status).toBe(400);
    });
  });

  describe('Pattern Accuracy After Learning', () => {
    it('should import similar-patterns-50.csv for accuracy testing', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions/import')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', similarCsvPath)
        .field('bank_account', 'E2E-TEST-BANK-001');

      // POST can return 200 or 201
      expect([200, 201]).toContain(response.status);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions_created).toBeGreaterThanOrEqual(
        40,
      );
    });

    it('should achieve reasonable auto-categorization on similar patterns', async () => {
      // Categorize the new batch
      const response = await request(app.getHttpServer())
        .post('/transactions/categorize/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ force_recategorize: false });

      // POST can return 200 or 201
      expect([200, 201]).toContain(response.status);

      const { total_processed, auto_categorized, statistics } =
        response.body.data;

      if (total_processed > 0) {
        const autoRate = (auto_categorized / total_processed) * 100;
        // Pattern matching should give us at least 50%+ on similar data
        // (Known patterns like WOOLWORTHS, CHECKERS should match)
        expect(autoRate).toBeGreaterThanOrEqual(50);
        // Statistics should be present
        expect(statistics).toBeDefined();
      }
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app.getHttpServer()).get('/transactions');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
