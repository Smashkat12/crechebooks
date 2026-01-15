<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-005</task_id>
    <title>Optimize Duplicate Detection Memory</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Performance Optimization</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>4-8 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>performance</tag>
      <tag>duplicate-detection</tag>
      <tag>memory-optimization</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      The duplicate detection service fetches up to 10,000 transactions into memory for
      comparison when checking for duplicates. This approach has poor scalability, causes
      memory pressure, and becomes increasingly slow as transaction volumes grow.
    </problem_statement>

    <current_behavior>
      - Loads up to 10,000 recent transactions into memory
      - Performs in-memory comparison for each new transaction
      - Memory usage: O(n) where n = min(total_transactions, 10,000)
      - Query time increases linearly with transaction count
      - Potential OOM issues with high-volume accounts
    </current_behavior>

    <expected_behavior>
      - Database-level hash comparison queries
      - Constant memory usage regardless of transaction volume
      - Indexed hash column for O(1) lookup
      - Configurable duplicate detection window
      - Batch processing support for imports
    </expected_behavior>

    <impact>
      - Memory usage: Reduced from ~100MB to constant ~1MB
      - Query performance: O(1) instead of O(n) lookups
      - Scalability: Support unlimited transaction volumes
      - Server stability: No OOM risk from large datasets
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/transactions/duplicate-detection.service.ts</path>
        <changes>Replace in-memory comparison with database query</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/transactions/__tests__/duplicate-detection.service.spec.ts</path>
        <purpose>Performance and correctness tests</purpose>
      </file>
    </files_to_create>

    <database_changes>
      <migration>
        <name>add-transaction-hash-index</name>
        <description>Add index on transaction_hash column</description>
      </migration>
    </database_changes>

    <out_of_scope>
      <item>Hash algorithm changes (separate task TASK-TXN-006)</item>
      <item>UI for duplicate management</item>
      <item>Automated duplicate resolution</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Replace the in-memory transaction loading with database queries using the
      transaction hash as the primary lookup key. Add a database index on the hash
      column and implement efficient batch checking for import scenarios.
    </approach>

    <database_schema>
```sql
-- Migration: add-transaction-hash-index
-- Add index for fast hash lookups
CREATE INDEX CONCURRENTLY idx_transactions_hash
ON transactions (transaction_hash)
WHERE deleted_at IS NULL;

-- Add composite index for time-bounded duplicate checks
CREATE INDEX CONCURRENTLY idx_transactions_hash_date
ON transactions (transaction_hash, transaction_date)
WHERE deleted_at IS NULL;

-- Add index for account-specific duplicate checks
CREATE INDEX CONCURRENTLY idx_transactions_account_hash
ON transactions (account_id, transaction_hash)
WHERE deleted_at IS NULL;
```
    </database_schema>

    <pseudocode>
```typescript
interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingTransactionId?: string;
  matchType?: 'exact' | 'probable' | 'none';
  confidence: number;
}

interface BatchDuplicateResult {
  duplicates: Map<string, string>; // hash -> existing transaction ID
  unique: string[]; // hashes not found
  checkTime: number;
}

@Injectable()
export class DuplicateDetectionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check single transaction for duplicates using database query
   * O(1) lookup with indexed hash
   */
  async checkDuplicate(
    accountId: string,
    transactionHash: string,
    transactionDate: Date,
    windowDays?: number
  ): Promise<DuplicateCheckResult> {
    const lookbackDays = windowDays ?? this.configService.get('DUPLICATE_WINDOW_DAYS', 90);
    const windowStart = new Date(transactionDate);
    windowStart.setDate(windowStart.getDate() - lookbackDays);

    // Single indexed query - O(1) with proper index
    const existing = await this.transactionRepository.findOne({
      where: {
        accountId,
        transactionHash,
        transactionDate: MoreThanOrEqual(windowStart),
        deletedAt: IsNull(),
      },
      select: ['id', 'transactionHash', 'transactionDate'],
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingTransactionId: existing.id,
        matchType: 'exact',
        confidence: 1.0,
      };
    }

    return {
      isDuplicate: false,
      matchType: 'none',
      confidence: 0,
    };
  }

  /**
   * Batch check multiple transactions for duplicates
   * Uses single query with IN clause for efficiency
   */
  async checkDuplicatesBatch(
    accountId: string,
    hashes: string[],
    windowStart: Date
  ): Promise<BatchDuplicateResult> {
    const startTime = Date.now();

    if (hashes.length === 0) {
      return {
        duplicates: new Map(),
        unique: [],
        checkTime: Date.now() - startTime,
      };
    }

    // Deduplicate input hashes
    const uniqueHashes = [...new Set(hashes)];

    // Single batch query - much more efficient than N queries
    const existingTransactions = await this.transactionRepository
      .createQueryBuilder('t')
      .select(['t.id', 't.transactionHash'])
      .where('t.accountId = :accountId', { accountId })
      .andWhere('t.transactionHash IN (:...hashes)', { hashes: uniqueHashes })
      .andWhere('t.transactionDate >= :windowStart', { windowStart })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    // Build results map
    const duplicates = new Map<string, string>();
    for (const tx of existingTransactions) {
      duplicates.set(tx.transactionHash, tx.id);
    }

    // Find unique hashes (not in database)
    const unique = uniqueHashes.filter(hash => !duplicates.has(hash));

    return {
      duplicates,
      unique,
      checkTime: Date.now() - startTime,
    };
  }

  /**
   * Optimized import duplicate check
   * Processes in configurable batch sizes
   */
  async checkImportDuplicates(
    accountId: string,
    transactions: Array<{ hash: string; date: Date }>,
    options?: { batchSize?: number; windowDays?: number }
  ): Promise<{
    duplicateHashes: Set<string>;
    uniqueHashes: Set<string>;
    totalChecked: number;
    checkTime: number;
  }> {
    const batchSize = options?.batchSize ?? 500;
    const windowDays = options?.windowDays ?? 90;
    const startTime = Date.now();

    const duplicateHashes = new Set<string>();
    const uniqueHashes = new Set<string>();

    // Find earliest date for window calculation
    const earliestDate = transactions.reduce(
      (min, tx) => (tx.date < min ? tx.date : min),
      transactions[0]?.date ?? new Date()
    );

    const windowStart = new Date(earliestDate);
    windowStart.setDate(windowStart.getDate() - windowDays);

    // Process in batches to avoid query size limits
    const allHashes = transactions.map(tx => tx.hash);

    for (let i = 0; i < allHashes.length; i += batchSize) {
      const batch = allHashes.slice(i, i + batchSize);
      const result = await this.checkDuplicatesBatch(accountId, batch, windowStart);

      for (const hash of result.duplicates.keys()) {
        duplicateHashes.add(hash);
      }
      for (const hash of result.unique) {
        uniqueHashes.add(hash);
      }
    }

    return {
      duplicateHashes,
      uniqueHashes,
      totalChecked: transactions.length,
      checkTime: Date.now() - startTime,
    };
  }
}
```
    </pseudocode>

    <technical_notes>
      - Use CREATE INDEX CONCURRENTLY to avoid blocking production
      - Batch queries limited to 500 hashes to avoid query plan issues
      - IN clause more efficient than multiple single queries
      - Consider partitioning for very high-volume accounts
      - Add query explain analysis for index verification
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should find duplicate using database query</name>
        <input>Existing transaction hash</input>
        <expected_result>isDuplicate: true, existingTransactionId populated</expected_result>
      </test_case>
      <test_case>
        <name>Should not find duplicate for new hash</name>
        <input>New unique hash</input>
        <expected_result>isDuplicate: false</expected_result>
      </test_case>
      <test_case>
        <name>Should respect time window for duplicates</name>
        <input>Old transaction hash outside window</input>
        <expected_result>isDuplicate: false (outside detection window)</expected_result>
      </test_case>
      <test_case>
        <name>Should handle batch duplicate check efficiently</name>
        <input>1000 hashes (mix of duplicates and unique)</input>
        <expected_result>Correct results in under 100ms</expected_result>
      </test_case>
      <test_case>
        <name>Should maintain constant memory usage</name>
        <input>Check against account with 100,000 transactions</input>
        <expected_result>Memory usage stays constant (~1MB)</expected_result>
      </test_case>
      <test_case>
        <name>Should use index for queries (EXPLAIN)</name>
        <input>EXPLAIN ANALYZE on duplicate check query</input>
        <expected_result>Index Scan on idx_transactions_hash</expected_result>
      </test_case>
    </test_cases>

    <performance_benchmarks>
      <benchmark>
        <name>Single duplicate check</name>
        <target>< 10ms</target>
        <dataset>Account with 100,000 transactions</dataset>
      </benchmark>
      <benchmark>
        <name>Batch check 1000 hashes</name>
        <target>< 100ms</target>
        <dataset>Account with 100,000 transactions</dataset>
      </benchmark>
      <benchmark>
        <name>Memory usage during check</name>
        <target>< 5MB overhead</target>
        <dataset>Any dataset size</dataset>
      </benchmark>
    </performance_benchmarks>

    <manual_verification>
      <step>Run EXPLAIN ANALYZE on duplicate check query</step>
      <step>Verify index is used in query plan</step>
      <step>Load test with 10,000 concurrent checks</step>
      <step>Monitor memory usage during bulk import</step>
      <step>Compare query times before/after optimization</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Database query replaces in-memory comparison</criterion>
      <criterion>Hash column index created and verified</criterion>
      <criterion>Batch duplicate check supports import scenarios</criterion>
      <criterion>Memory usage remains constant regardless of data size</criterion>
      <criterion>Query performance meets benchmark targets</criterion>
      <criterion>EXPLAIN shows index usage</criterion>
      <criterion>Unit tests cover all scenarios</criterion>
      <criterion>Performance tests validate scalability</criterion>
      <criterion>Migration tested on staging environment</criterion>
      <criterion>Documentation updated with performance characteristics</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>Duplicate Detection Service</title>
      <path>apps/api/src/transactions/duplicate-detection.service.ts</path>
    </reference>
    <reference>
      <title>PostgreSQL Index Documentation</title>
      <url>https://www.postgresql.org/docs/current/indexes.html</url>
    </reference>
  </references>
</task_specification>
