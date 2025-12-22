// Billing types

export interface IParent {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  address?: string;
  preferredCommunication: CommunicationMethod;
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
  SUSPENDED = 'SUSPENDED',
  EXITED = 'EXITED',
}

export enum CommunicationMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export interface IFeeStructure {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  baseAmount: number; // Stored in cents
  includes: string[];
  extras: IFeeExtra[];
  isActive: boolean;
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
