// Billing types

export interface IParent {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  preferredContact: CommunicationMethod;
  whatsappOptIn?: boolean;
  smsOptIn?: boolean;
  children: IChild[];
}

export interface IChild {
  id: string;
  parentId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  enrollmentDate: Date;
  exitDate?: Date;
  status: EnrollmentStatus;
  feeStructureId: string;
  notes?: string;
}

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}

// TASK-WA-015: Child lifecycle status (independent of enrollment)
export enum ChildStatus {
  REGISTERED = 'REGISTERED',
  ENROLLED = 'ENROLLED',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}

export enum CommunicationMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
  BOTH = 'BOTH',
}

export interface IFeeStructure {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  feeType?: FeeType;
  baseAmount?: number; // Legacy: Stored in cents
  amountCents?: number; // Primary: Monthly fee in cents
  registrationFeeCents?: number; // One-time registration fee in cents (for new students)
  reRegistrationFeeCents?: number; // One-time re-registration fee in cents (for returning students)
  vatInclusive?: boolean;
  siblingDiscountPercent?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  includes?: string[];
  extras?: IFeeExtra[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export enum FeeType {
  FULL_DAY = 'FULL_DAY',
  HALF_DAY = 'HALF_DAY',
  HOURLY = 'HOURLY',
  CUSTOM = 'CUSTOM',
}

export interface IFeeExtra {
  name: string;
  amount: number;
  isOptional: boolean;
}

export interface IInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  parentId: string;
  xeroInvoiceId?: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  lines: IInvoiceLine[];
  sentAt?: Date;
  sentVia?: CommunicationMethod;
  paidAt?: Date;
}

export interface IInvoiceLine {
  id: string;
  invoiceId: string;
  childId: string;
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  vatAmount: number;
  accountCode: string;
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}
