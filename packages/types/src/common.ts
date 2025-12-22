// Common types shared across the application

export interface IPaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface IAuditInfo {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ITenant {
  id: string;
  name: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  status: TenantStatus;
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export interface IUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
  ACCOUNTANT = 'ACCOUNTANT',
}

// South African specific
export const VAT_RATE = 0.15; // 15%
export const CURRENCY = 'ZAR';
export const TIMEZONE = 'Africa/Johannesburg';
