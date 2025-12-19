<task_spec id="TASK-MCP-001" version="1.0">

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
</metadata>

<context>
This task creates the Xero MCP (Model Context Protocol) server foundation which
enables Claude Code agents to interact with the Xero accounting API. The MCP
server acts as a bridge between AI agents and Xero, providing tools for fetching
chart of accounts, managing transactions, creating invoices, and applying payments.
This is a critical infrastructure component that enables bi-directional sync with
Xero and allows AI agents to perform accounting operations autonomously.
</context>

<input_context_files>
  <file purpose="architecture">specs/technical/architecture.md#MCP Server Configuration</file>
  <file purpose="architecture">specs/technical/architecture.md#Xero Integration Flow</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-001 completed (Prisma setup)</check>
  <check>Node.js and npm installed</check>
  <check>xero-node SDK available</check>
  <check>Xero developer account and OAuth2 credentials</check>
</prerequisites>

<scope>
  <in_scope>
    - Create MCP server directory structure (src/mcp/xero-mcp/)
    - Implement OAuth2 token management (storage, refresh)
    - Create MCP server initialization and configuration
    - Implement MCP tool: get_accounts (fetch Chart of Accounts)
    - Implement MCP tool: get_transactions (fetch bank transactions)
    - Implement MCP tool: update_transaction (update transaction category)
    - Implement MCP tool: create_invoice (create new invoice)
    - Implement MCP tool: get_invoices (fetch invoices)
    - Implement MCP tool: apply_payment (apply payment to invoice)
    - Implement MCP tool: get_contacts (fetch Xero contacts)
    - Implement MCP tool: create_contact (create new contact)
    - Implement token encryption for secure storage
    - Implement automatic token refresh on expiry
    - Error handling and rate limiting
  </in_scope>
  <out_of_scope>
    - OAuth2 authorization flow UI (handled by main app)
    - PostgreSQL MCP server (TASK-MCP-002)
    - Email MCP server (TASK-MCP-003)
    - Webhook listeners for Xero events
    - Bulk operations and batch processing
    - Full transaction categorization logic (uses this MCP)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/mcp/xero-mcp/server.ts">
      import { Server } from '@modelcontextprotocol/sdk/server/index.js';
      import { XeroClient } from 'xero-node';

      class XeroMCPServer {
        private server: Server;
        private xeroClient: XeroClient;

        constructor() {
          // Initialize MCP server
          // Initialize Xero client
        }

        async start(): Promise<void> {
          // Register all tools
          // Start server
        }
      }

      const mcpServer = new XeroMCPServer();
      mcpServer.start();
    </signature>
    <signature file="src/mcp/xero-mcp/tools/get-accounts.ts">
      export async function getAccounts(
        xeroClient: XeroClient,
        tenantId: string
      ): Promise<Account[]> {
        // Fetch Chart of Accounts from Xero
        // Return formatted account list
      }
    </signature>
    <signature file="src/mcp/xero-mcp/tools/update-transaction.ts">
      export async function updateTransaction(
        xeroClient: XeroClient,
        tenantId: string,
        transactionId: string,
        accountCode: string
      ): Promise<Transaction> {
        // Update transaction category in Xero
        // Return updated transaction
      }
    </signature>
    <signature file="src/mcp/xero-mcp/auth/token-manager.ts">
      export class TokenManager {
        async getAccessToken(tenantId: string): Promise<string>;
        async refreshAccessToken(tenantId: string): Promise<string>;
        async storeTokens(tenantId: string, tokens: TokenSet): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Must follow MCP protocol specification
    - Must use xero-node SDK for all Xero API calls
    - Must NOT store tokens in plain text (use encryption)
    - Must handle token expiry gracefully with automatic refresh
    - Must implement rate limiting to avoid Xero API limits
    - Must follow naming conventions from constitution
    - All errors must be properly typed and handled
    - Must NOT use 'any' type anywhere
    - All async functions must have proper error handling
    - Token refresh must be atomic (prevent concurrent refreshes)
  </constraints>

  <verification>
    - MCP server starts without errors
    - All 8 tools are registered and callable
    - OAuth2 token storage and retrieval works
    - Token refresh works when token expires
    - get_accounts returns valid Chart of Accounts
    - update_transaction successfully updates category in Xero
    - create_invoice creates valid invoice in Xero
    - apply_payment applies payment correctly
    - TypeScript compiles without errors
    - Unit tests pass
    - Integration tests with Xero sandbox pass
  </verification>
</definition_of_done>

<pseudo_code>
Directory Structure:
  src/mcp/xero-mcp/
    ├── server.ts              # Main MCP server entry point
    ├── types/
    │   ├── xero.types.ts      # Xero API type definitions
    │   └── mcp.types.ts       # MCP tool type definitions
    ├── auth/
    │   ├── token-manager.ts   # OAuth2 token management
    │   └── encryption.ts      # Token encryption utilities
    ├── tools/
    │   ├── get-accounts.ts    # Fetch Chart of Accounts
    │   ├── get-transactions.ts # Fetch bank transactions
    │   ├── update-transaction.ts # Update transaction category
    │   ├── create-invoice.ts  # Create new invoice
    │   ├── get-invoices.ts    # Fetch invoices
    │   ├── apply-payment.ts   # Apply payment to invoice
    │   ├── get-contacts.ts    # Fetch contacts
    │   └── create-contact.ts  # Create contact
    ├── utils/
    │   ├── rate-limiter.ts    # Rate limiting for API calls
    │   └── error-handler.ts   # Centralized error handling
    └── config.ts              # MCP server configuration

Server Initialization (server.ts):
  import { Server } from '@modelcontextprotocol/sdk/server/index.js'
  import { XeroClient } from 'xero-node'
  import { TokenManager } from './auth/token-manager'

  class XeroMCPServer:
    private server: Server
    private xeroClient: XeroClient
    private tokenManager: TokenManager

    constructor():
      this.server = new Server({
        name: 'xero-mcp',
        version: '1.0.0'
      })

      this.xeroClient = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID,
        clientSecret: process.env.XERO_CLIENT_SECRET,
        redirectUris: [process.env.XERO_REDIRECT_URI],
        scopes: ['accounting.transactions', 'accounting.contacts', 'accounting.settings']
      })

      this.tokenManager = new TokenManager()

    async start():
      // Register all MCP tools
      this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          { name: 'get_accounts', description: 'Fetch Chart of Accounts', ... },
          { name: 'get_transactions', description: 'Fetch bank transactions', ... },
          { name: 'update_transaction', description: 'Update transaction category', ... },
          { name: 'create_invoice', description: 'Create new invoice', ... },
          { name: 'get_invoices', description: 'Fetch invoices', ... },
          { name: 'apply_payment', description: 'Apply payment to invoice', ... },
          { name: 'get_contacts', description: 'Fetch contacts', ... },
          { name: 'create_contact', description: 'Create new contact', ... }
        ]
      }))

      // Register tool handlers
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params

        // Get fresh access token (auto-refresh if expired)
        const accessToken = await this.tokenManager.getAccessToken(args.tenantId)
        this.xeroClient.setAccessToken(accessToken)

        switch (name):
          case 'get_accounts':
            return await getAccounts(this.xeroClient, args.tenantId)
          case 'update_transaction':
            return await updateTransaction(this.xeroClient, args.tenantId, args.transactionId, args.accountCode)
          // ... other tools
      })

      // Start stdio transport
      const transport = new StdioServerTransport()
      await this.server.connect(transport)

Token Manager (auth/token-manager.ts):
  import { PrismaClient } from '@prisma/client'
  import { encrypt, decrypt } from './encryption'

  export class TokenManager:
    private prisma: PrismaClient

    constructor():
      this.prisma = new PrismaClient()

    async getAccessToken(tenantId: string): Promise<string>:
      // Fetch encrypted tokens from database
      const tokenRecord = await this.prisma.xeroToken.findUnique({
        where: { tenantId }
      })

      if (!tokenRecord):
        throw new Error('No Xero connection found')

      const decrypted = decrypt(tokenRecord.encryptedTokens)
      const tokens = JSON.parse(decrypted)

      // Check if token is expired
      if (Date.now() >= tokens.expiresAt):
        return await this.refreshAccessToken(tenantId)

      return tokens.accessToken

    async refreshAccessToken(tenantId: string): Promise<string>:
      // Use refresh token to get new access token
      const tokenRecord = await this.prisma.xeroToken.findUnique({
        where: { tenantId }
      })

      const decrypted = decrypt(tokenRecord.encryptedTokens)
      const oldTokens = JSON.parse(decrypted)

      // Call Xero token refresh endpoint
      const newTokens = await this.xeroClient.refreshToken(oldTokens.refreshToken)

      // Store new tokens
      await this.storeTokens(tenantId, newTokens)

      return newTokens.accessToken

    async storeTokens(tenantId: string, tokens: TokenSet): Promise<void>:
      const encrypted = encrypt(JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + (tokens.expiresIn * 1000)
      }))

      await this.prisma.xeroToken.upsert({
        where: { tenantId },
        create: { tenantId, encryptedTokens: encrypted },
        update: { encryptedTokens: encrypted }
      })

MCP Tools Implementation:
  Each tool in tools/ directory:
    - Accepts xeroClient and required parameters
    - Makes Xero API call using xero-node SDK
    - Handles errors appropriately
    - Returns formatted response matching MCP spec
    - Implements rate limiting
    - Logs all operations

  Example (tools/get-accounts.ts):
    export async function getAccounts(xeroClient: XeroClient, tenantId: string):
      try:
        const response = await xeroClient.accountingApi.getAccounts(tenantId)

        return response.body.accounts.map(account => ({
          code: account.code,
          name: account.name,
          type: account.type,
          taxType: account.taxType,
          enablePaymentsToAccount: account.enablePaymentsToAccount
        }))
      catch (error):
        throw new MCPError(`Failed to fetch accounts: ${error.message}`)
</pseudo_code>

<files_to_create>
  <file path="src/mcp/xero-mcp/server.ts">Main MCP server entry point</file>
  <file path="src/mcp/xero-mcp/types/xero.types.ts">Xero API type definitions</file>
  <file path="src/mcp/xero-mcp/types/mcp.types.ts">MCP tool type definitions</file>
  <file path="src/mcp/xero-mcp/auth/token-manager.ts">OAuth2 token management</file>
  <file path="src/mcp/xero-mcp/auth/encryption.ts">Token encryption utilities</file>
  <file path="src/mcp/xero-mcp/tools/get-accounts.ts">Get Chart of Accounts tool</file>
  <file path="src/mcp/xero-mcp/tools/get-transactions.ts">Get transactions tool</file>
  <file path="src/mcp/xero-mcp/tools/update-transaction.ts">Update transaction tool</file>
  <file path="src/mcp/xero-mcp/tools/create-invoice.ts">Create invoice tool</file>
  <file path="src/mcp/xero-mcp/tools/get-invoices.ts">Get invoices tool</file>
  <file path="src/mcp/xero-mcp/tools/apply-payment.ts">Apply payment tool</file>
  <file path="src/mcp/xero-mcp/tools/get-contacts.ts">Get contacts tool</file>
  <file path="src/mcp/xero-mcp/tools/create-contact.ts">Create contact tool</file>
  <file path="src/mcp/xero-mcp/utils/rate-limiter.ts">Rate limiting utility</file>
  <file path="src/mcp/xero-mcp/utils/error-handler.ts">Error handling utility</file>
  <file path="src/mcp/xero-mcp/config.ts">MCP server configuration</file>
  <file path="src/mcp/xero-mcp/package.json">MCP server dependencies</file>
  <file path="tests/mcp/xero-mcp/server.spec.ts">MCP server tests</file>
  <file path="tests/mcp/xero-mcp/tools/get-accounts.spec.ts">Tool tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add XeroToken model for encrypted token storage</file>
  <file path="package.json">Add xero-node and @modelcontextprotocol/sdk dependencies</file>
  <file path=".env.example">Add Xero OAuth2 configuration variables</file>
</files_to_modify>

<validation_criteria>
  <criterion>MCP server starts and registers all 8 tools successfully</criterion>
  <criterion>OAuth2 token storage with encryption works</criterion>
  <criterion>Token refresh happens automatically when token expires</criterion>
  <criterion>get_accounts tool returns valid Chart of Accounts from Xero</criterion>
  <criterion>get_transactions tool fetches bank transactions from Xero</criterion>
  <criterion>update_transaction tool updates transaction category in Xero</criterion>
  <criterion>create_invoice tool creates invoice in Xero sandbox</criterion>
  <criterion>get_invoices tool retrieves invoices from Xero</criterion>
  <criterion>apply_payment tool applies payment to invoice in Xero</criterion>
  <criterion>get_contacts and create_contact tools work correctly</criterion>
  <criterion>Rate limiting prevents exceeding Xero API limits</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All unit tests pass</criterion>
  <criterion>Integration tests with Xero sandbox pass</criterion>
  <criterion>MCP server can be called from Claude Code using mcp__xero__ prefix</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "XeroMCPServer"</command>
  <command>node src/mcp/xero-mcp/server.js</command>
  <command>npm run test:integration -- --grep "Xero MCP"</command>
</test_commands>

</task_spec>
