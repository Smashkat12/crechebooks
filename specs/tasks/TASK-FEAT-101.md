<task_spec id="TASK-FEAT-101" version="1.0">

<metadata>
  <title>Real-time Dashboard with WebSocket Updates</title>
  <status>ready</status>
  <phase>usacf-sprint-4</phase>
  <layer>feature</layer>
  <sequence>210</sequence>
  <priority>P1-HIGH</priority>
  <sprint>4</sprint>
  <estimated_effort>8 days (64 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP004</opportunity_ref>
    <gap_ref>C003</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="required">TASK-PERF-102</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <confidence>85%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP004</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture - WebSocket rooms must isolate tenants completely.
    Dashboard is the main view - real-time updates dramatically improve UX.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <websocket>Socket.IO 4.x via @nestjs/websockets</websocket>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <frontend>React 18 with socket.io-client</frontend>
    <testing>Jest for unit/integration, no mock data - test real WebSocket connections</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (WebSocket gateway here)
    apps/web/        - React frontend (WebSocket client here)
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - WebSocket is additive, no fallback to polling</rule>
    <rule id="2">NO MOCK DATA in tests - use real WebSocket connections with test tokens</rule>
    <rule id="3">TENANT ISOLATION - rooms named by tenantId, verify JWT tenant claim</rule>
    <rule id="4">JWT AUTHENTICATION - reuse existing JWT, verify on connection</rule>
    <rule id="5">RECONNECTION HANDLING - client must auto-reconnect with backoff</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="gateway">WebSocket gateways in apps/api/src/websocket/</pattern>
    <pattern name="guards">WebSocket guards in apps/api/src/websocket/guards/</pattern>
    <pattern name="hooks">React hooks in apps/web/src/hooks/</pattern>
    <pattern name="context">React context in apps/web/src/contexts/</pattern>
  </coding_patterns>

  <existing_dashboard_structure>
    - Dashboard service at apps/api/src/database/services/dashboard.service.ts
    - Dashboard controller at apps/api/src/api/dashboard/dashboard.controller.ts
    - Dashboard page at apps/web/src/pages/Dashboard.tsx
    - Currently requires manual refresh (this task adds real-time)
  </existing_dashboard_structure>

  <events_to_broadcast>
    - payment_received: When payment allocated to invoice
    - invoice_status_changed: When invoice status transitions
    - arrears_alert: When arrears threshold crossed
    - metrics_updated: Periodic dashboard metrics refresh
  </events_to_broadcast>
</project_context>

<executive_summary>
Implement WebSocket-based real-time updates for the dashboard to show live payment
receipts, invoice status changes, and arrears alerts without manual refresh. Currently,
users must refresh to see updates, causing delays in financial visibility.
</executive_summary>

<business_case>
  <problem>Dashboard requires manual refresh to see updates</problem>
  <solution>WebSocket connection for real-time push updates</solution>
  <benefit>Instant visibility of payments, improved user experience</benefit>
  <roi>Faster payment processing awareness, reduced support calls</roi>
</business_case>

<context>
GAP C003: No real-time dashboard updates.

Current State:
- Users must refresh browser to see new data
- Payments not visible until manual refresh
- No notifications for arrears changes
- Status changes delayed

User Impact:
- Delayed awareness of incoming payments
- Missed arrears notifications
- Manual refresh burden
- Perception of slow system
</context>

<input_context_files>
  <file purpose="dashboard_service">apps/api/src/database/services/dashboard.service.ts</file>
  <file purpose="dashboard_controller">apps/api/src/api/dashboard/dashboard.controller.ts</file>
  <file purpose="web_dashboard">apps/web/src/pages/Dashboard.tsx</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - WebSocket gateway for dashboard events
    - Real-time payment notifications
    - Real-time invoice status updates
    - Real-time arrears alerts
    - Connection management (reconnect, heartbeat)
    - Room-based tenant isolation
    - Event broadcasting from services
    - Frontend WebSocket client integration
  </in_scope>
  <out_of_scope>
    - Push notifications (mobile, browser)
    - Email notifications
    - Historical event replay
    - Offline sync
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/websocket/dashboard.gateway.ts">
      @WebSocketGateway({
        namespace: 'dashboard',
        cors: { origin: '*' },
      })
      export class DashboardGateway {
        @WebSocketServer()
        server: Server;

        @SubscribeMessage('join')
        handleJoin(
          @ConnectedSocket() client: Socket,
          @MessageBody() data: { tenantId: string; token: string }
        ): void;

        @SubscribeMessage('leave')
        handleLeave(@ConnectedSocket() client: Socket): void;

        broadcastToTenant(
          tenantId: string,
          event: DashboardEvent
        ): void;

        sendPaymentReceived(tenantId: string, payment: Payment): void;
        sendInvoiceStatusChange(tenantId: string, invoice: Invoice): void;
        sendArrearsAlert(tenantId: string, arrears: ArrearsData): void;
      }
    </signature>
    <signature file="apps/api/src/websocket/events/dashboard.events.ts">
      export enum DashboardEventType {
        PAYMENT_RECEIVED = 'payment_received',
        INVOICE_STATUS_CHANGED = 'invoice_status_changed',
        ARREARS_ALERT = 'arrears_alert',
        METRICS_UPDATED = 'metrics_updated',
      }

      export interface DashboardEvent {
        type: DashboardEventType;
        timestamp: string;
        data: unknown;
      }
    </signature>
    <signature file="apps/web/src/hooks/useDashboardSocket.ts">
      export function useDashboardSocket(): {
        isConnected: boolean;
        lastEvent: DashboardEvent | null;
        metrics: DashboardMetrics;
        payments: Payment[];
        connect: () => void;
        disconnect: () => void;
      };
    </signature>
  </signatures>

  <constraints>
    - JWT authentication required for WebSocket connection
    - Tenant isolation via rooms (no cross-tenant data)
    - Reconnection with exponential backoff
    - Heartbeat every 30 seconds
    - Maximum 1000 concurrent connections per instance
    - Event throttling: max 10 events/second per tenant
  </constraints>

  <verification>
    - WebSocket connection established with auth
    - Payment events delivered in &lt;500ms
    - Tenant isolation verified
    - Reconnection works after disconnect
    - No memory leaks from connections
    - All existing tests pass
  </verification>
</definition_of_done>

<event_specifications>
  <event type="payment_received">
    <trigger>Payment allocated to invoice</trigger>
    <payload>
      ```json
      {
        "type": "payment_received",
        "timestamp": "2026-01-20T10:30:00Z",
        "data": {
          "paymentId": "uuid",
          "amount": 1500.00,
          "parentName": "John Smith",
          "childName": "Jane Smith",
          "invoiceNumber": "INV-2026-001"
        }
      }
      ```
    </payload>
  </event>
  <event type="invoice_status_changed">
    <trigger>Invoice status transitions</trigger>
    <payload>
      ```json
      {
        "type": "invoice_status_changed",
        "timestamp": "2026-01-20T10:30:00Z",
        "data": {
          "invoiceId": "uuid",
          "invoiceNumber": "INV-2026-001",
          "previousStatus": "PENDING",
          "newStatus": "PAID"
        }
      }
      ```
    </payload>
  </event>
  <event type="arrears_alert">
    <trigger>Arrears threshold crossed</trigger>
    <payload>
      ```json
      {
        "type": "arrears_alert",
        "timestamp": "2026-01-20T10:30:00Z",
        "data": {
          "parentId": "uuid",
          "parentName": "John Smith",
          "totalArrears": 3500.00,
          "daysOverdue": 45
        }
      }
      ```
    </payload>
  </event>
</event_specifications>

<implementation_approach>
  <step order="1">
    Install Socket.IO dependencies:
    ```bash
    pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
    pnpm add -D @types/socket.io
    ```
  </step>
  <step order="2">
    Create DashboardGateway with authentication guard
  </step>
  <step order="3">
    Implement room-based tenant isolation
  </step>
  <step order="4">
    Create event emitter service for broadcasting
  </step>
  <step order="5">
    Integrate event emission in PaymentService
  </step>
  <step order="6">
    Integrate event emission in InvoiceService
  </step>
  <step order="7">
    Create frontend useDashboardSocket hook
  </step>
  <step order="8">
    Update Dashboard component with real-time data
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/websocket/dashboard.gateway.ts">
    WebSocket gateway for dashboard
  </file>
  <file path="apps/api/src/websocket/websocket.module.ts">
    WebSocket module
  </file>
  <file path="apps/api/src/websocket/guards/ws-jwt.guard.ts">
    WebSocket JWT authentication guard
  </file>
  <file path="apps/api/src/websocket/events/dashboard.events.ts">
    Event type definitions
  </file>
  <file path="apps/api/src/websocket/services/event-emitter.service.ts">
    Event broadcasting service
  </file>
  <file path="apps/api/src/websocket/__tests__/dashboard.gateway.spec.ts">
    Gateway tests
  </file>
  <file path="apps/web/src/hooks/useDashboardSocket.ts">
    Frontend WebSocket hook
  </file>
  <file path="apps/web/src/contexts/WebSocketContext.tsx">
    WebSocket context provider
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/app.module.ts">
    Import WebSocketModule
  </file>
  <file path="apps/api/src/database/services/payment.service.ts">
    Emit events on payment allocation
  </file>
  <file path="apps/api/src/database/services/invoice.service.ts">
    Emit events on status change
  </file>
  <file path="apps/web/src/pages/Dashboard.tsx">
    Integrate real-time updates
  </file>
  <file path="apps/web/src/App.tsx">
    Add WebSocket provider
  </file>
  <file path="package.json">
    Add socket.io dependencies
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>WebSocket connection authenticates with JWT</criterion>
  <criterion>Payment events delivered within 500ms</criterion>
  <criterion>Tenant isolation prevents cross-tenant events</criterion>
  <criterion>Reconnection handles network interruption</criterion>
  <criterion>Dashboard updates without refresh</criterion>
  <criterion>All existing tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="dashboard.gateway" --verbose</command>
  <command>npm run test:e2e -- websocket</command>
</test_commands>

<success_metrics>
  <metric name="event_latency">&lt;500ms</metric>
  <metric name="connection_success_rate">99.9%</metric>
  <metric name="reconnection_success">100%</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: REALTIME_DASHBOARD (default: true)
  - Fallback to polling (30 second refresh)
  - WebSocket module can be disabled without data loss
</rollback_plan>

</task_spec>
