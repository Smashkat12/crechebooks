'use client';

/**
 * Variable Picker Component
 * TASK-WEB-045: Payment Reminder Template Editor
 *
 * Displays available template variables that can be inserted.
 */

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { TemplateVariable } from '@/hooks/useTemplates';

export interface VariablePickerProps {
  /** Available template variables */
  variables: TemplateVariable[];
  /** Callback when a variable is selected for insertion */
  onInsert: (variable: string) => void;
}

/**
 * Dropdown picker for inserting template variables
 */
export function VariablePicker({ variables, onInsert }: VariablePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Insert Variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <h4 className="font-medium text-sm">Available Variables</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Click to insert into your template
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {variables.map((variable) => (
            <button
              key={variable.key}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-start gap-3"
              onClick={() => onInsert(`{${variable.key}}`)}
            >
              <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono shrink-0">
                {`{${variable.key}}`}
              </code>
              <div className="min-w-0">
                <div className="text-sm font-medium">{variable.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {variable.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
