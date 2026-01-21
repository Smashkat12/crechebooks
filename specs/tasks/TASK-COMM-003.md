<task_spec id="TASK-COMM-003" version="1.0">

<metadata>
  <title>Communication API Controller</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>282</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-COMM-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-COMM-002</task_ref>
    <task_ref status="complete">TASK-API-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/api/communications/communication.controller.ts` (NEW)
  - `apps/api/src/api/communications/dto/send-broadcast.dto.ts` (NEW)
  - `apps/api/src/api/communications/dto/preview-recipients.dto.ts` (NEW)
  - `apps/api/src/api/communications/dto/broadcast-response.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/api/api.module.ts` (add CommunicationController)
  - `apps/api/src/communications/communications.module.ts` (export services)

  **Current Problem:**
  - No API endpoints for ad-hoc communication
  - No way for frontend to create/send broadcasts
  - No endpoint to preview recipients before sending
  - No endpoint to check broadcast status and delivery stats

  **Test Count:** 460+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Communication Controller
  ```typescript
  @Controller('communications')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiTags('Communications')
  export class CommunicationController {
    constructor(
      private readonly adhocService: AdhocCommunicationService,
      private readonly recipientResolver: RecipientResolverService,
      private readonly broadcastEntity: BroadcastMessageEntity,
      private readonly recipientGroupEntity: RecipientGroupEntity,
    ) {}

    // ==================== BROADCASTS ====================

    @Post('broadcasts')
    @ApiOperation({ summary: 'Create a new broadcast message' })
    @ApiResponse({ status: 201, type: BroadcastResponseDto })
    async createBroadcast(
      @TenantId() tenantId: string,
      @CurrentUser() user: User,
      @Body() dto: CreateBroadcastDto,
    ): Promise<BroadcastResponseDto> {
      const broadcast = await this.adhocService.createBroadcast(
        tenantId,
        user.id,
        dto,
      );
      return new BroadcastResponseDto(broadcast);
    }

    @Post('broadcasts/:id/send')
    @ApiOperation({ summary: 'Send a broadcast message' })
    @ApiResponse({ status: 200, description: 'Broadcast queued for sending' })
    async sendBroadcast(
      @TenantId() tenantId: string,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<{ message: string }> {
      await this.adhocService.sendBroadcast(tenantId, id);
      return { message: 'Broadcast queued for sending' };
    }

    @Get('broadcasts')
    @ApiOperation({ summary: 'List broadcasts' })
    @ApiResponse({ status: 200, type: [BroadcastListItemDto] })
    async listBroadcasts(
      @TenantId() tenantId: string,
      @Query() query: ListBroadcastsQueryDto,
    ): Promise<BroadcastListItemDto[]> {
      const broadcasts = await this.broadcastEntity.findByTenant(tenantId, {
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });
      return broadcasts.map(b => new BroadcastListItemDto(b));
    }

    @Get('broadcasts/:id')
    @ApiOperation({ summary: 'Get broadcast details with delivery stats' })
    @ApiResponse({ status: 200, type: BroadcastDetailDto })
    async getBroadcast(
      @TenantId() tenantId: string,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<BroadcastDetailDto> {
      const broadcast = await this.broadcastEntity.findById(id);
      if (!broadcast || broadcast.tenantId !== tenantId) {
        throw new NotFoundException('Broadcast not found');
      }
      const stats = await this.recipientEntity.getDeliveryStats(id);
      return new BroadcastDetailDto(broadcast, stats);
    }

    // ==================== RECIPIENTS ====================

    @Post('recipients/preview')
    @ApiOperation({ summary: 'Preview recipients based on filter criteria' })
    @ApiResponse({ status: 200, type: RecipientPreviewDto })
    async previewRecipients(
      @TenantId() tenantId: string,
      @Body() dto: PreviewRecipientsDto,
    ): Promise<RecipientPreviewDto> {
      const recipients = await this.recipientResolver.resolve(
        tenantId,
        dto.recipientType,
        dto.filter,
        dto.channel,
      );
      return {
        total: recipients.length,
        recipients: recipients.slice(0, 20), // Preview first 20
        hasMore: recipients.length > 20,
      };
    }

    // ==================== RECIPIENT GROUPS ====================

    @Get('groups')
    @ApiOperation({ summary: 'List recipient groups' })
    @ApiResponse({ status: 200, type: [RecipientGroupDto] })
    async listGroups(
      @TenantId() tenantId: string,
    ): Promise<RecipientGroupDto[]> {
      const groups = await this.recipientGroupEntity.findByTenant(tenantId);
      return groups.map(g => new RecipientGroupDto(g));
    }

    @Post('groups')
    @ApiOperation({ summary: 'Create a recipient group' })
    @ApiResponse({ status: 201, type: RecipientGroupDto })
    async createGroup(
      @TenantId() tenantId: string,
      @CurrentUser() user: User,
      @Body() dto: CreateRecipientGroupDto,
    ): Promise<RecipientGroupDto> {
      const group = await this.recipientGroupEntity.create(dto, user.id);
      return new RecipientGroupDto(group);
    }

    @Delete('groups/:id')
    @ApiOperation({ summary: 'Delete a recipient group' })
    @ApiResponse({ status: 204 })
    async deleteGroup(
      @TenantId() tenantId: string,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
      await this.recipientGroupEntity.delete(tenantId, id);
    }
  }
  ```

  ### 3. DTOs
  ```typescript
  // apps/api/src/api/communications/dto/send-broadcast.dto.ts
  export class CreateBroadcastDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    subject?: string;

    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    @IsOptional()
    @IsString()
    htmlBody?: string;

    @IsEnum(RecipientType)
    recipientType: RecipientType;

    @IsOptional()
    @ValidateNested()
    @Type(() => RecipientFilterDto)
    recipientFilter?: RecipientFilterDto;

    @IsOptional()
    @IsUUID()
    recipientGroupId?: string;

    @IsEnum(CommunicationChannel)
    channel: CommunicationChannel;

    @IsOptional()
    @IsDateString()
    scheduledAt?: string;
  }

  export class RecipientFilterDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => ParentFilterDto)
    parentFilter?: ParentFilterDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => StaffFilterDto)
    staffFilter?: StaffFilterDto;

    @IsOptional()
    @IsArray()
    @IsUUID(undefined, { each: true })
    selectedIds?: string[];
  }

  export class ParentFilterDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsArray()
    @IsEnum(EnrollmentStatus, { each: true })
    enrollmentStatus?: EnrollmentStatus[];

    @IsOptional()
    @IsUUID()
    feeStructureId?: string;

    @IsOptional()
    @IsBoolean()
    hasOutstandingBalance?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(1)
    daysOverdue?: number;
  }
  ```

  ### 4. Response DTOs
  ```typescript
  // apps/api/src/api/communications/dto/broadcast-response.dto.ts
  export class BroadcastResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    subject?: string;

    @ApiProperty()
    body: string;

    @ApiProperty({ enum: RecipientType })
    recipientType: RecipientType;

    @ApiProperty({ enum: CommunicationChannel })
    channel: CommunicationChannel;

    @ApiProperty({ enum: BroadcastStatus })
    status: BroadcastStatus;

    @ApiProperty()
    totalRecipients: number;

    @ApiProperty()
    sentCount: number;

    @ApiProperty()
    failedCount: number;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty({ required: false })
    sentAt?: Date;

    constructor(broadcast: BroadcastMessage) {
      this.id = broadcast.id;
      this.subject = broadcast.subject ?? undefined;
      this.body = broadcast.body;
      this.recipientType = broadcast.recipientType as RecipientType;
      this.channel = broadcast.channel as CommunicationChannel;
      this.status = broadcast.status as BroadcastStatus;
      this.totalRecipients = broadcast.totalRecipients;
      this.sentCount = broadcast.sentCount;
      this.failedCount = broadcast.failedCount;
      this.createdAt = broadcast.createdAt;
      this.sentAt = broadcast.sentAt ?? undefined;
    }
  }

  export class BroadcastDetailDto extends BroadcastResponseDto {
    @ApiProperty()
    deliveryStats: {
      emailSent: number;
      emailDelivered: number;
      whatsappSent: number;
      whatsappDelivered: number;
    };

    constructor(broadcast: BroadcastMessage, stats: DeliveryStats) {
      super(broadcast);
      this.deliveryStats = {
        emailSent: stats.emailSent,
        emailDelivered: stats.emailDelivered,
        whatsappSent: stats.whatsappSent,
        whatsappDelivered: stats.whatsappDelivered,
      };
    }
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
This task creates the API layer for ad-hoc communication.

**Business Requirements:**
1. RESTful API for creating and sending broadcasts
2. Preview recipients before sending
3. List and filter broadcasts by status
4. View delivery statistics per broadcast
5. Manage reusable recipient groups

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /communications/broadcasts | Create broadcast |
| POST | /communications/broadcasts/:id/send | Send broadcast |
| GET | /communications/broadcasts | List broadcasts |
| GET | /communications/broadcasts/:id | Get broadcast details |
| POST | /communications/recipients/preview | Preview recipients |
| GET | /communications/groups | List recipient groups |
| POST | /communications/groups | Create recipient group |
| DELETE | /communications/groups/:id | Delete recipient group |
</context>

<scope>
  <in_scope>
    - CommunicationController with all endpoints
    - Request DTOs with validation
    - Response DTOs with Swagger documentation
    - Integration with AdhocCommunicationService
    - Tenant isolation guards
    - Unit tests for controller
  </in_scope>
  <out_of_scope>
    - Frontend integration (TASK-COMM-004)
    - Webhook updates for delivery status (handled by existing webhooks)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create DTOs
# Create apps/api/src/api/communications/dto/send-broadcast.dto.ts
# Create apps/api/src/api/communications/dto/preview-recipients.dto.ts
# Create apps/api/src/api/communications/dto/broadcast-response.dto.ts
# Create apps/api/src/api/communications/dto/recipient-group.dto.ts

# 2. Create Controller
# Create apps/api/src/api/communications/communication.controller.ts

# 3. Update API Module
# Edit apps/api/src/api/api.module.ts

# 4. Create tests
# Create apps/api/tests/api/communications/communication.controller.spec.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All endpoints protected by AuthGuard and TenantGuard
    - Validation using class-validator decorators
    - Swagger documentation for all endpoints
    - UUIDs validated with ParseUUIDPipe
    - Proper HTTP status codes (201 for create, 204 for delete)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Create broadcast with valid data
    - Test: Create broadcast validation errors
    - Test: Send broadcast
    - Test: Preview recipients
    - Test: List broadcasts with filters
    - Test: Get broadcast details with stats
    - Test: CRUD recipient groups
    - Test: Tenant isolation
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip tenant isolation checks
  - Allow cross-tenant broadcast access
  - Return full message body in list responses (summary only)
  - Allow deletion of system recipient groups
  - Skip validation on request bodies
</anti_patterns>

</task_spec>
