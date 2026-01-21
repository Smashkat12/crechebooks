<task_spec id="TASK-COMM-004" version="1.0">

<metadata>
  <title>Frontend Communication Dashboard Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>283</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-COMM-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-COMM-003</task_ref>
    <task_ref status="complete">TASK-WEB-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/communications/page.tsx` (NEW)
  - `apps/web/src/app/(dashboard)/communications/new/page.tsx` (NEW)
  - `apps/web/src/app/(dashboard)/communications/[id]/page.tsx` (NEW)
  - `apps/web/src/components/communications/broadcast-list.tsx` (NEW)
  - `apps/web/src/components/communications/broadcast-form.tsx` (NEW)
  - `apps/web/src/components/communications/broadcast-detail.tsx` (NEW)
  - `apps/web/src/components/communications/message-composer.tsx` (NEW)
  - `apps/web/src/hooks/use-communications.ts` (NEW)
  - `apps/web/src/lib/api/communications.ts` (NEW)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (add communication endpoints)

  **Current Problem:**
  - No UI for ad-hoc communication
  - Creche admins cannot send announcements to parents
  - No way to compose and preview messages
  - No dashboard to view broadcast history and status

  **Test Count:** 460+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Communication Dashboard Page
  ```typescript
  // apps/web/src/app/(dashboard)/communications/page.tsx
  'use client';

  import { useState } from 'react';
  import { useRouter } from 'next/navigation';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { BroadcastList } from '@/components/communications/broadcast-list';
  import { Plus, Mail, MessageSquare, Send } from 'lucide-react';

  export default function CommunicationsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('all');

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
            <p className="text-muted-foreground">
              Send announcements and messages to parents and staff
            </p>
          </div>
          <Button onClick={() => router.push('/communications/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Message
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <QuickStatCard
            title="Messages Sent"
            value="156"
            description="This month"
            icon={<Send className="h-4 w-4" />}
          />
          <QuickStatCard
            title="Email Delivery"
            value="94%"
            description="Average rate"
            icon={<Mail className="h-4 w-4" />}
          />
          <QuickStatCard
            title="WhatsApp Delivery"
            value="98%"
            description="Average rate"
            icon={<MessageSquare className="h-4 w-4" />}
          />
          <QuickStatCard
            title="Pending"
            value="3"
            description="Scheduled messages"
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        {/* Broadcast List */}
        <Card>
          <CardHeader>
            <CardTitle>Message History</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="sent">Sent</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                <TabsTrigger value="draft">Drafts</TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab}>
                <BroadcastList status={activeTab === 'all' ? undefined : activeTab} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 3. New Broadcast Page
  ```typescript
  // apps/web/src/app/(dashboard)/communications/new/page.tsx
  'use client';

  import { useState } from 'react';
  import { useRouter } from 'next/navigation';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { MessageComposer } from '@/components/communications/message-composer';
  import { RecipientSelector } from '@/components/communications/recipient-selector';
  import { ChannelSelector } from '@/components/communications/channel-selector';
  import { RecipientPreview } from '@/components/communications/recipient-preview';
  import { useCommunications } from '@/hooks/use-communications';
  import { toast } from 'sonner';

  export default function NewBroadcastPage() {
    const router = useRouter();
    const { createBroadcast, sendBroadcast, isCreating, isSending } = useCommunications();

    const [step, setStep] = useState(1); // 1: Recipients, 2: Message, 3: Review
    const [formData, setFormData] = useState({
      recipientType: 'parent',
      recipientFilter: {},
      channel: 'email',
      subject: '',
      body: '',
    });

    const handleCreate = async () => {
      try {
        const broadcast = await createBroadcast(formData);
        toast.success('Message created');
        router.push(`/communications/${broadcast.id}`);
      } catch (error) {
        toast.error('Failed to create message');
      }
    };

    const handleSendNow = async () => {
      try {
        const broadcast = await createBroadcast(formData);
        await sendBroadcast(broadcast.id);
        toast.success('Message sent');
        router.push('/communications');
      } catch (error) {
        toast.error('Failed to send message');
      }
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Message</h1>
            <p className="text-muted-foreground">
              Compose and send a message to parents or staff
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={step} steps={['Recipients', 'Message', 'Review']} />

        {/* Step 1: Recipients */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <RecipientSelector
                value={formData}
                onChange={(updates) => setFormData({ ...formData, ...updates })}
              />
              <ChannelSelector
                value={formData.channel}
                onChange={(channel) => setFormData({ ...formData, channel })}
              />
              <RecipientPreview
                recipientType={formData.recipientType}
                filter={formData.recipientFilter}
                channel={formData.channel}
              />
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)}>
                  Continue to Message
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Message */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Compose Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <MessageComposer
                value={formData}
                onChange={(updates) => setFormData({ ...formData, ...updates })}
                showSubject={formData.channel === 'email' || formData.channel === 'all'}
              />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Review Message
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <BroadcastPreview data={formData} />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleCreate}
                    disabled={isCreating}
                  >
                    Save as Draft
                  </Button>
                  <Button
                    onClick={handleSendNow}
                    disabled={isCreating || isSending}
                  >
                    Send Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

  ### 4. useCommunications Hook
  ```typescript
  // apps/web/src/hooks/use-communications.ts
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { communicationsApi } from '@/lib/api/communications';

  export function useCommunications() {
    const queryClient = useQueryClient();

    const { data: broadcasts, isLoading } = useQuery({
      queryKey: ['broadcasts'],
      queryFn: () => communicationsApi.listBroadcasts(),
    });

    const { mutateAsync: createBroadcast, isPending: isCreating } = useMutation({
      mutationFn: communicationsApi.createBroadcast,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      },
    });

    const { mutateAsync: sendBroadcast, isPending: isSending } = useMutation({
      mutationFn: communicationsApi.sendBroadcast,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      },
    });

    const { mutateAsync: previewRecipients, isPending: isPreviewing } = useMutation({
      mutationFn: communicationsApi.previewRecipients,
    });

    return {
      broadcasts,
      isLoading,
      createBroadcast,
      isCreating,
      sendBroadcast,
      isSending,
      previewRecipients,
      isPreviewing,
    };
  }

  export function useBroadcast(id: string) {
    const { data: broadcast, isLoading } = useQuery({
      queryKey: ['broadcast', id],
      queryFn: () => communicationsApi.getBroadcast(id),
      enabled: !!id,
    });

    return { broadcast, isLoading };
  }

  export function useRecipientGroups() {
    const queryClient = useQueryClient();

    const { data: groups, isLoading } = useQuery({
      queryKey: ['recipientGroups'],
      queryFn: () => communicationsApi.listGroups(),
    });

    const { mutateAsync: createGroup, isPending: isCreatingGroup } = useMutation({
      mutationFn: communicationsApi.createGroup,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['recipientGroups'] });
      },
    });

    return { groups, isLoading, createGroup, isCreatingGroup };
  }
  ```

  ### 5. API Client
  ```typescript
  // apps/web/src/lib/api/communications.ts
  import { apiClient } from './client';
  import type {
    BroadcastMessage,
    BroadcastDetail,
    CreateBroadcastDto,
    RecipientPreview,
    RecipientGroup,
  } from '@/types/communications';

  export const communicationsApi = {
    createBroadcast: (data: CreateBroadcastDto) =>
      apiClient.post<BroadcastMessage>('/communications/broadcasts', data),

    sendBroadcast: (id: string) =>
      apiClient.post<void>(`/communications/broadcasts/${id}/send`),

    listBroadcasts: (params?: { status?: string; limit?: number }) =>
      apiClient.get<BroadcastMessage[]>('/communications/broadcasts', { params }),

    getBroadcast: (id: string) =>
      apiClient.get<BroadcastDetail>(`/communications/broadcasts/${id}`),

    previewRecipients: (data: { recipientType: string; filter?: any; channel: string }) =>
      apiClient.post<RecipientPreview>('/communications/recipients/preview', data),

    listGroups: () =>
      apiClient.get<RecipientGroup[]>('/communications/groups'),

    createGroup: (data: { name: string; recipientType: string; filterCriteria: any }) =>
      apiClient.post<RecipientGroup>('/communications/groups', data),

    deleteGroup: (id: string) =>
      apiClient.delete<void>(`/communications/groups/${id}`),
  };
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the frontend dashboard for ad-hoc communication.

**Business Requirements:**
1. Intuitive interface for composing messages
2. Easy recipient selection with preview
3. Channel selection (Email, WhatsApp, Both)
4. Review before sending
5. Message history with status tracking
6. Quick stats on delivery rates

**User Flow:**
1. Click "New Message" → Select recipients → Compose message → Review → Send
2. View sent messages → Click to see delivery details
3. Create saved recipient groups for reuse

**UI Components:**
- Dashboard with quick stats and message list
- Step-by-step new message wizard
- Recipient selector with filters
- Channel selector
- Message composer with preview
- Broadcast detail page with delivery stats
</context>

<scope>
  <in_scope>
    - Communications dashboard page
    - New broadcast wizard (3-step)
    - Broadcast list component
    - Broadcast detail page
    - Message composer component
    - API client and hooks
    - Navigation integration
  </in_scope>
  <out_of_scope>
    - Recipient selector component (TASK-COMM-005)
    - Message history analytics (TASK-COMM-006)
    - Real-time status updates (future)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create API client
# Create apps/web/src/lib/api/communications.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-communications.ts

# 3. Create dashboard page
# Create apps/web/src/app/(dashboard)/communications/page.tsx

# 4. Create new broadcast page
# Create apps/web/src/app/(dashboard)/communications/new/page.tsx

# 5. Create broadcast detail page
# Create apps/web/src/app/(dashboard)/communications/[id]/page.tsx

# 6. Create components
# Create apps/web/src/components/communications/broadcast-list.tsx
# Create apps/web/src/components/communications/broadcast-form.tsx
# Create apps/web/src/components/communications/broadcast-detail.tsx
# Create apps/web/src/components/communications/message-composer.tsx
# Create apps/web/src/components/communications/channel-selector.tsx

# 7. Update navigation
# Add Communications link to sidebar

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Responsive design for desktop and tablet
    - Loading states and error handling
    - Form validation before submission
    - Toast notifications for actions
    - Proper TypeScript types
    - Accessible UI components
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Manual: Navigate to /communications
    - Manual: Create new broadcast
    - Manual: Preview recipients
    - Manual: Send broadcast
    - Manual: View broadcast details
    - Manual: Mobile responsiveness
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip loading states
  - Allow sending without confirmation
  - Show full message in list (use truncation)
  - Use inline styles (use Tailwind)
  - Skip TypeScript types
</anti_patterns>

</task_spec>
