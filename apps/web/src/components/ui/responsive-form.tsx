'use client';

/**
 * Responsive Form Components
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Features:
 * - Form grids that stack vertically on mobile
 * - Touch-friendly input sizes
 * - Responsive spacing
 * - Accessible form layouts
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';

// ============================================================================
// Responsive Form Grid
// ============================================================================

export interface ResponsiveFormGridProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns on desktop (default: 2) */
  columns?: 1 | 2 | 3 | 4;
  /** Gap between items (default: 4) */
  gap?: 2 | 3 | 4 | 5 | 6;
  /** Force single column regardless of screen size */
  forceSingleColumn?: boolean;
}

/**
 * Responsive form grid that:
 * - Shows specified columns on desktop (md+)
 * - Stacks vertically (1 column) on mobile
 */
export function ResponsiveFormGrid({
  columns = 2,
  gap = 4,
  forceSingleColumn = false,
  className,
  children,
  ...props
}: ResponsiveFormGridProps) {
  const columnClasses = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  const gapClasses = {
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    5: 'gap-5',
    6: 'gap-6',
  };

  return (
    <div
      className={cn(
        'grid',
        // Mobile: always single column
        'grid-cols-1',
        // Desktop: specified columns (unless forced single)
        !forceSingleColumn && columnClasses[columns],
        // Gap
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Form Row (spans full width)
// ============================================================================

export interface FormRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Span all columns */
  fullWidth?: boolean;
}

/**
 * Form row that can span full width of the grid
 */
export function FormRow({
  fullWidth = true,
  className,
  children,
  ...props
}: FormRowProps) {
  return (
    <div
      className={cn(fullWidth && 'col-span-full', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Form Section
// ============================================================================

export interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Add border at bottom */
  bordered?: boolean;
}

/**
 * Form section with optional title and description
 */
export function FormSection({
  title,
  description,
  bordered = false,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        bordered && 'pb-6 border-b',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-base sm:text-lg font-medium">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// Responsive Form Actions
// ============================================================================

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Alignment on desktop (default: right) */
  align?: 'left' | 'center' | 'right' | 'between';
  /** Stack buttons vertically on mobile */
  stackOnMobile?: boolean;
  /** Sticky at bottom on mobile */
  sticky?: boolean;
}

/**
 * Form actions container with responsive layout
 * - Stacks buttons on mobile
 * - Horizontal layout on desktop
 * - Optional sticky positioning on mobile
 */
export function FormActions({
  align = 'right',
  stackOnMobile = true,
  sticky = false,
  className,
  children,
  ...props
}: FormActionsProps) {
  const isMobile = useMobile();

  const alignClasses = {
    left: 'sm:justify-start',
    center: 'sm:justify-center',
    right: 'sm:justify-end',
    between: 'sm:justify-between',
  };

  return (
    <div
      className={cn(
        'flex gap-3',
        // Mobile: vertical stack or horizontal based on prop
        stackOnMobile ? 'flex-col-reverse' : 'flex-row',
        // Desktop: always horizontal with alignment
        'sm:flex-row',
        alignClasses[align],
        // Sticky on mobile
        sticky && isMobile && 'sticky bottom-0 bg-background py-4 -mx-4 px-4 border-t',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Touch-Friendly Input Wrapper
// ============================================================================

export interface TouchInputWrapperProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Increase padding for touch */
  enhanced?: boolean;
}

/**
 * Wrapper to add touch-friendly styling to inputs
 */
export function TouchInputWrapper({
  enhanced = true,
  className,
  children,
  ...props
}: TouchInputWrapperProps) {
  return (
    <div
      className={cn(
        enhanced && [
          // Ensure inputs meet touch target size
          '[&_input]:min-h-[44px]',
          '[&_textarea]:min-h-[88px]',
          '[&_select]:min-h-[44px]',
          '[&_button]:min-h-[44px]',
          // Better padding on mobile
          '[&_input]:px-3',
          '[&_input]:py-2',
          // Larger text on mobile for readability
          '[&_input]:text-base',
          '[&_input]:sm:text-sm',
        ],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Responsive Fieldset
// ============================================================================

export interface ResponsiveFieldsetProps
  extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** Legend text */
  legend?: string;
  /** Description text */
  description?: string;
}

/**
 * Accessible fieldset with responsive styling
 */
export function ResponsiveFieldset({
  legend,
  description,
  className,
  children,
  ...props
}: ResponsiveFieldsetProps) {
  return (
    <fieldset
      className={cn(
        'border rounded-lg p-4 sm:p-6',
        'space-y-4',
        className
      )}
      {...props}
    >
      {legend && (
        <legend className="px-2 text-sm font-medium -ml-2">{legend}</legend>
      )}
      {description && (
        <p className="text-sm text-muted-foreground -mt-2">{description}</p>
      )}
      {children}
    </fieldset>
  );
}

// ============================================================================
// Inline Form Group (Label + Input side by side on desktop)
// ============================================================================

export interface InlineFormGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Label text */
  label: string;
  /** Label width on desktop */
  labelWidth?: 'sm' | 'md' | 'lg';
  /** Required indicator */
  required?: boolean;
  /** Help text */
  helpText?: string;
}

/**
 * Inline form group with label beside input on desktop
 * Stacks on mobile
 */
export function InlineFormGroup({
  label,
  labelWidth = 'md',
  required = false,
  helpText,
  className,
  children,
  ...props
}: InlineFormGroupProps) {
  const labelWidthClasses = {
    sm: 'sm:w-24',
    md: 'sm:w-32',
    lg: 'sm:w-48',
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        'sm:flex-row sm:items-start sm:gap-4',
        className
      )}
      {...props}
    >
      <label
        className={cn(
          'text-sm font-medium shrink-0',
          labelWidthClasses[labelWidth],
          'sm:pt-2.5' // Align with input on desktop
        )}
      >
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="flex-1 space-y-1">
        {children}
        {helpText && (
          <p className="text-sm text-muted-foreground">{helpText}</p>
        )}
      </div>
    </div>
  );
}

export default ResponsiveFormGrid;
