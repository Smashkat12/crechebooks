<task_spec id="TASK-XERO-003" version="1.0">

<metadata>
  <title>Payment Sync to Xero</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>151</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-XERO-004</requirement_ref>
    <requirement_ref>EC-INT-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-012</task_ref>
    <task_ref>TASK-XERO-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that payment sync to Xero
returns SKIPPED status. Payments are recorded in CrecheBooks but never
synced to Xero.

## Current State
- File: `apps/api/src/database/services/payment-allocation.service.ts` (lines 681-695)
- Method `syncToXero()` is a stub that returns `XeroSyncStatus.SKIPPED`
- Logs: `Xero sync: skipped (not implemented) for payment ${payment.id}`
- Called from `allocatePayment()` at line 182 and `splitTransaction()` at line 370
- Xero MCP tools exist but not integrated

## What Should Happen (Per PRD REQ-XERO-004)
Payment sync to Xero should:
1. Create Payment record in Xero when payment is allocated
2. Link Payment to the corresponding Xero Invoice
3. Handle partial payments correctly
4. Update Xero invoice status when fully paid
5. Return Xero Payment ID for tracking
6. Handle sync errors gracefully

## Project Context
- **Payment Allocation Service**: `apps/api/src/database/services/payment-allocation.service.ts`
- **Xero Sync Service**: `apps/api/src/database/services/xero-sync.service.ts`
- **Xero MCP Tools**: `apps/api/src/mcp/xero-mcp/tools/apply-payment.ts`
- **Invoice Xero Sync**: Already works via `XeroSyncService.syncInvoice()`
- **Parent Entity**: Has `xeroContactId` for linking to Xero contacts
- **Invoice Entity**: Has `xeroInvoiceId` for linking to Xero invoices
</context>

<input_context_files>
  <file purpose="payment_allocation_service">apps/api/src/database/services/payment-allocation.service.ts</file>
  <file purpose="xero_sync_service">apps/api/src/database/services/xero-sync.service.ts</file>
  <file purpose="apply_payment_tool">apps/api/src/mcp/xero-mcp/tools/apply-payment.ts</file>
  <file purpose="payment_entity">apps/api/src/database/entities/payment.entity.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="xero_dto">apps/api/src/database/dto/payment-allocation.dto.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-012 completed (PaymentAllocationService exists)</check>
  <check>TASK-XERO-001 completed (Xero authentication works)</check>
  <check>Invoice sync to Xero works</check>
  <check>Xero MCP tools configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Implement real syncToXero() method
    - Use Xero API to create Payment records
    - Link Payment to Xero Invoice
    - Store xeroPaymentId in Payment entity
    - Handle partial and full payments
    - Handle sync errors with retry logic
    - Update XeroSyncStatus appropriately
    - Audit logging for Xero sync
    - Unit tests with mocked Xero
  </in_scope>
  <out_of_scope>
    - Bi-directional payment sync (Xero to CrecheBooks)
    - Credit note sync
    - Refund sync
    - Batch payment sync
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/payment-allocation.service.ts">
      /**
       * Sync payment to Xero
       * @param payment - Payment to sync
       * @param invoice - Related invoice (needed for Xero invoice ID)
       * @returns Xero sync status
       */
      private async syncToXero(
        payment: Payment,
        invoice: Invoice,
      ): Promise&lt;XeroSyncStatus&gt;;
    </signature>

    <signature file="apps/api/src/database/services/xero-sync.service.ts">
      /**
       * Sync payment to Xero
       * @param payment - Payment record
       * @param invoice - Invoice being paid
       * @param parent - Parent who made payment
       * @returns Xero payment ID or null if failed
       */
      async syncPayment(
        payment: Payment,
        invoice: Invoice,
        parent: Parent,
      ): Promise&lt;string | null&gt;;
    </signature>
  </signatures>

  <constraints>
    - Only sync if invoice has xeroInvoiceId
    - Only sync if tenant has Xero connection
    - Handle API rate limits gracefully
    - Store xeroPaymentId in Payment entity
    - Log all sync attempts and results
    - Return SKIPPED if prerequisites not met
    - Return SYNCED on success
    - Return FAILED on error (with retry)
  </constraints>

  <verification>
    - Payment syncs to Xero successfully
    - Xero Payment ID stored in database
    - Partial payments sync correctly
    - Full payment updates invoice status in Xero
    - Sync errors logged and handled
    - SKIPPED returned when no Xero connection
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
XeroSyncService.syncPayment (apps/api/src/database/services/xero-sync.service.ts):

/**
 * Sync payment to Xero
 */
async syncPayment(
  payment: Payment,
  invoice: Invoice,
  parent: Parent,
): Promise<string | null> {
  this.logger.log(`Syncing payment ${payment.id} to Xero for invoice ${invoice.invoiceNumber}`);

  // Check prerequisites
  if (!invoice.xeroInvoiceId) {
    this.logger.warn(`Cannot sync payment: Invoice ${invoice.id} not synced to Xero`);
    return null;
  }

  // Get Xero tenant ID for this tenant
  const tenant = await this.tenantRepo.findById(payment.tenantId);
  if (!tenant?.xeroTenantId) {
    this.logger.warn(`Cannot sync payment: Tenant ${payment.tenantId} not connected to Xero`);
    return null;
  }

  try {
    // Use Xero SDK to create payment
    const xeroPayment = await this.xeroClient.accountingApi.createPayment(
      tenant.xeroTenantId,
      {
        payments: [{
          invoice: {
            invoiceID: invoice.xeroInvoiceId,
          },
          account: {
            code: this.getPaymentAccountCode(payment),
          },
          date: payment.paymentDate.toISOString().split('T')[0],
          amount: payment.amountCents / 100,
          reference: payment.reference || `CrecheBooks Payment ${payment.id}`,
        }],
      }
    );

    const xeroPaymentId = xeroPayment.body.payments?.[0]?.paymentID;

    if (xeroPaymentId) {
      // Update payment with Xero ID
      await this.paymentRepo.update(payment.id, {
        xeroPaymentId,
      });

      // Audit log
      await this.auditLogService.logAction({
        tenantId: payment.tenantId,
        entityType: 'Payment',
        entityId: payment.id,
        action: AuditAction.UPDATE,
        afterValue: { xeroPaymentId, syncType: 'XERO_PAYMENT_SYNC' },
        changeSummary: `Payment synced to Xero: ${xeroPaymentId}`,
      });

      this.logger.log(`Payment ${payment.id} synced to Xero: ${xeroPaymentId}`);
      return xeroPaymentId;
    }

    return null;

  } catch (error) {
    this.logger.error(
      `Failed to sync payment ${payment.id} to Xero: ${error.message}`,
      error.stack,
    );

    // Audit log failure
    await this.auditLogService.logAction({
      tenantId: payment.tenantId,
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.UPDATE,
      afterValue: { syncError: error.message, syncType: 'XERO_PAYMENT_SYNC_FAILED' },
      changeSummary: `Payment Xero sync failed: ${error.message}`,
    });

    return null;
  }
}

/**
 * Get appropriate Xero account code for payment
 */
private getPaymentAccountCode(payment: Payment): string {
  // Default to bank account
  // In production, this would map to tenant's configured payment accounts
  return '090'; // Standard bank account code
}

// Update PaymentAllocationService.syncToXero():

private async syncToXero(payment: Payment, invoice: Invoice): Promise<XeroSyncStatus> {
  try {
    // Get parent for contact info
    const parent = await this.parentRepo.findById(invoice.parentId);
    if (!parent) {
      this.logger.warn(`Cannot sync payment: Parent ${invoice.parentId} not found`);
      return XeroSyncStatus.SKIPPED;
    }

    // Sync via XeroSyncService
    const xeroPaymentId = await this.xeroSyncService.syncPayment(
      payment,
      invoice,
      parent,
    );

    if (xeroPaymentId) {
      return XeroSyncStatus.SYNCED;
    } else {
      return XeroSyncStatus.SKIPPED;
    }

  } catch (error) {
    this.logger.error(`Xero payment sync error: ${error.message}`);
    return XeroSyncStatus.FAILED;
  }
}

// Update allocatePayment() to pass invoice:

async allocatePayment(dto: AllocatePaymentDto): Promise<PaymentAllocationResult> {
  // ... existing code ...

  // Get invoice for sync
  const invoice = await this.invoiceRepository.findById(dto.invoiceId, tenantId);

  // Sync to Xero
  const xeroSyncStatus = await this.syncToXero(payment, invoice);

  // ... rest of method ...
}
</pseudo_code>

<files_to_modify>
  <file path="apps/api/src/database/services/payment-allocation.service.ts">Update syncToXero() to call XeroSyncService</file>
  <file path="apps/api/src/database/services/xero-sync.service.ts">Add syncPayment() method</file>
  <file path="apps/api/src/database/repositories/payment.repository.ts">Ensure xeroPaymentId can be updated</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/__tests__/xero-payment-sync.spec.ts">Unit tests for payment sync</file>
</files_to_create>

<validation_criteria>
  <criterion>Payment syncs to Xero on allocation</criterion>
  <criterion>Xero Payment ID stored in database</criterion>
  <criterion>XeroSyncStatus.SYNCED returned on success</criterion>
  <criterion>XeroSyncStatus.SKIPPED when no Xero connection</criterion>
  <criterion>XeroSyncStatus.FAILED on API error</criterion>
  <criterion>Audit log entries created</criterion>
  <criterion>Partial payments handled correctly</criterion>
  <criterion>Unit tests pass with mocked Xero</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- payment-allocation.service</command>
  <command>npm run test -- xero-sync.service</command>
  <command>npm run test -- xero-payment-sync</command>
</test_commands>

</task_spec>
