/**
 * Parent Entity Types
 * TASK-BILL-001: Parent and Child Entities
 */

export enum PreferredContact {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export interface IParent {
  id: string;
  tenantId: string;
  xeroContactId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: PreferredContact;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
