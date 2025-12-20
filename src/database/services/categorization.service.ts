/**
 * Categorization Service
 * TASK-TRANS-012: Transaction Categorization Service
 *
 * @module database/services/categorization
 * @description Orchestrates AI-powered transaction categorization.
 * Handles pattern matching, AI categorization, and split transactions.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';
import { AuditLogService } from './audit-log.service';
import { PatternLearningService } from './pattern-learning.service';
import {
  CategorizationBatchResult,
  CategorizationItemResult,
  UserCategorizationDto,
  CategorySuggestion,
  PatternMatchResult,
  AICategorization,
  SplitItemDto,
  CATEGORIZATION_CONSTANTS,
} from '../dto/categorization-service.dto';
import {
  VatType,
  CategorizationSource,
} from '../entities/categorization.entity';
import { TransactionStatus } from '../entities/transaction.entity';
import { CreateCategorizationDto } from '../dto/categorization.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly payeePatternRepo: PayeePatternRepository,
    private readonly auditLogService: AuditLogService,
    @Inject(forwardRef(() => PatternLearningService))
    private readonly patternLearningService: PatternLearningService,
  ) {}

  /**
   * Categorize a batch of transactions
   * @param transactionIds - Array of transaction IDs to categorize
   * @param tenantId - Tenant ID for isolation
   * @returns Batch result with statistics
   */
  async categorizeTransactions(
    transactionIds: string[],
    tenantId: string,
  ): Promise<CategorizationBatchResult> {
    this.logger.log(
      `Starting batch categorization for ${transactionIds.length} transactions`,
    );

    const results: CategorizationItemResult[] = [];
    let autoCategorized = 0;
    let reviewRequired = 0;
    let failed = 0;
    let totalConfidence = 0;
    let patternMatches = 0;

    // Fetch all transactions at once
    const transactions = await this.transactionRepo.findByIds(
      tenantId,
      transactionIds,
    );

    const foundIds = new Set(transactions.map((t) => t.id));
    const missingIds = transactionIds.filter((id) => !foundIds.has(id));

    // Add failed results for missing transactions
    for (const id of missingIds) {
      results.push({
        transactionId: id,
        status: 'FAILED',
        source: CategorizationSource.AI_AUTO,
        error: 'Transaction not found',
      });
      failed++;
    }

    // Process each transaction
    for (const transaction of transactions) {
      try {
        const result = await this.categorizeTransaction(
          transaction.id,
          tenantId,
        );
        results.push(result);

        if (result.status === 'AUTO_APPLIED') {
          autoCategorized++;
          if (result.source === CategorizationSource.RULE_BASED) {
            patternMatches++;
          }
        } else if (result.status === 'REVIEW_REQUIRED') {
          reviewRequired++;
        } else {
          failed++;
        }

        if (result.confidenceScore) {
          totalConfidence += result.confidenceScore;
        }
      } catch (error) {
        this.logger.error(
          `Failed to categorize transaction ${transaction.id}: ${JSON.stringify({ tenantId })}`,
          error instanceof Error ? error.stack : String(error),
        );
        results.push({
          transactionId: transaction.id,
          status: 'FAILED',
          source: CategorizationSource.AI_AUTO,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    const processedCount = autoCategorized + reviewRequired;
    const avgConfidence =
      processedCount > 0 ? totalConfidence / processedCount : 0;
    const patternMatchRate =
      processedCount > 0 ? (patternMatches / processedCount) * 100 : 0;

    return {
      totalProcessed: transactionIds.length,
      autoCategorized,
      reviewRequired,
      failed,
      results,
      statistics: {
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        patternMatchRate: Math.round(patternMatchRate * 100) / 100,
      },
    };
  }

  /**
   * Categorize a single transaction
   * @param transactionId - Transaction ID to categorize
   * @param tenantId - Tenant ID for isolation
   * @returns Categorization result
   */
  async categorizeTransaction(
    transactionId: string,
    tenantId: string,
  ): Promise<CategorizationItemResult> {
    // Fetch transaction
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // Try pattern match first
    const patternMatch = await this.tryPatternMatch(transaction, tenantId);

    // Get AI categorization
    const aiResult = await this.invokeAIAgent(transaction, tenantId);

    // Calculate final confidence
    let finalConfidence = aiResult.confidenceScore;
    let source = CategorizationSource.AI_AUTO;

    if (patternMatch) {
      finalConfidence = Math.min(
        100,
        aiResult.confidenceScore + patternMatch.confidenceBoost,
      );
      source = CategorizationSource.RULE_BASED;

      // Increment pattern match count
      await this.payeePatternRepo.incrementMatchCount(patternMatch.pattern.id);
    }

    // Determine if auto-apply or review required
    const isAutoApply =
      finalConfidence >= CATEGORIZATION_CONSTANTS.AUTO_THRESHOLD;
    const status = isAutoApply ? 'AUTO_APPLIED' : 'REVIEW_REQUIRED';
    const transactionStatus = isAutoApply
      ? TransactionStatus.CATEGORIZED
      : TransactionStatus.REVIEW_REQUIRED;

    // Create categorization record
    const categorizationDto: CreateCategorizationDto = {
      transactionId,
      accountCode: aiResult.accountCode,
      accountName: aiResult.accountName,
      confidenceScore: finalConfidence,
      reasoning: aiResult.reasoning,
      source: isAutoApply ? source : CategorizationSource.AI_SUGGESTED,
      isSplit: aiResult.isSplit,
      splitAmountCents: aiResult.isSplit ? transaction.amountCents : undefined,
      vatAmountCents: this.calculateVatAmount(
        transaction.amountCents,
        aiResult.vatType,
      ),
      vatType: aiResult.vatType,
    };

    const categorization =
      await this.categorizationRepo.create(categorizationDto);

    // Update transaction status
    await this.transactionRepo.updateStatus(
      tenantId,
      transactionId,
      transactionStatus,
    );

    // Create audit trail
    await this.auditLogService.logCreate({
      tenantId,
      agentId: 'categorization-service',
      entityType: 'Categorization',
      entityId: categorization.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(categorization)),
    });

    return {
      transactionId,
      status,
      accountCode: aiResult.accountCode,
      accountName: aiResult.accountName,
      confidenceScore: finalConfidence,
      source: categorizationDto.source,
    };
  }

  /**
   * Update categorization with user override
   * @param transactionId - Transaction ID
   * @param dto - User categorization data
   * @param userId - User performing the override
   * @param tenantId - Tenant ID for isolation
   * @returns Updated transaction
   */
  async updateCategorization(
    transactionId: string,
    dto: UserCategorizationDto,
    userId: string,
    tenantId: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // Validate splits if provided
    if (dto.isSplit && dto.splits) {
      this.validateSplits(dto.splits, transaction.amountCents);
    }

    // Get existing categorization (if any)
    const existingCats =
      await this.categorizationRepo.findByTransaction(transactionId);
    const beforeValue = existingCats.length > 0 ? existingCats[0] : null;

    if (dto.isSplit && dto.splits) {
      // Delete existing categorizations for split
      for (const cat of existingCats) {
        await this.categorizationRepo.delete(cat.id);
      }

      // Create split categorizations
      for (const split of dto.splits) {
        const splitDto: CreateCategorizationDto = {
          transactionId,
          accountCode: split.accountCode,
          accountName: split.accountName,
          confidenceScore: 100,
          reasoning: 'User override - split transaction',
          source: CategorizationSource.USER_OVERRIDE,
          isSplit: true,
          splitAmountCents: split.amountCents,
          vatAmountCents: this.calculateVatAmount(
            split.amountCents,
            split.vatType,
          ),
          vatType: split.vatType,
        };
        await this.categorizationRepo.create(splitDto);
      }
    } else {
      if (existingCats.length > 0) {
        // Update existing
        await this.categorizationRepo.review(existingCats[0].id, {
          reviewedBy: userId,
          accountCode: dto.accountCode,
          accountName: dto.accountName,
          vatType: dto.vatType,
          vatAmountCents: this.calculateVatAmount(
            transaction.amountCents,
            dto.vatType,
          ),
        });
      } else {
        // Create new
        const newDto: CreateCategorizationDto = {
          transactionId,
          accountCode: dto.accountCode,
          accountName: dto.accountName,
          confidenceScore: 100,
          reasoning: 'User manual categorization',
          source: CategorizationSource.USER_OVERRIDE,
          isSplit: false,
          vatAmountCents: this.calculateVatAmount(
            transaction.amountCents,
            dto.vatType,
          ),
          vatType: dto.vatType,
        };
        await this.categorizationRepo.create(newDto);
      }
    }

    // Update transaction status
    await this.transactionRepo.updateStatus(
      tenantId,
      transactionId,
      TransactionStatus.CATEGORIZED,
    );

    // Create audit trail
    const afterCats =
      await this.categorizationRepo.findByTransaction(transactionId);
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Categorization',
      entityId: transactionId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: beforeValue ? JSON.parse(JSON.stringify(beforeValue)) : null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(afterCats)),
      changeSummary: 'User override categorization',
    });

    // Learn from user correction if createPattern is true or by default for non-split
    if (dto.createPattern !== false && !dto.isSplit) {
      try {
        await this.patternLearningService.learnFromCorrection(
          transactionId,
          dto.accountCode,
          dto.accountName,
          tenantId,
        );
        this.logger.log(
          `Learned pattern from user correction for transaction ${transactionId}`,
        );
      } catch (error) {
        // Log but don't fail - pattern learning is non-critical
        this.logger.warn(
          `Failed to learn pattern from correction: ${transactionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // Return updated transaction
    const updated = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!updated) {
      throw new NotFoundException('Transaction', transactionId);
    }
    return updated;
  }

  /**
   * Get categorization suggestions for a transaction
   * @param transactionId - Transaction ID
   * @param tenantId - Tenant ID for isolation
   * @returns Array of suggestions from different sources
   */
  async getSuggestions(
    transactionId: string,
    tenantId: string,
  ): Promise<CategorySuggestion[]> {
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    const suggestions: CategorySuggestion[] = [];

    // 1. Check pattern match
    if (transaction.payeeName) {
      const pattern = await this.payeePatternRepo.findByPayeeName(
        tenantId,
        transaction.payeeName,
      );
      if (pattern) {
        suggestions.push({
          accountCode: pattern.defaultAccountCode,
          accountName: pattern.defaultAccountName,
          confidenceScore: 85 + Number(pattern.confidenceBoost),
          reason: `Matches payee pattern: ${pattern.payeePattern}`,
          source: 'PATTERN',
        });
      }
    }

    // 2. Get AI suggestion
    const aiResult = await this.invokeAIAgent(transaction, tenantId);
    suggestions.push({
      accountCode: aiResult.accountCode,
      accountName: aiResult.accountName,
      confidenceScore: aiResult.confidenceScore,
      reason: aiResult.reasoning,
      source: 'AI',
    });

    // 3. Get similar transaction suggestions
    const similar = await this.categorizationRepo.findSimilarByDescription(
      tenantId,
      transaction.description,
      3,
    );
    for (const sim of similar) {
      // Don't duplicate AI or pattern suggestions
      if (
        !suggestions.some(
          (s) => s.accountCode === sim.accountCode && s.source !== 'SIMILAR_TX',
        )
      ) {
        suggestions.push({
          accountCode: sim.accountCode,
          accountName: sim.accountName,
          confidenceScore: Math.min(75, sim.count * 10 + 40),
          reason: `Similar to ${sim.count} previous transaction(s)`,
          source: 'SIMILAR_TX',
        });
      }
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Try to match transaction against payee patterns
   * @param transaction - Transaction to match
   * @param tenantId - Tenant ID for isolation
   * @returns Pattern match result or null
   */
  private async tryPatternMatch(
    transaction: Transaction,
    tenantId: string,
  ): Promise<PatternMatchResult | null> {
    if (!transaction.payeeName) {
      return null;
    }

    try {
      const pattern = await this.payeePatternRepo.findByPayeeName(
        tenantId,
        transaction.payeeName,
      );

      if (pattern) {
        return {
          pattern,
          confidenceBoost: Number(pattern.confidenceBoost),
        };
      }
    } catch (error) {
      this.logger.warn(
        `Pattern match failed for payee: ${transaction.payeeName}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return null;
  }

  /**
   * Invoke AI agent for categorization
   * This is a placeholder that returns deterministic categorizations
   * Will be replaced with actual Claude API in TASK-AGENT-002
   *
   * @param transaction - Transaction to categorize
   * @param _tenantId - Tenant ID (unused in placeholder)
   * @returns AI categorization result
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async invokeAIAgent(
    transaction: Transaction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantId: string,
  ): Promise<AICategorization> {
    const description = transaction.description.toUpperCase();
    const isCredit = transaction.isCredit;

    // Deterministic placeholder based on keywords
    if (
      description.includes('WOOLWORTHS') ||
      description.includes('CHECKERS') ||
      description.includes('PICK N PAY') ||
      description.includes('SPAR')
    ) {
      return {
        accountCode: '5100',
        accountName: 'Groceries & Supplies',
        confidenceScore: 85,
        reasoning: 'Matched grocery store retailer',
        vatType: VatType.STANDARD,
        isSplit: false,
      };
    }

    if (
      description.includes('ELECTRICITY') ||
      description.includes('ESKOM') ||
      description.includes('WATER') ||
      description.includes('MUNICIPAL')
    ) {
      return {
        accountCode: '5200',
        accountName: 'Utilities',
        confidenceScore: 90,
        reasoning: 'Matched utility provider',
        vatType: VatType.STANDARD,
        isSplit: false,
      };
    }

    if (
      description.includes('SALARY') ||
      description.includes('WAGE') ||
      description.includes('PAYROLL')
    ) {
      return {
        accountCode: '5300',
        accountName: 'Salaries & Wages',
        confidenceScore: 92,
        reasoning: 'Matched payroll/salary payment',
        vatType: VatType.NO_VAT,
        isSplit: false,
      };
    }

    if (isCredit && description.includes('FEE')) {
      return {
        accountCode: '4100',
        accountName: 'Fee Income',
        confidenceScore: 88,
        reasoning: 'Matched fee income payment',
        vatType: VatType.EXEMPT,
        isSplit: false,
      };
    }

    if (isCredit) {
      return {
        accountCode: '4900',
        accountName: 'Other Income',
        confidenceScore: 65,
        reasoning: 'Credit transaction - general income',
        vatType: VatType.EXEMPT,
        isSplit: false,
      };
    }

    // Default for expenses
    return {
      accountCode: '5900',
      accountName: 'General Expenses',
      confidenceScore: 55,
      reasoning: 'No specific category matched - general expense',
      vatType: VatType.STANDARD,
      isSplit: false,
    };
  }

  /**
   * Validate split amounts equal transaction total
   * @param splits - Array of split items
   * @param totalCents - Transaction total in cents
   * @throws BusinessException if amounts don't match
   */
  private validateSplits(splits: SplitItemDto[], totalCents: number): void {
    if (splits.length === 0) {
      throw new BusinessException(
        'Split transaction must have at least one split',
        'SPLITS_REQUIRED',
      );
    }

    const splitTotal = splits.reduce((sum, s) => sum + s.amountCents, 0);
    const difference = Math.abs(splitTotal - totalCents);

    if (difference > CATEGORIZATION_CONSTANTS.SPLIT_TOLERANCE_CENTS) {
      throw new BusinessException(
        `Split amounts (${splitTotal}) don't equal transaction total (${totalCents}). Difference: ${difference} cents`,
        'SPLIT_AMOUNT_MISMATCH',
      );
    }
  }

  /**
   * Calculate VAT amount based on type
   * @param amountCents - Base amount in cents
   * @param vatType - VAT type
   * @returns VAT amount in cents
   */
  private calculateVatAmount(
    amountCents: number,
    vatType: VatType,
  ): number | undefined {
    if (vatType !== VatType.STANDARD) {
      return undefined;
    }

    // VAT is 15% in South Africa
    // Amount includes VAT, so VAT = Amount * 15/115
    return Math.round((amountCents * 15) / 115);
  }
}
