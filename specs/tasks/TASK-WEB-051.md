<task_spec id="TASK-WEB-051" version="2.0">

<metadata>
  <title>Leave Balance and Application UI Components</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>251</sequence>
  <implements>
    <requirement_ref>REQ-LEAVE-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-WEB-050</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/components/staff/LeaveBalanceCard.tsx (NEW)
  - apps/web/src/components/staff/LeaveRequestDialog.tsx (NEW)

  **Dependency:**
  This task depends on TASK-WEB-050 which creates the leave API endpoints and frontend hooks.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. LeaveBalanceCard Component
  ```typescript
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Progress } from '@/components/ui/progress';
  import { Calendar, Plus } from 'lucide-react';
  import { useLeaveBalances } from '@/hooks/use-leave';
  import { useState } from 'react';
  import { LeaveRequestDialog } from './LeaveRequestDialog';

  interface LeaveBalanceCardProps {
    staffId: string;
  }

  export function LeaveBalanceCard({ staffId }: LeaveBalanceCardProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { data: balances, isLoading } = useLeaveBalances(staffId);

    if (isLoading) {
      return <Card><CardContent className="p-6">Loading leave balances...</CardContent></Card>;
    }

    if (!balances?.length) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar size={20} /> Leave Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No leave balances available</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar size={20} /> Leave Balances
            </CardTitle>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus size={16} className="mr-1" /> Request Leave
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {balances.map((balance) => {
              const usedPercent = balance.entitled > 0 ? (balance.used / balance.entitled) * 100 : 0;
              return (
                <div key={balance.leaveTypeId} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{balance.leaveTypeName}</span>
                    <span className="text-muted-foreground">
                      {balance.remaining} of {balance.entitled} days remaining
                    </span>
                  </div>
                  <Progress value={usedPercent} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
        <LeaveRequestDialog staffId={staffId} open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }
  ```

  ### 3. LeaveRequestDialog Component
  ```typescript
  'use client';

  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
  import { Button } from '@/components/ui/button';
  import { Label } from '@/components/ui/label';
  import { Textarea } from '@/components/ui/textarea';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { useLeaveTypes, useCreateLeaveRequest } from '@/hooks/use-leave';
  import { useState } from 'react';
  import { useToast } from '@/components/ui/use-toast';

  interface LeaveRequestDialogProps {
    staffId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  export function LeaveRequestDialog({ staffId, open, onOpenChange }: LeaveRequestDialogProps) {
    const { toast } = useToast();
    const { data: leaveTypes } = useLeaveTypes();
    const createMutation = useCreateLeaveRequest();
    const [formData, setFormData] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await createMutation.mutateAsync({ staffId, ...formData });
        toast({ title: 'Leave request submitted' });
        onOpenChange(false);
        setFormData({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      } catch (error) {
        toast({ title: 'Failed to submit leave request', variant: 'destructive' });
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={formData.leaveTypeId} onValueChange={(v) => setFormData({ ...formData, leaveTypeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <input type="date" className="w-full border rounded px-3 py-2" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <input type="date" className="w-full border rounded px-3 py-2" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Submitting...' : 'Submit Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Create LeaveBalanceCard component
    - Create LeaveRequestDialog component
    - Form validation with zod
    - Loading/success/error states
  </in_scope>
  <out_of_scope>
    - Leave approval workflow UI
    - Leave calendar view
    - Team leave overview
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - LeaveBalanceCard displays balances
    - Progress bars calculate correctly
    - LeaveRequestDialog validates inputs
    - Leave request creation works
  </verification>
</definition_of_done>

</task_spec>
