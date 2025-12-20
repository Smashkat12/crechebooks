/**
 * Child Entity Types
 * TASK-BILL-001: Parent and Child Entities
 */

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export interface IChild {
  id: string;
  tenantId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender | null;
  medicalNotes: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
