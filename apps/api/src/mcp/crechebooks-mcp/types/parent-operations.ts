/**
 * Parent Operations MCP Type Definitions
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Input/output types for parent operations.
 */

// ============================================
// List Parents Types
// ============================================

/** Input for list_parents tool */
export interface ListParentsInput {
  tenantId: string;
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/** Output for list_parents tool */
export interface ListParentsOutput {
  parents: ParentSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** Parent summary record */
export interface ParentSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: string;
  isActive: boolean;
  childrenCount: number;
  createdAt: string;
}

// ============================================
// Create Parent Types
// ============================================

/** Input for create_parent tool */
export interface CreateParentInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  idNumber?: string;
  address?: string;
  notes?: string;
  userId?: string;
}

/** Output for create_parent tool */
export interface CreateParentOutput {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContact: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================
// Send Parent Invite Types
// ============================================

/** Input for send_parent_invite tool */
export interface SendParentInviteInput {
  tenantId: string;
  parentId: string;
  resend?: boolean;
  userId?: string;
}

/** Output for send_parent_invite tool */
export interface SendParentInviteOutput {
  parentId: string;
  email: string;
  sent: boolean;
  inviteLink?: string;
  alreadySent?: boolean;
  error?: string;
}
