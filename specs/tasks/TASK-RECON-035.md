<task_spec id="TASK-RECON-035" version="2.0">

<metadata>
  <title>Implement Split Transaction Matching</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>193</sequence>
  <implements>
    <requirement_ref>REQ-RECON-SPLIT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-015</task_ref>
    <task_ref status="complete">TASK-RECON-019</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/database/services/split-transaction-matcher.service.ts` (NEW)
  - `apps/api/src/database/dto/split-transaction.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/database/services/bank-statement-reconciliation.service.ts`
  - `apps/api/src/api/reconciliation/reconciliation.controller.ts`
  - `apps/api/src/api/reconciliation/reconciliation.module.ts`
  - `apps/api/prisma/schema.prisma` (add SplitMatch model)

  **Current Problem:**
  Bank statement reconciliation only matches 1:1 (one bank transaction to one invoice/payment). Real-world scenarios include:
  1. Parent pays multiple invoices with single bank transfer
  2. Single invoice paid in multiple installments
  3. Batch payments processed as single bank entry

  **Example Scenarios:**
  - R10,000 bank deposit = Invoice A (R3,500) + Invoice B (R4,000) + Invoice C (R2,500)
  - Invoice X (R5,000) = Payment 1 (R2,000) + Payment 2 (R2,000) + Payment 3 (R1,000)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Split Match Model
  ```prisma
  model SplitMatch {
    id                  String   @id @default(uuid())
    tenantId            String   @map("tenant_id")
    bankTransactionId   String   @map("bank_transaction_id")
    matchType           String   @map("match_type") // ONE_TO_MANY, MANY_TO_ONE
    totalAmountCents    Int      @map("total_amount_cents")
    matchedAmountCents  Int      @map("matched_amount_cents")
    remainderCents      Int      @map("remainder_cents")
    status              String   @default("PENDING") // PENDING, CONFIRMED, REJECTED
    createdAt           DateTime @default(now()) @map("created_at")
    updatedAt           DateTime @updatedAt @map("updated_at")

    tenant          Tenant            @relation(fields: [tenantId], references: [id])
    bankTransaction BankTransaction   @relation(fields: [bankTransactionId], references: [id])
    components      SplitMatchComponent[]

    @@index([tenantId, status])
    @@map("split_matches")
  }

  model SplitMatchComponent {
    id              String   @id @default(uuid())
    splitMatchId    String   @map("split_match_id")
    invoiceId       String?  @map("invoice_id")
    paymentId       String?  @map("payment_id")
    amountCents     Int      @map("amount_cents")
    createdAt       DateTime @default(now()) @map("created_at")

    splitMatch SplitMatch @relation(fields: [splitMatchId], references: [id])
    invoice    Invoice?   @relation(fields: [invoiceId], references: [id])
    payment    Payment?   @relation(fields: [paymentId], references: [id])

    @@map("split_match_components")
  }
  ```

  ### 3. Service Pattern
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';
  import Decimal from 'decimal.js';

  @Injectable()
  export class SplitTransactionMatcherService {
    private readonly logger = new Logger(SplitTransactionMatcherService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Find potential split matches for a bank transaction
     * @param tenantId - Tenant identifier
     * @param bankTransactionId - Bank transaction to match
     * @param toleranceCents - Matching tolerance (default 100 = R1.00)
     */
    async findPotentialSplitMatches(
      tenantId: string,
      bankTransactionId: string,
      toleranceCents: number = 100,
    ): Promise<SplitMatchSuggestion[]> {
      const bankTxn = await this.getBankTransaction(bankTransactionId);

      // Find invoices that could sum to the bank transaction amount
      const unpaidInvoices = await this.getUnpaidInvoices(tenantId);

      // Use subset sum algorithm to find combinations
      const combinations = this.findMatchingCombinations(
        bankTxn.amountCents,
        unpaidInvoices,
        toleranceCents,
      );

      return combinations.map(combo => this.toSuggestion(bankTxn, combo));
    }

    /**
     * Confirm a split match
     */
    async confirmSplitMatch(
      tenantId: string,
      splitMatchId: string,
    ): Promise<SplitMatch> {
      return this.prisma.$transaction(async (tx) => {
        const splitMatch = await tx.splitMatch.update({
          where: { id: splitMatchId },
          data: { status: 'CONFIRMED' },
          include: { components: true },
        });

        // Update invoice/payment statuses
        for (const component of splitMatch.components) {
          if (component.invoiceId) {
            await this.updateInvoiceStatus(tx, component.invoiceId);
          }
          if (component.paymentId) {
            await this.updatePaymentStatus(tx, component.paymentId);
          }
        }

        return splitMatch;
      });
    }

    /**
     * Subset sum algorithm with tolerance
     * Uses dynamic programming for efficiency
     */
    private findMatchingCombinations(
      targetCents: number,
      items: InvoiceItem[],
      toleranceCents: number,
    ): InvoiceItem[][] {
      // Implementation using DP subset sum with tolerance window
    }
  }
  ```

  ### 4. Controller Pattern
  ```typescript
  @Get('split-matches/:bankTransactionId/suggestions')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get split match suggestions for a bank transaction' })
  async getSplitMatchSuggestions(
    @CurrentUser() user: IUser,
    @Param('bankTransactionId') bankTransactionId: string,
    @Query('tolerance') tolerance?: number,
  ): Promise<SplitMatchSuggestionDto[]> {
    return this.splitMatcherService.findPotentialSplitMatches(
      user.tenantId,
      bankTransactionId,
      tolerance,
    );
  }

  @Post('split-matches')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a split match' })
  async createSplitMatch(
    @CurrentUser() user: IUser,
    @Body() dto: CreateSplitMatchDto,
  ): Promise<SplitMatchDto> {
    return this.splitMatcherService.createSplitMatch(user.tenantId, dto);
  }

  @Post('split-matches/:id/confirm')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Confirm a split match' })
  async confirmSplitMatch(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<SplitMatchDto> {
    return this.splitMatcherService.confirmSplitMatch(user.tenantId, id);
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements split transaction matching for bank reconciliation. It handles real-world scenarios where a single bank transaction matches multiple invoices/payments, or multiple bank transactions match a single invoice.

**Match Types:**
1. **ONE_TO_MANY** - One bank transaction to many invoices
   - Example: Parent pays all outstanding invoices with single transfer
2. **MANY_TO_ONE** - Many payments to one invoice
   - Example: Invoice paid in installments

**Algorithm:**
- Uses subset sum algorithm with tolerance window
- Suggests best combinations to users
- Requires explicit confirmation (no auto-matching)

**South African Context:**
- Common for creches to receive bundled payments from employers (ECD subsidies)
- Some parents pay multiple months at once
- Corporate billing often consolidated
</context>

<scope>
  <in_scope>
    - Create SplitTransactionMatcherService
    - Add SplitMatch and SplitMatchComponent models
    - Implement subset sum algorithm for matching
    - Create API endpoints for split match suggestions
    - Allow manual split match creation
    - Confirmation workflow for split matches
    - Handle remainder amounts (overpayments)
    - Update invoice/payment statuses on confirmation
    - Integrate with existing reconciliation service
  </in_scope>
  <out_of_scope>
    - Automatic split match without user confirmation
    - Cross-tenant split matching
    - Split matching for Xero (handle via separate Xero sync)
    - Credit note allocation in splits
    - Partial refunds in splits
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add SplitMatch and SplitMatchComponent models

# 2. Run migration
npx prisma migrate dev --name add_split_match_models

# 3. Create DTOs
# Create apps/api/src/database/dto/split-transaction.dto.ts

# 4. Create service
# Create apps/api/src/database/services/split-transaction-matcher.service.ts

# 5. Update controller
# Edit apps/api/src/api/reconciliation/reconciliation.controller.ts

# 6. Update module
# Edit apps/api/src/api/reconciliation/reconciliation.module.ts

# 7. Create tests
# Create apps/api/tests/database/services/split-transaction-matcher.service.spec.ts

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values in cents (integer)
    - Use Decimal.js for calculations
    - Tolerance configurable (default R1.00 = 100 cents)
    - Subset sum limited to max 10 items for performance
    - User must confirm all split matches
    - Remainder tracked for overpayments
    - Transaction for confirmation (all-or-nothing)
    - Multi-tenant isolation enforced
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Find 1-to-many match suggestions
    - Test: Find many-to-1 match suggestions
    - Test: Tolerance window working
    - Test: Create split match with components
    - Test: Confirm split match updates statuses
    - Test: Reject split match removes suggestion
    - Test: Remainder calculation correct
    - Test: Subset sum performance with 10 items
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Auto-confirm split matches (user must confirm)
  - Use floating point for money calculations
  - Allow cross-tenant matching
  - Skip transaction for confirmation
  - Exceed 10-item combinations (performance)
  - Ignore tolerance in matching
</anti_patterns>

</task_spec>
