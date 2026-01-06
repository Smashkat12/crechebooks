# TASK-STMT-007: Statement Delivery Service

## Metadata
- **Task ID**: TASK-STMT-007
- **Phase**: 12 - Account Statements
- **Layer**: logic
- **Priority**: P2-HIGH
- **Dependencies**: TASK-STMT-005, TASK-BILL-015, TASK-NOTIF-002
- **Estimated Effort**: 4 hours

## Objective
Create a service to deliver statements to parents via email, SMS, and WhatsApp, leveraging existing notification infrastructure.

## Technical Requirements

### 1. Statement Delivery Service (`apps/api/src/database/services/statement-delivery.service.ts`)

```typescript
export interface DeliverStatementInput {
  tenantId: string;
  statementId: string;
  channel: 'email' | 'sms' | 'whatsapp';
  recipientOverride?: string; // Optional override for email/phone
  userId: string;
}

export interface BulkDeliverStatementsInput {
  tenantId: string;
  statementIds: string[];
  channel: 'email' | 'sms' | 'whatsapp';
  userId: string;
}

@Injectable()
export class StatementDeliveryService {
  constructor(
    private readonly statementRepo: StatementRepository,
    private readonly statementPdfService: StatementPdfService,
    private readonly parentRepo: ParentRepository,
    private readonly notificationService: MultiChannelNotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Send statement to parent via specified channel
   */
  async deliverStatement(input: DeliverStatementInput): Promise<DeliveryResult> {
    const statement = await this.statementRepo.findById(input.statementId);
    if (!statement || statement.tenantId !== input.tenantId) {
      throw new NotFoundException('Statement', input.statementId);
    }

    const parent = await this.parentRepo.findById(statement.parentId);

    // Generate PDF
    const pdfBuffer = await this.statementPdfService.generatePdf(
      input.tenantId,
      input.statementId
    );

    // Send via appropriate channel
    let result: DeliveryResult;
    switch (input.channel) {
      case 'email':
        result = await this.sendViaEmail(parent, statement, pdfBuffer);
        break;
      case 'sms':
        result = await this.sendViaSms(parent, statement);
        break;
      case 'whatsapp':
        result = await this.sendViaWhatsApp(parent, statement, pdfBuffer);
        break;
    }

    // Update statement delivery status
    await this.statementRepo.update(input.statementId, {
      deliveryStatus: result.success ? 'DELIVERED' : 'FAILED',
      deliveredAt: result.success ? new Date() : undefined,
      deliveryChannel: input.channel,
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'Statement',
      entityId: input.statementId,
      changeSummary: `Statement ${result.success ? 'sent' : 'failed'} via ${input.channel}`,
    });

    return result;
  }

  /**
   * Bulk send statements
   */
  async bulkDeliverStatements(
    input: BulkDeliverStatementsInput
  ): Promise<BulkDeliveryResult> {
    const results = await Promise.allSettled(
      input.statementIds.map(statementId =>
        this.deliverStatement({
          tenantId: input.tenantId,
          statementId,
          channel: input.channel,
          userId: input.userId,
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    return {
      total: results.length,
      successful,
      failed,
      errors: results
        .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
        .map((r, i) => ({
          statementId: input.statementIds[i],
          error: r.status === 'rejected' ? r.reason.message : r.value?.error,
        })),
    };
  }

  private async sendViaEmail(
    parent: Parent,
    statement: Statement,
    pdfBuffer: Buffer
  ): Promise<DeliveryResult> {
    return this.notificationService.send({
      channel: 'email',
      recipient: parent.email,
      subject: `Account Statement - ${statement.statementNumber}`,
      template: 'statement-delivery',
      data: {
        parentName: `${parent.firstName} ${parent.lastName}`,
        statementNumber: statement.statementNumber,
        periodStart: this.formatDate(statement.periodStart),
        periodEnd: this.formatDate(statement.periodEnd),
        closingBalance: this.formatCurrency(statement.closingBalanceCents),
      },
      attachments: [
        {
          filename: `Statement_${statement.statementNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  private async sendViaSms(
    parent: Parent,
    statement: Statement
  ): Promise<DeliveryResult> {
    const message = `Dear ${parent.firstName}, your account statement ${statement.statementNumber} is ready. ` +
      `Balance due: ${this.formatCurrency(statement.closingBalanceCents)}. ` +
      `Please check your email or parent portal for details.`;

    return this.notificationService.send({
      channel: 'sms',
      recipient: parent.phone,
      message,
    });
  }

  private async sendViaWhatsApp(
    parent: Parent,
    statement: Statement,
    pdfBuffer: Buffer
  ): Promise<DeliveryResult> {
    return this.notificationService.send({
      channel: 'whatsapp',
      recipient: parent.phone,
      template: 'statement_delivery',
      data: {
        parentName: parent.firstName,
        statementNumber: statement.statementNumber,
        closingBalance: this.formatCurrency(statement.closingBalanceCents),
      },
      mediaUrl: await this.uploadPdfAndGetUrl(pdfBuffer, statement.statementNumber),
    });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(date));
  }

  private formatCurrency(cents: number): string {
    return `R ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }
}
```

### 2. Email Template (`apps/api/src/notifications/templates/statement-delivery.hbs`)

```handlebars
<!DOCTYPE html>
<html>
<head>
  <style>
    .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: #1e40af; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .summary { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .balance { font-size: 24px; font-weight: bold; color: #dc2626; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Account Statement</h1>
    </div>
    <div class="content">
      <p>Dear {{parentName}},</p>
      <p>Please find attached your account statement for the period {{periodStart}} to {{periodEnd}}.</p>

      <div class="summary">
        <p><strong>Statement Number:</strong> {{statementNumber}}</p>
        <p><strong>Statement Period:</strong> {{periodStart}} - {{periodEnd}}</p>
        <p><strong>Amount Due:</strong> <span class="balance">{{closingBalance}}</span></p>
      </div>

      <p>Please review the attached PDF for a detailed breakdown of all transactions.</p>

      <p>If you have any questions about this statement, please contact us.</p>

      <p>Thank you for choosing our creche!</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/database/services/statement-delivery.service.ts` | CREATE | Delivery service |
| `apps/api/src/database/services/statement-delivery.service.spec.ts` | CREATE | Service tests |
| `apps/api/src/notifications/templates/statement-delivery.hbs` | CREATE | Email template |
| `apps/api/src/database/database.module.ts` | MODIFY | Register service |

## Acceptance Criteria

- [ ] Send statement via email with PDF attachment
- [ ] Send statement via SMS (notification only)
- [ ] Send statement via WhatsApp with PDF
- [ ] Bulk send to multiple parents
- [ ] Update delivery status on statement
- [ ] Handle delivery failures gracefully
- [ ] Audit log all send attempts
- [ ] Professional email template
- [ ] Unit tests with >90% coverage

## Test Cases

1. Send via email - success
2. Send via email - invalid email
3. Send via SMS - success
4. Send via WhatsApp - success
5. Bulk send - mixed success/failure
6. Delivery status updates correctly
7. Template rendering with all fields
8. PDF attachment included
9. Audit log created
10. Rate limiting respected
