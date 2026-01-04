/**
 * User Entity Types
 * TASK-CORE-003: User Entity and Authentication Types
 *
 * @module database/entities/user
 * @description User entity interface matching Prisma schema exactly
 */

// Re-export UserRole from Prisma to ensure type compatibility
import { UserRole } from '@prisma/client';
export { UserRole };

/**
 * User entity interface
 * Represents a user in a tenant with Auth0 authentication
 *
 * TASK-USER-001: Extended to support multi-tenant membership
 *
 * @interface IUser
 * @property {string} id - Unique identifier (UUID)
 * @property {string} tenantId - Primary tenant this user belongs to (backward compatibility)
 * @property {string} auth0Id - Auth0 user identifier (unique)
 * @property {string} email - User email address (unique per tenant)
 * @property {string} name - User display name
 * @property {UserRole} role - User role in primary tenant (backward compatibility)
 * @property {boolean} isActive - Whether user account is active
 * @property {Date | null} lastLoginAt - Last login timestamp
 * @property {string | null} currentTenantId - Currently active tenant in session
 * @property {Date} createdAt - Record creation timestamp
 * @property {Date} updatedAt - Record last update timestamp
 */
export interface IUser {
  id: string;
  tenantId: string;
  auth0Id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  currentTenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
