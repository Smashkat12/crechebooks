import { apiClient } from './client';

// ─── Status enum ──────────────────────────────────────────────────────────────

export type AttachmentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// ─── Shared shapes ────────────────────────────────────────────────────────────

export interface PaymentAttachmentBase {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  note: string | null;
  reviewStatus: AttachmentReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  paymentId: string | null;
  uploadedAt: string;
}

// ─── Parent-portal shapes ─────────────────────────────────────────────────────

export interface ParentAttachment extends PaymentAttachmentBase {
  payment: {
    id: string;
    reference: string;
    amount: number;
  } | null;
}

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export interface PresignRequest {
  filename: string;
  contentType: string;
  fileSize: number;
}

export interface RegisterAttachmentRequest {
  s3Key: string;
  filename: string;
  contentType: string;
  fileSize: number;
  note?: string;
  paymentId?: string;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

// ─── Admin shapes ─────────────────────────────────────────────────────────────

export interface AdminAttachment extends PaymentAttachmentBase {
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  uploader: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewer: {
    id: string;
    name: string;
    email: string;
  } | null;
  payment: {
    id: string;
    reference: string;
    amount: number;
    paymentDate: string;
  } | null;
}

export interface AdminAttachmentFilters {
  paymentId?: string;
  parentId?: string;
  status?: AttachmentReviewStatus;
  from?: string;
  to?: string;
}

export interface ReviewAttachmentRequest {
  status: 'APPROVED' | 'REJECTED';
  reviewNote?: string;
}

export interface LinkPaymentRequest {
  paymentId: string;
}

export interface AdminUploadRequest {
  s3Key: string;
  filename: string;
  contentType: string;
  fileSize: number;
  note?: string;
  parentId: string;
}

// ─── Parent-portal API functions ───────────────────────────────────────────────

const PARENT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

async function parentFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token = getParentToken();
  if (!token) throw new Error('Not authenticated. Please log in.');

  const response = await fetch(`${PARENT_API_URL}/api/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('parent_session_token');
      throw new Error('Session expired. Please log in again.');
    }
    let msg = `Request failed: ${response.status}`;
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {
      // use default
    }
    throw new Error(msg);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function fetchParentAttachments(params?: {
  paymentId?: string;
}): Promise<ParentAttachment[]> {
  const qs = params?.paymentId ? `?paymentId=${params.paymentId}` : '';
  return parentFetch<ParentAttachment[]>(
    `/parent-portal/payment-attachments${qs}`,
  );
}

export async function fetchParentAttachment(id: string): Promise<ParentAttachment> {
  return parentFetch<ParentAttachment>(`/parent-portal/payment-attachments/${id}`);
}

export async function presignAttachmentUpload(
  req: PresignRequest,
): Promise<PresignResponse> {
  return parentFetch<PresignResponse>('/parent-portal/payment-attachments/presign', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function registerParentAttachment(
  req: RegisterAttachmentRequest,
): Promise<ParentAttachment> {
  return parentFetch<ParentAttachment>('/parent-portal/payment-attachments', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function fetchParentAttachmentDownloadUrl(
  id: string,
): Promise<DownloadUrlResponse> {
  return parentFetch<DownloadUrlResponse>(
    `/parent-portal/payment-attachments/${id}/download-url`,
  );
}

export async function deleteParentAttachment(id: string): Promise<void> {
  return parentFetch<void>(`/parent-portal/payment-attachments/${id}`, {
    method: 'DELETE',
  });
}

// ─── Admin API functions ───────────────────────────────────────────────────────

export async function fetchAdminAttachments(
  filters?: AdminAttachmentFilters,
): Promise<AdminAttachment[]> {
  const { data } = await apiClient.get<AdminAttachment[]>(
    '/payment-attachments',
    { params: filters },
  );
  return data;
}

export async function fetchPendingAttachments(): Promise<AdminAttachment[]> {
  const { data } = await apiClient.get<AdminAttachment[]>(
    '/payment-attachments/pending',
  );
  return data;
}

export async function fetchAdminAttachment(id: string): Promise<AdminAttachment> {
  const { data } = await apiClient.get<AdminAttachment>(`/payment-attachments/${id}`);
  return data;
}

export async function fetchAdminAttachmentDownloadUrl(
  id: string,
): Promise<DownloadUrlResponse> {
  const { data } = await apiClient.get<DownloadUrlResponse>(
    `/payment-attachments/${id}/download-url`,
  );
  return data;
}

export async function reviewAttachment(
  id: string,
  req: ReviewAttachmentRequest,
): Promise<AdminAttachment> {
  const { data } = await apiClient.post<AdminAttachment>(
    `/payment-attachments/${id}/review`,
    req,
  );
  return data;
}

export async function linkAttachmentPayment(
  id: string,
  req: LinkPaymentRequest,
): Promise<AdminAttachment> {
  const { data } = await apiClient.post<AdminAttachment>(
    `/payment-attachments/${id}/link-payment`,
    req,
  );
  return data;
}

export async function unlinkAttachmentPayment(id: string): Promise<AdminAttachment> {
  const { data } = await apiClient.delete<AdminAttachment>(
    `/payment-attachments/${id}/link-payment`,
  );
  return data;
}

export async function deleteAdminAttachment(id: string): Promise<void> {
  await apiClient.delete(`/payment-attachments/${id}`);
}
