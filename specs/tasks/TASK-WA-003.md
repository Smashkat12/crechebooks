<task_spec id="TASK-WA-003" version="2.0">

<metadata>
  <title>Statement Delivery via WhatsApp</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>262</sequence>
  <implements>
    <requirement_ref>REQ-WA-STATEMENT-001</requirement_ref>
    <requirement_ref>REQ-BILL-STATEMENT-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-035</task_ref>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="pending">TASK-WA-001</task_ref>
    <task_ref status="pending">TASK-WA-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/services/statement-delivery.service.ts` (add WhatsApp channel)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (add sendStatement)
  - `apps/api/src/integrations/whatsapp/types/whatsapp.types.ts` (add statement template)
  - `apps/api/src/notifications/adapters/whatsapp-channel.adapter.ts` (update for statements)

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/dto/whatsapp-statement.dto.ts` (NEW)
  - `apps/api/tests/integrations/whatsapp/whatsapp-statement.spec.ts` (NEW)

  **Current Problem:**
  - Statements can only be delivered via email
  - Parents who prefer WhatsApp don't receive statements
  - No WhatsApp template defined for statement notifications
  - Statement PDF cannot be sent via WhatsApp (document limits)

  **Existing Statement Delivery:**
  - Email delivery implemented in TASK-BILL-035
  - PDF generation implemented in statement-pdf.service.ts
  - Statement data includes: period, opening balance, transactions, closing balance

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Statement Template Definition
  ```typescript
  // Add to CRECHEBOOKS_TEMPLATES
  statement_notification: {
    params: [
      'parent_name',
      'child_name',
      'period_start',
      'period_end',
      'opening_balance',
      'total_charges',
      'total_payments',
      'closing_balance',
    ],
    language: 'en',
  },

  // Template text (create in Meta Business Manager):
  // "Hi {{1}}, here's your statement for {{2}} ({{3}} - {{4}}).
  // Opening: R{{5}} | Charges: R{{6}} | Payments: R{{7}} | Balance: R{{8}}
  // Full statement sent to your email."
  ```

  ### 3. WhatsApp Statement Service Method
  ```typescript
  /**
   * Send statement notification via WhatsApp
   * Note: Full PDF sent via email, WhatsApp gets summary only
   */
  async sendStatement(
    tenantId: string,
    parentId: string,
    statementData: StatementSummary,
  ): Promise<WhatsAppMessageResult> {
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      include: { children: true },
    });

    if (!parent) {
      throw new BusinessException('Parent not found', 'PARENT_NOT_FOUND');
    }

    // Check opt-in
    const optedIn = await this.checkOptIn(tenantId, parentId);
    if (!optedIn) {
      return { success: false, error: 'Parent not opted in for WhatsApp' };
    }

    const childName = parent.children[0]?.firstName || 'your child';

    return this.sendMessage(tenantId, parentId, {
      templateName: 'statement_notification',
      params: {
        parent_name: parent.firstName,
        child_name: childName,
        period_start: this.formatDate(statementData.periodStart),
        period_end: this.formatDate(statementData.periodEnd),
        opening_balance: this.formatCurrency(statementData.openingBalanceCents),
        total_charges: this.formatCurrency(statementData.totalChargesCents),
        total_payments: this.formatCurrency(statementData.totalPaymentsCents),
        closing_balance: this.formatCurrency(statementData.closingBalanceCents),
      },
      contextType: WhatsAppContextType.STATEMENT,
      contextId: statementData.id,
    });
  }

  private formatCurrency(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  ```

  ### 4. Statement Delivery Service Update
  ```typescript
  // In statement-delivery.service.ts

  async deliverStatement(
    tenantId: string,
    statementId: string,
    channels: DeliveryChannel[],
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    for (const channel of channels) {
      if (channel === 'email') {
        results.push(await this.deliverViaEmail(tenantId, statementId));
      } else if (channel === 'whatsapp') {
        results.push(await this.deliverViaWhatsApp(tenantId, statementId));
      }
    }

    return results;
  }

  private async deliverViaWhatsApp(
    tenantId: string,
    statementId: string,
  ): Promise<DeliveryResult> {
    const statement = await this.getStatementWithParent(statementId);

    const result = await this.whatsAppService.sendStatement(
      tenantId,
      statement.parentId,
      {
        id: statementId,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        openingBalanceCents: statement.openingBalanceCents,
        totalChargesCents: statement.totalChargesCents,
        totalPaymentsCents: statement.totalPaymentsCents,
        closingBalanceCents: statement.closingBalanceCents,
      },
    );

    return {
      channel: 'whatsapp',
      success: result.success,
      messageId: result.wamid,
      error: result.error,
    };
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
This task enables statement delivery via WhatsApp notification.

**Business Requirements:**
1. Parents can receive statement summaries via WhatsApp
2. Full PDF statement still sent via email
3. WhatsApp message includes key financial summary
4. Respect parent's channel preferences
5. Track delivery status

**South African Context:**
- Many parents prefer WhatsApp over email
- WhatsApp messages have 1024 character limit for text
- PDF documents up to 100MB supported (but prefer email for PDFs)
- Rand formatting: R1,234.56
</context>

<scope>
  <in_scope>
    - Add statement_notification template definition
    - Add sendStatement method to WhatsAppService
    - Update StatementDeliveryService for WhatsApp channel
    - Create StatementSummary type
    - Create DTOs for statement WhatsApp delivery
    - Unit tests for WhatsApp statement delivery
  </in_scope>
  <out_of_scope>
    - PDF attachment via WhatsApp (use email for PDFs)
    - Template creation in Meta Business Manager (manual)
    - Statement generation logic (existing)
    - Parent channel preferences UI (TASK-WA-004)
  </out_of_scope>
</scope>

<whatsapp_statement_template>
## Template for Meta Business Manager

**Template Name:** `statement_notification`
**Category:** UTILITY
**Language:** English

**Body Text:**
```
Hi {{1}}, here's the statement summary for {{2}}.

📅 Period: {{3}} - {{4}}
💰 Opening Balance: R{{5}}
📝 Total Charges: R{{6}}
💳 Total Payments: R{{7}}
📊 Closing Balance: R{{8}}

The full statement PDF has been sent to your email.
```

**Parameters:**
1. parent_name
2. child_name
3. period_start
4. period_end
5. opening_balance
6. total_charges
7. total_payments
8. closing_balance
</whatsapp_statement_template>

<verification_commands>
## Execution Order

```bash
# 1. Create DTOs
# Create apps/api/src/integrations/whatsapp/dto/whatsapp-statement.dto.ts

# 2. Update WhatsApp types
# Edit apps/api/src/integrations/whatsapp/types/whatsapp.types.ts

# 3. Update WhatsApp service
# Edit apps/api/src/integrations/whatsapp/whatsapp.service.ts

# 4. Update statement delivery service
# Edit apps/api/src/database/services/statement-delivery.service.ts

# 5. Update channel adapter
# Edit apps/api/src/notifications/adapters/whatsapp-channel.adapter.ts

# 6. Create tests
# Create apps/api/tests/integrations/whatsapp/whatsapp-statement.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Check WhatsApp opt-in before sending
    - Format currency as R1,234.56
    - Format dates as DD MMM YYYY
    - Include statement ID as context for tracking
    - Handle negative balances correctly (credit)
    - WhatsApp is notification only, PDF via email
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Send statement notification via WhatsApp
    - Test: Check opt-in before sending
    - Test: Format currency correctly
    - Test: Format date correctly
    - Test: Handle negative balance (credit)
    - Test: Track delivery in message history
    - Test: Return error if not opted in
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Send PDF attachment via WhatsApp (use email)
  - Skip opt-in check
  - Use raw cents values (convert to Rands)
  - Use ISO date format (use human-readable)
  - Forget to track message in history (TASK-WA-001)
</anti_patterns>

</task_spec>
