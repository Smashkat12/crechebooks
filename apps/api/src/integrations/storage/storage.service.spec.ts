/**
 * StorageService Tests
 * Gate-3: S3 storage abstraction unit tests.
 *
 * Uses aws-sdk-client-mock to mock S3Client without making real AWS calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Readable } from 'stream';
import { StorageService } from './storage.service';
import { StorageKind } from './storage.types';

// ---------------------------------------------------------------------------
// S3 mock setup
// ---------------------------------------------------------------------------

const s3Mock = mockClient(S3Client);

const TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';
const TEST_BUCKET = 'crechebooks-uploads-test';

beforeEach(() => {
  s3Mock.reset();
});

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      StorageService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 's3') {
              return {
                bucket: TEST_BUCKET,
                region: 'af-south-1',
                accessKeyId: 'test-key-id',
                secretAccessKey: 'test-secret',
              };
            }
            return undefined;
          }),
        },
      },
    ],
  }).compile();
}

// ---------------------------------------------------------------------------
// buildKey
// ---------------------------------------------------------------------------

describe('StorageService.buildKey', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
  });

  it('builds a correctly prefixed key from tenant + kind + segments', () => {
    const key = service.buildKey(
      TENANT_ID,
      StorageKind.Invoice,
      '2026-04',
      'INV-001.pdf',
    );
    expect(key).toBe(`tenants/${TENANT_ID}/invoices/2026-04/INV-001.pdf`);
  });

  it('builds key with single segment', () => {
    const key = service.buildKey(TENANT_ID, StorageKind.Payslip, 'payslip.pdf');
    expect(key).toBe(`tenants/${TENANT_ID}/payslips/payslip.pdf`);
  });

  it('throws BadRequestException for invalid tenantId (empty)', () => {
    expect(() => service.buildKey('', StorageKind.Invoice, 'file.pdf')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for invalid tenantId (not UUID)', () => {
    expect(() =>
      service.buildKey('not-a-uuid', StorageKind.Invoice, 'file.pdf'),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for segment containing ".."', () => {
    expect(() =>
      service.buildKey(TENANT_ID, StorageKind.Invoice, '../etc/passwd'),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for segment starting with "/"', () => {
    expect(() =>
      service.buildKey(TENANT_ID, StorageKind.Invoice, '/absolute'),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for empty segment', () => {
    expect(() => service.buildKey(TENANT_ID, StorageKind.Invoice, '')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for segment containing "/"', () => {
    expect(() =>
      service.buildKey(TENANT_ID, StorageKind.Invoice, 'dir/file.pdf'),
    ).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant key guard
// ---------------------------------------------------------------------------

describe('StorageService — cross-tenant key guard', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
    s3Mock.reset();
  });

  const OTHER_TENANT = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

  it('rejects getObjectStream for a key belonging to another tenant', async () => {
    const alienKey = `tenants/${OTHER_TENANT}/invoices/file.pdf`;
    await expect(
      service.getObjectStream(TENANT_ID, StorageKind.Invoice, alienKey),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects deleteObject for a key belonging to another tenant', async () => {
    const alienKey = `tenants/${OTHER_TENANT}/invoices/file.pdf`;
    await expect(
      service.deleteObject(TENANT_ID, StorageKind.Invoice, alienKey),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects putObject for a key belonging to another tenant', async () => {
    const alienKey = `tenants/${OTHER_TENANT}/invoices/file.pdf`;
    await expect(
      service.putObject(
        TENANT_ID,
        StorageKind.Invoice,
        alienKey,
        Buffer.from('data'),
        'application/pdf',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// putObject
// ---------------------------------------------------------------------------

describe('StorageService.putObject', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
    s3Mock.reset();
  });

  it('calls PutObjectCommand with correct bucket, key, body, and contentType', async () => {
    const key = `tenants/${TENANT_ID}/invoices/INV-001.pdf`;
    const body = Buffer.from('pdf-data');
    const etag = '"abc123"';

    s3Mock.on(PutObjectCommand).resolves({ ETag: etag });

    const result = await service.putObject(
      TENANT_ID,
      StorageKind.Invoice,
      key,
      body,
      'application/pdf',
    );

    expect(result.key).toBe(key);
    expect(result.etag).toBe(etag);

    const calls = s3Mock.calls();
    expect(calls).toHaveLength(1);

    const cmd = calls[0].args[0] as InstanceType<typeof PutObjectCommand>;
    const input = cmd.input;
    expect(input.Bucket).toBe(TEST_BUCKET);
    expect(input.Key).toBe(key);
    expect(input.Body).toBe(body);
    expect(input.ContentType).toBe('application/pdf');
  });

  it('returns empty etag when S3 does not return ETag', async () => {
    const key = `tenants/${TENANT_ID}/invoices/INV-001.pdf`;
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await service.putObject(
      TENANT_ID,
      StorageKind.Invoice,
      key,
      Buffer.from('data'),
      'application/pdf',
    );

    expect(result.etag).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getObjectStream
// ---------------------------------------------------------------------------

describe('StorageService.getObjectStream', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
    s3Mock.reset();
  });

  it('returns a Readable stream when object exists', async () => {
    const key = `tenants/${TENANT_ID}/invoices/INV-001.pdf`;
    const readable = Readable.from(['hello world']);

    // Cast through unknown to satisfy the SDK's StreamingBlobPayloadOutputTypes
    s3Mock.on(GetObjectCommand).resolves({
      Body: readable as unknown as import('@aws-sdk/client-s3').GetObjectCommandOutput['Body'],
    });

    const stream = await service.getObjectStream(
      TENANT_ID,
      StorageKind.Invoice,
      key,
    );

    expect(stream).toBeInstanceOf(Readable);
  });

  it('throws NotFoundException on NoSuchKey error', async () => {
    const key = `tenants/${TENANT_ID}/invoices/missing.pdf`;

    s3Mock.on(GetObjectCommand).rejects(
      Object.assign(new NoSuchKey({ message: 'not found', $metadata: {} }), {
        name: 'NoSuchKey',
      }),
    );

    await expect(
      service.getObjectStream(TENANT_ID, StorageKind.Invoice, key),
    ).rejects.toThrow(NotFoundException);
  });

  it('rethrows non-NoSuchKey errors', async () => {
    const key = `tenants/${TENANT_ID}/invoices/INV-001.pdf`;

    s3Mock.on(GetObjectCommand).rejects(new Error('S3 internal error'));

    await expect(
      service.getObjectStream(TENANT_ID, StorageKind.Invoice, key),
    ).rejects.toThrow('S3 internal error');
  });
});

// ---------------------------------------------------------------------------
// deleteObject
// ---------------------------------------------------------------------------

describe('StorageService.deleteObject', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
    s3Mock.reset();
  });

  it('calls DeleteObjectCommand with correct bucket and key', async () => {
    const key = `tenants/${TENANT_ID}/invoices/INV-001.pdf`;

    s3Mock.on(DeleteObjectCommand).resolves({});

    await service.deleteObject(TENANT_ID, StorageKind.Invoice, key);

    const calls = s3Mock.calls();
    expect(calls).toHaveLength(1);

    const cmd = calls[0].args[0] as InstanceType<typeof DeleteObjectCommand>;
    expect(cmd.input.Bucket).toBe(TEST_BUCKET);
    expect(cmd.input.Key).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// createPresignedUploadUrl
// ---------------------------------------------------------------------------

describe('StorageService.createPresignedUploadUrl', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
    s3Mock.reset();
  });

  it('returns a URL, key, and expiresAt for a valid upload request', async () => {
    // getSignedUrl internally calls the S3Client — mock PutObjectCommand presign
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await service.createPresignedUploadUrl(
      TENANT_ID,
      StorageKind.ProofOfPayment,
      'receipt.pdf',
      { contentType: 'application/pdf', maxSizeBytes: 5_000_000 },
    );

    expect(result.url).toBeTruthy();
    expect(result.key).toMatch(
      new RegExp(`^tenants/${TENANT_ID}/proof-of-payments/`),
    );
    expect(result.expiresAt).toBeInstanceOf(Date);
    // expiresAt should be ~15 min in the future
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('key contains a UUID and sanitised filename', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await service.createPresignedUploadUrl(
      TENANT_ID,
      StorageKind.Payslip,
      'My Payslip Jan 2026.pdf',
      { contentType: 'application/pdf', maxSizeBytes: 10_000_000 },
    );

    // Pattern: tenants/{tid}/payslips/{uuid}-my-payslip-jan-2026.pdf
    expect(result.key).toMatch(
      /tenants\/.+\/payslips\/[0-9a-f-]{36}-my-payslip-jan-2026\.pdf$/,
    );
  });

  it('uses provided ttlSeconds for expiresAt', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const ttl = 60;
    const before = Date.now();
    const result = await service.createPresignedUploadUrl(
      TENANT_ID,
      StorageKind.StaffDocument,
      'contract.pdf',
      {
        contentType: 'application/pdf',
        maxSizeBytes: 2_000_000,
        ttlSeconds: ttl,
      },
    );
    const after = Date.now();

    const expectedMinMs = before + ttl * 1000;
    const expectedMaxMs = after + ttl * 1000;

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
  });

  it('throws BadRequestException for invalid tenantId', async () => {
    await expect(
      service.createPresignedUploadUrl(
        'bad-id',
        StorageKind.Invoice,
        'file.pdf',
        { contentType: 'application/pdf', maxSizeBytes: 1_000_000 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('appends filenameContext segments to the key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await service.createPresignedUploadUrl(
      TENANT_ID,
      StorageKind.Payslip,
      'slip.pdf',
      { contentType: 'application/pdf', maxSizeBytes: 5_000_000 },
      ['2026-04', 'emp-123'],
    );

    expect(result.key).toMatch(/tenants\/.+\/payslips\/2026-04\/emp-123\//);
  });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('StorageService.sanitizeFilename', () => {
  let service: StorageService;

  beforeEach(async () => {
    const mod = await buildModule();
    service = mod.get(StorageService);
  });

  it('lowercases and replaces spaces with hyphens', () => {
    expect(service.sanitizeFilename('My Document.PDF')).toBe('my-document.pdf');
  });

  it('strips special characters', () => {
    expect(service.sanitizeFilename('file@#$%.pdf')).toBe('file.pdf');
  });

  it('preserves dots and hyphens', () => {
    expect(service.sanitizeFilename('my-file.v1.2.pdf')).toBe(
      'my-file.v1.2.pdf',
    );
  });

  it('preserves the file extension', () => {
    expect(service.sanitizeFilename('Report Q1 2026.xlsx')).toBe(
      'report-q1-2026.xlsx',
    );
  });

  it('caps base name at 100 characters preserving extension', () => {
    const longBase = 'a'.repeat(200);
    const result = service.sanitizeFilename(`${longBase}.pdf`);
    // base truncated to 100 + '.pdf' = 104 chars
    expect(result.length).toBeLessThanOrEqual(104);
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('falls back to "file" when result is empty', () => {
    expect(service.sanitizeFilename('!!!###')).toBe('file');
  });

  it('handles empty string', () => {
    expect(service.sanitizeFilename('')).toBe('file');
  });

  it('handles filename without extension', () => {
    expect(service.sanitizeFilename('README')).toBe('readme');
  });
});
