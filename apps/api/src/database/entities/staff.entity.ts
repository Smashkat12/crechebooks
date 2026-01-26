/**
 * Staff Entity
 * Represents an employee at the creche for payroll and SARS compliance.
 * Stores employee information, banking details, and tax numbers required
 * for EMP201 and IRP5 SARS submission generation.
 */

export enum EmploymentType {
  PERMANENT = 'PERMANENT',
  CONTRACT = 'CONTRACT',
  PART_TIME = 'PART_TIME',
  CASUAL = 'CASUAL',
}

export enum PayFrequency {
  MONTHLY = 'MONTHLY',
  FORTNIGHTLY = 'FORTNIGHTLY',
  WEEKLY = 'WEEKLY',
  DAILY = 'DAILY',
  HOURLY = 'HOURLY',
}

export interface IStaff {
  id: string;
  tenantId: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  idNumber: string;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date;
  startDate: Date;
  endDate: Date | null;
  employmentType: EmploymentType;
  payFrequency: PayFrequency;
  basicSalaryCents: number;
  bankName: string | null;
  bankAccount: string | null;
  bankBranchCode: string | null;
  medicalAidMembers: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
