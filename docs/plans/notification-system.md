# CrecheBooks — Comprehensive In-App Notification System

> **Status**: Planning  
> **Author**: Claude Code  
> **Date**: 2026-04-05  
> **Scope**: Full-stack notification system across Admin, Parent, and Staff portals

---

## 1. Problem Statement

CrecheBooks has 3 portals (Admin Dashboard, Parent Portal, Staff Portal) but **zero in-app notification infrastructure**. When business events occur — a new student enrolls, a payment arrives, a SARS deadline approaches — there is no way for the relevant user to be notified within the app.

### What Exists Today

| Layer | Status | Details |
|-------|--------|---------|
| **WebSocket gateway** | Backend only | Socket.io with JWT auth, tenant room isolation, rate limiting — but frontend never connects |
| **Multi-channel delivery** | Partial | Email (Mailgun), WhatsApp (Twilio), SMS (Africa's Talking) adapters exist — mostly unused |
| **EventEmitter2** | Minimal | Only `enrollment.completed` and `staff.created` emit events; 150+ audit-log points produce no notifications |
| **Toast system** | Frontend only | shadcn/Radix toast (1 toast at a time) for Xero sync results — no persistent storage |
| **Notification bell** | Missing | No notification icon in any portal header |
| **Notification store** | Missing | No DB model, no Zustand store, no API endpoints |

### What's Missing

- No `Notification` database model for persistent storage
- No notification REST API endpoints
- No BullMQ notification queue
- No WebSocket connection from any frontend portal
- No notification bell/badge in any header
- No notification panel/dropdown
- Most domain events only audit-log, never notify users

---

## 2. Architecture Overview

```
Domain Event (e.g. payment.allocated)
    │
    ▼
EventEmitter2 Handler (e.g. PaymentEventsHandler)
    │
    ▼
NotificationEmitter.notifyAdmins() / .notifyParent() / .notifyStaff()
    │
    ▼
BullMQ "notification" queue (async, non-blocking)
    │
    ▼
NotificationProcessor
    ├── 1. Check preferences (Phase 5)
    ├── 2. Persist to PostgreSQL (Notification model)
    └── 3. Push via WebSocket (EventEmitterService.emitNotificationCreated)
            │
            ▼
        Frontend (Socket.io client)
            ├── Zustand store update (unreadCount++)
            ├── Bell badge update
            └── Optional toast popup

Admin/Parent/Staff also poll GET /notifications/unread-count every 60s as fallback
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Single `Notification` table** (not junction table) | Each row = 1 notification for 1 recipient. Avoids N+1 fan-out. Simple queries. |
| **BullMQ queue for async creation** | Triggering operations (payment, invoice) enqueue and return immediately. Non-blocking. |
| **Cursor-based pagination** | Notifications are append-heavy. Cursor pagination (`createdAt` + `id`) avoids offset performance degradation. |
| **Separate `InAppNotificationService`** | Decoupled from existing `NotificationService` (Email/WhatsApp/SMS). No regression risk. |
| **Separate WebSocket gateway for parent portal** | Parent auth (localStorage token) differs from admin (NextAuth JWT). Clean separation. |
| **Type enum in Prisma** (not free-form strings) | Type safety, enables per-type preference toggles, predictable querying. |
| **Reusable UI components across portals** | `NotificationPanel` and `NotificationItem` are portal-agnostic; only data hooks differ. |

---

## 3. Role-Based Notification Matrix

### Admin / Owner (Dashboard Portal)

| Category | Notification Types | Priority |
|----------|--------------------|----------|
| **Enrollment** | New student enrolled (WhatsApp or admin) | Normal |
| **Payments** | Payment received, payment allocated | Normal |
| **Invoices** | Batch generation complete, delivery failures/bounces | Normal / High |
| **Arrears** | New arrears, escalation thresholds (30/60/90 days) | Normal → Urgent |
| **Staff** | Leave request submitted, onboarding complete | Normal |
| **Banking** | Reconciliation complete, discrepancies found | Normal / High |
| **SARS** | Tax deadline approaching (30/14/7/3/1 days) | Low → Urgent |
| **System** | Xero sync failures, trial expiring | High / Urgent |
| **Comms** | Broadcast delivery summary | Low |

### Parent (Parent Portal)

| Category | Notification Types | Priority |
|----------|--------------------|----------|
| **Invoices** | New invoice available | Normal |
| **Payments** | Payment confirmed (receipt) | Normal |
| **Statements** | Statement available | Normal |
| **Enrollment** | Enrollment confirmed | Normal |
| **Reminders** | Overdue invoice (gentle) | High |
| **Comms** | Broadcast messages from creche | Normal |

### Staff (Staff Portal)

| Category | Notification Types | Priority |
|----------|--------------------|----------|
| **Leave** | Leave request approved/rejected | Normal |
| **Payroll** | Payslip available | Normal |
| **Onboarding** | Tasks assigned, document requests | Normal |
| **Comms** | Broadcast messages from creche | Normal |

### Accountant (Dashboard Portal — filtered)

| Category | Notification Types | Priority |
|----------|--------------------|----------|
| **SARS** | VAT201/EMP201 deadlines, generation complete | Normal → Urgent |
| **Reconciliation** | Discrepancies found | High |
| **Payments** | Payment batch summaries | Normal |

---

## 4. Database Schema

### NotificationType Enum

```prisma
enum NotificationType {
  ENROLLMENT_COMPLETED
  PAYMENT_RECEIVED
  PAYMENT_ALLOCATED
  INVOICE_GENERATED
  INVOICE_SENT
  INVOICE_DELIVERY_FAILED
  ARREARS_NEW
  ARREARS_ESCALATION
  SARS_DEADLINE
  RECONCILIATION_COMPLETE
  RECONCILIATION_DISCREPANCY
  XERO_SYNC_FAILURE
  STAFF_LEAVE_REQUEST
  STAFF_LEAVE_DECISION
  STAFF_ONBOARDING_COMPLETE
  PAYSLIP_AVAILABLE
  STATEMENT_AVAILABLE
  BROADCAST_SUMMARY
  TRIAL_EXPIRING
  SYSTEM_ALERT
}
```

### NotificationPriority Enum

```prisma
enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

### Notification Model

```prisma
model Notification {
  id            String               @id @default(uuid())
  tenantId      String               @map("tenant_id")

  // Recipient targeting
  recipientType String               @map("recipient_type") @db.VarChar(20)  // USER, PARENT, STAFF
  recipientId   String               @map("recipient_id")

  // Content
  type          NotificationType
  priority      NotificationPriority @default(NORMAL)
  title         String               @db.VarChar(200)
  body          String               @db.Text
  actionUrl     String?              @map("action_url") @db.VarChar(500)     // Deep link
  metadata      Json?                                                         // Flexible payload

  // Read tracking
  isRead        Boolean              @default(false) @map("is_read")
  readAt        DateTime?            @map("read_at")

  // Lifecycle
  expiresAt     DateTime?            @map("expires_at")
  createdAt     DateTime             @default(now()) @map("created_at")

  // Relations
  tenant        Tenant               @relation(fields: [tenantId], references: [id])

  @@index([tenantId, recipientType, recipientId, isRead])
  @@index([tenantId, recipientId, createdAt])
  @@index([expiresAt])
  @@map("notifications")
}
```

### NotificationPreference Model (Phase 5)

```prisma
model NotificationPreference {
  id                String   @id @default(uuid())
  tenantId          String   @map("tenant_id")
  recipientType     String   @map("recipient_type") @db.VarChar(20)
  recipientId       String   @map("recipient_id")
  disabledTypes     String[] @default([]) @map("disabled_types")
  quietHoursEnabled Boolean  @default(false) @map("quiet_hours_enabled")
  quietHoursStart   String?  @map("quiet_hours_start") @db.VarChar(5)  // "22:00"
  quietHoursEnd     String?  @map("quiet_hours_end") @db.VarChar(5)    // "06:00"
  inAppEnabled      Boolean  @default(true) @map("in_app_enabled")
  emailDigest       Boolean  @default(false) @map("email_digest")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  tenant            Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, recipientType, recipientId])
  @@map("notification_preferences")
}
```

---

## 5. API Endpoints

### Admin / Dashboard (JWT Auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | List notifications for current user (cursor-paginated) |
| `GET` | `/notifications/unread-count` | Returns `{ count: number }` |
| `PATCH` | `/notifications/:id/read` | Mark single notification as read |
| `PATCH` | `/notifications/read-all` | Mark all as read (returns count updated) |
| `DELETE` | `/notifications/:id` | Delete single notification |
| `GET` | `/notifications/preferences` | Get notification preferences (Phase 5) |
| `PUT` | `/notifications/preferences` | Update notification preferences (Phase 5) |

### Parent Portal (Parent Token Auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/parent-portal/notifications` | List notifications for parent |
| `GET` | `/parent-portal/notifications/unread-count` | Unread count |
| `PATCH` | `/parent-portal/notifications/:id/read` | Mark as read |
| `PATCH` | `/parent-portal/notifications/read-all` | Mark all as read |

### Staff Portal (Staff Token Auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/staff-portal/notifications` | List notifications for staff member |
| `GET` | `/staff-portal/notifications/unread-count` | Unread count |
| `PATCH` | `/staff-portal/notifications/:id/read` | Mark as read |
| `PATCH` | `/staff-portal/notifications/read-all` | Mark all as read |

### Query Parameters (List Endpoints)

```
?cursor=<uuid>        Cursor for pagination (notification ID)
&limit=20             Page size (default 20, max 50)
&type=PAYMENT_RECEIVED  Filter by notification type
&isRead=false         Filter by read status
```

### Response Shape

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "PAYMENT_ALLOCATED",
      "priority": "NORMAL",
      "title": "Payment received",
      "body": "R3,500.00 from John Doe allocated to INV-2026-042",
      "actionUrl": "/payments",
      "metadata": { "amount": 350000, "parentName": "John Doe" },
      "isRead": false,
      "createdAt": "2026-04-05T14:30:00.000Z"
    }
  ],
  "meta": {
    "unreadCount": 5,
    "nextCursor": "uuid-of-last-item",
    "hasMore": true
  }
}
```

---

## 6. Notification Content Examples

| Type | Title | Body | Action URL |
|------|-------|------|-----------|
| `ENROLLMENT_COMPLETED` | New enrollment: Maya Johnson | Enrolled via WhatsApp — Full Day plan, starts 1 May | `/children` |
| `PAYMENT_ALLOCATED` | Payment received | R3,500.00 from John Doe allocated to INV-2026-042 | `/payments` |
| `INVOICE_GENERATED` | Invoice generation complete | 15 invoices generated for March 2026 (2 errors) | `/invoices?month=2026-03` |
| `INVOICE_SENT` | Invoice available | Your invoice #INV-2026-042 for R3,500.00 is ready | `/parent/invoices` |
| `ARREARS_ESCALATION` | Arrears alert: Jane Smith | R12,450.00 outstanding — 60 days overdue | `/arrears` |
| `SARS_DEADLINE` | EMP201 due in 7 days | Monthly employer declaration due 7 April 2026 | `/sars` |
| `RECONCILIATION_DISCREPANCY` | Reconciliation discrepancy | Feb 2026: 3 unmatched items totalling R2,150.00 | `/reconciliation` |
| `STAFF_LEAVE_REQUEST` | Leave request: Sarah M. | 5 days annual leave, 14–18 April 2026 | `/staff/leave` |
| `STAFF_LEAVE_DECISION` | Leave approved | Your annual leave (14–18 April) has been approved | `/staff/leave` |
| `XERO_SYNC_FAILURE` | Xero sync failed | Circuit breaker opened after 3 consecutive failures | `/settings/xero` |
| `STATEMENT_AVAILABLE` | Statement ready | Your March 2026 account statement is available | `/parent/statements` |
| `PAYSLIP_AVAILABLE` | Payslip ready | Your March 2026 payslip is available to download | `/staff/payslips` |

---

## 7. Frontend UI Design

### Notification Bell

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Dashboard > Overview      [🔔 5] [☀] [Avatar] │
│                                     ▲                    │
│                                     │                    │
│                              Bell with badge             │
└─────────────────────────────────────────────────────────┘
```

- **Desktop**: Bell icon with red badge (count, max "99+"), opens Popover (380px wide, max 400px tall)
- **Mobile**: Same bell, opens bottom Sheet (full-width, 70vh)
- Badge hidden when unread count is 0
- Uses shadcn/ui `Popover` (desktop) and `Sheet` (mobile) components

### Notification Panel

```
┌──────────────────────────────────┐
│  Notifications          Mark all │
│                          as read │
├──────────────────────────────────┤
│ 🔵 💰 Payment received    2m ago │
│    R3,500 from John Doe          │
├──────────────────────────────────┤
│ 🔵 🎓 New enrollment      15m    │
│    Maya Johnson — Full Day       │
├──────────────────────────────────┤
│    📄 Invoice generation   1h    │
│    15 invoices for March 2026    │
├──────────────────────────────────┤
│    ⚠️ Arrears alert        3h    │
│    Jane Smith — R12,450 (60d)    │
├──────────────────────────────────┤
│         Load more                │
└──────────────────────────────────┘

🔵 = unread indicator (blue dot)
Icons mapped by NotificationType
```

### Notification Item States

| State | Visual |
|-------|--------|
| **Unread** | Blue dot indicator, slightly darker background (`bg-blue-50`/`bg-blue-950`) |
| **Read** | No dot, normal background |
| **Urgent** | Red left border accent |
| **Clicked** | Navigates to `actionUrl`, marks as read |

---

## 8. Implementation Phases

### Phase 1: Backend Foundation

**Deliverable**: Notification model in DB, services, BullMQ queue, REST API endpoints. Testable via curl/Swagger.

**New files (8)**:
- `apps/api/src/notifications/types/in-app-notification.types.ts`
- `apps/api/src/notifications/in-app-notification.service.ts`
- `apps/api/src/notifications/processors/notification.processor.ts`
- `apps/api/src/api/notifications/notification.controller.ts`
- `apps/api/src/api/notifications/parent-notification.controller.ts`
- `apps/api/src/api/notifications/staff-notification.controller.ts`
- `apps/api/src/api/notifications/dto/notification.dto.ts`
- `apps/api/src/api/notifications/notification-api.module.ts`

**Modified files (5)**:
- `apps/api/prisma/schema.prisma` — Add Notification model + enums + Tenant relation
- `apps/api/src/config/queue.config.ts` — Add NOTIFICATION queue name
- `apps/api/src/scheduler/scheduler.module.ts` — Register notification queue
- `apps/api/src/websocket/events/dashboard.events.ts` — Add NOTIFICATION_CREATED event
- `apps/api/src/api/api.module.ts` — Import NotificationApiModule

**Migration**: `npx prisma migrate dev --name add_notification_model`

**Tests**: Unit tests for service CRUD + processor + controller endpoints

---

### Phase 2: Frontend Foundation

**Deliverable**: Admin dashboard bell with live unread count, notification panel with real-time WebSocket updates.

**Install**: `pnpm add socket.io-client --filter @crechebooks/web`

**New files (9)**:
- `apps/web/src/hooks/use-websocket.ts` — Socket.io connection hook
- `apps/web/src/hooks/use-notification-socket.ts` — WebSocket event listener
- `apps/web/src/hooks/use-notifications.ts` — TanStack Query hooks (infinite query, unread count, mutations)
- `apps/web/src/stores/notification-store.ts` — Zustand store
- `apps/web/src/types/notification.types.ts` — Frontend type definitions
- `apps/web/src/components/providers/websocket-provider.tsx` — React context for WebSocket
- `apps/web/src/components/notifications/notification-bell.tsx` — Bell + Badge + Popover/Sheet
- `apps/web/src/components/notifications/notification-panel.tsx` — Scrollable notification list
- `apps/web/src/components/notifications/notification-item.tsx` — Individual notification row

**Modified files (4)**:
- `apps/web/src/lib/api/endpoints.ts` — Add notifications endpoints
- `apps/web/src/lib/api/query-keys.ts` — Add notifications key factory
- `apps/web/src/components/layout/header.tsx` — Add NotificationBell
- `apps/web/src/components/layout/dashboard-layout.tsx` — Wrap with WebSocketProvider

**Tests**: Zustand store actions, component tests for bell + panel

---

### Phase 3: Domain Event Handlers

**Deliverable**: Real notifications for all major business events. System becomes genuinely useful.

**New files (8)**:
- `apps/api/src/notifications/helpers/notification-emitter.ts` — Helper: `notifyAdmins()`, `notifyParent()`, `notifyStaff()`
- `apps/api/src/database/events/domain-events.ts` — Central event interfaces
- `apps/api/src/notifications/handlers/payment-events.handler.ts` — payment.allocated
- `apps/api/src/notifications/handlers/invoice-events.handler.ts` — invoice.batch.completed, invoice.sent, invoice.delivery.failed
- `apps/api/src/notifications/handlers/arrears-alert.handler.ts` — arrears.threshold.crossed
- `apps/api/src/notifications/handlers/sars-deadline.handler.ts` — sars.deadline.approaching
- `apps/api/src/notifications/handlers/reconciliation.handler.ts` — reconciliation.completed/discrepancy
- `apps/api/src/notifications/handlers/staff-events.handler.ts` — leave/onboarding events

**Modified files (~8)**: Emit EventEmitter2 events from:
- Payment allocation service
- Invoice scheduler processor (replace TODO `sendAdminNotification`)
- Statement scheduler processor (same)
- SARS deadline processor
- Leave controller/service
- Reconciliation service
- Enrollment completed handler (add in-app alongside existing email)

**Tests**: Unit test per handler (mock EventEmitter2, verify jobs enqueued)

---

### Phase 4: Parent + Staff Portal Integration

**Deliverable**: Notification bell in parent and staff portal headers.

**New files (6)**:
- `apps/web/src/hooks/parent-portal/use-parent-websocket.ts` — WebSocket with parent token
- `apps/web/src/hooks/parent-portal/use-parent-notifications.ts` — Parent notification hooks
- `apps/web/src/components/parent-portal/parent-notification-bell.tsx` — Portal-specific wrapper
- `apps/web/src/hooks/staff-portal/use-staff-notifications.ts` — Staff notification hooks
- `apps/web/src/components/staff-portal/staff-notification-bell.tsx` — Portal-specific wrapper
- `apps/api/src/websocket/parent.gateway.ts` — Parent WebSocket gateway (`/parent` namespace)

**Modified files (2)**:
- `apps/web/src/components/parent-portal/portal-header.tsx` — Add bell
- `apps/web/src/components/staff-portal/staff-header.tsx` — Add bell

**Tests**: Portal-specific endpoint tests, component tests

---

### Phase 5: Preferences + Settings

**Deliverable**: Per-user notification preferences, quiet hours, cleanup job.

**New files (3)**:
- `apps/api/src/notifications/in-app-preference.service.ts` — CRUD + `shouldNotify()` check
- `apps/web/src/components/notifications/notification-settings.tsx` — Settings panel UI
- `apps/api/src/notifications/jobs/notification-cleanup.job.ts` — Daily cron: delete > 90 days

**Modified files (3)**:
- `apps/api/prisma/schema.prisma` — Add NotificationPreference model
- `apps/api/src/notifications/processors/notification.processor.ts` — Check preferences before creating
- `apps/api/src/api/notifications/notification.controller.ts` — Add GET/PUT preferences endpoints

**Migration**: `npx prisma migrate dev --name add_notification_preferences`

---

## 9. Staging Safety

| Concern | Approach |
|---------|----------|
| **In-app notifications** | Safe in staging — only visible to logged-in admin, no external side effects |
| **Email notifications** | Suppressed when `APP_ENV=staging` (already implemented in enrollment handler) |
| **WhatsApp/SMS** | Suppressed when `APP_ENV=staging` |
| **WebSocket events** | Safe — only pushed to connected dashboard clients |
| **BullMQ queue** | Runs in staging but notifications are in-app only, no external delivery |

---

## 10. Totals

|  | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | **Total** |
|---|---|---|---|---|---|---|
| **New files** | 8 | 9 | 8 | 6 | 3 | **34** |
| **Modified files** | 5 | 4 | ~8 | 2 | 3 | **~22** |
| **DB Migrations** | 1 | 0 | 0 | 0 | 1 | **2** |

---

## 11. Verification Checklist

### Phase 1
- [ ] `GET /notifications` returns paginated list with cursor
- [ ] `GET /notifications/unread-count` returns count
- [ ] `PATCH /notifications/:id/read` marks as read
- [ ] BullMQ notification queue processes jobs
- [ ] WebSocket `notification_created` event emitted

### Phase 2
- [ ] Bell icon appears in admin dashboard header
- [ ] Unread badge shows correct count
- [ ] Clicking bell opens notification panel
- [ ] Real-time: new notification appears without page refresh
- [ ] Mark-as-read updates UI instantly (optimistic)
- [ ] Polling fallback works when WebSocket disconnects

### Phase 3
- [ ] Payment allocation creates admin + parent notification
- [ ] Invoice generation creates admin notification
- [ ] SARS deadline creates urgent notification
- [ ] Arrears escalation creates notification with correct priority
- [ ] Leave request creates admin notification

### Phase 4
- [ ] Parent portal shows bell with invoice/payment notifications
- [ ] Staff portal shows bell with leave/payslip notifications
- [ ] WebSocket works with parent/staff auth tokens

### Phase 5
- [ ] User can disable specific notification types
- [ ] Quiet hours suppress notifications during configured window
- [ ] Notifications older than 90 days are auto-cleaned

---

## 12. Recommended Implementation Order

Start **Phase 1 + Phase 2 together** (backend + frontend in parallel) for the full vertical slice: DB → API → Queue → WebSocket → UI.

Then **Phase 3** to populate with real events — this is where the system becomes genuinely useful.

**Phase 4** (parent + staff portals) and **Phase 5** (preferences) can follow as separate PRs.
