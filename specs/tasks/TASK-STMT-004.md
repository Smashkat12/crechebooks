# TASK-STMT-004: Statement API Endpoints

## Metadata
- **Task ID**: TASK-STMT-004
- **Phase**: 12 - Account Statements
- **Layer**: surface
- **Priority**: P1-CRITICAL
- **Dependencies**: TASK-STMT-003
- **Estimated Effort**: 4 hours

## Objective
Create REST API endpoints for statement generation, retrieval, and management.

## Technical Requirements

### 1. Statement Controller (`apps/api/src/api/billing/statement.controller.ts`)

```typescript
@Controller('statements')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiTags('Statements')
export class StatementController {
  constructor(
    private readonly statementService: StatementGenerationService,
    private readonly parentAccountService: ParentAccountService,
  ) {}

  /**
   * GET /statements
   * List all statements for the tenant
   */
  @Get()
  @ApiOperation({ summary: 'List all statements' })
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListStatementsQueryDto
  ): Promise<PaginatedResponse<StatementListItemDto>>;

  /**
   * GET /statements/:id
   * Get statement details with lines
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get statement by ID' })
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string
  ): Promise<StatementDetailDto>;

  /**
   * POST /statements/generate
   * Generate statement for a single parent
   */
  @Post('generate')
  @ApiOperation({ summary: 'Generate statement for a parent' })
  async generate(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateStatementDto
  ): Promise<StatementDetailDto>;

  /**
   * POST /statements/generate/bulk
   * Bulk generate statements for multiple parents
   */
  @Post('generate/bulk')
  @ApiOperation({ summary: 'Bulk generate statements' })
  async bulkGenerate(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkGenerateStatementDto
  ): Promise<BulkGenerationResultDto>;

  /**
   * GET /statements/:id/pdf
   * Download statement as PDF
   */
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download statement as PDF' })
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response
  ): Promise<void>;

  /**
   * POST /statements/:id/send
   * Send statement to parent via email/WhatsApp
   */
  @Post(':id/send')
  @ApiOperation({ summary: 'Send statement to parent' })
  async send(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendStatementDto
  ): Promise<{ success: boolean; channel: string }>;

  /**
   * GET /parents/:parentId/account
   * Get parent account summary (balance, history)
   */
  @Get('/parents/:parentId/account')
  @ApiOperation({ summary: 'Get parent account summary' })
  async getParentAccount(
    @TenantId() tenantId: string,
    @Param('parentId') parentId: string,
    @Query() query: AccountHistoryQueryDto
  ): Promise<ParentAccountDto>;

  /**
   * GET /parents/:parentId/statements
   * Get statements for a specific parent
   */
  @Get('/parents/:parentId/statements')
  @ApiOperation({ summary: 'Get statements for parent' })
  async getParentStatements(
    @TenantId() tenantId: string,
    @Param('parentId') parentId: string,
    @Query() query: ListStatementsQueryDto
  ): Promise<PaginatedResponse<StatementListItemDto>>;
}
```

### 2. DTOs (`apps/api/src/api/billing/dto/statement.dto.ts`)

```typescript
export class GenerateStatementDto {
  @IsUUID()
  parentId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}

export class BulkGenerateStatementDto {
  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  parentIds?: string[];

  @IsOptional()
  @IsBoolean()
  onlyWithActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  onlyWithBalance?: boolean;
}

export class SendStatementDto {
  @IsEnum(['email', 'whatsapp', 'sms'])
  channel: 'email' | 'whatsapp' | 'sms';
}

export class StatementListItemDto {
  id: string;
  statementNumber: string;
  parentName: string;
  periodStart: Date;
  periodEnd: Date;
  closingBalanceCents: number;
  status: StatementStatus;
  generatedAt: Date;
}

export class StatementDetailDto extends StatementListItemDto {
  openingBalanceCents: number;
  totalChargesCents: number;
  totalPaymentsCents: number;
  totalCreditsCents: number;
  deliveryStatus?: string;
  deliveredAt?: Date;
  lines: StatementLineDto[];
}

export class StatementLineDto {
  date: Date;
  description: string;
  lineType: StatementLineType;
  referenceNumber?: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}

export class ParentAccountDto {
  parentId: string;
  parentName: string;
  email: string;
  phone: string;
  totalOutstandingCents: number;
  creditBalanceCents: number;
  netBalanceCents: number;
  children: ChildAccountSummary[];
  recentTransactions: AccountTransactionDto[];
  statements: StatementListItemDto[];
}

export class AccountTransactionDto {
  date: Date;
  type: string;
  referenceNumber: string;
  description: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}
```

### 3. Payment Allocation Endpoints Enhancement

Add to existing payment controller:

```typescript
@Controller('payments')
export class PaymentController {
  /**
   * POST /payments/allocate
   * Allocate a transaction to invoices
   */
  @Post('allocate')
  @ApiOperation({ summary: 'Allocate transaction to invoices' })
  async allocateToInvoices(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AllocatePaymentDto
  ): Promise<PaymentAllocationResultDto>;

  /**
   * GET /payments/unallocated
   * Get transactions requiring allocation
   */
  @Get('unallocated')
  @ApiOperation({ summary: 'Get unallocated transactions' })
  async getUnallocated(
    @TenantId() tenantId: string
  ): Promise<UnallocatedTransactionDto[]>;

  /**
   * GET /payments/suggest-allocation/:transactionId
   * Get suggested allocation for a transaction
   */
  @Get('suggest-allocation/:transactionId')
  @ApiOperation({ summary: 'Get suggested allocation' })
  async suggestAllocation(
    @TenantId() tenantId: string,
    @Param('transactionId') transactionId: string,
    @Query('parentId') parentId: string
  ): Promise<SuggestedAllocationDto>;
}

export class AllocatePaymentDto {
  @IsUUID()
  transactionId: string;

  @IsUUID()
  parentId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceAllocationDto)
  allocations: InvoiceAllocationDto[];
}

export class InvoiceAllocationDto {
  @IsUUID()
  invoiceId: string;

  @IsInt()
  @Min(1)
  amountCents: number;
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/api/billing/statement.controller.ts` | CREATE | Statement controller |
| `apps/api/src/api/billing/dto/statement.dto.ts` | CREATE | Statement DTOs |
| `apps/api/src/api/billing/dto/index.ts` | MODIFY | Export statement DTOs |
| `apps/api/src/api/billing/billing.module.ts` | MODIFY | Register statement controller |
| `apps/api/src/api/payment/payment.controller.ts` | MODIFY | Add allocation endpoints |
| `apps/api/src/api/payment/dto/payment.dto.ts` | MODIFY | Add allocation DTOs |

## Acceptance Criteria

- [ ] All endpoints authenticated and tenant-isolated
- [ ] Generate statement for single parent
- [ ] Bulk generate statements
- [ ] Download statement as PDF
- [ ] Send statement via email/WhatsApp/SMS
- [ ] Get parent account summary
- [ ] Allocate transaction to invoices
- [ ] Get unallocated transactions
- [ ] Suggest allocation (FIFO)
- [ ] All responses use standardized DTOs
- [ ] Swagger/OpenAPI documentation
- [ ] Integration tests for all endpoints

## Test Cases

1. Generate statement - success
2. Generate statement - parent not found
3. Bulk generate - all parents
4. Bulk generate - specific parents
5. Download PDF - success
6. Send via email - success
7. Allocate transaction - full payment
8. Allocate transaction - partial payment
9. Get unallocated transactions
10. Suggest allocation FIFO order
