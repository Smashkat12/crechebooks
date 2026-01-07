'use client';

/**
 * Checklist Step
 * TASK-STAFF-001: Staff Onboarding - Step 6
 *
 * Administrative checklist for onboarding completion:
 * - IT setup (email, system access)
 * - Equipment assignment
 * - Policy acknowledgements
 * - Training completion
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2,
  Check,
  Clock,
  SkipForward,
  MessageSquare,
  Monitor,
  Key,
  BookOpen,
  Shield,
  Users,
} from 'lucide-react';
import {
  useOnboardingChecklist,
  useCompleteChecklistItem,
  type OnboardingChecklist,
} from '@/hooks/use-staff-onboarding';

interface ChecklistStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

// Category icons
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  IT_SETUP: Monitor,
  ACCESS: Key,
  TRAINING: BookOpen,
  COMPLIANCE: Shield,
  TEAM: Users,
};

function ChecklistItemCard({
  item,
  onComplete,
  isCompleting,
}: {
  item: OnboardingChecklist;
  onComplete: (itemId: string, notes?: string) => void;
  isCompleting: boolean;
}) {
  const [notes, setNotes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const Icon = CATEGORY_ICONS[item.category] || Check;
  const isCompleted = item.status === 'COMPLETED';
  const isSkipped = item.status === 'SKIPPED';

  const handleComplete = () => {
    onComplete(item.id, notes || undefined);
    setDialogOpen(false);
    setNotes('');
  };

  return (
    <Card className={`transition-all ${isCompleted ? 'bg-green-50 border-green-200' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
              ${isCompleted ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}
            `}
          >
            {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                {item.itemName}
              </h4>
              {item.isRequired && !isCompleted && (
                <Badge variant="destructive" className="text-xs">Required</Badge>
              )}
              {isCompleted && (
                <Badge variant="success" className="text-xs">Completed</Badge>
              )}
              {isSkipped && (
                <Badge variant="secondary" className="text-xs">Skipped</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            {item.completedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Completed on {new Date(item.completedAt).toLocaleDateString()}
                {item.completedBy && ` by ${item.completedBy}`}
              </p>
            )}
            {item.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Note: {item.notes}
              </p>
            )}
          </div>

          <div className="flex-shrink-0">
            {!isCompleted && !isSkipped && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isCompleting}>
                    {isCompleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Complete
                      </>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete Checklist Item</DialogTitle>
                    <DialogDescription>
                      Mark &quot;{item.itemName}&quot; as complete. You can optionally add notes.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any relevant notes..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleComplete} disabled={isCompleting}>
                      {isCompleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Mark Complete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChecklistStep({ staffId, onComplete, isSubmitting, isEditing }: ChecklistStepProps) {
  const { data: checklist, isLoading } = useOnboardingChecklist(staffId);
  const { mutate: completeItem, isPending: isCompleting } = useCompleteChecklistItem(staffId);

  const handleCompleteItem = (itemId: string, notes?: string) => {
    completeItem({ itemId, notes });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Check if all required items are completed
    const requiredItems = checklist?.filter((item) => item.isRequired) || [];
    const pendingRequired = requiredItems.filter((item) => item.status === 'PENDING');

    if (pendingRequired.length > 0) {
      alert(`Please complete the following required items: ${pendingRequired.map((i) => i.itemName).join(', ')}`);
      return;
    }

    await onComplete({
      checklistCompleted: true,
      completedItems: checklist?.filter((i) => i.status === 'COMPLETED').length || 0,
    });
  };

  // Group items by category
  const groupedItems = checklist?.reduce(
    (acc, item) => {
      const category = item.category || 'OTHER';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, OnboardingChecklist[]>
  );

  // Calculate progress
  const totalItems = checklist?.length || 0;
  const completedItems = checklist?.filter((i) => i.status === 'COMPLETED').length || 0;
  const requiredItems = checklist?.filter((i) => i.isRequired).length || 0;
  const completedRequired = checklist?.filter((i) => i.isRequired && i.status === 'COMPLETED').length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Progress Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Checklist Progress</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Items:</span>
            <span className="ml-2 font-medium">{totalItems}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed:</span>
            <span className="ml-2 font-medium text-green-600">
              {completedItems} / {totalItems}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Required:</span>
            <span className="ml-2 font-medium">{requiredItems}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Required Done:</span>
            <span className="ml-2 font-medium text-green-600">
              {completedRequired} / {requiredItems}
            </span>
          </div>
        </div>
      </div>

      {/* Checklist Items by Category */}
      <div className="space-y-6">
        {groupedItems &&
          Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                {CATEGORY_ICONS[category] && (
                  <span>{React.createElement(CATEGORY_ICONS[category], { className: 'w-4 h-4' })}</span>
                )}
                {category.replace(/_/g, ' ')}
              </h4>
              <div className="space-y-3">
                {items.map((item) => (
                  <ChecklistItemCard
                    key={item.id}
                    item={item}
                    onComplete={handleCompleteItem}
                    isCompleting={isCompleting}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting || completedRequired < requiredItems}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {completedRequired < requiredItems
            ? `Complete ${requiredItems - completedRequired} more required items`
            : isEditing ? 'Update & Return' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
