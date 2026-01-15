<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-002</task_id>
    <title>Add Transaction Isolation to Batch Invoice Generation</title>
    <priority>CRITICAL</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>6-8 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>database</tag>
      <tag>transactions</tag>
      <tag>race-condition</tag>
      <tag>critical-bug</tag>
      <tag>prisma</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Batch invoice generation suffers from race conditions when multiple
      processes or requests attempt concurrent batch operations. This results
      in duplicate invoices, incorrect totals, and data inconsistency.
    </problem_statement>

    <business_impact>
      - Duplicate invoices sent to customers
      - Financial reconciliation failures
      - Potential double-charging
      - Data integrity issues requiring manual correction
      - Audit trail contamination
    </business_impact>

    <root_cause>
      Batch invoice operations are not wrapped in database transactions with
      appropriate isolation levels. Individual invoice creation within a batch
      can interleave with other operations, causing read-modify-write conflicts.
    </root_cause>

    <affected_users>
      - Finance team running batch invoicing
      - Automated end-of-month billing processes
      - Any concurrent invoice generation scenarios
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Batch invoice generation method in billing.service.ts</item>
      <item>Transaction wrapper implementation</item>
      <item>Isolation level configuration</item>
      <item>Error handling and rollback logic</item>
      <item>Retry mechanism for transient failures</item>
    </in_scope>

    <out_of_scope>
      <item>Single invoice creation (already uses transactions)</item>
      <item>Database schema changes</item>
      <item>Invoice number generation (separate task)</item>
      <item>External API calls within transactions</item>
    </out_of_scope>

    <affected_files>
      <file>apps/api/src/billing/billing.service.ts</file>
      <file>apps/api/src/billing/batch-invoice.service.ts</file>
      <file>apps/api/src/common/transaction.utils.ts</file>
    </affected_files>

    <dependencies>
      <dependency type="library">Prisma Client with transaction support</dependency>
      <dependency type="database">PostgreSQL with SERIALIZABLE support</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Wrap all batch invoice operations in Prisma interactive transactions
      with SERIALIZABLE isolation level. Implement retry logic for serialization
      failures and ensure atomic completion or rollback of entire batch.
    </approach>

    <steps>
      <step order="1">
        <description>Analyze current batch invoice flow</description>
        <details>
          - Map all database operations in batch generation
          - Identify points of potential interleaving
          - Document current error handling behavior
        </details>
      </step>

      <step order="2">
        <description>Create transaction utility wrapper</description>
        <details>
          - Implement reusable transaction wrapper with retry logic
          - Configure isolation levels per operation type
          - Add transaction timeout handling
        </details>
        <code_snippet>
```typescript
// apps/api/src/common/transaction.utils.ts
import { Prisma, PrismaClient } from '@prisma/client';

interface TransactionOptions {
  maxRetries?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout?: number;
}

export async function withSerializableTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    isolationLevel = Prisma.TransactionIsolationLevel.Serializable,
    timeout = 30000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel,
        timeout,
      });
    } catch (error) {
      lastError = error as Error;

      // Check if error is a serialization failure (retryable)
      if (isSerializationFailure(error)) {
        console.warn(
          `Transaction serialization failure, attempt ${attempt}/${maxRetries}`,
          { error: error.message }
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          await sleep(Math.pow(2, attempt) * 100);
          continue;
        }
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  throw lastError;
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // PostgreSQL serialization failure code
    return error.code === 'P2034' ||
           (error.meta?.code === '40001');
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Refactor batch invoice generation to use transactions</description>
        <details>
          - Wrap entire batch operation in transaction
          - Move all related queries inside transaction scope
          - Ensure invoice numbers are generated within transaction
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/billing.service.ts
import { withSerializableTransaction } from '../common/transaction.utils';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaClient) {}

  async generateBatchInvoices(
    organizationId: string,
    options: BatchInvoiceOptions
  ): Promise<BatchInvoiceResult> {
    return withSerializableTransaction(
      this.prisma,
      async (tx) => {
        // All operations now use 'tx' instead of 'this.prisma'

        // 1. Get pending billing items
        const pendingItems = await tx.billingItem.findMany({
          where: {
            organizationId,
            invoiceId: null,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'asc' },
        });

        if (pendingItems.length === 0) {
          return { invoices: [], itemsProcessed: 0 };
        }

        // 2. Group items by customer
        const itemsByCustomer = this.groupByCustomer(pendingItems);

        // 3. Generate invoices within transaction
        const invoices: Invoice[] = [];

        for (const [customerId, items] of Object.entries(itemsByCustomer)) {
          // Generate invoice number (atomic within transaction)
          const invoiceNumber = await this.generateInvoiceNumber(tx, organizationId);

          // Create invoice
          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              organizationId,
              customerId,
              status: 'DRAFT',
              lineItems: {
                create: items.map(item => ({
                  description: item.description,
                  amount: item.amount,
                  vatRate: item.vatRate,
                  vatAmount: item.vatAmount,
                })),
              },
            },
            include: { lineItems: true },
          });

          // Mark items as invoiced
          await tx.billingItem.updateMany({
            where: { id: { in: items.map(i => i.id) } },
            data: { invoiceId: invoice.id, status: 'INVOICED' },
          });

          invoices.push(invoice);
        }

        // 4. Create audit log entry
        await tx.auditLog.create({
          data: {
            action: 'BATCH_INVOICE_GENERATED',
            organizationId,
            metadata: {
              invoiceCount: invoices.length,
              itemCount: pendingItems.length,
            },
          },
        });

        return {
          invoices,
          itemsProcessed: pendingItems.length,
        };
      },
      {
        maxRetries: 3,
        timeout: 60000, // Longer timeout for batch operations
      }
    );
  }
}
```
        </code_snippet>
      </step>

      <step order="4">
        <description>Add batch operation locking mechanism</description>
        <details>
          - Implement advisory lock to prevent concurrent batch runs
          - Add batch operation status tracking
          - Implement graceful handling of lock contention
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/batch-invoice.service.ts
async acquireBatchLock(organizationId: string): Promise<boolean> {
  const lockKey = `batch_invoice_${organizationId}`;
  const lockId = this.hashToInt(lockKey);

  // PostgreSQL advisory lock
  const result = await this.prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
    SELECT pg_try_advisory_lock(${lockId})
  `;

  return result[0].pg_try_advisory_lock;
}

async releaseBatchLock(organizationId: string): Promise<void> {
  const lockKey = `batch_invoice_${organizationId}`;
  const lockId = this.hashToInt(lockKey);

  await this.prisma.$queryRaw`
    SELECT pg_advisory_unlock(${lockId})
  `;
}
```
        </code_snippet>
      </step>

      <step order="5">
        <description>Add comprehensive error handling</description>
        <details>
          - Implement partial batch recovery
          - Add detailed error logging
          - Create admin notification for batch failures
        </details>
      </step>
    </steps>

    <technical_notes>
      - SERIALIZABLE isolation prevents phantom reads and write skew
      - Advisory locks prevent concurrent batch operations at application level
      - Transaction timeout must accommodate largest expected batch size
      - External API calls should be made AFTER transaction commits
      - Consider breaking very large batches into smaller transactions
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Concurrent batch generation uses locking</description>
        <preconditions>Two simultaneous batch requests for same organization</preconditions>
        <expected_result>Second request waits or returns conflict error</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>Transaction rollback on partial failure</description>
        <preconditions>Batch with item that causes validation error</preconditions>
        <expected_result>No invoices created, all items remain pending</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>Serialization failure triggers retry</description>
        <preconditions>Simulated serialization conflict</preconditions>
        <expected_result>Operation retries and eventually succeeds</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Batch completes atomically</description>
        <preconditions>Large batch of 100+ items</preconditions>
        <expected_result>All invoices created or none, no partial state</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Transaction timeout handled gracefully</description>
        <preconditions>Batch that exceeds timeout duration</preconditions>
        <expected_result>Clean error, no data corruption, items retryable</expected_result>
      </test_case>
    </test_cases>

    <load_testing>
      <scenario>10 concurrent batch requests for different organizations</scenario>
      <scenario>Batch of 1000 items with simulated network latency</scenario>
      <scenario>Repeated batch requests with overlapping items</scenario>
    </load_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All batch invoice operations wrapped in SERIALIZABLE transactions</criterion>
      <criterion>Retry logic handles serialization failures</criterion>
      <criterion>Advisory locking prevents concurrent batch operations</criterion>
      <criterion>Complete rollback on any failure within batch</criterion>
      <criterion>Existing batch invoice tests pass</criterion>
      <criterion>New concurrency tests added and passing</criterion>
      <criterion>Load tests demonstrate no race conditions</criterion>
      <criterion>Error handling covers all failure modes</criterion>
      <criterion>Code reviewed by senior engineer</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">Transaction wrapper utility created</item>
      <item checked="false">Batch invoice service refactored</item>
      <item checked="false">Advisory lock mechanism implemented</item>
      <item checked="false">Unit tests for transaction behavior</item>
      <item checked="false">Integration tests for concurrency</item>
      <item checked="false">Load testing completed</item>
      <item checked="false">Monitoring/alerting configured</item>
      <item checked="false">Documentation updated</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="documentation">Prisma Interactive Transactions</reference>
    <reference type="documentation">PostgreSQL Transaction Isolation</reference>
    <reference type="issue">Incident Report - Duplicate Invoices</reference>
  </references>
</task_specification>
