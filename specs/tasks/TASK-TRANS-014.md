<task_spec id="TASK-TRANS-014" version="1.0">

<metadata>
  <title>Xero Sync Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>19</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-MCP-001</task_ref>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the XeroSyncService which handles bi-directional synchronization
between CrecheBooks and Xero accounting software via the Xero MCP server. The service
syncs categorized transactions to Xero as bank transactions, pulls Chart of Accounts
from Xero, handles OAuth token refresh, and resolves sync conflicts. This integration
ensures data consistency between the two systems.
</context>

<input_context_files>
  <file purpose="xero_mcp_tools">specs/technical/mcp-integration.md#xero-mcp-server</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="categorization_entity">src/database/entities/categorization.entity.ts</file>
  <file purpose="requirements">specs/requirements/REQ-TRANS.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-MCP-001 completed (Xero MCP server configured)</check>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Xero OAuth credentials configured per tenant</check>
  <check>Bull queue for sync jobs configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create XeroSyncService in src/core/transaction/
    - Implement push: sync categorized transactions to Xero
    - Implement pull: fetch Chart of Accounts from Xero
    - Handle OAuth token refresh via Xero MCP
    - Implement conflict resolution (last-write-wins with warning)
    - Track sync status and last sync time
    - Queue-based processing for async sync
    - Store xero_transaction_id for linking
  </in_scope>
  <out_of_scope>
    - Initial Xero OAuth setup (manual admin task)
    - Syncing invoices (separate billing sync)
    - Syncing payments (separate payment sync)
    - Real-time webhooks from Xero
    - Historical data import from Xero
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/transaction/xero-sync.service.ts">
      @Injectable()
      export class XeroSyncService {
        constructor(
          private readonly transactionRepo: TransactionRepository,
          private readonly categorizationRepo: CategorizationRepository,
          private readonly coaRepo: ChartOfAccountsRepository,
          private readonly xeroMCP: XeroMCPClient,
          @InjectQueue('xero-sync') private syncQueue: Queue
        )

        async syncTransactions(
          transactionIds: string[],
          tenantId: string
        ): Promise&lt;SyncResult&gt;

        async syncCategories(
          tenantId: string
        ): Promise&lt;CategorySyncResult&gt;

        async pullFromXero(
          tenantId: string,
          dateFrom: Date,
          dateTo: Date
        ): Promise&lt;PullResult&gt;

        async pushToXero(
          transactionId: string,
          tenantId: string
        ): Promise&lt;XeroTransaction&gt;

        private async refreshTokenIfNeeded(tenantId: string): Promise&lt;void&gt;
        private async handleConflict(
          transaction: Transaction,
          xeroData: XeroTransaction
        ): Promise&lt;ConflictResolution&gt;
        private mapToXeroTransaction(
          transaction: Transaction,
          categorization: Categorization
        ): XeroBankTransaction
        private mapFromXeroTransaction(
          xeroTx: XeroTransaction
        ): CreateTransactionDto
      }
    </signature>
    <signature file="src/core/transaction/dto/xero-sync.dto.ts">
      export interface SyncResult {
        totalProcessed: number;
        synced: number;
        failed: number;
        conflicts: number;
        errors: SyncError[];
      }

      export interface CategorySyncResult {
        accountsCreated: number;
        accountsUpdated: number;
        accountsDeleted: number;
        total: number;
      }

      export interface PullResult {
        transactionsPulled: number;
        duplicatesSkipped: number;
        errors: string[];
      }

      export interface XeroBankTransaction {
        contactId?: string;
        lineItems: {
          accountCode: string;
          description: string;
          amount: number;
          taxType: string;
        }[];
        date: string;
        reference?: string;
        isReconciled: boolean;
      }

      export interface XeroTransaction {
        bankTransactionID: string;
        type: 'SPEND' | 'RECEIVE';
        contact?: {
          contactID: string;
          name: string;
        };
        lineItems: XeroLineItem[];
        date: string;
        reference?: string;
        isReconciled: boolean;
        total: number;
        updatedDateUTC: string;
      }

      export interface XeroLineItem {
        accountCode: string;
        description: string;
        lineAmount: number;
        taxType: string;
        taxAmount: number;
      }

      export interface ConflictResolution {
        action: 'USE_LOCAL' | 'USE_XERO' | 'MANUAL_REVIEW';
        reason: string;
      }

      export interface SyncError {
        transactionId: string;
        error: string;
        xeroResponse?: any;
      }
    </signature>
    <signature file="src/integrations/xero/xero-mcp.client.ts">
      @Injectable()
      export class XeroMCPClient {
        async createBankTransaction(
          tenantId: string,
          data: XeroBankTransaction
        ): Promise&lt;XeroTransaction&gt;

        async getBankTransactions(
          tenantId: string,
          dateFrom: Date,
          dateTo: Date
        ): Promise&lt;XeroTransaction[]&gt;

        async getAccounts(
          tenantId: string
        ): Promise&lt;XeroAccount[]&gt;

        async refreshAccessToken(
          tenantId: string
        ): Promise&lt;string&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - Must refresh OAuth token if expired (check 5 min before expiry)
    - Must store xero_transaction_id after successful sync
    - Must handle rate limits (Xero: 60 req/min)
    - Conflict resolution: last-write-wins with warning logged
    - Must NOT sync transactions already marked as synced
    - Must filter all data by tenantId
    - Must NOT use 'any' type anywhere
    - Queue retry: 3 attempts with exponential backoff
    - All amounts must be converted to decimal for Xero API
  </constraints>

  <verification>
    - Categorized transactions successfully sync to Xero
    - xero_transaction_id stored after sync
    - Chart of Accounts pulled from Xero correctly
    - OAuth token refreshes automatically when expired
    - Conflicts detected and resolved appropriately
    - Multi-tenant isolation verified (separate Xero orgs)
    - Rate limiting handled gracefully
    - Unit tests pass
    - Integration tests with Xero sandbox pass
  </verification>
</definition_of_done>

<pseudo_code>
XeroSyncService (src/core/transaction/xero-sync.service.ts):
  @Injectable()
  export class XeroSyncService:
    constructor(
      private transactionRepo: TransactionRepository,
      private categorizationRepo: CategorizationRepository,
      private coaRepo: ChartOfAccountsRepository,
      private xeroMCP: XeroMCPClient,
      @InjectQueue('xero-sync') private syncQueue: Queue
    )

    async syncTransactions(transactionIds, tenantId):
      // 1. Refresh token if needed
      await this.refreshTokenIfNeeded(tenantId)

      const results = {
        totalProcessed: transactionIds.length,
        synced: 0,
        failed: 0,
        conflicts: 0,
        errors: []
      }

      // 2. Process each transaction
      for (const txId of transactionIds):
        try:
          // Check if already synced
          const transaction = await this.transactionRepo.findById(tenantId, txId)

          if transaction.status === 'SYNCED' && transaction.xeroTransactionId:
            // Already synced, skip
            continue

          // Push to Xero
          const xeroTx = await this.pushToXero(txId, tenantId)

          // Update local record
          await this.transactionRepo.update(tenantId, txId, {
            xeroTransactionId: xeroTx.bankTransactionID,
            status: 'SYNCED'
          })

          results.synced++

        catch (error):
          results.failed++
          results.errors.push({
            transactionId: txId,
            error: error.message,
            xeroResponse: error.response?.data
          })

      return results

    async syncCategories(tenantId):
      // 1. Refresh token
      await this.refreshTokenIfNeeded(tenantId)

      // 2. Pull accounts from Xero
      const xeroAccounts = await this.xeroMCP.getAccounts(tenantId)

      // 3. Get existing local accounts
      const localAccounts = await this.coaRepo.findByTenant(tenantId)
      const localMap = new Map(localAccounts.map(a => [a.code, a]))

      let created = 0
      let updated = 0

      // 4. Sync each Xero account
      for (const xeroAcc of xeroAccounts):
        const local = localMap.get(xeroAcc.code)

        if local:
          // Update if name changed
          if local.name !== xeroAcc.name:
            await this.coaRepo.update(local.id, {
              name: xeroAcc.name,
              type: xeroAcc.type
            })
            updated++
        else:
          // Create new
          await this.coaRepo.create({
            tenantId,
            code: xeroAcc.code,
            name: xeroAcc.name,
            type: xeroAcc.type,
            status: 'ACTIVE'
          })
          created++

      // 5. Mark accounts not in Xero as deleted
      const xeroCodeSet = new Set(xeroAccounts.map(a => a.code))
      const toDelete = localAccounts.filter(a => !xeroCodeSet.has(a.code))

      for (const acc of toDelete):
        await this.coaRepo.update(acc.id, { status: 'ARCHIVED' })

      return {
        accountsCreated: created,
        accountsUpdated: updated,
        accountsDeleted: toDelete.length,
        total: xeroAccounts.length
      }

    async pullFromXero(tenantId, dateFrom, dateTo):
      // 1. Refresh token
      await this.refreshTokenIfNeeded(tenantId)

      // 2. Fetch transactions from Xero
      const xeroTxs = await this.xeroMCP.getBankTransactions(
        tenantId,
        dateFrom,
        dateTo
      )

      let pulled = 0
      let duplicates = 0
      const errors = []

      // 3. Import each transaction
      for (const xeroTx of xeroTxs):
        try:
          // Check if already exists by xero_transaction_id
          const existing = await this.transactionRepo.findByXeroId(
            tenantId,
            xeroTx.bankTransactionID
          )

          if existing:
            duplicates++
            continue

          // Map and create
          const dto = this.mapFromXeroTransaction(xeroTx)
          await this.transactionRepo.create({
            ...dto,
            tenantId,
            xeroTransactionId: xeroTx.bankTransactionID,
            source: 'BANK_FEED',
            status: 'SYNCED'
          })

          pulled++

        catch (error):
          errors.push(`Transaction ${xeroTx.bankTransactionID}: ${error.message}`)

      return {
        transactionsPulled: pulled,
        duplicatesSkipped: duplicates,
        errors
      }

    async pushToXero(transactionId, tenantId):
      // 1. Load transaction and categorization
      const transaction = await this.transactionRepo.findById(tenantId, transactionId)
      const categorization = await this.categorizationRepo.findByTransaction(transactionId)

      if !categorization:
        throw new Error('Transaction must be categorized before syncing')

      // 2. Map to Xero format
      const xeroData = this.mapToXeroTransaction(transaction, categorization)

      // 3. Check if update or create
      if transaction.xeroTransactionId:
        // Transaction already in Xero - check for conflicts
        const xeroTx = await this.xeroMCP.getBankTransaction(
          tenantId,
          transaction.xeroTransactionId
        )

        if xeroTx.updatedDateUTC > transaction.updatedAt:
          // Conflict: Xero was updated more recently
          const resolution = await this.handleConflict(transaction, xeroTx)

          if resolution.action === 'USE_XERO':
            // Don't push, use Xero data
            return xeroTx
          else if resolution.action === 'MANUAL_REVIEW':
            throw new ConflictError(resolution.reason)
          // else USE_LOCAL, continue with push

        // Update existing
        return await this.xeroMCP.updateBankTransaction(
          tenantId,
          transaction.xeroTransactionId,
          xeroData
        )

      else:
        // Create new in Xero
        return await this.xeroMCP.createBankTransaction(tenantId, xeroData)

    private async refreshTokenIfNeeded(tenantId):
      // Get tenant OAuth info
      const tenant = await this.tenantRepo.findById(tenantId)

      if !tenant.xeroAccessToken:
        throw new Error('Xero not connected for this tenant')

      // Check if token expires in next 5 minutes
      const expiresAt = new Date(tenant.xeroTokenExpiresAt)
      const fiveMinFromNow = addMinutes(new Date(), 5)

      if expiresAt < fiveMinFromNow:
        // Token expired or about to expire - refresh
        const newToken = await this.xeroMCP.refreshAccessToken(tenantId)

        await this.tenantRepo.update(tenantId, {
          xeroAccessToken: newToken.access_token,
          xeroRefreshToken: newToken.refresh_token,
          xeroTokenExpiresAt: new Date(Date.now() + newToken.expires_in * 1000)
        })

    private async handleConflict(transaction, xeroData):
      // Simple conflict resolution: last-write-wins
      // Log warning for admin review

      this.logger.warn({
        message: 'Xero sync conflict detected',
        transactionId: transaction.id,
        localUpdated: transaction.updatedAt,
        xeroUpdated: xeroData.updatedDateUTC
      })

      // Use local (overwrite Xero)
      return {
        action: 'USE_LOCAL',
        reason: 'Local changes are more recent than Xero'
      }

    private mapToXeroTransaction(transaction, categorization):
      // Map CrecheBooks transaction to Xero format
      const lineItems = []

      if categorization.isSplit:
        // Multiple line items for split
        for (const split of categorization.splits):
          lineItems.push({
            accountCode: split.accountCode,
            description: split.description || transaction.description,
            amount: split.amountCents / 100,
            taxType: this.mapVatToXeroTax(split.vatType)
          })
      else:
        // Single line item
        lineItems.push({
          accountCode: categorization.accountCode,
          description: transaction.description,
          amount: transaction.amountCents / 100,
          taxType: this.mapVatToXeroTax(categorization.vatType)
        })

      return {
        type: transaction.isCredit ? 'RECEIVE' : 'SPEND',
        contact: transaction.payeeName ? {
          name: transaction.payeeName
        } : undefined,
        lineItems,
        date: format(transaction.date, 'yyyy-MM-dd'),
        reference: transaction.reference || undefined,
        isReconciled: transaction.isReconciled
      }

    private mapFromXeroTransaction(xeroTx):
      // Map Xero transaction to CrecheBooks format
      const total = xeroTx.lineItems.reduce((sum, item) => sum + item.lineAmount, 0)

      return {
        date: new Date(xeroTx.date),
        description: xeroTx.lineItems[0]?.description || 'Xero Import',
        payeeName: xeroTx.contact?.name || null,
        reference: xeroTx.reference || null,
        amountCents: Math.round(Math.abs(total) * 100),
        isCredit: xeroTx.type === 'RECEIVE',
        isReconciled: xeroTx.isReconciled
      }

    private mapVatToXeroTax(vatType: VatType): string:
      switch (vatType):
        case 'STANDARD':
          return 'OUTPUT2' // 15% VAT in South Africa
        case 'ZERO_RATED':
          return 'ZERORATEDOUTPUT'
        case 'EXEMPT':
          return 'EXEMPTOUTPUT'
        case 'NO_VAT':
          return 'NONE'
        default:
          return 'NONE'

XeroMCPClient (src/integrations/xero/xero-mcp.client.ts):
  @Injectable()
  export class XeroMCPClient:
    constructor(private mcpService: MCPService)

    async createBankTransaction(tenantId, data):
      return await this.mcpService.callTool('xero-mcp', 'createBankTransaction', {
        tenantId,
        transaction: data
      })

    async getBankTransactions(tenantId, dateFrom, dateTo):
      return await this.mcpService.callTool('xero-mcp', 'getBankTransactions', {
        tenantId,
        dateFrom: format(dateFrom, 'yyyy-MM-dd'),
        dateTo: format(dateTo, 'yyyy-MM-dd')
      })

    async getAccounts(tenantId):
      return await this.mcpService.callTool('xero-mcp', 'getAccounts', {
        tenantId
      })

    async refreshAccessToken(tenantId):
      return await this.mcpService.callTool('xero-mcp', 'refreshToken', {
        tenantId
      })

Queue Processor (src/core/transaction/processors/xero-sync.processor.ts):
  @Processor('xero-sync')
  export class XeroSyncProcessor:
    constructor(private xeroSyncService: XeroSyncService)

    @Process('sync-transaction')
    async handleSync(job: Job):
      const { transactionId, tenantId } = job.data

      try:
        await this.xeroSyncService.pushToXero(transactionId, tenantId)
        return { success: true }

      catch (error):
        // Log error
        this.logger.error({
          message: 'Xero sync failed',
          transactionId,
          error: error.message
        })

        // Retry up to 3 times
        if job.attemptsMade < 3:
          throw error // Trigger retry

        // Max retries reached
        return { success: false, error: error.message }
</pseudo_code>

<files_to_create>
  <file path="src/core/transaction/xero-sync.service.ts">Main Xero sync service</file>
  <file path="src/core/transaction/dto/xero-sync.dto.ts">Xero sync DTOs</file>
  <file path="src/integrations/xero/xero-mcp.client.ts">Xero MCP client wrapper</file>
  <file path="src/core/transaction/processors/xero-sync.processor.ts">Queue processor for async sync</file>
  <file path="tests/core/transaction/xero-sync.service.spec.ts">Service tests</file>
  <file path="tests/integrations/xero/xero-mcp.client.spec.ts">MCP client tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/transaction/index.ts">Export XeroSyncService</file>
  <file path="src/database/repositories/transaction.repository.ts">Add findByXeroId method</file>
  <file path="src/database/entities/tenant.entity.ts">Add xero OAuth fields if not present</file>
  <file path="src/config/queue.config.ts">Add xero-sync queue configuration</file>
</files_to_modify>

<validation_criteria>
  <criterion>Categorized transactions sync to Xero successfully</criterion>
  <criterion>xero_transaction_id stored after successful sync</criterion>
  <criterion>Chart of Accounts pulled from Xero correctly</criterion>
  <criterion>OAuth token refreshes automatically when needed</criterion>
  <criterion>Conflicts detected and resolved with last-write-wins</criterion>
  <criterion>Split transactions sync with multiple line items</criterion>
  <criterion>VAT types map correctly to Xero tax types</criterion>
  <criterion>Multi-tenant isolation verified (separate Xero orgs)</criterion>
  <criterion>Queue retry works for failed syncs</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- --grep "XeroSyncService"</command>
  <command>npm run test -- --grep "XeroMCPClient"</command>
  <command>npm run build</command>
</test_commands>

</task_spec>
