/**
 * Conflicting Correction Modal Component
 * TASK-EC-002: Conflicting Correction Resolution UI
 *
 * Displays when user categorizes a payee differently from existing pattern.
 * Offers resolution options: update all, just this one, or create split rule.
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import { ConflictResolutionOptions } from './ConflictResolutionOptions';
import { ImpactPreview } from './ImpactPreview';

export interface CorrectionConflict {
  payee: string;
  existingCategory: string;
  existingCategoryCode: string;
  newCategory: string;
  newCategoryCode: string;
  existingTransactionCount: number;
  affectedTransactionIds: string[];
  patternId: string;
}

export type ConflictResolutionType =
  | 'update_all'
  | 'just_this_one'
  | 'split_by_amount'
  | 'split_by_description';

export interface ConflictResolution {
  type: ConflictResolutionType;
  threshold?: number;
  pattern?: string;
}

export interface ConflictingCorrectionModalProps {
  conflict: CorrectionConflict | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
}

export function ConflictingCorrectionModal({
  conflict,
  isOpen,
  onClose,
  onResolve,
}: ConflictingCorrectionModalProps) {
  const [selectedResolution, setSelectedResolution] =
    React.useState<ConflictResolutionType>('update_all');
  const [isResolving, setIsResolving] = React.useState(false);
  const [showImpactPreview, setShowImpactPreview] = React.useState(false);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedResolution('update_all');
      setIsResolving(false);
      setShowImpactPreview(false);
    }
  }, [isOpen]);

  if (!conflict) {
    return null;
  }

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      const resolution: ConflictResolution = {
        type: selectedResolution,
      };

      await onResolve(resolution);
      onClose();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      // Error handling would show toast/alert in real implementation
    } finally {
      setIsResolving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Conflicting Categorization Detected</DialogTitle>
          </div>
          <DialogDescription>
            You previously categorized <strong>{conflict.payee}</strong> as{' '}
            <strong>{conflict.existingCategory}</strong>. You&apos;re now categorizing it as{' '}
            <strong>{conflict.newCategory}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Warning Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This change affects <strong>{conflict.existingTransactionCount}</strong>{' '}
            {conflict.existingTransactionCount === 1 ? 'transaction' : 'transactions'}.
            Please choose how to handle this conflict.
          </AlertDescription>
        </Alert>

        {/* Resolution Options */}
        <ConflictResolutionOptions
          selectedResolution={selectedResolution}
          onResolutionChange={setSelectedResolution}
          conflict={conflict}
        />

        {/* Impact Preview Toggle */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowImpactPreview(!showImpactPreview)}
          >
            {showImpactPreview ? 'Hide' : 'Show'} affected transactions
          </Button>
          <span className="text-sm text-muted-foreground">
            {conflict.existingTransactionCount}{' '}
            {conflict.existingTransactionCount === 1 ? 'transaction' : 'transactions'} affected
          </span>
        </div>

        {/* Impact Preview (collapsible) */}
        {showImpactPreview && (
          <ImpactPreview
            affectedTransactionIds={conflict.affectedTransactionIds}
            resolution={selectedResolution}
          />
        )}

        {/* Footer Actions */}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isResolving}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={isResolving}>
            {isResolving ? 'Resolving...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
