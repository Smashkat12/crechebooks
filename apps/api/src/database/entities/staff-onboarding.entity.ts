/**
 * Staff Onboarding Entities
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Defines entities for managing staff onboarding process including:
 * - Document uploads and verification
 * - Onboarding workflow status tracking
 * - Checklist items for onboarding tasks
 */

// Document type enums matching Prisma schema
export enum DocumentType {
  ID_DOCUMENT = 'ID_DOCUMENT',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  TAX_CERTIFICATE = 'TAX_CERTIFICATE',
  QUALIFICATIONS = 'QUALIFICATIONS',
  POLICE_CLEARANCE = 'POLICE_CLEARANCE',
  MEDICAL_CERTIFICATE = 'MEDICAL_CERTIFICATE',
  FIRST_AID_CERTIFICATE = 'FIRST_AID_CERTIFICATE',
  EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT',
  BANK_CONFIRMATION = 'BANK_CONFIRMATION',
  POPIA_CONSENT = 'POPIA_CONSENT',
  // Physically signed versions of auto-generated documents
  SIGNED_CONTRACT = 'SIGNED_CONTRACT',
  SIGNED_POPIA = 'SIGNED_POPIA',
  OTHER = 'OTHER',
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  VERIFICATION_PENDING = 'VERIFICATION_PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ChecklistItemStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  BLOCKED = 'BLOCKED',
}

/**
 * Staff Document Interface
 * Represents uploaded documents for staff verification
 */
export interface IStaffDocument {
  id: string;
  tenantId: string;
  staffId: string;
  documentType: DocumentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  uploadedAt: Date;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  expiryDate: Date | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Staff Onboarding Interface
 * Represents the onboarding workflow for a staff member
 */
export interface IStaffOnboarding {
  id: string;
  tenantId: string;
  staffId: string;
  status: OnboardingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  welcomePackSentAt: Date | null;
  welcomePackGeneratedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Onboarding Checklist Item Interface
 * Represents individual tasks in the onboarding checklist
 */
export interface IOnboardingChecklistItem {
  id: string;
  onboardingId: string;
  itemKey: string;
  title: string;
  description: string | null;
  category: string;
  status: ChecklistItemStatus;
  isRequired: boolean;
  sortOrder: number;
  completedAt: Date | null;
  completedBy: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default checklist items for new staff onboarding
 * DSD (Department of Social Development) Compliance Requirements
 * for childcare workers in South African ECD facilities
 */
export const DEFAULT_ONBOARDING_CHECKLIST: Omit<
  IOnboardingChecklistItem,
  | 'id'
  | 'onboardingId'
  | 'status'
  | 'completedAt'
  | 'completedBy'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
>[] = [
  // ===========================================
  // DSD REQUIRED DOCUMENTS (Children's Act Compliance)
  // ===========================================
  {
    itemKey: 'POLICE_CLEARANCE',
    title: 'Police Clearance Certificate',
    description:
      "Valid police clearance certificate (not older than 6 months). Required under the Children's Act for all persons working with children.",
    category: 'dsd_compliance',
    isRequired: true,
    sortOrder: 1,
  },
  {
    itemKey: 'MEDICAL_CERTIFICATE',
    title: 'Medical Certificate',
    description:
      'Medical fitness certificate from a registered medical practitioner confirming ability to work with children.',
    category: 'dsd_compliance',
    isRequired: true,
    sortOrder: 2,
  },
  {
    itemKey: 'FIRST_AID',
    title: 'First Aid Certificate',
    description:
      'Valid First Aid Level 1 certificate or higher. Must be renewed every 3 years.',
    category: 'dsd_compliance',
    isRequired: true,
    sortOrder: 3,
  },
  {
    itemKey: 'ID_DOCUMENT',
    title: 'ID Document/Passport',
    description:
      'Certified copy of South African ID or valid passport for foreign nationals.',
    category: 'dsd_compliance',
    isRequired: true,
    sortOrder: 4,
  },
  {
    itemKey: 'QUALIFICATIONS',
    title: 'ECD Qualifications',
    description:
      'Certified copies of ECD qualifications (NQF Level 4 or higher for practitioners, or proof of enrollment in ECD training).',
    category: 'dsd_compliance',
    isRequired: true,
    sortOrder: 5,
  },

  // ===========================================
  // EMPLOYMENT DOCUMENTS
  // ===========================================
  {
    itemKey: 'BANK_DETAILS',
    title: 'Bank Account Details',
    description:
      'Bank confirmation letter or cancelled cheque for salary payments.',
    category: 'employment',
    isRequired: true,
    sortOrder: 6,
  },
  {
    itemKey: 'TAX_NUMBER',
    title: 'SARS Tax Number',
    description:
      'SARS tax reference number. If not registered, assist with registration.',
    category: 'employment',
    isRequired: true,
    sortOrder: 7,
  },
  {
    itemKey: 'CONTRACT_SIGNED',
    title: 'Employment Contract',
    description:
      'Review and sign the employment contract in accordance with BCEA.',
    category: 'employment',
    isRequired: true,
    sortOrder: 8,
  },

  // ===========================================
  // POPIA COMPLIANCE
  // ===========================================
  {
    itemKey: 'POPIA_CONSENT',
    title: 'POPIA Data Consent Form',
    description:
      'Complete and sign the POPIA consent form for processing personal information.',
    category: 'popia',
    isRequired: true,
    sortOrder: 9,
  },

  // ===========================================
  // OPTIONAL BUT RECOMMENDED
  // ===========================================
  {
    itemKey: 'PROOF_OF_ADDRESS',
    title: 'Proof of Address',
    description:
      'Recent utility bill or bank statement (not older than 3 months).',
    category: 'documentation',
    isRequired: false,
    sortOrder: 10,
  },
  {
    itemKey: 'PREVIOUS_EMPLOYMENT',
    title: 'Previous Employment Reference',
    description: 'Reference letter or contact details from previous employer.',
    category: 'documentation',
    isRequired: false,
    sortOrder: 11,
  },

  // ===========================================
  // TRAINING & ORIENTATION
  // ===========================================
  {
    itemKey: 'ORIENTATION',
    title: 'Complete Orientation',
    description:
      'Attend staff orientation session covering policies, procedures, and emergency protocols.',
    category: 'training',
    isRequired: true,
    sortOrder: 12,
  },
  {
    itemKey: 'CHILD_SAFETY',
    title: 'Child Safety Training',
    description:
      'Complete child safety and protection training including abuse identification and reporting.',
    category: 'training',
    isRequired: true,
    sortOrder: 13,
  },
  {
    itemKey: 'CODE_OF_CONDUCT',
    title: 'Acknowledge Code of Conduct',
    description:
      'Read and acknowledge the staff code of conduct and disciplinary procedures.',
    category: 'compliance',
    isRequired: true,
    sortOrder: 14,
  },
];

/**
 * Document types mapped to checklist item keys
 * Used to automatically link uploaded documents to checklist items
 */
export const DOCUMENT_TO_CHECKLIST_MAP: Record<DocumentType, string> = {
  [DocumentType.ID_DOCUMENT]: 'ID_DOCUMENT',
  [DocumentType.PROOF_OF_ADDRESS]: 'PROOF_OF_ADDRESS',
  [DocumentType.TAX_CERTIFICATE]: 'TAX_NUMBER',
  [DocumentType.QUALIFICATIONS]: 'QUALIFICATIONS',
  [DocumentType.POLICE_CLEARANCE]: 'POLICE_CLEARANCE',
  [DocumentType.MEDICAL_CERTIFICATE]: 'MEDICAL_CERTIFICATE',
  [DocumentType.FIRST_AID_CERTIFICATE]: 'FIRST_AID',
  [DocumentType.EMPLOYMENT_CONTRACT]: 'CONTRACT_SIGNED',
  [DocumentType.BANK_CONFIRMATION]: 'BANK_DETAILS',
  [DocumentType.POPIA_CONSENT]: 'POPIA_CONSENT',
  [DocumentType.SIGNED_CONTRACT]: 'CONTRACT_SIGNED',
  [DocumentType.SIGNED_POPIA]: 'POPIA_CONSENT',
  [DocumentType.OTHER]: '',
};

/**
 * DSD Checklist item keys for easy reference
 */
export const DSD_CHECKLIST_KEYS = {
  POLICE_CLEARANCE: 'POLICE_CLEARANCE',
  MEDICAL_CERTIFICATE: 'MEDICAL_CERTIFICATE',
  FIRST_AID: 'FIRST_AID',
  ID_DOCUMENT: 'ID_DOCUMENT',
  QUALIFICATIONS: 'QUALIFICATIONS',
  BANK_DETAILS: 'BANK_DETAILS',
  TAX_NUMBER: 'TAX_NUMBER',
  CONTRACT_SIGNED: 'CONTRACT_SIGNED',
  POPIA_CONSENT: 'POPIA_CONSENT',
} as const;
