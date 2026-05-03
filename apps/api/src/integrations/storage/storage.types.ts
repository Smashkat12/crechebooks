/**
 * Storage Types
 * Gate-3: S3StorageService types and enums.
 *
 * Path convention: tenants/{tenantId}/{kind}/{...segments}
 */

export enum StorageKind {
  ProofOfPayment = 'proof-of-payments',
  Payslip = 'payslips',
  StaffDocument = 'staff-documents',
  Invoice = 'invoices',
  ClassReport = 'class-reports',
  WhatsAppMedia = 'whatsapp-media',
  PaymentReceipt = 'payment-receipts',
}

export interface PresignUploadOptions {
  /** MIME type of the file being uploaded */
  contentType: string;
  /** Maximum allowed file size in bytes */
  maxSizeBytes: number;
  /** TTL for the pre-signed URL in seconds. Defaults to 900s (15 min) */
  ttlSeconds?: number;
}

export interface PresignUploadResult {
  /** Pre-signed PUT URL for browser-direct upload */
  url: string;
  /** Full S3 key where the object will land after upload */
  key: string;
  /** When the pre-signed URL expires */
  expiresAt: Date;
}

export interface PutObjectResult {
  /** Full S3 key the object was stored at */
  key: string;
  /** ETag returned by S3 */
  etag: string;
}

/** Minimal S3 object descriptor returned by listObjectsWithPrefix */
export interface S3ObjectSummary {
  /** Full S3 key */
  key: string;
  /** S3 LastModified timestamp */
  lastModified: Date;
}
