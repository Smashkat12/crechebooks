/**
 * PaymentAttachmentResponseDto — shape returned by list/detail endpoints.
 *
 * s3Key is intentionally excluded from public responses — callers get a
 * presigned download URL on demand instead.
 */

import { PaymentAttachmentKind, PaymentAttachmentStatus } from '@prisma/client';

export interface PaymentAttachmentResponseDto {
  id: string;
  tenantId: string;
  paymentId: string | null;
  parentId: string | null;
  kind: PaymentAttachmentKind;
  filename: string;
  contentType: string;
  fileSize: number;
  note: string | null;
  reviewStatus: PaymentAttachmentStatus;
  uploadedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated on admin detail endpoint */
  parent?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  /** Populated on admin detail endpoint */
  payment?: {
    id: string;
    amountCents: number;
    paymentDate: string;
    reference: string | null;
  } | null;
  /** Populated on admin detail endpoint */
  uploadedBy?: {
    id: string;
    email: string;
  } | null;
  /** Populated on admin detail endpoint */
  reviewedBy?: {
    id: string;
    email: string;
  } | null;
  /** OCR extracted fields — populated after matcher runs on APPROVED attachments */
  extractedAmount?: number | null;
  extractedDate?: string | null;
  extractedReference?: string | null;
  matchAttemptedAt?: string | null;
  /** Normalised confidence 0.0000-1.0000 */
  matchConfidence?: string | null;
  /** Suggested payment context — populated on admin detail when suggestedPaymentId is set */
  suggestedPayment?: {
    id: string;
    amountCents: number;
    paymentDate: string;
    reference: string | null;
    parent?: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}

export interface AdminAttachmentListFilters {
  paymentId?: string;
  parentId?: string;
  status?: PaymentAttachmentStatus;
  from?: string;
  to?: string;
}
