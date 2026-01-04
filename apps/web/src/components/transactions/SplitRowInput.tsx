/**
 * Split Row Input Component
 *
 * Individual row for entering split transaction details with:
 * - Category selection
 * - Amount input (formatted as ZAR currency)
 * - Optional description
 * - Remove button
 */

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { CategorySelect } from './category-select';
import type { SplitRow } from './SplitTransactionModal';

interface SplitRowInputProps {
  split: SplitRow;
  index: number;
  onUpdate: (updates: Partial<SplitRow>) => void;
  onRemove: () => void;
  disabled?: boolean;
  canRemove: boolean;
}

export function SplitRowInput({
  split,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  canRemove,
}: SplitRowInputProps) {
  const [amountInput, setAmountInput] = React.useState(split.amount);

  // Sync amount input with split prop changes
  React.useEffect(() => {
    setAmountInput(split.amount);
  }, [split.amount]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Allow only numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = sanitized.split('.');
    const formatted = parts.length > 2
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : sanitized;

    setAmountInput(formatted);
  };

  const handleAmountBlur = () => {
    // Validate and format on blur
    const numValue = parseFloat(amountInput);
    if (isNaN(numValue) || numValue < 0) {
      setAmountInput('0.00');
      onUpdate({ amount: '0.00' });
    } else {
      const formatted = numValue.toFixed(2);
      setAmountInput(formatted);
      onUpdate({ amount: formatted });
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    // Extract category name from CategorySelect component
    // This should match the account code to name mapping
    const ACCOUNT_CODE_TO_NAME: Record<string, string> = {
      '4000': 'Fee Income',
      '4100': 'Enrollment Fees',
      '4200': 'Activity Fees',
      '4900': 'Other Income',
      '5000': 'Salaries and Wages',
      '5100': 'Staff Benefits',
      '5200': 'Facility Costs',
      '5300': 'Learning Materials',
      '5400': 'Food and Nutrition',
      '5500': 'Utilities',
      '5600': 'Administrative',
      '5700': 'Professional Services',
      '5800': 'Taxes and Licenses',
      '5900': 'Other Expenses',
    };

    const categoryName = ACCOUNT_CODE_TO_NAME[categoryId] || 'Unknown';
    onUpdate({ categoryId, categoryName });
  };

  return (
    <div className="grid grid-cols-12 gap-3 items-start p-4 border rounded-lg bg-card">
      <div className="col-span-12 sm:col-span-1 flex items-center">
        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
      </div>

      <div className="col-span-12 sm:col-span-5 space-y-1">
        <Label htmlFor={`category-${split.id}`} className="text-xs">
          Category *
        </Label>
        <CategorySelect
          value={split.categoryId}
          onValueChange={handleCategoryChange}
          disabled={disabled}
          placeholder="Select category..."
        />
      </div>

      <div className="col-span-12 sm:col-span-3 space-y-1">
        <Label htmlFor={`amount-${split.id}`} className="text-xs">
          Amount (ZAR) *
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            R
          </span>
          <Input
            id={`amount-${split.id}`}
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            placeholder="0.00"
            disabled={disabled}
            className="pl-7"
            required
          />
        </div>
      </div>

      <div className="col-span-12 sm:col-span-2 space-y-1">
        <Label htmlFor={`description-${split.id}`} className="text-xs">
          Note
        </Label>
        <Input
          id={`description-${split.id}`}
          type="text"
          value={split.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Optional"
          disabled={disabled}
        />
      </div>

      <div className="col-span-12 sm:col-span-1 flex items-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          title={canRemove ? 'Remove split' : 'Minimum 2 splits required'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
