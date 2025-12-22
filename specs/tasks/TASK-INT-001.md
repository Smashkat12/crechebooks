<task_spec id="TASK-INT-001" version="3.0">

<metadata>
  <title>E2E Transaction Categorization Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>58</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-TRANS-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Complete E2E integration test for the transaction categorization workflow. Tests the entire
journey from CSV/PDF import through AI-powered categorization, manual corrections, pattern
learning, and final Xero synchronization. Uses real database, real services - mock only
Xero MCP server. Validates 95% accuracy target on pattern-trained data.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use real services with actual database</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API uses snake_case (e.g., bank_account, transaction_ids)</rule>
  <rule>Internal services use camelCase (e.g., bankAccount, transactionIds)</rule>
  <rule>API amounts in decimal Rands, internal amounts in cents (multiply by 100)</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>1536 tests currently passing</test_count>
  <surface_layer_status>100% complete (all 16 Surface Layer tasks done)</surface_layer_status>
  <agent_layer_status>100% complete (all 5 Agent tasks done)</agent_layer_status>
  <pattern_reference>Use tests/api/transaction/*.spec.ts as reference for test patterns</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/api/transaction/transaction.controller.ts" purpose="Transaction API endpoints">
    Key endpoints:
    - GET /transactions - List with filters (status, date_from, date_to, is_reconciled, search)
    - POST /transactions/import - Upload CSV/PDF file with bank_account
    - PUT /transactions/:id/categorize - Manual categorization with create_pattern option
    - POST /transactions/categorize/batch - Batch AI categorization
    - GET /transactions/:id/suggestions - Get AI suggestions

    Query params use snake_case, service calls use camelCase.
    Response wraps in { success: true, data: {...}, meta?: {...} }
  </file>

  <file path="src/api/transaction/dto/index.ts" purpose="Transaction DTOs">
    Exports:
    - ListTransactionsQueryDto (page, limit, status, date_from, date_to, is_reconciled, search)
    - TransactionListResponseDto, TransactionResponseDto
    - ImportTransactionsRequestDto (bank_account: string)
    - ImportTransactionsResponseDto (import_batch_id, status, total_parsed, duplicates_skipped, etc.)
    - UpdateCategorizationRequestDto (account_code, account_name, vat_type, is_split, splits, create_pattern)
    - UpdateCategorizationResponseDto
    - BatchCategorizeRequestDto (transaction_ids: string[], force_recategorize?: boolean)
    - BatchCategorizeResponseDto
    - SuggestionsResponseDto
  </file>

  <file path="src/database/services/transaction-import.service.ts" purpose="Import service">
    TransactionImportService.importFromFile(file, bankAccount, tenantId) -> ImportResult
    Handles CSV and PDF (via LLMWhisperer) parsing.
    Returns { importBatchId, status, fileName, totalParsed, duplicatesSkipped, transactionsCreated, errors }
  </file>

  <file path="src/database/services/categorization.service.ts" purpose="AI categorization service">
    CategorizationService.categorizeTransactions(transactionIds, tenantId) -> BatchResult
    CategorizationService.updateCategorization(txId, dto, userId, tenantId) -> Transaction
    CategorizationService.getSuggestions(txId, tenantId) -> Suggestion[]

    Uses payee patterns for matching, Claude AI for unknown transactions.
    Returns { totalProcessed, autoCategorized, reviewRequired, failed, results, statistics }
  </file>

  <file path="src/database/services/pattern-learning.service.ts" purpose="Pattern learning">
    PatternLearningService.createPattern(transactionId, accountCode, tenantId, userId)
    PatternLearningService.findMatchingPatterns(payeeName, tenantId) -> Pattern[]
    Stores payee patterns for future automatic categorization.
  </file>

  <file path="src/database/services/xero-sync.service.ts" purpose="Xero synchronization">
    XeroSyncService.syncTransaction(transaction, categorization) -> XeroResult
    Syncs categorized transactions to Xero as bank transactions.
  </file>

  <file path="src/database/entities/transaction.entity.ts" purpose="Transaction entity">
    TransactionStatus: PENDING, CATEGORIZED, REVIEW_REQUIRED, SYNCED, FAILED
    Fields: tenantId, date, description, payeeName, reference, amountCents, isCredit, status, isReconciled
  </file>

  <file path="src/database/entities/categorization.entity.ts" purpose="Categorization entity">
    VatType: STANDARD, ZERO_RATED, EXEMPT
    CategorizationSource: AI, PATTERN, USER_OVERRIDE, RULE
    Fields: transactionId, accountCode, accountName, confidenceScore, source, isSplit
  </file>

  <file path="tests/api/transaction/transaction.controller.spec.ts" purpose="Controller unit tests">
    Pattern for mocking: Use Test.createTestingModule with providers including repositories.
    Use jest.spyOn() for service method verification.
    Create mock IUser objects with real UserRole from @prisma/client.
  </file>

  <file path="src/api/auth/decorators/current-user.decorator.ts" purpose="User decorator">
    @CurrentUser() extracts user from JWT payload.
    User interface: { id, tenantId, email, role }
  </file>

  <file path="src/api/auth/guards/jwt-auth.guard.ts" purpose="JWT guard">
    JwtAuthGuard validates JWT token in Authorization header.
  </file>

  <file path="src/api/auth/guards/roles.guard.ts" purpose="Roles guard">
    RolesGuard checks user.role against @Roles() decorator.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="tests/e2e/transaction-flow.e2e.spec.ts">
    Complete E2E test suite using supertest and real database.

    Test structure:
    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { INestApplication, ValidationPipe } from '@nestjs/common';
    import * as request from 'supertest';
    import { AppModule } from '../../src/app.module';
    import { PrismaService } from '../../src/database/prisma/prisma.service';

    describe('E2E: Transaction Categorization Flow', () => {
      let app: INestApplication;
      let prisma: PrismaService;
      let authToken: string;
      let testTenantId: string;

      beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true }));
        await app.init();

        prisma = app.get(PrismaService);

        // Create test tenant and user
        const tenant = await prisma.tenant.create({ data: { name: 'E2E Test Tenant' } });
        testTenantId = tenant.id;

        // Create user and get JWT token
        // ...setup auth...
      });

      afterAll(async () => {
        await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.tenant.delete({ where: { id: testTenantId } });
        await app.close();
      });

      it('imports CSV with diverse transactions', async () => {
        // Use multipart/form-data with file upload
        const response = await request(app.getHttpServer())
          .post('/transactions/import')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', 'tests/fixtures/transactions/diverse-100.csv')
          .field('bank_account', 'TEST-BANK-001');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.transactions_created).toBe(100);
      });

      it('AI categorizes with 95%+ confidence on known patterns', async () => { ... });
      it('flags low-confidence for manual review', async () => { ... });
      it('learns from manual corrections', async () => { ... });
      it('handles blank descriptions gracefully', async () => { ... });
      it('detects and prevents duplicates', async () => { ... });
      it('validates split transaction amounts', async () => { ... });
      it('syncs categorized transactions to Xero', async () => { ... });
    });
    ```
  </file>

  <file path="tests/fixtures/transactions/diverse-100.csv">
    Test CSV with 100 diverse transactions:
    - Various payee names (Shoprite, Woolworths, Eskom, etc.)
    - Mix of credits and debits
    - Various amounts (R50 to R50,000)
    - Some blank descriptions for edge case testing
    - Some duplicate entries for detection testing
  </file>

  <file path="tests/fixtures/transactions/similar-patterns-50.csv">
    Test CSV for pattern validation - transactions similar to those corrected manually.
  </file>

  <file path="tests/helpers/xero-mock.ts">
    Xero MCP mock server using express:
    ```typescript
    import express from 'express';
    import { Server } from 'http';

    export class XeroMockServer {
      private app = express();
      private server: Server | null = null;
      private requests: Array<{ method: string; path: string; body: any }> = [];

      start(port = 9999): Promise<void> {
        this.app.use(express.json());
        this.app.all('*', (req, res) => {
          this.requests.push({ method: req.method, path: req.path, body: req.body });
          res.json({ success: true });
        });
        return new Promise((resolve) => {
          this.server = this.app.listen(port, resolve);
        });
      }

      getRequests() { return this.requests; }
      clearRequests() { this.requests = []; }
      stop(): Promise<void> { ... }
    }
    ```
  </file>

  <file path="tests/helpers/test-data-generators.ts">
    Helper functions:
    - createTestTenant(opts) -> Tenant
    - createTestUser(tenantId, role) -> User
    - getAuthToken(user) -> string (JWT)
    - seedChartOfAccounts(tenantId) -> Account[]
  </file>
</files_to_create>

<test_requirements>
  <requirement>Use real database with actual Prisma operations</requirement>
  <requirement>Use real CategorizationService (not mocked)</requirement>
  <requirement>Mock only external services (Xero MCP)</requirement>
  <requirement>Test minimum 100 transactions in batch operations</requirement>
  <requirement>Achieve 95% auto-categorization on second run (after pattern learning)</requirement>
  <requirement>Validate duplicate detection catches 100% of re-imported transactions</requirement>
  <requirement>Split transaction amounts must equal parent transaction</requirement>
  <requirement>All edge cases must have clear error messages</requirement>
  <requirement>Test completes in under 5 minutes</requirement>
</test_requirements>

<endpoint_reference>
  | Method | Path | DTO In | DTO Out | Description |
  |--------|------|--------|---------|-------------|
  | GET | /transactions | ListTransactionsQueryDto | TransactionListResponseDto | List with filters |
  | POST | /transactions/import | multipart + bank_account | ImportTransactionsResponseDto | Upload file |
  | PUT | /transactions/:id/categorize | UpdateCategorizationRequestDto | UpdateCategorizationResponseDto | Manual categorize |
  | POST | /transactions/categorize/batch | BatchCategorizeRequestDto | BatchCategorizeResponseDto | AI batch categorize |
  | GET | /transactions/:id/suggestions | - | SuggestionsResponseDto | Get AI suggestions |
</endpoint_reference>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test:e2e -- transaction-flow.e2e.spec.ts - all tests pass</step>
  <step>Verify 95% accuracy achieved on pattern-trained data</step>
  <step>Verify Xero mock receives correct sync payloads</step>
</verification_steps>

<test_commands>
  <command>npm run test:e2e -- transaction-flow.e2e.spec.ts</command>
  <command>npm run test:e2e -- transaction-flow.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>
