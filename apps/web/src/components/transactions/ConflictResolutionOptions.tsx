/**
 * Conflict Resolution Options Component
 * TASK-EC-002: Conflicting Correction Resolution UI
 *
 * Displays resolution option cards with clear explanations of impact.
 */

import * as React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Info } from 'lucide-react';
import type { CorrectionConflict, ConflictResolutionType } from './ConflictingCorrectionModal';

export interface ConflictResolutionOptionsProps {
  selectedResolution: ConflictResolutionType;
  onResolutionChange: (resolution: ConflictResolutionType) => void;
  conflict: CorrectionConflict;
}

interface ResolutionOption {
  value: ConflictResolutionType;
  label: string;
  description: string;
  impact: string;
  recommended?: boolean;
  disabled?: boolean;
}

export function ConflictResolutionOptions({
  selectedResolution,
  onResolutionChange,
  conflict,
}: ConflictResolutionOptionsProps) {
  const options: ResolutionOption[] = [
    {
      value: 'update_all',
      label: 'Update all transactions',
      description: `Change all ${conflict.existingTransactionCount} transactions from "${conflict.existingCategory}" to "${conflict.newCategory}"`,
      impact: 'This will update the pattern and recategorize all past transactions.',
      recommended: true,
    },
    {
      value: 'just_this_one',
      label: 'Just this one',
      description: `Keep future "${conflict.payee}" transactions as "${conflict.existingCategory}", but categorize this one as "${conflict.newCategory}"`,
      impact: 'Creates an exception. The existing pattern remains unchanged.',
    },
    {
      value: 'split_by_amount',
      label: 'Split by amount (Coming Soon)',
      description: 'Categorize based on transaction amount threshold',
      impact: 'Creates conditional rules for different amount ranges.',
      disabled: true,
    },
    {
      value: 'split_by_description',
      label: 'Split by description (Coming Soon)',
      description: 'Categorize based on description keywords',
      impact: 'Creates conditional rules based on transaction description patterns.',
      disabled: true,
    },
  ];

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">How would you like to resolve this?</Label>
      <RadioGroup
        value={selectedResolution}
        onValueChange={(value: string) => onResolutionChange(value as ConflictResolutionType)}
        className="space-y-3"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={cn(
              'relative flex items-start space-x-3 rounded-lg border p-4 transition-colors',
              selectedResolution === option.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
              option.disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <RadioGroupItem
              value={option.value}
              id={option.value}
              disabled={option.disabled}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={option.value}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium cursor-pointer',
                  option.disabled && 'cursor-not-allowed',
                )}
              >
                {option.label}
                {option.recommended && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </Label>
              <p className="text-sm text-muted-foreground">{option.description}</p>
              <div className="flex items-start gap-2 mt-2 pt-2 border-t">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">{option.impact}</p>
              </div>
            </div>
            {selectedResolution === option.value && !option.disabled && (
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            )}
            {selectedResolution !== option.value && !option.disabled && (
              <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0" />
            )}
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
