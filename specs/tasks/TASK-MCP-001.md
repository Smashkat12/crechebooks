<task_spec id="TASK-MCP-001" version="2.0">

<metadata>
  <title>Xero MCP Server Foundation</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>15</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<!-- ================================================================
     CRITICAL: PROJECT STATE AS OF 2025-12-20
     This section gives you full context of what already exists.
     ================================================================ -->

<project_state>
  <summary>
    CrecheBooks is an AI-powered bookkeeping system for South African creches.
    The foundation layer is 87% complete (13 of 15 entities implemented).
    All 610 tests pass. The codebase uses NestJS + Prisma + PostgreSQL.
  </summary>

  <completed_entities>
    <!-- These models already exist in prisma/schema.prisma -->
    <entity>Tenant</entity>
    <entity>User</entity>
    <entity>AuditLog</entity>
    <entity>Transaction</entity>
    <entity>Categorization</entity>
    <entity>PayeePattern</entity>
    <entity>Parent</entity>
    <entity>Child</entity>
    <entity>FeeStructure</entity>
    <entity>Enrollment</entity>
    <entity>Invoice</entity>
    <entity>InvoiceLine</entity>
    <entity>Payment</entity>
    <entity>Staff</entity>
    <entity>Payroll</entity>
    <entity>SarsSubmission</entity>
    <entity>Reconciliation</entity>
  </completed_entities>

  <test_count>610 tests passing</test_count>

  <directory_structure>
    <!-- ACTUAL current structure - use these paths exactly -->
    src/
    ├── database/
    │   ├── prisma/
    │   │   ├── prisma.service.ts      # PrismaService singleton
    │   │   ├── prisma.module.ts
    │   │   └── index.ts
    │   ├── entities/                   # TypeScript interfaces + enums
    │   │   ├── index.ts               # Exports all entities
    │   │   ├── tenant.entity.ts
    │   │   ├── user.entity.ts
    │   │   └── ... (17 entity files)
    │   ├── dto/                        # DTOs with class-validator
    │   │   ├── index.ts               # Exports all DTOs
    │   │   └── ... (17 dto files)
    │   ├── repositories/               # Repository pattern with Prisma
    │   │   ├── index.ts               # Exports all repositories
    │   │   └── ... (17 repository files)
    │   ├── services/
    │   │   └── audit-log.service.ts
    │   └── database.module.ts
    ├── shared/
    │   ├── exceptions/
    │   │   ├── base.exception.ts      # NotFoundException, ConflictException, etc.
    │   │   └── index.ts
    │   ├── utils/
    │   │   ├── decimal.util.ts        # Financial calculations with Decimal.js
    │   │   ├── date.util.ts
    │   │   └── index.ts
    │   ├── constants/
    │   └── interfaces/
    ├── config/
    │   ├── configuration.ts
    │   └── config.module.ts
    └── mcp/                           # CREATE THIS - MCP servers go here
        └── xero-mcp/                  # THIS TASK creates this directory

    tests/
    └── database/
        └── repositories/              # 17 integration test files
            └── *.repository.spec.ts

    prisma/
    ├── schema.prisma                  # MODIFY - add XeroToken model
    └── migrations/                    # 14 migrations exist
  </directory_structure>
</project_state>

<!-- ================================================================
     CONTEXT
     ================================================================ -->

<context>
This task creates the Xero MCP (Model Context Protocol) server foundation which
enables Claude Code agents to interact with the Xero accounting API. The MCP
server acts as a bridge between AI agents and Xero, providing tools for fetching
chart of accounts, managing transactions, creating invoices, and applying payments.

This is infrastructure that will be used by future TASK-TRANS-014 (Xero Sync Service)
and various AI agents for autonomous accounting operations.

IMPORTANT: This is an MCP server that runs as a SEPARATE process. It communicates
via stdio with Claude Code. It does NOT integrate into the NestJS app directly.
</context>

<input_context_files>
  <!-- YOU MUST READ THESE FILES BEFORE STARTING -->
  <file purpose="coding_standards" required="true">specs/constitution.md</file>
  <file purpose="architecture" required="true">specs/technical/architecture.md</file>
  <file purpose="task_index" required="true">specs/tasks/_index.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-001 completed (Prisma setup exists)</check>
  <check>prisma/schema.prisma exists with 17 models</check>
  <check>Node.js 20.x and npm installed</check>
  <check>PostgreSQL 16.x running</check>
  <check>Xero developer account and OAuth2 credentials available</check>
</prerequisites>

<!-- ================================================================
     SCOPE
     ================================================================ -->

<scope>
  <in_scope>
    <item>Create MCP server directory: src/mcp/xero-mcp/</item>
    <item>Add XeroToken model to prisma/schema.prisma for encrypted token storage</item>
    <item>Add dependencies to package.json: xero-node, @modelcontextprotocol/sdk</item>
    <item>Implement MCP server with stdio transport</item>
    <item>Implement OAuth2 token management with encryption</item>
    <item>Implement 8 MCP tools: get_accounts, get_transactions, update_transaction, create_invoice, get_invoices, apply_payment, get_contacts, create_contact</item>
    <item>Rate limiting to respect Xero API limits</item>
    <item>Comprehensive error handling with typed exceptions</item>
    <item>Integration tests with Xero sandbox</item>
  </in_scope>
  <out_of_scope>
    <item>OAuth2 authorization flow UI (handled by main app later)</item>
    <item>PostgreSQL MCP server (TASK-MCP-002)</item>
    <item>Email MCP server (TASK-MCP-003)</item>
    <item>Webhook listeners for Xero events</item>
    <item>Bulk operations and batch processing</item>
  </out_of_scope>
</scope>

<!-- ================================================================
     DEFINITION OF DONE - EXACT SIGNATURES
     ================================================================ -->

<definition_of_done>

  <!-- PRISMA SCHEMA ADDITION -->
  <prisma_model>
    <!-- Add this model to prisma/schema.prisma AFTER the Reconciliation model -->
    model XeroToken {
      id                String   @id @default(uuid())
      tenantId          String   @unique @map("tenant_id")
      xeroTenantId      String   @map("xero_tenant_id")
      encryptedTokens   String   @map("encrypted_tokens") @db.Text
      tokenExpiresAt    DateTime @map("token_expires_at")
      createdAt         DateTime @default(now()) @map("created_at")
      updatedAt         DateTime @updatedAt @map("updated_at")

      tenant            Tenant   @relation(fields: [tenantId], references: [id])

      @@index([tenantId])
      @@map("xero_tokens")
    }

    <!-- Also add to Tenant model relations -->
    xeroToken         XeroToken?
  </prisma_model>

  <!-- PACKAGE.JSON ADDITIONS -->
  <dependencies_to_add>
    "xero-node": "^6.0.0",
    "@modelcontextprotocol/sdk": "^0.6.0",
    "crypto-js": "^4.2.0"
  </dependencies_to_add>
  <dev_dependencies_to_add>
    "@types/crypto-js": "^4.2.2"
  </dev_dependencies_to_add>

  <!-- FILE SIGNATURES -->
  <signatures>
    <signature file="src/mcp/xero-mcp/server.ts">
      import { Server } from '@modelcontextprotocol/sdk/server/index.js';
      import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
      import { XeroClient } from 'xero-node';
      import { TokenManager } from './auth/token-manager';
      import { Logger } from './utils/logger';

      export class XeroMCPServer {
        private server: Server;
        private xeroClient: XeroClient;
        private tokenManager: TokenManager;
        private logger: Logger;

        constructor();
        async start(): Promise&lt;void&gt;;
        private registerTools(): void;
        private handleToolCall(name: string, args: Record&lt;string, unknown&gt;): Promise&lt;unknown&gt;;
      }
    </signature>

    <signature file="src/mcp/xero-mcp/auth/token-manager.ts">
      import { PrismaClient } from '@prisma/client';

      export interface TokenSet {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        xeroTenantId: string;
      }

      export class TokenManager {
        private prisma: PrismaClient;
        private encryptionKey: string;

        constructor();
        async getAccessToken(tenantId: string): Promise&lt;string&gt;;
        async refreshAccessToken(tenantId: string): Promise&lt;string&gt;;
        async storeTokens(tenantId: string, tokens: TokenSet): Promise&lt;void&gt;;
        async getXeroTenantId(tenantId: string): Promise&lt;string&gt;;
        private encrypt(data: string): string;
        private decrypt(data: string): string;
      }
    </signature>

    <signature file="src/mcp/xero-mcp/tools/get-accounts.ts">
      import { XeroClient } from 'xero-node';

      export interface XeroAccount {
        code: string;
        name: string;
        type: string;
        taxType: string | null;
        enablePaymentsToAccount: boolean;
      }

      export async function getAccounts(
        xeroClient: XeroClient,
        xeroTenantId: string
      ): Promise&lt;XeroAccount[]&gt;;
    </signature>

    <signature file="src/mcp/xero-mcp/tools/update-transaction.ts">
      import { XeroClient } from 'xero-node';

      export interface UpdateTransactionResult {
        transactionId: string;
        accountCode: string;
        updatedAt: Date;
      }

      export async function updateTransaction(
        xeroClient: XeroClient,
        xeroTenantId: string,
        transactionId: string,
        accountCode: string
      ): Promise&lt;UpdateTransactionResult&gt;;
    </signature>

    <signature file="src/mcp/xero-mcp/tools/create-invoice.ts">
      import { XeroClient } from 'xero-node';

      export interface CreateInvoiceParams {
        contactId: string;
        lineItems: Array&lt;{
          description: string;
          quantity: number;
          unitAmountCents: number;
          accountCode: string;
          taxType?: string;
        }&gt;;
        reference?: string;
        dueDate: Date;
      }

      export interface CreatedInvoice {
        invoiceId: string;
        invoiceNumber: string;
        status: string;
        totalCents: number;
      }

      export async function createInvoice(
        xeroClient: XeroClient,
        xeroTenantId: string,
        params: CreateInvoiceParams
      ): Promise&lt;CreatedInvoice&gt;;
    </signature>

    <signature file="src/mcp/xero-mcp/utils/rate-limiter.ts">
      export class RateLimiter {
        private requests: number[];
        private readonly maxRequests: number;  // 60 per minute for Xero
        private readonly windowMs: number;     // 60000 ms

        constructor(maxRequests?: number, windowMs?: number);
        async acquire(): Promise&lt;void&gt;;
        canProceed(): boolean;
      }
    </signature>

    <signature file="src/mcp/xero-mcp/utils/error-handler.ts">
      export class XeroMCPError extends Error {
        readonly code: string;
        readonly statusCode?: number;
        readonly context?: Record&lt;string, unknown&gt;;

        constructor(message: string, code: string, statusCode?: number, context?: Record&lt;string, unknown&gt;);
      }

      export function handleXeroError(error: unknown): never;
      export function isRetryableError(error: unknown): boolean;
    </signature>
  </signatures>

  <constraints>
    <!-- FROM constitution.md - YOU MUST FOLLOW THESE -->
    <constraint>Must NOT use 'any' type - use proper typing or 'unknown'</constraint>
    <constraint>All monetary values as integers (cents) - convert Xero decimals</constraint>
    <constraint>Must NOT store tokens in plain text - use AES-256 encryption</constraint>
    <constraint>Must handle token expiry with automatic refresh</constraint>
    <constraint>Must implement rate limiting (60 requests/minute for Xero)</constraint>
    <constraint>All errors must be properly typed - no throwing raw strings</constraint>
    <constraint>All async functions must have try-catch with logging</constraint>
    <constraint>Must log all Xero API calls for audit trail</constraint>
    <constraint>Token refresh must be atomic (prevent race conditions)</constraint>
    <constraint>Must follow kebab-case for files (e.g., token-manager.ts)</constraint>
    <constraint>Must follow PascalCase for classes (e.g., TokenManager)</constraint>
  </constraints>

  <verification>
    <check>Prisma migration runs without error: npx prisma migrate dev</check>
    <check>TypeScript compiles: npm run build</check>
    <check>Linting passes: npm run lint</check>
    <check>MCP server starts: node dist/mcp/xero-mcp/server.js</check>
    <check>All 8 tools are registered and callable</check>
    <check>OAuth2 token encryption/decryption works</check>
    <check>Token refresh works when token expires</check>
    <check>Rate limiter prevents exceeding 60 req/min</check>
    <check>Integration tests with Xero sandbox pass</check>
    <check>All existing 610+ tests still pass</check>
  </verification>
</definition_of_done>

<!-- ================================================================
     FILES TO CREATE
     ================================================================ -->

<files_to_create>
  <file path="src/mcp/xero-mcp/server.ts">Main MCP server entry point</file>
  <file path="src/mcp/xero-mcp/index.ts">Export for external use</file>
  <file path="src/mcp/xero-mcp/types/xero.types.ts">Xero API response types</file>
  <file path="src/mcp/xero-mcp/types/mcp.types.ts">MCP tool input/output types</file>
  <file path="src/mcp/xero-mcp/types/index.ts">Type exports</file>
  <file path="src/mcp/xero-mcp/auth/token-manager.ts">OAuth2 token management</file>
  <file path="src/mcp/xero-mcp/auth/encryption.ts">AES-256 encryption utilities</file>
  <file path="src/mcp/xero-mcp/auth/index.ts">Auth exports</file>
  <file path="src/mcp/xero-mcp/tools/get-accounts.ts">Fetch Chart of Accounts</file>
  <file path="src/mcp/xero-mcp/tools/get-transactions.ts">Fetch bank transactions</file>
  <file path="src/mcp/xero-mcp/tools/update-transaction.ts">Update transaction category</file>
  <file path="src/mcp/xero-mcp/tools/create-invoice.ts">Create new invoice</file>
  <file path="src/mcp/xero-mcp/tools/get-invoices.ts">Fetch invoices</file>
  <file path="src/mcp/xero-mcp/tools/apply-payment.ts">Apply payment to invoice</file>
  <file path="src/mcp/xero-mcp/tools/get-contacts.ts">Fetch contacts</file>
  <file path="src/mcp/xero-mcp/tools/create-contact.ts">Create new contact</file>
  <file path="src/mcp/xero-mcp/tools/index.ts">Tool exports</file>
  <file path="src/mcp/xero-mcp/utils/rate-limiter.ts">Rate limiting for API calls</file>
  <file path="src/mcp/xero-mcp/utils/error-handler.ts">Centralized error handling</file>
  <file path="src/mcp/xero-mcp/utils/logger.ts">Logging utility</file>
  <file path="src/mcp/xero-mcp/utils/index.ts">Util exports</file>
  <file path="src/mcp/xero-mcp/config.ts">MCP server configuration</file>
  <file path="tests/mcp/xero-mcp/token-manager.spec.ts">Token manager tests</file>
  <file path="tests/mcp/xero-mcp/rate-limiter.spec.ts">Rate limiter tests</file>
  <file path="tests/mcp/xero-mcp/tools/get-accounts.spec.ts">Get accounts tool tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">
    Add XeroToken model and Tenant relation.
    Add AFTER the Reconciliation model (line ~652).
  </file>
  <file path="package.json">
    Add dependencies: xero-node, @modelcontextprotocol/sdk, crypto-js
    Add devDependencies: @types/crypto-js
  </file>
  <file path=".env.example">
    Add: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, TOKEN_ENCRYPTION_KEY
  </file>
</files_to_modify>

<!-- ================================================================
     TEST PATTERNS - MATCH EXISTING CODEBASE STYLE
     ================================================================ -->

<test_patterns>
  <pattern name="test_file_structure">
    // Tests go in tests/mcp/xero-mcp/*.spec.ts
    import 'dotenv/config';
    import { Test, TestingModule } from '@nestjs/testing';
    import { PrismaService } from '../../../src/database/prisma/prisma.service';

    describe('FeatureName', () => {
      let prisma: PrismaService;

      beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [PrismaService],
        }).compile();

        prisma = module.get&lt;PrismaService&gt;(PrismaService);
        await prisma.onModuleInit();
      });

      afterAll(async () => {
        await prisma.onModuleDestroy();
      });

      beforeEach(async () => {
        // CRITICAL: Clean in FK order - leaf tables first!
        await prisma.xeroToken.deleteMany({});
        await prisma.reconciliation.deleteMany({});
        await prisma.sarsSubmission.deleteMany({});
        await prisma.payroll.deleteMany({});
        await prisma.staff.deleteMany({});
        await prisma.payment.deleteMany({});
        await prisma.invoiceLine.deleteMany({});
        await prisma.invoice.deleteMany({});
        await prisma.enrollment.deleteMany({});
        await prisma.feeStructure.deleteMany({});
        await prisma.child.deleteMany({});
        await prisma.parent.deleteMany({});
        await prisma.payeePattern.deleteMany({});
        await prisma.categorization.deleteMany({});
        await prisma.transaction.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.tenant.deleteMany({});
      });

      describe('methodName', () => {
        it('should do something specific', async () => {
          // Arrange - use REAL data, not mocks
          // Act
          // Assert with expect()
        });

        it('should throw SpecificException when condition', async () => {
          await expect(someCall()).rejects.toThrow(SpecificException);
        });
      });
    });
  </pattern>

  <pattern name="real_data_not_mocks">
    // CORRECT: Use real tenant and test against database
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test St',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27111234567',
        email: `test${Date.now()}@test.co.za`,
      },
    });

    // WRONG: Don't mock Prisma - use real database
    // jest.mock('@prisma/client');  // NEVER DO THIS
  </pattern>
</test_patterns>

<!-- ================================================================
     PSEUDOCODE - IMPLEMENTATION GUIDE
     ================================================================ -->

<pseudo_code>
<!-- SERVER INITIALIZATION -->
server.ts:
  class XeroMCPServer:
    constructor():
      this.server = new Server({
        name: 'xero-mcp',
        version: '1.0.0',
        capabilities: { tools: {} }
      })

      this.xeroClient = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID!,
        clientSecret: process.env.XERO_CLIENT_SECRET!,
        redirectUris: [process.env.XERO_REDIRECT_URI!],
        scopes: ['accounting.transactions', 'accounting.contacts', 'accounting.settings']
      })

      this.tokenManager = new TokenManager()
      this.rateLimiter = new RateLimiter(60, 60000)  // 60 req/min
      this.logger = new Logger('XeroMCP')

      this.registerTools()

    registerTools():
      this.server.setRequestHandler(ListToolsRequestSchema, () => ({
        tools: [
          { name: 'get_accounts', description: 'Fetch Chart of Accounts from Xero', inputSchema: {...} },
          { name: 'get_transactions', description: 'Fetch bank transactions', inputSchema: {...} },
          { name: 'update_transaction', description: 'Update transaction category', inputSchema: {...} },
          { name: 'create_invoice', description: 'Create draft invoice in Xero', inputSchema: {...} },
          { name: 'get_invoices', description: 'Fetch invoices from Xero', inputSchema: {...} },
          { name: 'apply_payment', description: 'Apply payment to invoice', inputSchema: {...} },
          { name: 'get_contacts', description: 'Fetch contacts from Xero', inputSchema: {...} },
          { name: 'create_contact', description: 'Create new contact in Xero', inputSchema: {...} }
        ]
      }))

      this.server.setRequestHandler(CallToolRequestSchema, (request) =>
        this.handleToolCall(request.params.name, request.params.arguments)
      )

    async handleToolCall(name: string, args: Record&lt;string, unknown&gt;):
      // Rate limit check
      await this.rateLimiter.acquire()

      // Get fresh access token (auto-refresh if needed)
      const tenantId = args.tenantId as string
      const accessToken = await this.tokenManager.getAccessToken(tenantId)
      const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId)

      this.xeroClient.setTokenSet({ access_token: accessToken })

      this.logger.info(`Executing tool: ${name}`, { tenantId, args })

      try:
        switch (name):
          case 'get_accounts': return await getAccounts(this.xeroClient, xeroTenantId)
          case 'get_transactions': return await getTransactions(this.xeroClient, xeroTenantId, args)
          case 'update_transaction': return await updateTransaction(this.xeroClient, xeroTenantId, args.transactionId, args.accountCode)
          case 'create_invoice': return await createInvoice(this.xeroClient, xeroTenantId, args)
          case 'get_invoices': return await getInvoices(this.xeroClient, xeroTenantId, args)
          case 'apply_payment': return await applyPayment(this.xeroClient, xeroTenantId, args)
          case 'get_contacts': return await getContacts(this.xeroClient, xeroTenantId)
          case 'create_contact': return await createContact(this.xeroClient, xeroTenantId, args)
          default: throw new XeroMCPError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL')
      catch (error):
        this.logger.error(`Tool ${name} failed`, { error, args })
        handleXeroError(error)

    async start():
      const transport = new StdioServerTransport()
      await this.server.connect(transport)
      this.logger.info('Xero MCP Server started')

<!-- TOKEN MANAGEMENT WITH ENCRYPTION -->
token-manager.ts:
  class TokenManager:
    constructor():
      this.prisma = new PrismaClient()
      this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY!
      if (!this.encryptionKey || this.encryptionKey.length &lt; 32):
        throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 characters')

    async getAccessToken(tenantId: string):
      const record = await this.prisma.xeroToken.findUnique({
        where: { tenantId }
      })

      if (!record):
        throw new XeroMCPError(`No Xero connection for tenant ${tenantId}`, 'NO_CONNECTION')

      const tokens = JSON.parse(this.decrypt(record.encryptedTokens)) as TokenSet

      // Refresh if expires within 5 minutes
      if (Date.now() >= tokens.expiresAt - 300000):
        return await this.refreshAccessToken(tenantId)

      return tokens.accessToken

    async refreshAccessToken(tenantId: string):
      // Use mutex/lock to prevent concurrent refreshes
      const record = await this.prisma.xeroToken.findUnique({ where: { tenantId } })
      const oldTokens = JSON.parse(this.decrypt(record.encryptedTokens))

      // Xero SDK refresh
      const newTokenSet = await this.xeroClient.refreshToken()

      const newTokens: TokenSet = {
        accessToken: newTokenSet.access_token,
        refreshToken: newTokenSet.refresh_token,
        expiresAt: Date.now() + (newTokenSet.expires_in * 1000),
        xeroTenantId: oldTokens.xeroTenantId
      }

      await this.storeTokens(tenantId, newTokens)
      return newTokens.accessToken

    async storeTokens(tenantId: string, tokens: TokenSet):
      const encrypted = this.encrypt(JSON.stringify(tokens))

      await this.prisma.xeroToken.upsert({
        where: { tenantId },
        create: {
          tenantId,
          xeroTenantId: tokens.xeroTenantId,
          encryptedTokens: encrypted,
          tokenExpiresAt: new Date(tokens.expiresAt)
        },
        update: {
          encryptedTokens: encrypted,
          tokenExpiresAt: new Date(tokens.expiresAt)
        }
      })

    encrypt(data: string): AES.encrypt(data, this.encryptionKey).toString()
    decrypt(data: string): AES.decrypt(data, this.encryptionKey).toString(enc.Utf8)

<!-- RATE LIMITER -->
rate-limiter.ts:
  class RateLimiter:
    constructor(maxRequests = 60, windowMs = 60000):
      this.requests = []
      this.maxRequests = maxRequests
      this.windowMs = windowMs

    async acquire():
      // Clean old requests
      const now = Date.now()
      this.requests = this.requests.filter(t => t > now - this.windowMs)

      if (this.requests.length >= this.maxRequests):
        const waitTime = this.requests[0] + this.windowMs - now
        await new Promise(resolve => setTimeout(resolve, waitTime))
        return this.acquire()  // Retry

      this.requests.push(now)

<!-- TOOL EXAMPLE -->
get-accounts.ts:
  export async function getAccounts(xeroClient: XeroClient, xeroTenantId: string):
    try:
      const response = await xeroClient.accountingApi.getAccounts(xeroTenantId)

      return response.body.accounts?.map(account => ({
        code: account.code ?? '',
        name: account.name ?? '',
        type: account.type ?? '',
        taxType: account.taxType ?? null,
        enablePaymentsToAccount: account.enablePaymentsToAccount ?? false
      })) ?? []
    catch (error):
      handleXeroError(error)
</pseudo_code>

<!-- ================================================================
     VALIDATION CRITERIA
     ================================================================ -->

<validation_criteria>
  <criterion priority="critical">Prisma migration creates xero_tokens table</criterion>
  <criterion priority="critical">Tokens encrypted with AES-256, never stored plain</criterion>
  <criterion priority="critical">TypeScript compiles with no errors (npm run build)</criterion>
  <criterion priority="critical">Linting passes (npm run lint)</criterion>
  <criterion priority="critical">All existing 610+ tests still pass</criterion>
  <criterion priority="high">MCP server starts and registers 8 tools</criterion>
  <criterion priority="high">Token refresh works automatically on expiry</criterion>
  <criterion priority="high">Rate limiter prevents &gt;60 requests/minute</criterion>
  <criterion priority="high">All tools return properly typed responses</criterion>
  <criterion priority="medium">Integration tests with Xero sandbox pass</criterion>
  <criterion priority="medium">Error handling provides actionable messages</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_xero_tokens</command>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- --runInBand</command>
  <command>npm test -- -t "XeroMCP" --runInBand</command>
  <command>node dist/mcp/xero-mcp/server.js</command>
</test_commands>

<!-- ================================================================
     ENVIRONMENT VARIABLES REQUIRED
     ================================================================ -->

<environment_variables>
  <var name="XERO_CLIENT_ID" description="Xero OAuth2 client ID from developer portal" />
  <var name="XERO_CLIENT_SECRET" description="Xero OAuth2 client secret" />
  <var name="XERO_REDIRECT_URI" description="OAuth callback URL, e.g., http://localhost:3000/api/auth/xero/callback" />
  <var name="TOKEN_ENCRYPTION_KEY" description="32+ character key for AES-256 encryption of tokens" />
</environment_variables>

<!-- ================================================================
     CRITICAL REMINDERS
     ================================================================ -->

<critical_reminders>
  <reminder>NO 'any' TYPE - Use proper typing or 'unknown'</reminder>
  <reminder>NO MOCK DATA IN TESTS - Use real database with test data</reminder>
  <reminder>NO FLOATING POINT FOR MONEY - Convert Xero decimals to cents (integers)</reminder>
  <reminder>FAIL FAST - Throw typed exceptions, don't silently fail</reminder>
  <reminder>LOG EVERYTHING - All API calls must be logged for audit</reminder>
  <reminder>RUN ALL TESTS - Ensure existing 610 tests still pass</reminder>
  <reminder>FK CLEANUP ORDER - When cleaning test DB, delete leaf tables first</reminder>
  <reminder>ENCRYPTION REQUIRED - Tokens must never be stored in plain text</reminder>
</critical_reminders>

</task_spec>
