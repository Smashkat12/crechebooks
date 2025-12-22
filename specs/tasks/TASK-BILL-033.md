<task_spec id="TASK-BILL-033" version="3.0">

<metadata>
  <title>Invoice Delivery Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>48</sequence>
  <implements>
    <requirement_ref>REQ-BILL-006</requirement_ref>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-031</task_ref>
    <task_ref status="complete">TASK-BILL-032</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<context>
This task adds POST /invoices/send endpoint to the existing InvoiceController. The endpoint
triggers invoice delivery via email/WhatsApp by calling InvoiceDeliveryService.sendInvoices().
TASK-BILL-031 and TASK-BILL-032 are COMPLETE - use their patterns for controller/DTO structure.

CRITICAL REQUIREMENTS:
- NO MOCK DATA in tests - use jest.spyOn() with real behavior verification
- NO BACKWARDS COMPATIBILITY - fail fast with robust error logging
- NO WORKAROUNDS - if something fails, throw BusinessException with error code
- NO FALLBACKS - each failure must be logged and returned in the response

Service layer (TASK-BILL-013) is COMPLETE. The InvoiceDeliveryService already:
- Validates invoices are in DRAFT status (throws BusinessException if not)
- Maps parent.preferredContact to DeliveryMethod
- Tracks delivery attempts and updates invoice status
- Returns DeliveryResult with sent/failed counts and failure details
</context>

<current_codebase_state>
IMPORTANT: These are the ACTUAL file paths and patterns in the codebase.

## Existing Billing Files (Created in TASK-BILL-031/032)
- src/api/billing/invoice.controller.ts (add sendInvoices method here)
- src/api/billing/billing.module.ts (add InvoiceDeliveryService)
- src/api/billing/dto/index.ts (export new DTOs here)
- tests/api/billing/invoice.controller.spec.ts (10 tests)
- tests/api/billing/generate-invoices.controller.spec.ts (8 tests)

## Service Layer (COMPLETE - TASK-BILL-013)
- src/database/services/invoice-delivery.service.ts
  - sendInvoices(dto: SendInvoicesDto): Promise<DeliveryResult>
  - deliverInvoice(tenantId, invoiceId, methodOverride?): Promise<void>
  - retryFailed(dto: RetryFailedDto): Promise<DeliveryResult>

## DTOs from Service Layer
- src/database/dto/invoice-delivery.dto.ts contains:
  ```typescript
  export class SendInvoicesDto {
    tenantId!: string;
    invoiceIds!: string[];
    method?: DeliveryMethod;
  }

  export interface DeliveryResult {
    sent: number;
    failed: number;
    failures: DeliveryFailure[];
  }

  export interface DeliveryFailure {
    invoiceId: string;
    reason: string;
    channel?: 'EMAIL' | 'WHATSAPP';
    code: string;
  }
  ```

## Entity Enums (src/database/entities/invoice.entity.ts)
```typescript
export enum DeliveryMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}
```

## Auth Patterns (from TASK-BILL-031/032)
```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../database/entities/user.entity';
```

## Integration Services (Required by InvoiceDeliveryService)
- src/integrations/email/email.service.ts
- src/integrations/whatsapp/whatsapp.service.ts
</current_codebase_state>

<scope>
  <in_scope>
    - Add POST /invoices/send endpoint to invoice.controller.ts
    - Create API-layer request/response DTOs (snake_case)
    - Create send-invoices.dto.ts with validation
    - Update billing.module.ts with InvoiceDeliveryService and dependencies
    - Add Swagger/OpenAPI annotations
    - Create unit tests (8 minimum, no mock data)
    - Return summary with sent/failed counts
  </in_scope>
  <out_of_scope>
    - Email/WhatsApp sending logic (in integration services)
    - PDF generation (not implemented yet)
    - Parent contact preference management
    - Delivery retry endpoint (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/invoice.controller.ts">
      @Post('send')
      @HttpCode(200)
      @Roles(UserRole.OWNER, UserRole.ADMIN)
      @UseGuards(JwtAuthGuard, RolesGuard)
      @ApiOperation({ summary: 'Send approved invoices to parents' })
      @ApiResponse({ status: 200, type: SendInvoicesResponseDto })
      @ApiResponse({ status: 400, description: 'Invalid invoice IDs or non-DRAFT status' })
      @ApiForbiddenResponse({ description: 'Insufficient permissions' })
      async sendInvoices(
        @Body() dto: ApiSendInvoicesDto,
        @CurrentUser() user: IUser
      ): Promise<SendInvoicesResponseDto>;
    </signature>

    <signature file="src/api/billing/dto/send-invoices.dto.ts">
      // API-layer DTO (snake_case for API, converts to service-layer DTO)
      export class ApiSendInvoicesDto {
        @IsArray()
        @IsUUID('4', { each: true })
        @ArrayMinSize(1)
        @ApiProperty({ type: [String], description: 'Invoice UUIDs to send' })
        invoice_ids!: string[];

        @IsOptional()
        @IsEnum(DeliveryMethod)
        @ApiProperty({
          enum: DeliveryMethod,
          required: false,
          description: 'Override delivery method. Defaults to parent preference.'
        })
        delivery_method?: DeliveryMethod;
      }

      export class DeliveryFailureResponseDto {
        @ApiProperty() invoice_id!: string;
        @ApiProperty() invoice_number?: string;
        @ApiProperty() reason!: string;
        @ApiProperty() code!: string;
      }

      export class SendInvoicesResponseDto {
        @ApiProperty() success!: boolean;
        @ApiProperty({
          type: 'object',
          properties: {
            sent: { type: 'number' },
            failed: { type: 'number' },
            failures: { type: 'array', items: { $ref: '#/components/schemas/DeliveryFailureResponseDto' } }
          }
        })
        data!: {
          sent: number;
          failed: number;
          failures: DeliveryFailureResponseDto[];
        };
      }
    </signature>
  </signatures>

  <constraints>
    - Only OWNER and ADMIN roles can send invoices
    - Service validates invoices are in DRAFT status (throws BusinessException)
    - Service validates all invoice_ids exist and belong to tenant
    - Failed deliveries must not block others (partial success allowed)
    - Must return detailed failure reasons with error codes
    - All DTOs must have Swagger documentation
    - API uses snake_case (invoice_ids), service uses camelCase (invoiceIds)
  </constraints>

  <validation_criteria>
    - POST /invoices/send sends invoices successfully
    - delivery_method override works (EMAIL, WHATSAPP, BOTH)
    - Parent preference used when delivery_method not specified
    - Returns sent/failed counts accurately
    - Returns failure details with reason and code
    - Only OWNER/ADMIN can access (403 for others)
    - Minimum 8 unit tests, all using jest.spyOn()
    - npm run test passes
    - npm run build passes
    - npm run lint passes
  </validation_criteria>
</definition_of_done>

<implementation_pattern>
Follow EXACTLY this pattern from TASK-BILL-032 invoice.controller.ts:

```typescript
// In invoice.controller.ts - ADD this method

@Post('send')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({
  summary: 'Send invoices to parents',
  description: 'Sends DRAFT invoices via email/WhatsApp. Returns partial success if some fail.',
})
@ApiResponse({ status: 200, type: SendInvoicesResponseDto })
@ApiResponse({ status: 400, description: 'Invalid invoice IDs' })
@ApiForbiddenResponse({ description: 'Insufficient permissions (requires OWNER or ADMIN)' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async sendInvoices(
  @Body() dto: ApiSendInvoicesDto,
  @CurrentUser() user: IUser,
): Promise<SendInvoicesResponseDto> {
  this.logger.log(
    `Send invoices: tenant=${user.tenantId}, count=${dto.invoice_ids.length}`,
  );

  // Call service layer (handles DRAFT validation, tenant isolation, delivery)
  const result = await this.invoiceDeliveryService.sendInvoices({
    tenantId: user.tenantId,
    invoiceIds: dto.invoice_ids, // API: snake_case -> Service: camelCase
    method: dto.delivery_method,
  });

  this.logger.log(
    `Send complete: sent=${result.sent}, failed=${result.failed}`,
  );

  // Transform service result to API response (camelCase -> snake_case)
  return {
    success: true,
    data: {
      sent: result.sent,
      failed: result.failed,
      failures: result.failures.map((f) => ({
        invoice_id: f.invoiceId,
        reason: f.reason,
        code: f.code,
      })),
    },
  };
}
```
</implementation_pattern>

<test_pattern>
Follow EXACTLY this pattern from generate-invoices.controller.spec.ts:

```typescript
// tests/api/billing/send-invoices.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from '../../../src/api/billing/invoice.controller';
import { InvoiceDeliveryService } from '../../../src/database/services/invoice-delivery.service';
// ... other imports from existing tests

describe('InvoiceController - Send Invoices', () => {
  let controller: InvoiceController;
  let invoiceDeliveryService: InvoiceDeliveryService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        // ... existing providers from other tests
        {
          provide: InvoiceDeliveryService,
          useValue: {
            sendInvoices: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
    invoiceDeliveryService = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /invoices/send', () => {
    it('should send invoices successfully', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001', 'inv-002'] };
      const mockResult = { sent: 2, failed: 0, failures: [] };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001', 'inv-002'],
        method: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(2);
      expect(result.data.failed).toBe(0);
    });

    // ... more tests following this pattern
  });
});
```

CRITICAL: NO MOCK DATA. Use jest.spyOn() to verify service calls with real behavior.
</test_pattern>

<files_to_create>
  <file path="src/api/billing/dto/send-invoices.dto.ts">API-layer send invoices DTOs</file>
  <file path="tests/api/billing/send-invoices.controller.spec.ts">Send endpoint unit tests (8 minimum)</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/invoice.controller.ts">Add sendInvoices endpoint</file>
  <file path="src/api/billing/billing.module.ts">Add InvoiceDeliveryService, EmailService, WhatsAppService</file>
  <file path="src/api/billing/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<billing_module_update>
Update billing.module.ts to add InvoiceDeliveryService and its dependencies:

```typescript
import { InvoiceDeliveryService } from '../../database/services/invoice-delivery.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController],
  providers: [
    // ... existing providers
    InvoiceDeliveryService,
    EmailService,
    WhatsAppService,
  ],
})
export class BillingModule {}
```
</billing_module_update>

<test_commands>
  <command>npm run test -- tests/api/billing/send-invoices.controller.spec.ts</command>
  <command>npm run test -- tests/api/billing/</command>
  <command>npm run build</command>
  <command>npm run lint -- src/api/billing tests/api/billing</command>
</test_commands>

<success_criteria>
1. POST /invoices/send endpoint works with valid invoice_ids
2. delivery_method override works (EMAIL, WHATSAPP, BOTH)
3. Returns correct sent/failed counts
4. Returns failure details with code and reason
5. Role guard enforces OWNER/ADMIN only
6. All 8+ tests pass using jest.spyOn() (NO MOCK DATA)
7. npm run build passes
8. npm run lint passes
</success_criteria>

</task_spec>
