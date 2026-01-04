/**
 * UserTenantRole Entity Types
 * TASK-USER-001: Multi-Tenant User Role Assignment
 *
 * @module database/entities/user-tenant-role
 * @description Junction table entity for many-to-many relationship between Users and Tenants with roles
 */

import { UserRole } from '@prisma/client';
export { UserRole };

/**
 * UserTenantRole entity interface
 * Represents a user's membership in a tenant with an assigned role
 *
 * @interface IUserTenantRole
 * @property {string} id - Unique identifier (UUID)
 * @property {string} userId - User ID (foreign key)
 * @property {string} tenantId - Tenant ID (foreign key)
 * @property {UserRole} role - Role assigned to user in this tenant
 * @property {boolean} isActive - Whether this membership is currently active
 * @property {Date} joinedAt - When user joined this tenant
 * @property {Date} createdAt - Record creation timestamp
 * @property {Date} updatedAt - Record last update timestamp
 */
export interface IUserTenantRole {
  id: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant with role information
 * Used when returning user's accessible tenants
 */
export interface TenantWithRole {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  joinedAt: Date;
}
