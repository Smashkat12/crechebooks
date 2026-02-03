'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Collapsible Section
 * Reusable collapsible section for Operating, Investing, and Financing activities
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * Format amount in ZAR (South African Rand)
 * Values are in cents, convert to Rand for display
 */
function formatZAR(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rands);
}

interface LineItemProps {
  label: string;
  current: number;
  comparative?: number;
  indent?: boolean;
  bold?: boolean;
  showComparative?: boolean;
}

export function LineItem({
  label,
  current,
  comparative,
  indent = false,
  bold = false,
  showComparative = false,
}: LineItemProps) {
  const textClass = bold ? 'font-semibold' : 'text-sm';
  const paddingClass = indent ? 'pl-6' : '';

  return (
    <div className={`flex items-center py-2 border-b border-muted last:border-b-0 ${paddingClass}`}>
      <span className={`flex-1 ${textClass}`}>{label}</span>
      <span
        className={`w-32 text-right font-mono tabular-nums ${textClass} ${
          current < 0 ? 'text-red-600 dark:text-red-400' : ''
        }`}
      >
        {formatZAR(current)}
      </span>
      {showComparative && comparative !== undefined && (
        <span
          className={`w-32 text-right font-mono tabular-nums ${textClass} text-muted-foreground ${
            comparative < 0 ? 'text-red-400' : ''
          }`}
        >
          {formatZAR(comparative)}
        </span>
      )}
    </div>
  );
}

interface CashFlowSectionProps {
  title: string;
  netAmount: number;
  comparativeNetAmount?: number;
  showComparative?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CashFlowSection({
  title,
  netAmount,
  comparativeNetAmount,
  showComparative = false,
  defaultOpen = true,
  children,
}: CashFlowSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full" asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full py-3 px-4 bg-muted/50 hover:bg-muted cursor-pointer rounded-t-md"
        >
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-semibold">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`font-mono font-semibold tabular-nums ${
                netAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              }`}
            >
              {formatZAR(netAmount)}
            </span>
            {showComparative && comparativeNetAmount !== undefined && (
              <span
                className={`w-32 text-right font-mono tabular-nums text-muted-foreground ${
                  comparativeNetAmount < 0 ? 'text-red-400' : ''
                }`}
              >
                {formatZAR(comparativeNetAmount)}
              </span>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 border border-t-0 border-muted rounded-b-md">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
