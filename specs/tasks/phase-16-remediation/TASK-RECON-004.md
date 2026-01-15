<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-RECON-004</task_id>
    <title>Improve Multiple Match Ambiguity Handling</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>6 hours</estimated_effort>
    <assigned_to>TBD</assigned_to>
    <tags>reconciliation, matching, ambiguity, manual-review</tags>
  </metadata>

  <context>
    <problem_statement>
      When a bank statement entry could potentially match multiple system transactions,
      the current implementation arbitrarily selects the first match found. This "first
      match wins" approach can lead to incorrect matches and creates no visibility into
      alternative matching possibilities.

      Example scenario: A bank entry for R500 could match either:
      - Transaction A: R500 invoice payment from Customer X
      - Transaction B: R500 invoice payment from Customer Y

      Currently, whichever transaction appears first in the query result becomes the
      match, regardless of other factors that might indicate a better match.
    </problem_statement>

    <business_impact>
      - Incorrect matches require manual correction after the fact
      - No audit trail of why a particular match was chosen
      - Users have no visibility into potential alternatives
      - Reduces trust in automated reconciliation
      - Increased manual reconciliation workload
    </business_impact>

    <root_cause>
      The matching algorithm prioritizes speed over accuracy by returning immediately
      upon finding any match above threshold, without evaluating all candidates.
    </root_cause>
  </context>

  <scope>
    <in_scope>
      - Implement comprehensive match scoring for all candidates
      - Define scoring criteria (amount closeness, date proximity, reference match, etc.)
      - Flag entries with multiple high-confidence matches as "ambiguous"
      - Create ambiguous match review queue
      - Provide match alternatives in reconciliation results
      - Add confidence differential threshold for ambiguity detection
    </in_scope>

    <out_of_scope>
      - UI for resolving ambiguous matches (separate task)
      - Machine learning-based match improvement
      - Historical match pattern analysis
    </out_of_scope>

    <affected_files>
      <file path="apps/api/src/reconciliation/matching.service.ts" change_type="modify">
        Implement comprehensive scoring and ambiguity detection
      </file>
      <file path="apps/api/src/reconciliation/types/match-result.types.ts" change_type="create">
        Type definitions for match results with alternatives
      </file>
      <file path="apps/api/src/reconciliation/dto/ambiguous-match.dto.ts" change_type="create">
        DTO for ambiguous match records
      </file>
      <file path="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts" change_type="modify">
        Handle ambiguous matches in reconciliation flow
      </file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      1. Define comprehensive match scoring criteria
      2. Evaluate ALL potential matches, not just the first
      3. Rank matches by composite score
      4. Detect ambiguity when multiple matches are close in score
      5. Route ambiguous matches to manual review queue
      6. Provide full context for each alternative match
    </approach>

    <technical_details>
      <code_changes>
        <change file="apps/api/src/reconciliation/types/match-result.types.ts">
          ```typescript
          export interface MatchCandidate {
            transactionId: string;
            score: number;
            scoreBreakdown: MatchScoreBreakdown;
            transaction: TransactionSummary;
          }

          export interface MatchScoreBreakdown {
            amountScore: number;      // 0-40 points
            dateScore: number;        // 0-20 points
            referenceScore: number;   // 0-25 points
            descriptionScore: number; // 0-15 points
            totalScore: number;       // 0-100 points
          }

          export interface MatchResult {
            bankEntryId: string;
            status: 'matched' | 'unmatched' | 'ambiguous';
            bestMatch: MatchCandidate | null;
            alternatives: MatchCandidate[];
            ambiguityReason?: string;
            requiresReview: boolean;
          }

          export interface AmbiguousMatch {
            id: string;
            bankEntryId: string;
            bankEntry: BankStatementEntrySummary;
            candidates: MatchCandidate[];
            scoreDifferential: number;
            createdAt: Date;
            resolvedAt?: Date;
            resolvedBy?: string;
            resolution?: 'accepted' | 'rejected' | 'manual';
            selectedTransactionId?: string;
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/matching.service.ts">
          ```typescript
          import { Injectable, Logger } from '@nestjs/common';
          import {
            MatchCandidate,
            MatchResult,
            MatchScoreBreakdown,
            AmbiguousMatch
          } from './types/match-result.types';
          import { ToleranceConfigService } from './config/tolerance.config';

          // Scoring weights
          const SCORE_WEIGHTS = {
            AMOUNT_EXACT: 40,
            AMOUNT_WITHIN_TOLERANCE: 30,
            DATE_SAME_DAY: 20,
            DATE_WITHIN_TOLERANCE: 15,
            REFERENCE_EXACT: 25,
            REFERENCE_PARTIAL: 15,
            DESCRIPTION_MATCH: 15,
          } as const;

          // Ambiguity threshold: if top two matches are within this score difference
          const AMBIGUITY_THRESHOLD = 10;

          @Injectable()
          export class MatchingService {
            private readonly logger = new Logger(MatchingService.name);

            constructor(
              private readonly toleranceConfig: ToleranceConfigService,
            ) {}

            /**
             * Find and score all potential matches for a bank entry.
             * Returns the best match along with alternatives if ambiguous.
             */
            async findMatches(
              bankEntry: BankStatementEntry,
              transactions: Transaction[]
            ): Promise<MatchResult> {
              const candidates: MatchCandidate[] = [];

              // Score ALL transactions
              for (const transaction of transactions) {
                const scoreBreakdown = this.calculateScoreBreakdown(bankEntry, transaction);

                if (scoreBreakdown.totalScore >= 50) { // Minimum threshold
                  candidates.push({
                    transactionId: transaction.id,
                    score: scoreBreakdown.totalScore,
                    scoreBreakdown,
                    transaction: this.summarizeTransaction(transaction),
                  });
                }
              }

              // Sort by score descending
              candidates.sort((a, b) => b.score - a.score);

              // No matches found
              if (candidates.length === 0) {
                return {
                  bankEntryId: bankEntry.id,
                  status: 'unmatched',
                  bestMatch: null,
                  alternatives: [],
                  requiresReview: false,
                };
              }

              // Single match
              if (candidates.length === 1) {
                return {
                  bankEntryId: bankEntry.id,
                  status: 'matched',
                  bestMatch: candidates[0],
                  alternatives: [],
                  requiresReview: false,
                };
              }

              // Multiple candidates - check for ambiguity
              const scoreDifferential = candidates[0].score - candidates[1].score;
              const isAmbiguous = scoreDifferential < AMBIGUITY_THRESHOLD;

              if (isAmbiguous) {
                this.logger.warn(
                  `Ambiguous match detected for bank entry ${bankEntry.id}. ` +
                  `Top scores: ${candidates[0].score}, ${candidates[1].score}`
                );

                return {
                  bankEntryId: bankEntry.id,
                  status: 'ambiguous',
                  bestMatch: candidates[0],
                  alternatives: candidates.slice(1, 5), // Top 5 alternatives
                  ambiguityReason: `Multiple matches with similar scores (differential: ${scoreDifferential.toFixed(1)})`,
                  requiresReview: true,
                };
              }

              // Clear winner
              return {
                bankEntryId: bankEntry.id,
                status: 'matched',
                bestMatch: candidates[0],
                alternatives: candidates.slice(1, 3), // Show top alternatives for reference
                requiresReview: false,
              };
            }

            /**
             * Calculate detailed score breakdown for a potential match.
             */
            private calculateScoreBreakdown(
              bankEntry: BankStatementEntry,
              transaction: Transaction
            ): MatchScoreBreakdown {
              let amountScore = 0;
              let dateScore = 0;
              let referenceScore = 0;
              let descriptionScore = 0;

              // Amount scoring
              const amountDiff = Math.abs(bankEntry.amount - transaction.amount);
              if (amountDiff === 0) {
                amountScore = SCORE_WEIGHTS.AMOUNT_EXACT;
              } else if (this.toleranceConfig.isWithinTolerance(amountDiff, bankEntry.amount)) {
                amountScore = SCORE_WEIGHTS.AMOUNT_WITHIN_TOLERANCE;
              }

              // Date scoring
              const dateDiff = Math.abs(
                bankEntry.date.getTime() - transaction.date.getTime()
              ) / (1000 * 60 * 60 * 24);

              if (dateDiff === 0) {
                dateScore = SCORE_WEIGHTS.DATE_SAME_DAY;
              } else if (dateDiff <= this.toleranceConfig.dateTolerance) {
                dateScore = SCORE_WEIGHTS.DATE_WITHIN_TOLERANCE;
              }

              // Reference scoring
              if (bankEntry.reference && transaction.reference) {
                const bankRef = bankEntry.reference.toLowerCase().trim();
                const txnRef = transaction.reference.toLowerCase().trim();

                if (bankRef === txnRef) {
                  referenceScore = SCORE_WEIGHTS.REFERENCE_EXACT;
                } else if (bankRef.includes(txnRef) || txnRef.includes(bankRef)) {
                  referenceScore = SCORE_WEIGHTS.REFERENCE_PARTIAL;
                }
              }

              // Description scoring (fuzzy match)
              if (bankEntry.description && transaction.description) {
                const similarity = this.calculateStringSimilarity(
                  bankEntry.description,
                  transaction.description
                );
                descriptionScore = Math.floor(similarity * SCORE_WEIGHTS.DESCRIPTION_MATCH);
              }

              const totalScore = amountScore + dateScore + referenceScore + descriptionScore;

              return {
                amountScore,
                dateScore,
                referenceScore,
                descriptionScore,
                totalScore,
              };
            }

            /**
             * Calculate string similarity using Levenshtein distance.
             */
            private calculateStringSimilarity(str1: string, str2: string): number {
              const s1 = str1.toLowerCase();
              const s2 = str2.toLowerCase();

              if (s1 === s2) return 1;
              if (s1.length === 0 || s2.length === 0) return 0;

              const matrix: number[][] = [];

              for (let i = 0; i <= s1.length; i++) {
                matrix[i] = [i];
              }

              for (let j = 0; j <= s2.length; j++) {
                matrix[0][j] = j;
              }

              for (let i = 1; i <= s1.length; i++) {
                for (let j = 1; j <= s2.length; j++) {
                  const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                  matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                  );
                }
              }

              const maxLength = Math.max(s1.length, s2.length);
              return 1 - matrix[s1.length][s2.length] / maxLength;
            }

            private summarizeTransaction(txn: Transaction): TransactionSummary {
              return {
                id: txn.id,
                amount: txn.amount,
                date: txn.date,
                reference: txn.reference,
                description: txn.description,
                type: txn.type,
              };
            }
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts">
          ```typescript
          // Update reconciliation flow to handle ambiguous matches

          async reconcile(
            bankEntries: BankStatementEntry[],
            transactions: Transaction[]
          ): Promise<ReconciliationResult> {
            const matchResults: MatchResult[] = [];
            const ambiguousMatches: AmbiguousMatch[] = [];
            const matchedTransactionIds = new Set<string>();

            for (const entry of bankEntries) {
              const availableTransactions = transactions.filter(
                t => !matchedTransactionIds.has(t.id)
              );

              const result = await this.matchingService.findMatches(
                entry,
                availableTransactions
              );

              matchResults.push(result);

              if (result.status === 'matched' && result.bestMatch) {
                matchedTransactionIds.add(result.bestMatch.transactionId);
              } else if (result.status === 'ambiguous') {
                // Create ambiguous match record for review
                const ambiguousRecord = await this.createAmbiguousMatch(entry, result);
                ambiguousMatches.push(ambiguousRecord);
              }
            }

            return {
              id: generateId(),
              status: ambiguousMatches.length > 0 ? 'requires_review' : 'completed',
              matchedCount: matchResults.filter(r => r.status === 'matched').length,
              unmatchedCount: matchResults.filter(r => r.status === 'unmatched').length,
              ambiguousCount: ambiguousMatches.length,
              ambiguousMatches,
              matchResults,
              // ... other fields
            };
          }

          private async createAmbiguousMatch(
            entry: BankStatementEntry,
            result: MatchResult
          ): Promise<AmbiguousMatch> {
            return this.prisma.ambiguousMatch.create({
              data: {
                bankEntryId: entry.id,
                candidates: result.alternatives,
                scoreDifferential: result.bestMatch
                  ? result.bestMatch.score - (result.alternatives[0]?.score || 0)
                  : 0,
              },
            });
          }
          ```
        </change>
      </code_changes>
    </technical_details>

    <dependencies>
      - TASK-RECON-001 (Amount Tolerance) - uses tolerance for scoring
      - TASK-RECON-003 (Standardize Tolerance) - uses shared config
    </dependencies>

    <risks>
      <risk level="medium">
        Performance impact from evaluating all candidates. Mitigated by early
        filtering based on minimum score threshold.
      </risk>
      <risk level="medium">
        More items requiring manual review may overwhelm users initially.
        Mitigated by clear documentation and adjustable ambiguity threshold.
      </risk>
    </risks>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001" type="unit">
        <description>Single match returns matched status without alternatives</description>
        <input>One transaction matching bank entry</input>
        <expected>status: 'matched', alternatives: [], requiresReview: false</expected>
      </test_case>

      <test_case id="TC-002" type="unit">
        <description>No matches returns unmatched status</description>
        <input>No transactions matching bank entry</input>
        <expected>status: 'unmatched', bestMatch: null</expected>
      </test_case>

      <test_case id="TC-003" type="unit">
        <description>Similar scores trigger ambiguous status</description>
        <input>Two transactions with scores 85 and 82</input>
        <expected>status: 'ambiguous', requiresReview: true</expected>
      </test_case>

      <test_case id="TC-004" type="unit">
        <description>Clear winner with large score gap returns matched</description>
        <input>Transactions with scores 95, 70, 60</input>
        <expected>status: 'matched', bestMatch.score: 95</expected>
      </test_case>

      <test_case id="TC-005" type="unit">
        <description>Score breakdown correctly weighted</description>
        <input>Exact amount and date match</input>
        <expected>amountScore: 40, dateScore: 20</expected>
      </test_case>

      <test_case id="TC-006" type="integration">
        <description>Reconciliation creates ambiguous match records</description>
        <input>Bank entries with ambiguous matches</input>
        <expected>AmbiguousMatch records created in database</expected>
      </test_case>
    </test_cases>

    <acceptance_criteria>
      - All potential matches are scored, not just the first
      - Score breakdown is available for each match
      - Ambiguous matches are flagged when score differential is below threshold
      - Ambiguous match records are created for manual review
      - Reconciliation result includes ambiguousCount and ambiguousMatches
      - Clear audit trail of why matches were flagged as ambiguous
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item status="pending">MatchResult and MatchCandidate types defined</item>
      <item status="pending">AmbiguousMatch type and database model created</item>
      <item status="pending">Comprehensive scoring algorithm implemented</item>
      <item status="pending">Ambiguity detection logic implemented</item>
      <item status="pending">Reconciliation service updated to handle ambiguous matches</item>
      <item status="pending">Unit tests for all scoring scenarios</item>
      <item status="pending">Integration tests for ambiguous match flow</item>
      <item status="pending">Performance validated with realistic data volumes</item>
      <item status="pending">Code reviewed and approved</item>
      <item status="pending">Documentation for scoring criteria and thresholds</item>
    </checklist>

    <review_notes>
      Pay attention to the AMBIGUITY_THRESHOLD value. Too low will flag too many
      matches for review, too high may miss genuine ambiguities. Consider making
      this configurable after initial deployment based on user feedback.
    </review_notes>
  </definition_of_done>
</task_specification>
