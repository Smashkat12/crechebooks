<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-006</task_id>
    <title>Improve Transaction Hash Algorithm</title>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <category>Enhancement</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>2-4 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>hashing</tag>
      <tag>deduplication</tag>
      <tag>security</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      The current transaction hash algorithm uses simple string concatenation to create
      a deduplication key. This approach has collision risk, particularly for transactions
      with similar attributes, and lacks the security properties of a proper cryptographic
      hash function.
    </problem_statement>

    <current_behavior>
      - Simple concatenation: `${date}|${amount}|${description}`
      - No normalization of input strings
      - Collision risk with similar transactions
      - Not cryptographically secure
      - Variable-length output
    </current_behavior>

    <expected_behavior>
      - SHA-256 hash for collision resistance
      - Normalized input string handling
      - Fixed-length hash output (64 hex characters)
      - Deterministic results across systems
      - Include additional fields for uniqueness
    </expected_behavior>

    <impact>
      - Data integrity: Reduced false positive/negative duplicates
      - Security: Cryptographic hash prevents tampering detection bypass
      - Consistency: Same transaction always produces same hash
      - Storage: Fixed-length hashes optimize index storage
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/transactions/transaction-hash.service.ts</path>
        <changes>Replace concatenation with SHA-256 hashing</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/transactions/__tests__/transaction-hash.service.spec.ts</path>
        <purpose>Hash algorithm tests including collision detection</purpose>
      </file>
    </files_to_create>

    <database_changes>
      <migration>
        <name>update-hash-column-length</name>
        <description>Ensure hash column can store 64 character SHA-256 hex</description>
      </migration>
    </database_changes>

    <out_of_scope>
      <item>Rehashing existing transactions (migration task)</item>
      <item>Hash verification UI</item>
      <item>Cross-tenant deduplication</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Implement a robust hashing algorithm using Node.js crypto module with SHA-256.
      Normalize all input fields before hashing to ensure consistent results. Include
      additional transaction metadata to reduce collision probability.
    </approach>

    <pseudocode>
```typescript
import { createHash } from 'crypto';

interface HashableTransaction {
  accountId: string;
  transactionDate: Date | string;
  amount: number | string;
  description: string;
  reference?: string;
  bankReference?: string;
}

interface HashResult {
  hash: string;
  algorithm: string;
  inputNormalized: string;
  version: number;
}

@Injectable()
export class TransactionHashService {
  private readonly HASH_VERSION = 2; // Increment when algorithm changes
  private readonly ALGORITHM = 'sha256';

  /**
   * Generate SHA-256 hash for transaction deduplication
   * Version 2: Includes additional fields and normalization
   */
  generateHash(transaction: HashableTransaction): HashResult {
    // Normalize all input fields
    const normalizedInput = this.normalizeInput(transaction);

    // Create SHA-256 hash
    const hash = createHash(this.ALGORITHM)
      .update(normalizedInput, 'utf8')
      .digest('hex');

    return {
      hash,
      algorithm: this.ALGORITHM,
      inputNormalized: normalizedInput,
      version: this.HASH_VERSION,
    };
  }

  /**
   * Normalize input for consistent hashing
   */
  private normalizeInput(transaction: HashableTransaction): string {
    const parts: string[] = [];

    // Account ID (required)
    parts.push(this.normalizeString(transaction.accountId));

    // Date (required) - normalize to ISO date string
    parts.push(this.normalizeDate(transaction.transactionDate));

    // Amount (required) - normalize to fixed decimal
    parts.push(this.normalizeAmount(transaction.amount));

    // Description (required) - normalize whitespace and case
    parts.push(this.normalizeDescription(transaction.description));

    // Reference (optional) - only include if present
    if (transaction.reference) {
      parts.push(this.normalizeString(transaction.reference));
    }

    // Bank reference (optional) - only include if present
    if (transaction.bankReference) {
      parts.push(this.normalizeString(transaction.bankReference));
    }

    // Join with delimiter that won't appear in normalized values
    return parts.join('\x00'); // Null byte separator
  }

  /**
   * Normalize string: trim, lowercase, remove multiple spaces
   */
  private normalizeString(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Normalize date to YYYY-MM-DD format
   */
  private normalizeDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date for hash calculation');
    }
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Normalize amount to fixed decimal string
   */
  private normalizeAmount(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) {
      throw new BadRequestException('Invalid amount for hash calculation');
    }
    // Fixed 2 decimal places, remove trailing zeros issues
    return num.toFixed(2);
  }

  /**
   * Normalize description for consistent matching
   */
  private normalizeDescription(description: string): string {
    return description
      .trim()
      .toLowerCase()
      // Remove common variable elements
      .replace(/\d{2}:\d{2}:\d{2}/g, '') // Remove time stamps
      .replace(/\d{2}\/\d{2}\/\d{4}/g, '') // Remove date formats
      .replace(/ref[:\s]*[\w-]+/gi, 'ref') // Normalize reference prefixes
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  /**
   * Verify hash matches transaction
   */
  verifyHash(transaction: HashableTransaction, expectedHash: string): boolean {
    const result = this.generateHash(transaction);
    return result.hash === expectedHash;
  }

  /**
   * Compare two transactions for similarity (fuzzy matching)
   */
  calculateSimilarity(tx1: HashableTransaction, tx2: HashableTransaction): number {
    // Exact hash match = 100% similar
    const hash1 = this.generateHash(tx1);
    const hash2 = this.generateHash(tx2);

    if (hash1.hash === hash2.hash) {
      return 1.0;
    }

    // Calculate component-wise similarity
    let score = 0;
    let weights = 0;

    // Date match (high weight)
    if (this.normalizeDate(tx1.transactionDate) === this.normalizeDate(tx2.transactionDate)) {
      score += 0.3;
    }
    weights += 0.3;

    // Amount match (high weight)
    if (this.normalizeAmount(tx1.amount) === this.normalizeAmount(tx2.amount)) {
      score += 0.3;
    }
    weights += 0.3;

    // Description similarity (medium weight)
    const desc1 = this.normalizeDescription(tx1.description);
    const desc2 = this.normalizeDescription(tx2.description);
    score += 0.4 * this.stringSimilarity(desc1, desc2);
    weights += 0.4;

    return score / weights;
  }

  /**
   * Simple string similarity (Jaccard index on words)
   */
  private stringSimilarity(s1: string, s2: string): number {
    const words1 = new Set(s1.split(' '));
    const words2 = new Set(s2.split(' '));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}
```
    </pseudocode>

    <technical_notes>
      - SHA-256 provides 2^128 collision resistance (birthday bound)
      - Null byte separator prevents input manipulation attacks
      - Version field enables future algorithm upgrades
      - Normalized input stored for debugging/auditing
      - Consider HMAC-SHA256 if hash secrecy is needed
    </technical_notes>

    <migration_strategy>
      Phase 1: Deploy new hash algorithm for new transactions
      Phase 2: Run background job to rehash existing transactions
      Phase 3: Update duplicate detection to use new hashes
      Phase 4: Remove old hash column after transition period
    </migration_strategy>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should generate consistent hash for same input</name>
        <input>Same transaction processed twice</input>
        <expected_result>Identical hash values</expected_result>
      </test_case>
      <test_case>
        <name>Should generate different hash for different amounts</name>
        <input>Transactions differing only in amount</input>
        <expected_result>Different hash values</expected_result>
      </test_case>
      <test_case>
        <name>Should handle whitespace variations</name>
        <input>"  WOOLWORTHS  FOOD  " vs "woolworths food"</input>
        <expected_result>Same normalized hash</expected_result>
      </test_case>
      <test_case>
        <name>Should handle date format variations</name>
        <input>Date as Date object vs ISO string</input>
        <expected_result>Same hash for same date</expected_result>
      </test_case>
      <test_case>
        <name>Should produce fixed 64 character output</name>
        <input>Any valid transaction</input>
        <expected_result>Hash length === 64</expected_result>
      </test_case>
      <test_case>
        <name>Should not collide for similar transactions</name>
        <input>1000 similar transactions with minor variations</input>
        <expected_result>No hash collisions</expected_result>
      </test_case>
      <test_case>
        <name>Should verify correct hash</name>
        <input>Transaction and its correct hash</input>
        <expected_result>verifyHash returns true</expected_result>
      </test_case>
      <test_case>
        <name>Should reject tampered transaction</name>
        <input>Transaction with modified amount, original hash</input>
        <expected_result>verifyHash returns false</expected_result>
      </test_case>
    </test_cases>

    <collision_testing>
      <test>
        <name>Birthday attack simulation</name>
        <description>Generate 100,000 hashes and verify no collisions</description>
        <expected_result>Zero collisions (mathematically extremely unlikely)</expected_result>
      </test>
      <test>
        <name>Similar input collision test</name>
        <description>Test transactions with sequential amounts (100.00-100.99)</description>
        <expected_result>All unique hashes</expected_result>
      </test>
    </collision_testing>

    <manual_verification>
      <step>Generate hash and verify with online SHA-256 tool</step>
      <step>Test normalization with edge case descriptions</step>
      <step>Verify hash length is always 64 characters</step>
      <step>Compare performance with old concatenation method</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>SHA-256 hash algorithm implemented</criterion>
      <criterion>Input normalization handles edge cases</criterion>
      <criterion>Fixed 64-character hex output</criterion>
      <criterion>Version field for future upgrades</criterion>
      <criterion>Hash verification method implemented</criterion>
      <criterion>Unit tests cover normalization scenarios</criterion>
      <criterion>Collision tests pass</criterion>
      <criterion>Performance benchmarks acceptable</criterion>
      <criterion>Migration strategy documented</criterion>
      <criterion>Database column updated if needed</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>Transaction Hash Service</title>
      <path>apps/api/src/transactions/transaction-hash.service.ts</path>
    </reference>
    <reference>
      <title>Node.js Crypto Documentation</title>
      <url>https://nodejs.org/api/crypto.html</url>
    </reference>
    <reference>
      <title>SHA-256 Specification</title>
      <url>https://csrc.nist.gov/publications/detail/fips/180/4/final</url>
    </reference>
  </references>
</task_specification>
