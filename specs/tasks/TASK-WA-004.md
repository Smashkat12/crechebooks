<task_spec id="TASK-WA-004" version="2.0">

<metadata>
  <title>WhatsApp Opt-In UI Components</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>263</sequence>
  <implements>
    <requirement_ref>REQ-WA-OPTIN-001</requirement_ref>
    <requirement_ref>REQ-POPIA-CONSENT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="complete">TASK-WEB-031</task_ref>
    <task_ref status="pending">TASK-WA-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/components/parents/whatsapp-opt-in.tsx` (NEW)
  - `apps/web/src/components/parents/whatsapp-message-history.tsx` (NEW)
  - `apps/web/src/hooks/use-whatsapp.ts` (NEW)
  - `apps/api/src/api/whatsapp/whatsapp.controller.ts` (NEW)
  - `apps/api/src/api/whatsapp/dto/whatsapp-api.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/parents/[id]/page.tsx` (add WhatsApp section)
  - `apps/web/src/lib/api/endpoints.ts` (add WhatsApp endpoints)
  - `apps/api/src/api/api.module.ts` (add WhatsApp controller)

  **Current Problem:**
  - No UI for managing WhatsApp opt-in/opt-out
  - No way for staff to see message history
  - No way for staff to manually resend messages
  - Phone number for WhatsApp not visible in parent details
  - POPIA requires explicit consent tracking

  **Existing Opt-In Backend:**
  - `WhatsAppService.optIn(tenantId, parentId)` - marks parent as opted in
  - `WhatsAppService.optOut(tenantId, parentId)` - marks parent as opted out
  - `WhatsAppService.checkOptIn(tenantId, parentId)` - checks opt-in status

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. WhatsApp Opt-In Component
  ```typescript
  'use client';

  import { useState } from 'react';
  import { Switch } from '@/components/ui/switch';
  import { Label } from '@/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { useWhatsApp } from '@/hooks/use-whatsapp';
  import { toast } from 'sonner';

  interface WhatsAppOptInProps {
    parentId: string;
    phone: string;
    initialOptedIn: boolean;
  }

  export function WhatsAppOptIn({ parentId, phone, initialOptedIn }: WhatsAppOptInProps) {
    const [optedIn, setOptedIn] = useState(initialOptedIn);
    const { updateOptIn, isLoading } = useWhatsApp();

    const handleToggle = async (checked: boolean) => {
      try {
        await updateOptIn(parentId, checked);
        setOptedIn(checked);
        toast.success(checked ? 'WhatsApp enabled' : 'WhatsApp disabled');
      } catch (error) {
        toast.error('Failed to update WhatsApp preference');
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WhatsApp Notifications
            {optedIn && <Badge variant="success">Active</Badge>}
          </CardTitle>
          <CardDescription>
            Send invoices, reminders, and statements via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="whatsapp-opt-in">Enable WhatsApp</Label>
              <p className="text-sm text-muted-foreground">
                Messages will be sent to {phone}
              </p>
            </div>
            <Switch
              id="whatsapp-opt-in"
              checked={optedIn}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
          {optedIn && (
            <p className="text-xs text-muted-foreground">
              POPIA Notice: The parent has consented to receive communications via WhatsApp.
              Consent recorded at opt-in time.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

  ### 3. Message History Component
  ```typescript
  'use client';

  import { useWhatsAppHistory } from '@/hooks/use-whatsapp';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { RefreshCw } from 'lucide-react';
  import { formatDistanceToNow } from 'date-fns';

  interface WhatsAppMessageHistoryProps {
    parentId: string;
  }

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    read: 'bg-green-200 text-green-900',
    failed: 'bg-red-100 text-red-800',
  };

  export function WhatsAppMessageHistory({ parentId }: WhatsAppMessageHistoryProps) {
    const { messages, isLoading, refetch } = useWhatsAppHistory(parentId);

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Message History</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground">No messages sent yet</p>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div>
                    <p className="font-medium capitalize">{msg.contextType}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge className={statusColors[msg.status]}>{msg.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

  ### 4. API Hook
  ```typescript
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { apiClient } from '@/lib/api/client';

  export function useWhatsApp() {
    const queryClient = useQueryClient();

    const updateOptIn = useMutation({
      mutationFn: async ({ parentId, optIn }: { parentId: string; optIn: boolean }) => {
        const endpoint = optIn ? '/whatsapp/opt-in' : '/whatsapp/opt-out';
        return apiClient.post(endpoint, { parentId });
      },
      onSuccess: (_, { parentId }) => {
        queryClient.invalidateQueries({ queryKey: ['parent', parentId] });
      },
    });

    return {
      updateOptIn: (parentId: string, optIn: boolean) =>
        updateOptIn.mutateAsync({ parentId, optIn }),
      isLoading: updateOptIn.isPending,
    };
  }

  export function useWhatsAppHistory(parentId: string) {
    const query = useQuery({
      queryKey: ['whatsapp-history', parentId],
      queryFn: () => apiClient.get(`/whatsapp/history/${parentId}`),
    });

    return {
      messages: query.data?.data || [],
      isLoading: query.isLoading,
      refetch: query.refetch,
    };
  }
  ```

  ### 5. API Controller
  ```typescript
  @Controller('whatsapp')
  @ApiTags('WhatsApp')
  @UseGuards(AuthGuard, TenantGuard)
  export class WhatsAppController {
    constructor(private readonly whatsappService: WhatsAppService) {}

    @Post('opt-in')
    @ApiOperation({ summary: 'Opt parent into WhatsApp notifications' })
    async optIn(
      @TenantId() tenantId: string,
      @Body() dto: WhatsAppOptInDto,
    ): Promise<{ success: boolean }> {
      await this.whatsappService.optIn(tenantId, dto.parentId);
      return { success: true };
    }

    @Post('opt-out')
    @ApiOperation({ summary: 'Opt parent out of WhatsApp notifications' })
    async optOut(
      @TenantId() tenantId: string,
      @Body() dto: WhatsAppOptOutDto,
    ): Promise<{ success: boolean }> {
      await this.whatsappService.optOut(tenantId, dto.parentId);
      return { success: true };
    }

    @Get('history/:parentId')
    @ApiOperation({ summary: 'Get WhatsApp message history for a parent' })
    async getHistory(
      @TenantId() tenantId: string,
      @Param('parentId') parentId: string,
      @Query('limit') limit?: number,
    ): Promise<WhatsAppMessageDto[]> {
      return this.whatsappService.getMessageHistory(tenantId, parentId, limit);
    }

    @Get('status/:parentId')
    @ApiOperation({ summary: 'Check WhatsApp opt-in status' })
    async getStatus(
      @TenantId() tenantId: string,
      @Param('parentId') parentId: string,
    ): Promise<{ optedIn: boolean }> {
      const optedIn = await this.whatsappService.checkOptIn(tenantId, parentId);
      return { optedIn };
    }
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
This task creates the UI components for managing WhatsApp opt-in and viewing message history.

**Business Requirements:**
1. Staff can enable/disable WhatsApp for each parent
2. Staff can view message history per parent
3. Message status visible (sent, delivered, read, failed)
4. POPIA consent timestamp tracked
5. Phone number displayed for verification

**POPIA Compliance:**
- Explicit opt-in required (not opt-out)
- Consent timestamp recorded
- Easy opt-out mechanism
- Communication history retained
</context>

<scope>
  <in_scope>
    - Create WhatsApp opt-in toggle component
    - Create message history component
    - Create API hooks for WhatsApp
    - Create WhatsApp API controller
    - Create API DTOs
    - Add WhatsApp section to parent detail page
    - Add API endpoints to frontend
  </in_scope>
  <out_of_scope>
    - Parent self-service portal (future)
    - Bulk opt-in/opt-out
    - Message content preview
    - Resend message functionality (TASK-WA-006)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create API DTOs
# Create apps/api/src/api/whatsapp/dto/whatsapp-api.dto.ts

# 2. Create API controller
# Create apps/api/src/api/whatsapp/whatsapp.controller.ts

# 3. Update API module
# Edit apps/api/src/api/api.module.ts

# 4. Create frontend hooks
# Create apps/web/src/hooks/use-whatsapp.ts

# 5. Update frontend endpoints
# Edit apps/web/src/lib/api/endpoints.ts

# 6. Create opt-in component
# Create apps/web/src/components/parents/whatsapp-opt-in.tsx

# 7. Create history component
# Create apps/web/src/components/parents/whatsapp-message-history.tsx

# 8. Update parent detail page
# Edit apps/web/src/app/(dashboard)/parents/[id]/page.tsx

# 9. Create tests
# Create apps/api/tests/api/whatsapp.controller.spec.ts

# 10. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - shadcn/ui components used consistently
    - React Query for data fetching
    - Optimistic updates for toggle
    - Loading states handled
    - Error states handled
    - POPIA consent notice displayed
    - Phone number formatted as +27 XX XXX XXXX
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Toggle opt-in/opt-out
    - Test: Load message history
    - Test: Display message status correctly
    - Test: Handle loading state
    - Test: Handle error state
    - Test: API endpoint authentication
    - Test: Tenant isolation on API
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip tenant isolation in API
  - Allow opt-in without phone number
  - Store full message content in UI
  - Use fetch instead of React Query
  - Skip loading/error states
</anti_patterns>

</task_spec>
