<task_spec id="TASK-WA-001" version="2.0">

<metadata>
  <title>WhatsApp Message History Entity</title>
  <status>complete</status>
  <layer>foundation</layer>
  <sequence>260</sequence>
  <implements>
    <requirement_ref>REQ-WA-HISTORY-001</requirement_ref>
    <requirement_ref>REQ-AUDIT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="complete">TASK-CORE-002</task_ref>
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
  - `apps/api/prisma/migrations/YYYYMMDD_add_whatsapp_message_history/migration.sql` (NEW)
  - `apps/api/src/integrations/whatsapp/entities/whatsapp-message.entity.ts` (NEW)
  - `apps/api/src/integrations/whatsapp/types/message-history.types.ts` (NEW)

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` (add WhatsAppMessage model)
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` (export entity)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (store message history)

  **Current Problem:**
  - WhatsApp messages are sent but not persisted for audit trail
  - No history of which messages were sent to which parents
  - No way to track delivery status over time
  - Cannot generate reports on message delivery rates
  - POPIA requires retention of communication records

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. WhatsAppMessage Model
  ```prisma
  model WhatsAppMessage {
    id               String   @id @default(uuid())
    tenantId         String   @map("tenant_id")
    parentId         String?  @map("parent_id")
    recipientPhone   String   @map("recipient_phone")
    templateName     String   @map("template_name")
    templateParams   Json?    @map("template_params")

    // Message identifiers from Meta
    wamid            String?  @map("wamid")    // WhatsApp Message ID

    // Status tracking
    status           String   @default("pending") // pending, sent, delivered, read, failed
    statusUpdatedAt  DateTime? @map("status_updated_at")
    errorCode        String?  @map("error_code")
    errorMessage     String?  @map("error_message")

    // Context
    contextType      String   @map("context_type") // invoice, reminder, statement, welcome
    contextId        String?  @map("context_id")   // invoice ID, etc.

    // Timestamps
    sentAt           DateTime? @map("sent_at")
    deliveredAt      DateTime? @map("delivered_at")
    readAt           DateTime? @map("read_at")
    createdAt        DateTime  @default(now()) @map("created_at")
    updatedAt        DateTime  @updatedAt @map("updated_at")

    // Relations
    tenant           Tenant   @relation(fields: [tenantId], references: [id])
    parent           Parent?  @relation(fields: [parentId], references: [id])

    @@index([tenantId, parentId])
    @@index([tenantId, status])
    @@index([tenantId, contextType, contextId])
    @@index([wamid])
    @@map("whatsapp_messages")
  }
  ```

  ### 3. Message Status Enum
  ```typescript
  export enum WhatsAppMessageStatus {
    PENDING = 'pending',
    SENT = 'sent',
    DELIVERED = 'delivered',
    READ = 'read',
    FAILED = 'failed',
  }

  export enum WhatsAppContextType {
    INVOICE = 'invoice',
    REMINDER = 'reminder',
    STATEMENT = 'statement',
    WELCOME = 'welcome',
    ARREARS = 'arrears',
  }
  ```

  ### 4. Entity Pattern
  ```typescript
  @Injectable()
  export class WhatsAppMessageEntity {
    constructor(private readonly prisma: PrismaService) {}

    async create(data: CreateWhatsAppMessageDto): Promise<WhatsAppMessage> {
      return this.prisma.whatsAppMessage.create({ data });
    }

    async updateStatus(
      wamid: string,
      status: WhatsAppMessageStatus,
      timestamp: Date,
    ): Promise<WhatsAppMessage | null> {
      return this.prisma.whatsAppMessage.update({
        where: { wamid },
        data: {
          status,
          statusUpdatedAt: timestamp,
          ...(status === 'delivered' && { deliveredAt: timestamp }),
          ...(status === 'read' && { readAt: timestamp }),
        },
      });
    }

    async findByTenantAndParent(
      tenantId: string,
      parentId: string,
      options?: { limit?: number; offset?: number },
    ): Promise<WhatsAppMessage[]> {
      return this.prisma.whatsAppMessage.findMany({
        where: { tenantId, parentId },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
      });
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
This task creates the foundation for WhatsApp message history tracking.

**Business Requirements:**
1. Track all outbound WhatsApp messages
2. Store delivery status from webhook callbacks
3. Enable message history queries per parent
4. Support audit trail and POPIA compliance
5. Enable delivery rate reporting

**South African Context:**
- POPIA requires communication records for 5+ years
- Parents may request communication history
- Creche must demonstrate consent and opt-in compliance
</context>

<scope>
  <in_scope>
    - Create WhatsAppMessage Prisma model
    - Create migration
    - Create entity service for CRUD
    - Create types for message status and context
    - Update WhatsAppService to store messages on send
    - Update webhook handler to update message status
  </in_scope>
  <out_of_scope>
    - Message history UI (TASK-WA-004)
    - Retry logic (TASK-WA-006)
    - Template management (TASK-WA-002)
    - Statement delivery (TASK-WA-003)
  </out_of_scope>
</scope>

<whatsapp_webhook_status_mapping>
## Status Updates from Meta Webhook

### Message Statuses
| Webhook Status | Database Status | Timestamp Field |
|----------------|-----------------|-----------------|
| sent | sent | sentAt |
| delivered | delivered | deliveredAt |
| read | read | readAt |
| failed | failed | statusUpdatedAt |

### Error Handling
```typescript
// From webhook payload
const statusUpdate = {
  wamid: entry.changes[0].value.statuses[0].id,
  status: entry.changes[0].value.statuses[0].status,
  timestamp: new Date(parseInt(entry.changes[0].value.statuses[0].timestamp) * 1000),
  errors: entry.changes[0].value.statuses[0].errors, // If failed
};
```
</whatsapp_webhook_status_mapping>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add WhatsAppMessage model to apps/api/prisma/schema.prisma

# 2. Create and run migration
cd apps/api
npx prisma migrate dev --name add_whatsapp_message_history

# 3. Create types
# Create apps/api/src/integrations/whatsapp/types/message-history.types.ts

# 4. Create entity service
# Create apps/api/src/integrations/whatsapp/entities/whatsapp-message.entity.ts

# 5. Update WhatsApp module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 6. Update WhatsApp service
# Edit apps/api/src/integrations/whatsapp/whatsapp.service.ts

# 7. Update webhook handler
# Edit apps/api/src/integrations/whatsapp/whatsapp.service.ts (handleWebhook)

# 8. Create tests
# Create apps/api/tests/integrations/whatsapp/whatsapp-message.entity.spec.ts

# 9. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All fields follow snake_case mapping convention
    - Indexes for common queries
    - Soft reference to Parent (nullable for non-parent messages)
    - Status history tracked via timestamps
    - WAMID indexed for webhook updates
    - Context allows linking to invoices, statements, etc.
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Create message record on send
    - Test: Update status from webhook
    - Test: Query message history by parent
    - Test: Query by context (invoice ID)
    - Test: Error tracking on failed messages
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Store message content (privacy concern)
  - Skip index on wamid (needed for webhook updates)
  - Use camelCase in database columns
  - Make parentId required (some messages may not have parent)
  - Store plain phone numbers (use E.164 format)
</anti_patterns>

</task_spec>
