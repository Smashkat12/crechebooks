'use client';

/**
 * Enhanced Form Field Component
 * TASK-UI-005: Fix Form Validation Messages
 *
 * Features:
 * - Show field-level validation errors with inline feedback
 * - Use consistent error message styling with accessibility
 * - Support async validation (email uniqueness)
 * - Clear errors on input change
 * - Scroll to first error on submit
 * - Support South African specific validations
 * - Comprehensive aria attributes (aria-invalid, aria-describedby)
 * - Form-level and field-level error support
 */

import * as React from 'react';
import { FieldError } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertCircle, CheckCircle2, Loader2, Info, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============================================================================
// Form Field Context
// ============================================================================

interface FormFieldContextValue {
  error?: FieldError;
  isValidating?: boolean;
  isValid?: boolean;
  isDirty?: boolean;
  isTouched?: boolean;
}

const FormFieldContext = React.createContext<FormFieldContextValue | undefined>(
  undefined
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useFormFieldContext() {
  return React.useContext(FormFieldContext);
}

// ============================================================================
// Form Field Wrapper Component
// ============================================================================

export interface FormFieldWrapperProps {
  /** Field name for identification */
  name: string;
  /** Label text */
  label?: string;
  /** Description/helper text */
  description?: string;
  /** Error message (overrides form error) */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether validation is in progress */
  isValidating?: boolean;
  /** Whether the field is valid */
  isValid?: boolean;
  /** Additional class name for the wrapper */
  className?: string;
  /** Children elements */
  children: React.ReactNode;
}

export function FormFieldWrapper({
  name,
  label,
  description,
  error,
  required = false,
  disabled = false,
  isValidating = false,
  isValid = false,
  className,
  children,
}: FormFieldWrapperProps) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  return (
    <FormFieldContext.Provider value={{ isValidating, isValid }}>
      <div className={cn('space-y-2', className)} data-field={name}>
        {/* Label */}
        {label && (
          <div className="flex items-center justify-between">
            <Label
              htmlFor={fieldId}
              className={cn(
                error && 'text-destructive',
                disabled && 'opacity-50'
              )}
            >
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {/* Validation status indicator */}
            {isValidating && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isValidating && isValid && !error && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
          </div>
        )}

        {/* Field */}
        <div className="relative">
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                  id: fieldId,
                  'aria-invalid': !!error,
                  'aria-describedby': cn(
                    error && errorId,
                    description && descriptionId
                  ),
                  disabled,
                })
              : child
          )}

          {/* Error icon */}
          {error && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
          )}
        </div>

        {/* Description */}
        {description && !error && (
          <p
            id={descriptionId}
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            className="text-sm font-medium text-destructive flex items-center gap-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}

// ============================================================================
// Enhanced Input Field
// ============================================================================

export interface FormInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field name */
  name: string;
  /** Label text */
  label?: string;
  /** Description/helper text */
  description?: string;
  /** Error message */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether validation is in progress */
  isValidating?: boolean;
  /** Whether the field is valid (show success state) */
  isValid?: boolean;
  /** Wrapper class name */
  wrapperClassName?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      name,
      label,
      description,
      error,
      required,
      isValidating,
      isValid,
      disabled,
      className,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    return (
      <FormFieldWrapper
        name={name}
        label={label}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
        isValidating={isValidating}
        isValid={isValid}
        className={wrapperClassName}
      >
        <Input
          ref={ref}
          name={name}
          disabled={disabled}
          className={cn(
            error && 'border-destructive pr-10 focus-visible:ring-destructive',
            isValid && !error && 'border-green-500 focus-visible:ring-green-500',
            className
          )}
          {...props}
        />
      </FormFieldWrapper>
    );
  }
);
FormInput.displayName = 'FormInput';

// ============================================================================
// Enhanced Textarea Field
// ============================================================================

export interface FormTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  name: string;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  isValidating?: boolean;
  isValid?: boolean;
  wrapperClassName?: string;
}

export const FormTextarea = React.forwardRef<
  HTMLTextAreaElement,
  FormTextareaProps
>(
  (
    {
      name,
      label,
      description,
      error,
      required,
      isValidating,
      isValid,
      disabled,
      className,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    return (
      <FormFieldWrapper
        name={name}
        label={label}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
        isValidating={isValidating}
        isValid={isValid}
        className={wrapperClassName}
      >
        <Textarea
          ref={ref}
          name={name}
          disabled={disabled}
          className={cn(
            error && 'border-destructive focus-visible:ring-destructive',
            isValid && !error && 'border-green-500 focus-visible:ring-green-500',
            className
          )}
          {...props}
        />
      </FormFieldWrapper>
    );
  }
);
FormTextarea.displayName = 'FormTextarea';

// ============================================================================
// Enhanced Select Field
// ============================================================================

export interface FormSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FormSelectProps {
  name: string;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  isValidating?: boolean;
  isValid?: boolean;
  placeholder?: string;
  options: FormSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  wrapperClassName?: string;
  className?: string;
}

export function FormSelect({
  name,
  label,
  description,
  error,
  required,
  disabled,
  isValidating,
  isValid,
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  wrapperClassName,
  className,
}: FormSelectProps) {
  return (
    <FormFieldWrapper
      name={name}
      label={label}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      isValidating={isValidating}
      isValid={isValid}
      className={wrapperClassName}
    >
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            error && 'border-destructive focus:ring-destructive',
            isValid && !error && 'border-green-500 focus:ring-green-500',
            className
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormFieldWrapper>
  );
}

// ============================================================================
// Enhanced Checkbox Field
// ============================================================================

export interface FormCheckboxProps {
  name: string;
  label: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  wrapperClassName?: string;
  className?: string;
}

export function FormCheckbox({
  name,
  label,
  description,
  error,
  disabled,
  checked,
  onChange,
  wrapperClassName,
  className,
}: FormCheckboxProps) {
  const fieldId = `field-${name}`;

  return (
    <div className={cn('space-y-2', wrapperClassName)} data-field={name}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={fieldId}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className={cn(
            error && 'border-destructive data-[state=checked]:bg-destructive',
            className
          )}
        />
        <div className="space-y-1 leading-none">
          <Label
            htmlFor={fieldId}
            className={cn(
              'cursor-pointer',
              disabled && 'opacity-50 cursor-not-allowed',
              error && 'text-destructive'
            )}
          >
            {label}
          </Label>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Scroll to First Error Utility
// ============================================================================

/**
 * Scroll to the first field with an error
 * Call this function on form submit when there are validation errors
 */
export function scrollToFirstError(containerSelector?: string): void {
  setTimeout(() => {
    const container = containerSelector
      ? document.querySelector(containerSelector)
      : document;

    if (!container) return;

    // Find the first error message
    const errorElement = container.querySelector(
      '[role="alert"], .text-destructive, [aria-invalid="true"]'
    );

    if (errorElement) {
      // Find the parent field wrapper
      const fieldWrapper = errorElement.closest('[data-field]');
      const targetElement = fieldWrapper || errorElement;

      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // Focus the input within the field if possible
      const input = (fieldWrapper || errorElement.parentElement)?.querySelector(
        'input, textarea, select, [role="combobox"]'
      ) as HTMLElement | null;

      if (input && typeof input.focus === 'function') {
        input.focus();
      }
    }
  }, 100); // Small delay to ensure DOM is updated
}

// ============================================================================
// Async Validation Hook
// ============================================================================

interface AsyncValidationOptions<T> {
  /** The validation function that returns a promise */
  validate: (value: T) => Promise<string | null>;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Minimum length before validation starts */
  minLength?: number;
}

interface AsyncValidationResult {
  isValidating: boolean;
  error: string | null;
  isValid: boolean;
}

/**
 * Hook for async field validation (e.g., email uniqueness check)
 */
export function useAsyncValidation<T>(
  value: T,
  options: AsyncValidationOptions<T>
): AsyncValidationResult {
  const { validate, debounceMs = 300, minLength = 0 } = options;

  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isValid, setIsValid] = React.useState(false);

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastValueRef = React.useRef<T>(value);

  React.useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check minimum length for strings
    if (
      typeof value === 'string' &&
      minLength > 0 &&
      value.length < minLength
    ) {
      setIsValidating(false);
      setError(null);
      setIsValid(false);
      return;
    }

    // Skip if value hasn't changed
    if (value === lastValueRef.current) {
      return;
    }
    lastValueRef.current = value;

    setIsValidating(true);
    setIsValid(false);

    timeoutRef.current = setTimeout(async () => {
      try {
        const validationError = await validate(value);
        setError(validationError);
        setIsValid(!validationError);
      } catch {
        setError('Validation failed');
        setIsValid(false);
      } finally {
        setIsValidating(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, validate, debounceMs, minLength]);

  return { isValidating, error, isValid };
}

// ============================================================================
// Form Error Summary Component
// ============================================================================

export interface FormErrorSummaryProps {
  errors: Record<string, { message?: string }>;
  className?: string;
}

/**
 * Display a summary of all form errors at the top of the form
 */
export function FormErrorSummary({ errors, className }: FormErrorSummaryProps) {
  const errorList = Object.entries(errors).filter(
    ([, error]) => error?.message
  );

  if (errorList.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 p-4',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">
            Please fix the following errors:
          </p>
          <ul className="text-sm text-destructive/90 list-disc pl-4 space-y-1">
            {errorList.map(([field, error]) => (
              <li key={field}>
                <button
                  type="button"
                  className="underline hover:no-underline"
                  onClick={() => {
                    const element = document.querySelector(`[data-field="${field}"]`);
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const input = element?.querySelector('input, textarea, select') as HTMLElement;
                    input?.focus();
                  }}
                >
                  {error.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Form Field with Inline Validation (React Hook Form Integration)
// ============================================================================

export interface InlineValidationFieldProps {
  /** Field name for identification */
  name: string;
  /** Label text */
  label: string;
  /** Error from react-hook-form */
  error?: FieldError;
  /** Whether the field is required */
  required?: boolean;
  /** Description/help text */
  helpText?: string;
  /** Tooltip help text (shown on hover) */
  tooltipText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether validation is in progress */
  isValidating?: boolean;
  /** Whether the field has been validated successfully */
  isValid?: boolean;
  /** Whether to show success state */
  showSuccess?: boolean;
  /** Additional class name */
  className?: string;
  /** Children elements */
  children: React.ReactNode;
}

/**
 * Form field component with inline validation support
 * Designed for direct integration with react-hook-form's field errors
 */
export function InlineValidationField({
  name,
  label,
  error,
  required = false,
  helpText,
  tooltipText,
  disabled = false,
  isValidating = false,
  isValid = false,
  showSuccess = true,
  className,
  children,
}: InlineValidationFieldProps) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;

  const hasError = !!error;
  const showSuccessState = showSuccess && isValid && !hasError && !isValidating;

  return (
    <div className={cn('space-y-1.5', className)} data-field={name}>
      {/* Label row with optional tooltip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor={fieldId}
            className={cn(
              'text-sm font-medium',
              hasError && 'text-destructive',
              disabled && 'opacity-50'
            )}
          >
            {label}
            {required && (
              <span className="text-destructive ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </Label>

          {tooltipText && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Help for ${label}`}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-sm">{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Validation status indicators */}
        <div className="flex items-center gap-1">
          {isValidating && (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-label="Validating..."
            />
          )}
          {showSuccessState && (
            <CheckCircle2
              className="h-4 w-4 text-green-500"
              aria-label="Valid"
            />
          )}
        </div>
      </div>

      {/* Field container */}
      <div className="relative">
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                id: fieldId,
                name,
                'aria-invalid': hasError ? 'true' : 'false',
                'aria-describedby': cn(
                  hasError && errorId,
                  helpText && helpId
                ) || undefined,
                'aria-required': required ? 'true' : undefined,
                disabled,
                className: cn(
                  (child as React.ReactElement<Record<string, unknown>>).props.className as string | undefined,
                  hasError && 'border-destructive focus-visible:ring-destructive pr-10',
                  showSuccessState && 'border-green-500 focus-visible:ring-green-500'
                ),
              })
            : child
        )}

        {/* Error icon inside field */}
        {hasError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <p
          id={errorId}
          className="text-sm font-medium text-destructive flex items-center gap-1.5"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{error.message}</span>
        </p>
      )}

      {/* Help text (hidden when error is shown) */}
      {helpText && !hasError && (
        <p
          id={helpId}
          className="text-sm text-muted-foreground flex items-start gap-1.5"
        >
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{helpText}</span>
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Radio Group Field
// ============================================================================

export interface FormRadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface FormRadioGroupProps {
  name: string;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  options: FormRadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  wrapperClassName?: string;
  className?: string;
}

export function FormRadioGroup({
  name,
  label,
  description,
  error,
  required,
  disabled,
  options,
  value,
  onChange,
  orientation = 'vertical',
  wrapperClassName,
  className,
}: FormRadioGroupProps) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={cn('space-y-3', wrapperClassName)} data-field={name}>
      {label && (
        <div className="space-y-1">
          <Label
            className={cn(
              error && 'text-destructive',
              disabled && 'opacity-50'
            )}
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      <RadioGroup
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        className={cn(
          orientation === 'horizontal' ? 'flex flex-wrap gap-4' : 'space-y-2',
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={cn(
              'flex items-start gap-3',
              option.disabled && 'opacity-50'
            )}
          >
            <RadioGroupItem
              value={option.value}
              id={`${fieldId}-${option.value}`}
              disabled={option.disabled || disabled}
              className={cn(
                error && 'border-destructive'
              )}
            />
            <div className="space-y-1 leading-none">
              <Label
                htmlFor={`${fieldId}-${option.value}`}
                className={cn(
                  'cursor-pointer font-normal',
                  (option.disabled || disabled) && 'cursor-not-allowed'
                )}
              >
                {option.label}
              </Label>
              {option.description && (
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </RadioGroup>

      {error && (
        <p
          id={errorId}
          className="text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Server Error Banner
// ============================================================================

export interface ServerErrorBannerProps {
  error?: string | null;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Display server-side or network errors at the top of a form
 */
export function ServerErrorBanner({
  error,
  onDismiss,
  className,
}: ServerErrorBannerProps) {
  if (!error) return null;

  return (
    <div
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 p-4',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-destructive hover:text-destructive/80 transition-colors"
            aria-label="Dismiss error"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Required Field Indicator
// ============================================================================

export function RequiredFieldsNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      <span className="text-destructive">*</span> indicates required fields
    </p>
  );
}

// ============================================================================
// Form Section Component
// ============================================================================

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Group related form fields into a visual section
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <fieldset className={cn('space-y-4', className)}>
      <legend className="sr-only">{title}</legend>
      <div className="space-y-1">
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

// ============================================================================
// Character Counter
// ============================================================================

export interface CharacterCounterProps {
  current: number;
  max: number;
  className?: string;
}

export function CharacterCounter({
  current,
  max,
  className,
}: CharacterCounterProps) {
  const isOverLimit = current > max;
  const isNearLimit = current >= max * 0.9;

  return (
    <span
      className={cn(
        'text-xs',
        isOverLimit
          ? 'text-destructive font-medium'
          : isNearLimit
            ? 'text-amber-600'
            : 'text-muted-foreground',
        className
      )}
      aria-live="polite"
    >
      {current}/{max}
    </span>
  );
}

// ============================================================================
// Password Strength Indicator
// ============================================================================

export interface PasswordStrengthProps {
  password: string;
  className?: string;
}

function calculatePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 4) return { score, label: 'Medium', color: 'bg-amber-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label, color } = calculatePasswordStrength(password);
  const percentage = (score / 6) * 100;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Password strength</span>
        <span
          className={cn(
            'font-medium',
            score <= 2 && 'text-red-600',
            score > 2 && score <= 4 && 'text-amber-600',
            score > 4 && 'text-green-600'
          )}
        >
          {label}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', color)}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={6}
          aria-label={`Password strength: ${label}`}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Field Group (for horizontal layouts)
// ============================================================================

export interface FieldGroupProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FieldGroup({
  children,
  columns = 2,
  gap = 'md',
  className,
}: FieldGroupProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  };

  return (
    <div
      className={cn('grid', columnClasses[columns], gapClasses[gap], className)}
    >
      {children}
    </div>
  );
}

export default FormFieldWrapper;
