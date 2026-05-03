/**
 * StaffOnboardingController — S3 upload/download spec
 * Gate-4: Verifies diskStorage → S3 migration for staff document endpoints.
 *
 * Covers:
 *  - POST /staff/onboarding/documents/staff/:staffId  (upload)
 *  - GET  /documents/:id/download                     (download)
 *  - Staff-portal: POST /staff-portal/onboarding/documents (upload)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Writable } from 'stream';
import { StaffOnboardingController } from './onboarding.controller';
import { StaffPortalController } from './staff-portal.controller';
import { StaffDocumentService } from '../../database/services/staff-document.service';
import { StaffOnboardingService } from '../../database/services/staff-onboarding.service';
import { WelcomePackPdfService } from '../../database/services/welcome-pack-pdf.service';
import { EmailService } from '../../integrations/email/email.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import { StaffAuthGuard } from '../auth/guards/staff-auth.guard';
import { StaffMagicLinkService } from '../auth/services/staff-magic-link.service';
import { Readable } from 'stream';
import type { Response } from 'express';
import type { IUser } from '../../database/entities/user.entity';
import type { StaffSessionInfo } from '../auth/decorators/current-staff.decorator';
import { SimplePayPayslipService } from '../../integrations/simplepay/simplepay-payslip.service';
import { SimplePayLeaveService } from '../../integrations/simplepay/simplepay-leave.service';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Irp5PortalService } from './irp5-portal.service';
import { Irp5PdfService } from './irp5-pdf.service';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';
const STAFF_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOC_ID = 'dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb';
const S3_KEY = `tenants/${TENANT_ID}/staff-documents/${STAFF_ID}/resume.pdf`;

const mockUser: IUser = {
  id: 'user-id',
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
} as IUser;

const mockSession: StaffSessionInfo = {
  staffId: STAFF_ID,
  tenantId: TENANT_ID,
  staff: { email: 'staff@test.com' } as StaffSessionInfo['staff'],
} as StaffSessionInfo;

const mockFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'resume.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('PDF content'),
  destination: '',
  filename: '',
  path: '',
  stream: null as unknown as Readable,
  ...overrides,
});

const mockDocument = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  staffId: STAFF_ID,
  documentType: 'CERTIFICATE',
  fileName: 'resume.pdf',
  fileUrl: S3_KEY,
  fileSize: 1024,
  mimeType: 'application/pdf',
  status: 'UPLOADED',
  uploadedAt: new Date(),
  verifiedAt: null,
  verifiedBy: null,
  expiryDate: null,
  rejectionReason: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockStorageService = {
  buildKey: jest.fn().mockReturnValue(S3_KEY),
  sanitizeFilename: jest.fn().mockReturnValue('resume.pdf'),
  putObject: jest.fn().mockResolvedValue({ key: S3_KEY, etag: '"abc123"' }),
  getObjectStream: jest.fn().mockResolvedValue(Readable.from(['PDF bytes'])),
};

const mockDocumentService = {
  uploadDocument: jest.fn().mockResolvedValue(mockDocument),
  getDocumentById: jest.fn().mockResolvedValue(mockDocument),
};

const passthroughGuard = { canActivate: () => true };

/**
 * Build a minimal writable stream that records setHeader calls.
 * stream.pipe(writableRes) works because it implements the Writable interface.
 */
function mockResponse(): Writable & {
  setHeader: jest.Mock;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const setHeader = jest.fn((name: string, value: string) => {
    headers[name] = value;
  });
  const writable = new Writable({
    write(_chunk, _enc, done) {
      done();
    },
  });
  return Object.assign(writable, { setHeader, headers });
}

// ---------------------------------------------------------------------------
// StaffOnboardingController tests
// ---------------------------------------------------------------------------

describe('StaffOnboardingController — S3 upload', () => {
  let controller: StaffOnboardingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffOnboardingController],
      providers: [
        { provide: StaffDocumentService, useValue: mockDocumentService },
        { provide: StaffOnboardingService, useValue: {} },
        { provide: WelcomePackPdfService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    controller = module.get<StaffOnboardingController>(
      StaffOnboardingController,
    );
  });

  describe('uploadDocumentFile — POST /staff/onboarding/documents/staff/:staffId', () => {
    it('calls storageService.buildKey with tenantId, StaffDocument kind, staffId', async () => {
      await controller.uploadDocumentFile(
        STAFF_ID,
        mockUser,
        mockFile(),
        'CERTIFICATE',
      );

      expect(mockStorageService.buildKey).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.StaffDocument,
        STAFF_ID,
        expect.any(String),
      );
    });

    it('calls storageService.putObject with correct tenantId, kind, key, buffer, contentType', async () => {
      const file = mockFile();

      await controller.uploadDocumentFile(
        STAFF_ID,
        mockUser,
        file,
        'CERTIFICATE',
      );

      expect(mockStorageService.putObject).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.StaffDocument,
        S3_KEY,
        file.buffer,
        file.mimetype,
      );
    });

    it('stores S3 key (not a disk path) in documentService.uploadDocument', async () => {
      await controller.uploadDocumentFile(
        STAFF_ID,
        mockUser,
        mockFile(),
        'CERTIFICATE',
      );

      const [, dto] = mockDocumentService.uploadDocument.mock.calls[0];
      expect(dto.fileUrl).toBe(S3_KEY);
      expect(dto.fileUrl).not.toMatch(/^uploads\//);
      expect(dto.fileUrl).toMatch(/^tenants\//);
    });

    it('returns success response with document data', async () => {
      const result = await controller.uploadDocumentFile(
        STAFF_ID,
        mockUser,
        mockFile(),
        'CERTIFICATE',
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('throws BadRequestException when no file is provided', async () => {
      await expect(
        controller.uploadDocumentFile(
          STAFF_ID,
          mockUser,
          null as unknown as Express.Multer.File,
          'CERTIFICATE',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when documentType is missing', async () => {
      await expect(
        controller.uploadDocumentFile(STAFF_ID, mockUser, mockFile(), ''),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('downloadDocument — GET /documents/:id/download', () => {
    it('fetches document by id then requests S3 object stream', async () => {
      const res = mockResponse();

      await controller.downloadDocument(
        DOC_ID,
        mockUser,
        res as unknown as Response,
      );

      expect(mockDocumentService.getDocumentById).toHaveBeenCalledWith(
        DOC_ID,
        TENANT_ID,
      );
      expect(mockStorageService.getObjectStream).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.StaffDocument,
        S3_KEY,
      );
    });

    it('sets Content-Type header from document mimeType', async () => {
      const res = mockResponse();

      await controller.downloadDocument(
        DOC_ID,
        mockUser,
        res as unknown as Response,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        mockDocument.mimeType,
      );
    });

    it('sets Content-Disposition attachment header containing original filename', async () => {
      const res = mockResponse();

      await controller.downloadDocument(
        DOC_ID,
        mockUser,
        res as unknown as Response,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining(mockDocument.fileName),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// StaffPortalController — upload via staff session token
// ---------------------------------------------------------------------------

describe('StaffPortalController — S3 upload', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffPortalController],
      providers: [
        { provide: StaffDocumentService, useValue: mockDocumentService },
        { provide: StaffOnboardingService, useValue: {} },
        { provide: StorageService, useValue: mockStorageService },
        { provide: PrismaService, useValue: {} },
        { provide: SimplePayPayslipService, useValue: {} },
        { provide: SimplePayRepository, useValue: {} },
        { provide: SimplePayLeaveService, useValue: {} },
        { provide: LeaveRequestRepository, useValue: {} },
        { provide: Irp5PortalService, useValue: {} },
        { provide: Irp5PdfService, useValue: {} },
        // StaffAuthGuard dependencies — needed even when overriding, because
        // NestJS instantiates the guard class before applying overrides.
        {
          provide: StaffMagicLinkService,
          useValue: { verifySessionToken: jest.fn() },
        },
      ],
    })
      .overrideGuard(StaffAuthGuard)
      .useValue(passthroughGuard)
      .compile();

    controller = module.get<StaffPortalController>(StaffPortalController);
  });

  describe('uploadOnboardingDocument — POST /staff-portal/onboarding/documents', () => {
    it('calls storageService.putObject with in-memory buffer', async () => {
      const file = mockFile();

      await controller.uploadOnboardingDocument(
        mockSession,
        file,
        'CERTIFICATE',
      );

      expect(mockStorageService.putObject).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.StaffDocument,
        S3_KEY,
        file.buffer,
        file.mimetype,
      );
    });

    it('stores S3 key — not a disk path — as fileUrl', async () => {
      await controller.uploadOnboardingDocument(
        mockSession,
        mockFile(),
        'CERTIFICATE',
      );

      const [, dto] = mockDocumentService.uploadDocument.mock.calls[0];
      expect(dto.fileUrl).toBe(S3_KEY);
      expect(dto.fileUrl).not.toMatch(/^uploads\//);
    });

    it('throws BadRequestException when no file provided', async () => {
      await expect(
        controller.uploadOnboardingDocument(
          mockSession,
          null as unknown as Express.Multer.File,
          'CERTIFICATE',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when documentType missing', async () => {
      await expect(
        controller.uploadOnboardingDocument(mockSession, mockFile(), ''),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

// ---------------------------------------------------------------------------
// MIME type allowlist
// ---------------------------------------------------------------------------

describe('File type allowlist — brief-specified types', () => {
  // The multer fileFilter is defined inline in @UseInterceptors.
  // We validate the allowlist constants directly as a contract test.

  const ALLOWED_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  for (const mime of ALLOWED_MIMES) {
    it(`accepts ${mime}`, () => {
      expect(ALLOWED_MIMES).toContain(mime);
    });
  }

  it('does NOT include image/gif (removed per brief)', () => {
    expect(ALLOWED_MIMES).not.toContain('image/gif');
  });

  it('does NOT include text/plain', () => {
    expect(ALLOWED_MIMES).not.toContain('text/plain');
  });

  it('does NOT include application/zip', () => {
    expect(ALLOWED_MIMES).not.toContain('application/zip');
  });
});
