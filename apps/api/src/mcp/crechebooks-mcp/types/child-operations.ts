/**
 * Child Operations MCP Type Definitions
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Input/output types for child and enrollment operations.
 */

// ============================================
// List Children Types
// ============================================

/** Input for list_children tool */
export interface ListChildrenInput {
  tenantId: string;
  parentId?: string;
  enrolled?: boolean;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/** Output for list_children tool */
export interface ListChildrenOutput {
  children: ChildSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** Child summary record */
export interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string | null;
  isActive: boolean;
  parentId: string;
  parentName: string;
  enrollmentStatus: string | null;
  enrollmentId: string | null;
  feeStructureName: string | null;
  monthlyFeeCents: number | null;
}

// ============================================
// Create Child Types
// ============================================

/** Input for create_child tool */
export interface CreateChildInput {
  tenantId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  medicalNotes?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  userId?: string;
}

/** Output for create_child tool */
export interface CreateChildOutput {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string | null;
  parentId: string;
  parentName: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================
// Create Enrollment Types
// ============================================

/** Input for create_enrollment tool */
export interface CreateEnrollmentInput {
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate: string;
  endDate?: string;
  siblingDiscountApplied?: boolean;
  customFeeOverrideCents?: number;
  notes?: string;
  userId?: string;
}

/** Output for create_enrollment tool */
export interface CreateEnrollmentOutput {
  id: string;
  childId: string;
  childName: string;
  feeStructureId: string;
  feeStructureName: string;
  feeCents: number;
  effectiveFeeCents: number;
  startDate: string;
  endDate: string | null;
  status: string;
  siblingDiscountApplied: boolean;
  createdAt: string;
}
