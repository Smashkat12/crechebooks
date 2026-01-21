<task_spec id="TASK-COMM-001" version="1.0">

<metadata>
  <title>Ad-hoc Communication Database Schema</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>280</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-COMM-001</requirement_ref>
    <requirement_ref>REQ-AUDIT-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-002</task_ref>
    <task_ref status="complete">TASK-BILL-001</task_ref>
    <task_ref status="complete">TASK-SARS-001</task_ref>
    <task_ref status="complete">TASK-WA-001</task_ref>
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
  - `apps/api/prisma/migrations/YYYYMMDD_add_adhoc_communication/migration.sql` (NEW)
  - `apps/api/src/communications/entities/broadcast-message.entity.ts` (NEW)
  - `apps/api/src/communications/entities/message-recipient.entity.ts` (NEW)
  - `apps/api/src/communications/entities/recipient-group.entity.ts` (NEW)
  - `apps/api/src/communications/types/communication.types.ts` (NEW)
  - `apps/api/src/communications/dto/create-broadcast.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` (add BroadcastMessage, MessageRecipient, RecipientGroup models)

  **Current Problem:**
  - System only supports transactional messages (invoice, statement, reminder)
  - No way for creche admin to send ad-hoc announcements to parents
  - No broadcast capability for bulk messages to groups
  - No unified message history across email and WhatsApp channels
  - No saved recipient lists for reusable targeting

  **Test Count:** 450+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. BroadcastMessage Model
  ```prisma
  model BroadcastMessage {
    id              String   @id @default(uuid())
    tenantId        String   @map("tenant_id")

    // Message content
    subject         String?  // For email
    body            String   // Plain text content
    htmlBody        String?  @map("html_body") // HTML for email

    // Targeting
    recipientType   String   @map("recipient_type") // parent, staff, custom
    recipientFilter Json?    @map("recipient_filter") // Filter criteria
    recipientGroupId String? @map("recipient_group_id") // Saved group

    // Channel selection
    channel         String   // email, whatsapp, sms, all

    // Scheduling
    scheduledAt     DateTime? @map("scheduled_at")
    sentAt          DateTime? @map("sent_at")

    // Status
    status          String   @default("draft") // draft, scheduled, sending, sent, failed
    totalRecipients Int      @default(0) @map("total_recipients")
    sentCount       Int      @default(0) @map("sent_count")
    failedCount     Int      @default(0) @map("failed_count")

    // Metadata
    createdBy       String   @map("created_by") // User ID
    createdAt       DateTime @default(now()) @map("created_at")
    updatedAt       DateTime @updatedAt @map("updated_at")

    // Relations
    tenant          Tenant   @relation(fields: [tenantId], references: [id])
    createdByUser   User     @relation(fields: [createdBy], references: [id])
    recipientGroup  RecipientGroup? @relation(fields: [recipientGroupId], references: [id])
    recipients      MessageRecipient[]

    @@index([tenantId, status])
    @@index([tenantId, recipientType])
    @@index([tenantId, createdAt])
    @@map("broadcast_messages")
  }
  ```

  ### 3. MessageRecipient Model
  ```prisma
  model MessageRecipient {
    id              String   @id @default(uuid())
    broadcastId     String   @map("broadcast_id")

    // Recipient info (copied for audit)
    recipientId     String   @map("recipient_id") // Parent or Staff ID
    recipientType   String   @map("recipient_type") // parent, staff
    recipientName   String   @map("recipient_name")
    recipientEmail  String?  @map("recipient_email")
    recipientPhone  String?  @map("recipient_phone")

    // Delivery status per channel
    emailStatus     String?  @map("email_status") // pending, sent, delivered, opened, failed
    emailSentAt     DateTime? @map("email_sent_at")
    emailMessageId  String?  @map("email_message_id") // Mailgun ID

    whatsappStatus  String?  @map("whatsapp_status") // pending, sent, delivered, read, failed
    whatsappSentAt  DateTime? @map("whatsapp_sent_at")
    whatsappWamid   String?  @map("whatsapp_wamid") // WhatsApp Message ID

    smsStatus       String?  @map("sms_status") // pending, sent, delivered, failed
    smsSentAt       DateTime? @map("sms_sent_at")
    smsMessageId    String?  @map("sms_message_id")

    // Error tracking
    lastError       String?  @map("last_error")
    retryCount      Int      @default(0) @map("retry_count")

    createdAt       DateTime @default(now()) @map("created_at")
    updatedAt       DateTime @updatedAt @map("updated_at")

    // Relations
    broadcast       BroadcastMessage @relation(fields: [broadcastId], references: [id])

    @@unique([broadcastId, recipientId])
    @@index([broadcastId, recipientType])
    @@index([emailStatus])
    @@index([whatsappStatus])
    @@map("message_recipients")
  }
  ```

  ### 4. RecipientGroup Model
  ```prisma
  model RecipientGroup {
    id          String   @id @default(uuid())
    tenantId    String   @map("tenant_id")

    name        String   // "All Active Parents", "Grade 1 Parents"
    description String?

    // Filter criteria (stored as JSON)
    recipientType String  @map("recipient_type") // parent, staff
    filterCriteria Json?  @map("filter_criteria")

    // Metadata
    isSystem    Boolean  @default(false) @map("is_system") // Built-in groups
    createdBy   String?  @map("created_by")
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    // Relations
    tenant      Tenant   @relation(fields: [tenantId], references: [id])
    broadcasts  BroadcastMessage[]

    @@unique([tenantId, name])
    @@index([tenantId, recipientType])
    @@map("recipient_groups")
  }
  ```

  ### 5. Type Definitions
  ```typescript
  // apps/api/src/communications/types/communication.types.ts

  export enum RecipientType {
    PARENT = 'parent',
    STAFF = 'staff',
    CUSTOM = 'custom', // Selected individuals
  }

  export enum CommunicationChannel {
    EMAIL = 'email',
    WHATSAPP = 'whatsapp',
    SMS = 'sms',
    ALL = 'all', // All available channels per preference
  }

  export enum BroadcastStatus {
    DRAFT = 'draft',
    SCHEDULED = 'scheduled',
    SENDING = 'sending',
    SENT = 'sent',
    PARTIALLY_SENT = 'partially_sent',
    FAILED = 'failed',
  }

  export enum DeliveryStatus {
    PENDING = 'pending',
    SENT = 'sent',
    DELIVERED = 'delivered',
    OPENED = 'opened', // Email only
    READ = 'read', // WhatsApp only
    FAILED = 'failed',
  }

  export interface ParentFilter {
    isActive?: boolean;
    enrollmentStatus?: string[];
    feeStructureId?: string;
    hasOutstandingBalance?: boolean;
    daysOverdue?: number;
    whatsappOptIn?: boolean; // For WhatsApp channel
    smsOptIn?: boolean; // For SMS channel
  }

  export interface StaffFilter {
    isActive?: boolean;
    employmentType?: string[];
    department?: string;
    position?: string;
  }

  export interface RecipientFilterCriteria {
    parentFilter?: ParentFilter;
    staffFilter?: StaffFilter;
    selectedIds?: string[]; // For custom selection
  }
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task creates the database foundation for ad-hoc communication in CrecheBooks.

**Business Requirements:**
1. Creche admins need to send announcements to all parents (e.g., holiday closure)
2. Ability to target specific groups (parents with arrears, specific class)
3. Support multiple channels (email, WhatsApp, SMS) based on parent preference
4. Track delivery status for audit and follow-up
5. Save reusable recipient lists for recurring communications
6. Schedule messages for future delivery

**South African Context:**
- POPIA requires tracking of all communications sent to parents
- Parents can opt-in/opt-out of specific channels
- Creche must respect communication preferences
- Audit trail required for 5+ years

**Use Cases:**
1. **Holiday Announcement**: "Creche closed on 16 December" → All active parents
2. **Fee Increase Notice**: "Monthly fees increasing" → All active parents, email preferred
3. **Overdue Reminder**: "Outstanding balance" → Parents with >30 days overdue
4. **Staff Notice**: "Staff meeting Friday" → All staff
5. **Event Reminder**: "Concert tomorrow" → Grade 1 parents only
</context>

<scope>
  <in_scope>
    - Create BroadcastMessage Prisma model
    - Create MessageRecipient Prisma model
    - Create RecipientGroup Prisma model
    - Create migration
    - Create entity services for CRUD operations
    - Create type definitions for channels, statuses, filters
    - Create DTOs for creating broadcasts
    - Add relations to Parent and Staff models
  </in_scope>
  <out_of_scope>
    - Communication service (TASK-COMM-002)
    - API controller (TASK-COMM-003)
    - Frontend dashboard (TASK-COMM-004)
    - Recipient selection UI (TASK-COMM-005)
    - Message history UI (TASK-COMM-006)
  </out_of_scope>
</scope>

<prisma_schema_additions>
## Schema Changes

Add to `apps/api/prisma/schema.prisma`:

1. Add BroadcastMessage model (see critical_patterns)
2. Add MessageRecipient model (see critical_patterns)
3. Add RecipientGroup model (see critical_patterns)

4. Update Tenant model:
```prisma
model Tenant {
  // ... existing fields
  broadcastMessages BroadcastMessage[]
  recipientGroups   RecipientGroup[]
}
```

5. Update User model:
```prisma
model User {
  // ... existing fields
  broadcastMessages BroadcastMessage[]
}
```
</prisma_schema_additions>

<entity_services>
## Entity Implementation

### BroadcastMessageEntity
```typescript
@Injectable()
export class BroadcastMessageEntity {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBroadcastDto, userId: string): Promise<BroadcastMessage> {
    return this.prisma.broadcastMessage.create({
      data: {
        ...data,
        createdBy: userId,
      },
      include: { recipients: true },
    });
  }

  async findByTenant(
    tenantId: string,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<BroadcastMessage[]> {
    return this.prisma.broadcastMessage.findMany({
      where: {
        tenantId,
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
      include: { recipientGroup: true },
    });
  }

  async updateStatus(
    id: string,
    status: BroadcastStatus,
    counts?: { sentCount?: number; failedCount?: number },
  ): Promise<BroadcastMessage> {
    return this.prisma.broadcastMessage.update({
      where: { id },
      data: {
        status,
        ...(status === 'sent' && { sentAt: new Date() }),
        ...(counts?.sentCount !== undefined && { sentCount: counts.sentCount }),
        ...(counts?.failedCount !== undefined && { failedCount: counts.failedCount }),
      },
    });
  }
}
```

### MessageRecipientEntity
```typescript
@Injectable()
export class MessageRecipientEntity {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(recipients: CreateMessageRecipientDto[]): Promise<number> {
    const result = await this.prisma.messageRecipient.createMany({
      data: recipients,
      skipDuplicates: true,
    });
    return result.count;
  }

  async updateEmailStatus(
    broadcastId: string,
    recipientId: string,
    status: DeliveryStatus,
    messageId?: string,
  ): Promise<MessageRecipient> {
    return this.prisma.messageRecipient.update({
      where: {
        broadcastId_recipientId: { broadcastId, recipientId },
      },
      data: {
        emailStatus: status,
        ...(status === 'sent' && { emailSentAt: new Date() }),
        ...(messageId && { emailMessageId: messageId }),
      },
    });
  }

  async updateWhatsAppStatus(
    broadcastId: string,
    recipientId: string,
    status: DeliveryStatus,
    wamid?: string,
  ): Promise<MessageRecipient> {
    return this.prisma.messageRecipient.update({
      where: {
        broadcastId_recipientId: { broadcastId, recipientId },
      },
      data: {
        whatsappStatus: status,
        ...(status === 'sent' && { whatsappSentAt: new Date() }),
        ...(wamid && { whatsappWamid: wamid }),
      },
    });
  }

  async getDeliveryStats(broadcastId: string): Promise<{
    total: number;
    emailSent: number;
    emailDelivered: number;
    whatsappSent: number;
    whatsappDelivered: number;
    failed: number;
  }> {
    const recipients = await this.prisma.messageRecipient.findMany({
      where: { broadcastId },
      select: { emailStatus: true, whatsappStatus: true },
    });

    return {
      total: recipients.length,
      emailSent: recipients.filter(r => r.emailStatus === 'sent').length,
      emailDelivered: recipients.filter(r => ['delivered', 'opened'].includes(r.emailStatus ?? '')).length,
      whatsappSent: recipients.filter(r => r.whatsappStatus === 'sent').length,
      whatsappDelivered: recipients.filter(r => ['delivered', 'read'].includes(r.whatsappStatus ?? '')).length,
      failed: recipients.filter(r => r.emailStatus === 'failed' || r.whatsappStatus === 'failed').length,
    };
  }
}
```

### RecipientGroupEntity
```typescript
@Injectable()
export class RecipientGroupEntity {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRecipientGroupDto, userId: string): Promise<RecipientGroup> {
    return this.prisma.recipientGroup.create({
      data: {
        ...data,
        createdBy: userId,
      },
    });
  }

  async findByTenant(tenantId: string): Promise<RecipientGroup[]> {
    return this.prisma.recipientGroup.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async seedSystemGroups(tenantId: string): Promise<void> {
    const systemGroups = [
      { name: 'All Active Parents', recipientType: 'parent', filterCriteria: { parentFilter: { isActive: true } }, isSystem: true },
      { name: 'All Staff', recipientType: 'staff', filterCriteria: { staffFilter: { isActive: true } }, isSystem: true },
      { name: 'Parents with Arrears', recipientType: 'parent', filterCriteria: { parentFilter: { isActive: true, hasOutstandingBalance: true } }, isSystem: true },
    ];

    for (const group of systemGroups) {
      await this.prisma.recipientGroup.upsert({
        where: { tenantId_name: { tenantId, name: group.name } },
        create: { tenantId, ...group },
        update: {},
      });
    }
  }
}
```
</entity_services>

<verification_commands>
## Execution Order

```bash
# 1. Create types file
# Create apps/api/src/communications/types/communication.types.ts

# 2. Update Prisma schema
# Add models to apps/api/prisma/schema.prisma

# 3. Create and run migration
cd apps/api
npx prisma migrate dev --name add_adhoc_communication

# 4. Create entity services
# Create apps/api/src/communications/entities/broadcast-message.entity.ts
# Create apps/api/src/communications/entities/message-recipient.entity.ts
# Create apps/api/src/communications/entities/recipient-group.entity.ts

# 5. Create DTOs
# Create apps/api/src/communications/dto/create-broadcast.dto.ts
# Create apps/api/src/communications/dto/create-recipient-group.dto.ts

# 6. Create communications module
# Create apps/api/src/communications/communications.module.ts

# 7. Create tests
# Create apps/api/tests/communications/entities/broadcast-message.entity.spec.ts
# Create apps/api/tests/communications/entities/message-recipient.entity.spec.ts
# Create apps/api/tests/communications/entities/recipient-group.entity.spec.ts

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/communications/types/communication.types.ts">
      export enum RecipientType { PARENT, STAFF, CUSTOM }
      export enum CommunicationChannel { EMAIL, WHATSAPP, SMS, ALL }
      export enum BroadcastStatus { DRAFT, SCHEDULED, SENDING, SENT, PARTIALLY_SENT, FAILED }
      export enum DeliveryStatus { PENDING, SENT, DELIVERED, OPENED, READ, FAILED }
      export interface ParentFilter { ... }
      export interface StaffFilter { ... }
      export interface RecipientFilterCriteria { ... }
    </signature>
    <signature file="apps/api/src/communications/entities/broadcast-message.entity.ts">
      @Injectable()
      export class BroadcastMessageEntity {
        create(data, userId): Promise<BroadcastMessage>
        findByTenant(tenantId, options?): Promise<BroadcastMessage[]>
        findById(id): Promise<BroadcastMessage | null>
        updateStatus(id, status, counts?): Promise<BroadcastMessage>
      }
    </signature>
  </signatures>

  <constraints>
    - All fields follow snake_case mapping convention
    - Indexes for common queries (tenantId, status, recipientType)
    - Composite unique on MessageRecipient (broadcastId, recipientId)
    - Unique on RecipientGroup (tenantId, name)
    - System groups marked with isSystem flag
    - Filter criteria stored as JSON for flexibility
    - POPIA compliance: track all sent messages
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Create broadcast message
    - Test: Create message recipients in bulk
    - Test: Update email delivery status
    - Test: Update WhatsApp delivery status
    - Test: Get delivery statistics
    - Test: Create and retrieve recipient groups
    - Test: Seed system groups
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Store full message body in MessageRecipient (only in BroadcastMessage)
  - Use camelCase in database columns
  - Make email/WhatsApp/SMS status required (channel may not be used)
  - Skip tenantId index (needed for multi-tenant queries)
  - Create separate models for each channel's history (unified in MessageRecipient)
  - Delete messages (soft delete or archive for POPIA)
</anti_patterns>

</task_spec>
