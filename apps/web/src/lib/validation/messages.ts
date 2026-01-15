/**
 * Centralized Validation Error Messages
 * TASK UI-005: Fix Form Validation Messages
 *
 * Provides consistent, user-friendly error messages across all forms.
 * Supports South African specific validations and accessibility requirements.
 */

// ============================================================================
// Generic Field Messages
// ============================================================================

export const FIELD_MESSAGES = {
  required: (fieldName: string) => `${fieldName} is required`,
  minLength: (fieldName: string, min: number) =>
    `${fieldName} must be at least ${min} characters`,
  maxLength: (fieldName: string, max: number) =>
    `${fieldName} must be no more than ${max} characters`,
  exactLength: (fieldName: string, length: number) =>
    `${fieldName} must be exactly ${length} characters`,
  invalidFormat: (fieldName: string) => `Please enter a valid ${fieldName.toLowerCase()}`,
  numbersOnly: (fieldName: string) => `${fieldName} must contain only numbers`,
  lettersOnly: (fieldName: string) => `${fieldName} must contain only letters`,
  alphanumeric: (fieldName: string) => `${fieldName} must contain only letters and numbers`,
  positiveNumber: (fieldName: string) => `${fieldName} must be a positive number`,
  invalidSelection: 'Please select a valid option',
  alreadyExists: (fieldName: string) => `This ${fieldName.toLowerCase()} is already in use`,
} as const;

// ============================================================================
// Email Messages
// ============================================================================

export const EMAIL_MESSAGES = {
  required: 'Email address is required',
  invalid: 'Please enter a valid email address (e.g., name@example.com)',
  format: 'Email must be in the format: name@domain.com',
  alreadyExists: 'This email address is already registered',
  notFound: 'No account found with this email address',
} as const;

// ============================================================================
// Password Messages
// ============================================================================

export const PASSWORD_MESSAGES = {
  required: 'Password is required',
  minLength: 'Password must be at least 8 characters',
  maxLength: 'Password must be no more than 128 characters',
  uppercase: 'Password must contain at least one uppercase letter',
  lowercase: 'Password must contain at least one lowercase letter',
  number: 'Password must contain at least one number',
  special: 'Password must contain at least one special character (!@#$%^&*)',
  weak: 'Password is too weak. Use a mix of letters, numbers, and symbols',
  mismatch: 'Passwords do not match',
  current: 'Current password is incorrect',
  same: 'New password must be different from current password',
} as const;

// ============================================================================
// South African ID Number Messages
// ============================================================================

export const SA_ID_NUMBER_MESSAGES = {
  required: 'South African ID number is required',
  length: 'SA ID number must be exactly 13 digits',
  format: 'SA ID number must contain only digits (0-9)',
  invalid: 'Please enter a valid South African ID number',
  dateInvalid: 'The date of birth in this ID number is invalid',
  checksumFailed: 'This ID number failed validation. Please check and try again',
  help: 'Enter your 13-digit South African ID number (e.g., 8501015800088)',
} as const;

// ============================================================================
// South African Phone Number Messages
// ============================================================================

export const SA_PHONE_MESSAGES = {
  required: 'Phone number is required',
  format: 'Please enter a valid South African phone number',
  invalid: 'Invalid phone number. Use format: 082 123 4567 or +27 82 123 4567',
  mobile: 'Please enter a valid South African mobile number (starting with 06, 07, or 08)',
  landline: 'Please enter a valid South African landline number',
  help: 'Enter your phone number starting with 0 or +27 (e.g., 0821234567)',
} as const;

// ============================================================================
// South African Tax Number Messages
// ============================================================================

export const SA_TAX_NUMBER_MESSAGES = {
  required: 'Tax reference number is required',
  length: 'Tax reference number must be exactly 10 digits',
  format: 'Tax reference number must contain only digits',
  invalid: 'Please enter a valid SARS tax reference number',
  help: 'Enter your 10-digit SARS tax reference number',
} as const;

// ============================================================================
// Bank Account Messages
// ============================================================================

export const BANK_ACCOUNT_MESSAGES = {
  accountNumber: {
    required: 'Bank account number is required',
    minLength: 'Account number must be at least 6 digits',
    maxLength: 'Account number must be no more than 20 digits',
    format: 'Account number must contain only digits',
  },
  branchCode: {
    required: 'Branch code is required',
    length: 'Branch code must be exactly 6 digits',
    format: 'Branch code must contain only digits',
    invalid: 'Please enter a valid South African branch code',
  },
  accountType: {
    required: 'Please select an account type',
  },
  help: {
    accountNumber: 'Enter your bank account number (6-20 digits)',
    branchCode: 'Enter your 6-digit branch code (e.g., 250655 for FNB)',
  },
} as const;

// ============================================================================
// Currency Messages
// ============================================================================

export const CURRENCY_MESSAGES = {
  required: 'Amount is required',
  invalid: 'Please enter a valid amount',
  format: 'Amount must be a number with up to 2 decimal places',
  positive: 'Amount must be a positive number',
  max: (max: number) => `Amount cannot exceed R${max.toLocaleString()}`,
  min: (min: number) => `Amount must be at least R${min.toLocaleString()}`,
  help: 'Enter the amount in Rands (e.g., 1500.00)',
} as const;

// ============================================================================
// Date Messages
// ============================================================================

export const DATE_MESSAGES = {
  required: 'Date is required',
  invalid: 'Please enter a valid date',
  future: 'Date cannot be in the future',
  past: 'Date cannot be in the past',
  range: 'End date must be after start date',
  minAge: (age: number) => `You must be at least ${age} years old`,
  maxAge: (age: number) => `Age cannot exceed ${age} years`,
  dobFuture: 'Date of birth cannot be in the future',
  startDateRequired: 'Start date is required',
  endDateRequired: 'End date is required',
} as const;

// ============================================================================
// Name Messages
// ============================================================================

export const NAME_MESSAGES = {
  firstName: {
    required: 'First name is required',
    minLength: 'First name must be at least 2 characters',
    maxLength: 'First name must be no more than 50 characters',
    format: 'First name can only contain letters, hyphens, and apostrophes',
  },
  lastName: {
    required: 'Last name is required',
    minLength: 'Last name must be at least 2 characters',
    maxLength: 'Last name must be no more than 50 characters',
    format: 'Last name can only contain letters, hyphens, and apostrophes',
  },
  fullName: {
    required: 'Full name is required',
    minLength: 'Full name must be at least 3 characters',
    maxLength: 'Full name must be no more than 100 characters',
  },
} as const;

// ============================================================================
// Address Messages
// ============================================================================

export const ADDRESS_MESSAGES = {
  streetAddress: {
    required: 'Street address is required',
    maxLength: 'Street address must be no more than 255 characters',
  },
  city: {
    required: 'City is required',
    maxLength: 'City must be no more than 100 characters',
  },
  province: {
    required: 'Province is required',
    invalid: 'Please select a valid South African province',
  },
  postalCode: {
    required: 'Postal code is required',
    format: 'Postal code must be 4 digits',
  },
  country: {
    required: 'Country is required',
  },
} as const;

// ============================================================================
// Child/Enrollment Messages
// ============================================================================

export const CHILD_MESSAGES = {
  name: {
    required: 'Child\'s name is required',
    minLength: 'Name must be at least 2 characters',
  },
  dateOfBirth: {
    required: 'Child\'s date of birth is required',
    future: 'Date of birth cannot be in the future',
    tooOld: 'Child appears to be too old for this program',
  },
  enrollmentDate: {
    required: 'Enrollment date is required',
    past: 'Enrollment date cannot be before child\'s date of birth',
  },
  grade: {
    required: 'Please select a grade/class',
  },
  parent: {
    required: 'Parent/Guardian is required',
  },
  medicalInfo: {
    allergies: 'Please list any known allergies',
    conditions: 'Please list any medical conditions',
  },
} as const;

// ============================================================================
// Staff/Employee Messages
// ============================================================================

export const STAFF_MESSAGES = {
  employeeNumber: {
    required: 'Employee number is required',
    format: 'Employee number must be alphanumeric',
    maxLength: 'Employee number must be no more than 20 characters',
    exists: 'This employee number is already in use',
  },
  position: {
    required: 'Position/Role is required',
  },
  salary: {
    required: 'Salary is required',
    positive: 'Salary must be a positive amount',
    min: 'Salary cannot be below minimum wage',
  },
  startDate: {
    required: 'Start date is required',
    future: 'Start date cannot be too far in the future',
  },
  endDate: {
    beforeStart: 'End date cannot be before start date',
  },
} as const;

// ============================================================================
// Invoice Messages
// ============================================================================

export const INVOICE_MESSAGES = {
  number: {
    required: 'Invoice number is required',
    format: 'Invoice number format is invalid',
    exists: 'This invoice number already exists',
  },
  date: {
    required: 'Invoice date is required',
  },
  dueDate: {
    required: 'Due date is required',
    beforeIssue: 'Due date cannot be before invoice date',
  },
  lineItems: {
    required: 'At least one line item is required',
    description: 'Item description is required',
    quantity: 'Quantity must be at least 1',
    amount: 'Amount must be greater than 0',
  },
  total: {
    mismatch: 'Invoice total does not match line items',
  },
} as const;

// ============================================================================
// Payment Messages
// ============================================================================

export const PAYMENT_MESSAGES = {
  amount: {
    required: 'Payment amount is required',
    positive: 'Payment amount must be greater than 0',
    exceeds: 'Payment amount exceeds the outstanding balance',
  },
  date: {
    required: 'Payment date is required',
    future: 'Payment date cannot be in the future',
  },
  method: {
    required: 'Please select a payment method',
  },
  reference: {
    required: 'Payment reference is required',
    format: 'Payment reference format is invalid',
  },
} as const;

// ============================================================================
// Form-Level Messages
// ============================================================================

export const FORM_MESSAGES = {
  submitError: 'An error occurred while submitting the form. Please try again.',
  validationError: 'Please correct the errors below before submitting.',
  networkError: 'Unable to connect to the server. Please check your internet connection.',
  sessionExpired: 'Your session has expired. Please log in again.',
  unauthorized: 'You do not have permission to perform this action.',
  notFound: 'The requested resource was not found.',
  serverError: 'A server error occurred. Please try again later.',
  unsavedChanges: 'You have unsaved changes. Are you sure you want to leave?',
  confirmDelete: 'Are you sure you want to delete this? This action cannot be undone.',
  successSave: 'Changes saved successfully.',
  successCreate: 'Created successfully.',
  successUpdate: 'Updated successfully.',
  successDelete: 'Deleted successfully.',
} as const;

// ============================================================================
// Combined Validation Messages Export
// ============================================================================

export const VALIDATION_MESSAGES = {
  field: FIELD_MESSAGES,
  email: EMAIL_MESSAGES,
  password: PASSWORD_MESSAGES,
  saIdNumber: SA_ID_NUMBER_MESSAGES,
  phone: SA_PHONE_MESSAGES,
  taxNumber: SA_TAX_NUMBER_MESSAGES,
  bankAccount: BANK_ACCOUNT_MESSAGES,
  currency: CURRENCY_MESSAGES,
  date: DATE_MESSAGES,
  name: NAME_MESSAGES,
  address: ADDRESS_MESSAGES,
  child: CHILD_MESSAGES,
  staff: STAFF_MESSAGES,
  invoice: INVOICE_MESSAGES,
  payment: PAYMENT_MESSAGES,
  form: FORM_MESSAGES,
} as const;

export type ValidationMessages = typeof VALIDATION_MESSAGES;
