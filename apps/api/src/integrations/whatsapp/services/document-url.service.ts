/**
 * Document URL Service
 * TASK-WA-010: Signed URLs for WhatsApp Document Delivery
 *
 * Generates short-lived signed URLs for public document access.
 * Used by the hybrid approach (Option A) to send PDFs in WhatsApp session messages.
 *
 * Flow:
 * 1. Parent taps "View Invoice" button in WhatsApp
 * 2. This opens a 24-hour session window
 * 3. System generates signed URL for the invoice PDF
 * 4. PDF is sent via session message (no template approval needed)
 *
 * Security:
 * - URLs expire after 15 minutes (configurable)
 * - Tokens are single-use (optional: can implement token revocation)
 * - Tenant isolation enforced at verification
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InvoicePdfService } from '../../../database/services/invoice-pdf.service';

/**
 * Document token payload for signed URLs
 */
interface DocumentTokenPayload {
  /** Document type (invoice, statement, receipt) */
  docType: 'invoice' | 'statement' | 'receipt';
  /** Document ID (invoice ID, statement ID) */
  docId: string;
  /** Tenant ID for isolation */
  tenantId: string;
  /** Token type identifier */
  type: 'document_access';
  /** Issue timestamp for tracking */
  iat: number;
}

/**
 * Result of generating a signed document URL
 */
export interface SignedDocumentUrl {
  /** The full signed URL to access the document */
  url: string;
  /** Expiry time in seconds from now */
  expiresIn: number;
  /** Human-readable expiry */
  expiresAt: Date;
}

/**
 * Result of verifying a document token
 */
export interface VerifiedDocumentAccess {
  docType: 'invoice' | 'statement' | 'receipt';
  docId: string;
  tenantId: string;
}

@Injectable()
export class DocumentUrlService {
  private readonly logger = new Logger(DocumentUrlService.name);
  private readonly expiryMinutes: number;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {
    // Default 15 minutes for document access tokens
    this.expiryMinutes = parseInt(
      this.configService.get<string>('DOCUMENT_URL_EXPIRY_MINUTES') || '15',
      10,
    );

    // API base URL for document access endpoint
    this.apiBaseUrl =
      this.configService.get<string>('API_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:3000';
  }

  /**
   * Generate a signed URL for invoice PDF access
   *
   * @param invoiceId Invoice ID
   * @param tenantId Tenant ID for isolation
   * @returns Signed URL with expiry information
   */
  async generateInvoiceUrl(
    invoiceId: string,
    tenantId: string,
  ): Promise<SignedDocumentUrl> {
    // Verify invoice exists and belongs to tenant
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
        isDeleted: false,
      },
      select: { id: true, invoiceNumber: true },
    });

    if (!invoice) {
      throw new UnauthorizedException('Invoice not found');
    }

    return this.generateSignedUrl('invoice', invoiceId, tenantId);
  }

  /**
   * Generate a signed URL for invoice PDF access by invoice number
   *
   * @param invoiceNumber Invoice number (e.g., INV-2026-001234)
   * @param tenantId Tenant ID for isolation
   * @returns Signed URL with expiry information
   */
  async generateInvoiceUrlByNumber(
    invoiceNumber: string,
    tenantId: string,
  ): Promise<SignedDocumentUrl> {
    // Find invoice by number
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber,
        tenantId,
        isDeleted: false,
      },
      select: { id: true, invoiceNumber: true },
    });

    if (!invoice) {
      throw new UnauthorizedException('Invoice not found');
    }

    return this.generateSignedUrl('invoice', invoice.id, tenantId);
  }

  /**
   * Generate a signed URL for any document type
   */
  private generateSignedUrl(
    docType: 'invoice' | 'statement' | 'receipt',
    docId: string,
    tenantId: string,
  ): SignedDocumentUrl {
    const payload: Omit<DocumentTokenPayload, 'iat'> = {
      docType,
      docId,
      tenantId,
      type: 'document_access',
    };

    const expiresIn = this.expiryMinutes * 60; // Convert to seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const token = this.jwtService.sign(payload, {
      expiresIn: `${this.expiryMinutes}m`,
    });

    // Build public access URL
    const url = `${this.apiBaseUrl}/api/documents/view?token=${encodeURIComponent(token)}`;

    this.logger.debug(
      `Generated signed URL for ${docType} ${docId}, expires in ${this.expiryMinutes}m`,
    );

    return {
      url,
      expiresIn,
      expiresAt,
    };
  }

  /**
   * Verify a document access token
   *
   * @param token JWT token from signed URL
   * @returns Verified document access information
   * @throws UnauthorizedException if token is invalid or expired
   */
  verifyDocumentToken(token: string): VerifiedDocumentAccess {
    try {
      const payload = this.jwtService.verify<DocumentTokenPayload>(token);

      if (payload.type !== 'document_access') {
        throw new UnauthorizedException('Invalid document token');
      }

      return {
        docType: payload.docType,
        docId: payload.docId,
        tenantId: payload.tenantId,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        this.logger.warn('Document token expired');
        throw new UnauthorizedException(
          'Document link has expired. Please request a new one.',
        );
      }
      this.logger.warn(
        `Invalid document token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid document link');
    }
  }

  /**
   * Get document PDF buffer for verified token
   *
   * @param access Verified document access
   * @returns PDF buffer and filename
   */
  async getDocumentPdf(
    access: VerifiedDocumentAccess,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (access.docType === 'invoice') {
      // Get invoice for filename
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          id: access.docId,
          tenantId: access.tenantId,
          isDeleted: false,
        },
        select: { invoiceNumber: true },
      });

      if (!invoice) {
        throw new UnauthorizedException('Invoice not found');
      }

      const buffer = await this.invoicePdfService.generatePdf(
        access.tenantId,
        access.docId,
      );

      return {
        buffer,
        filename: `${invoice.invoiceNumber}.pdf`,
      };
    }

    // Add statement and receipt support as needed
    throw new UnauthorizedException('Unsupported document type');
  }
}
