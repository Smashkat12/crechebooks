'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useParentsList } from '@/hooks/use-parents';
import { useGenerateStatement, useBulkGenerateStatements } from '@/hooks/use-statements';
import { useToast } from '@/hooks/use-toast';

interface GenerateStatementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type GenerationMode = 'single' | 'bulk';

export function GenerateStatementDialog({
  isOpen,
  onClose,
  onSuccess,
}: GenerateStatementDialogProps) {
  const [mode, setMode] = useState<GenerationMode>('bulk');
  const [parentId, setParentId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [onlyWithActivity, setOnlyWithActivity] = useState(true);
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);

  const { data: parentsData } = useParentsList({ limit: 1000 });
  const generateStatement = useGenerateStatement();
  const bulkGenerateStatements = useBulkGenerateStatements();
  const { toast } = useToast();

  const isLoading = generateStatement.isPending || bulkGenerateStatements.isPending;

  // Set default period to current month
  const handleOpen = () => {
    if (!periodStart) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setPeriodStart(firstDay.toISOString().split('T')[0]);
      setPeriodEnd(lastDay.toISOString().split('T')[0]);
    }
  };

  // Call on mount
  if (isOpen && !periodStart) {
    handleOpen();
  }

  const handleSubmit = async () => {
    if (!periodStart || !periodEnd) {
      toast({
        title: 'Validation Error',
        description: 'Please select a statement period',
        variant: 'destructive',
      });
      return;
    }

    if (mode === 'single' && !parentId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a parent',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (mode === 'single') {
        await generateStatement.mutateAsync({
          parentId,
          periodStart,
          periodEnd,
        });
        toast({
          title: 'Statement Generated',
          description: 'Statement has been generated successfully',
        });
      } else {
        const result = await bulkGenerateStatements.mutateAsync({
          periodStart,
          periodEnd,
          onlyWithActivity,
          onlyWithBalance,
        });
        toast({
          title: 'Bulk Generation Complete',
          description: `Generated ${result.generated} statements, skipped ${result.skipped}`,
        });
        if (result.errors.length > 0) {
          console.error('Bulk generation errors:', result.errors);
        }
      }
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Generation failed:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setMode('bulk');
    setParentId('');
    setPeriodStart('');
    setPeriodEnd('');
    setOnlyWithActivity(true);
    setOnlyWithBalance(false);
    onClose();
  };

  const parents = parentsData?.parents ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate Statements</DialogTitle>
          <DialogDescription>
            Generate account statements for the selected period.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Mode Selection */}
          <div className="flex gap-4">
            <Button
              variant={mode === 'bulk' ? 'default' : 'outline'}
              onClick={() => setMode('bulk')}
              className="flex-1"
            >
              All Parents
            </Button>
            <Button
              variant={mode === 'single' ? 'default' : 'outline'}
              onClick={() => setMode('single')}
              className="flex-1"
            >
              Single Parent
            </Button>
          </div>

          {/* Parent Selection (single mode) */}
          {mode === 'single' && (
            <div className="grid gap-2">
              <Label htmlFor="parent">Parent</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent" />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.firstName} {parent.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Period Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="periodStart">Period Start</Label>
              <Input
                id="periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="periodEnd">Period End</Label>
              <Input
                id="periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Bulk Options */}
          {mode === 'bulk' && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="onlyWithActivity"
                  checked={onlyWithActivity}
                  onCheckedChange={(checked) => setOnlyWithActivity(checked as boolean)}
                />
                <Label htmlFor="onlyWithActivity" className="font-normal">
                  Only parents with activity in period
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="onlyWithBalance"
                  checked={onlyWithBalance}
                  onCheckedChange={(checked) => setOnlyWithBalance(checked as boolean)}
                />
                <Label htmlFor="onlyWithBalance" className="font-normal">
                  Only parents with outstanding balance
                </Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
