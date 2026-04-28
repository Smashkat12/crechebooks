/**
 * StorageService
 * Gate-3: S3-backed file storage with tenant isolation.
 *
 * Upload strategy : pre-signed PUT URLs (browser → S3 direct)
 * Download strategy: server-proxy GetObject → Node Readable stream
 *
 * All methods are tenant-scoped. Cross-tenant access is rejected at the key
 * validation layer before any S3 call is made.
 */

import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import {
  StorageKind,
  PresignUploadOptions,
  PresignUploadResult,
  PutObjectResult,
} from './storage.types';
import type { S3ConfigType } from './storage.config';

/** Matches a canonical UUID (case-insensitive) */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default TTLs */
const DEFAULT_UPLOAD_TTL_SECONDS = 900; // 15 min
const DEFAULT_DOWNLOAD_TTL_SECONDS = 300; // 5 min

/** Maximum sanitized filename length (excluding extension) */
const MAX_FILENAME_CHARS = 100;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const cfg = this.configService.get<S3ConfigType>('s3');

    const region = cfg?.region ?? 'af-south-1';
    const bucket = cfg?.bucket ?? '';
    const accessKeyId = cfg?.accessKeyId;
    const secretAccessKey = cfg?.secretAccessKey;

    this.bucket = bucket;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region,
    };

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.s3 = new S3Client(clientConfig);
  }

  // ---------------------------------------------------------------------------
  // Key construction
  // ---------------------------------------------------------------------------

  /**
   * Build a scoped S3 key.
   *
   * Rules:
   *  - tenantId must be a valid UUID.
   *  - No segment may contain ".." or start with "/".
   *  - No empty segments.
   */
  buildKey(tenantId: string, kind: StorageKind, ...segments: string[]): string {
    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      throw new BadRequestException(
        `Invalid tenantId — must be a UUID: "${tenantId}"`,
      );
    }

    for (const seg of segments) {
      if (!seg || seg.trim() === '') {
        throw new BadRequestException('Key segment must not be empty');
      }
      if (seg.includes('..')) {
        throw new BadRequestException(
          `Path traversal detected in segment: "${seg}"`,
        );
      }
      if (seg.startsWith('/')) {
        throw new BadRequestException(
          `Segment must not start with "/": "${seg}"`,
        );
      }
      if (seg.includes('/')) {
        throw new BadRequestException(
          `Segment must not contain "/": "${seg}" — use multiple segments instead`,
        );
      }
    }

    return ['tenants', tenantId, kind, ...segments].join('/');
  }

  // ---------------------------------------------------------------------------
  // Cross-tenant guard
  // ---------------------------------------------------------------------------

  private assertTenantOwnsKey(
    tenantId: string,
    kind: StorageKind,
    key: string,
  ): void {
    const expectedPrefix = `tenants/${tenantId}/${kind}/`;
    if (!key.startsWith(expectedPrefix)) {
      this.logger.warn(
        `Cross-tenant key access rejected: tenantId=${tenantId} key=${key}`,
      );
      throw new ForbiddenException(
        'Key does not belong to the requesting tenant',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Server-side upload
  // ---------------------------------------------------------------------------

  /**
   * Put an object directly (server-side upload).
   * Used for caching externally-fetched files (e.g. SimplePay payslips).
   */
  async putObject(
    tenantId: string,
    kind: StorageKind,
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
  ): Promise<PutObjectResult> {
    this.assertTenantOwnsKey(tenantId, kind, key);

    this.logger.log(`putObject: bucket=${this.bucket} key=${key}`);

    const result = await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return {
      key,
      etag: result.ETag ?? '',
    };
  }

  // ---------------------------------------------------------------------------
  // Server-proxy download
  // ---------------------------------------------------------------------------

  /**
   * Retrieve an object as a Node Readable stream.
   * Pipe directly into the HTTP response to avoid buffering the full file.
   *
   * @throws NotFoundException when the object does not exist (S3 NoSuchKey).
   */
  async getObjectStream(
    tenantId: string,
    kind: StorageKind,
    key: string,
  ): Promise<Readable> {
    this.assertTenantOwnsKey(tenantId, kind, key);

    this.logger.log(`getObjectStream: bucket=${this.bucket} key=${key}`);

    try {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!(result.Body instanceof Readable)) {
        // AWS SDK v3 returns a web ReadableStream in some environments;
        // convert to a Node stream for piping.
        const webStream = result.Body as ReadableStream;
        return Readable.fromWeb(
          webStream as Parameters<typeof Readable.fromWeb>[0],
        );
      }

      return result.Body;
    } catch (err) {
      if (err instanceof NoSuchKey) {
        throw new NotFoundException(`Object not found: ${key}`);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Object existence check (HEAD)
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the object exists in the bucket, false otherwise.
   * Used to verify a client-uploaded file actually landed in S3 before we
   * create a PaymentAttachment DB row.
   */
  async objectExists(
    tenantId: string,
    kind: StorageKind,
    key: string,
  ): Promise<boolean> {
    this.assertTenantOwnsKey(tenantId, kind, key);

    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) {
        return false;
      }
      // S3 also returns a 404-shaped error with name 'NotFound' in some SDK versions
      if (
        err instanceof Error &&
        ('$metadata' in err
          ? (err as unknown as { $metadata: { httpStatusCode?: number } })
              .$metadata?.httpStatusCode === 404
          : false)
      ) {
        return false;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete an object (creates a delete marker — bucket versioning is enabled).
   */
  async deleteObject(
    tenantId: string,
    kind: StorageKind,
    key: string,
  ): Promise<void> {
    this.assertTenantOwnsKey(tenantId, kind, key);

    this.logger.log(`deleteObject: bucket=${this.bucket} key=${key}`);

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Pre-signed upload URL
  // ---------------------------------------------------------------------------

  /**
   * Generate a pre-signed PUT URL for browser-direct upload.
   *
   * A UUID is embedded in the object name to prevent guessable URLs and
   * collisions. The filename is sanitised before being included.
   *
   * @param filenameContext - Optional path segments inserted before the
   *   sanitised filename (e.g. ['2026-04', 'employee-123']).
   */
  async createPresignedUploadUrl(
    tenantId: string,
    kind: StorageKind,
    filename: string,
    opts: PresignUploadOptions,
    filenameContext: string[] = [],
  ): Promise<PresignUploadResult> {
    if (!UUID_REGEX.test(tenantId)) {
      throw new BadRequestException(
        `Invalid tenantId — must be a UUID: "${tenantId}"`,
      );
    }

    const ttl = opts.ttlSeconds ?? DEFAULT_UPLOAD_TTL_SECONDS;
    const sanitized = this.sanitizeFilename(filename);
    const objectId = uuidv4();
    const objectName = `${objectId}-${sanitized}`;

    const key = this.buildKey(tenantId, kind, ...filenameContext, objectName);

    this.logger.log(
      `createPresignedUploadUrl: key=${key} ttl=${ttl}s contentType=${opts.contentType}`,
    );

    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: opts.contentType,
        ContentLength: opts.maxSizeBytes,
      }),
      { expiresIn: ttl },
    );

    const expiresAt = new Date(Date.now() + ttl * 1000);

    return { url, key, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Pre-signed download URL (use sparingly)
  // ---------------------------------------------------------------------------

  /**
   * Generate a pre-signed GET URL.
   * Prefer getObjectStream for normal downloads — this is for edge cases where
   * streaming through the API server is prohibitively expensive.
   */
  async createPresignedDownloadUrl(
    tenantId: string,
    kind: StorageKind,
    key: string,
    ttlSeconds: number = DEFAULT_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    this.assertTenantOwnsKey(tenantId, kind, key);

    this.logger.log(
      `createPresignedDownloadUrl: key=${key} ttl=${ttlSeconds}s`,
    );

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  // ---------------------------------------------------------------------------
  // Filename sanitisation
  // ---------------------------------------------------------------------------

  /**
   * Sanitise a filename for safe inclusion in an S3 key.
   *
   * Rules:
   *  - Lowercase
   *  - Whitespace → '-'
   *  - Strip chars outside [a-z0-9._-]
   *  - Cap base name at MAX_FILENAME_CHARS chars (extension preserved)
   *  - Fallback to 'file' when result is empty
   */
  sanitizeFilename(filename: string): string {
    if (!filename) {
      return 'file';
    }

    // Separate extension (everything after last '.')
    const lastDot = filename.lastIndexOf('.');
    const hasExtension = lastDot > 0 && lastDot < filename.length - 1;
    const base = hasExtension ? filename.slice(0, lastDot) : filename;
    const ext = hasExtension ? filename.slice(lastDot) : ''; // includes '.'

    const sanitizedBase = base
      .toLowerCase()
      .replace(/\s+/g, '-') // spaces → hyphens
      .replace(/[^a-z0-9._-]/g, '') // strip unsafe chars
      .slice(0, MAX_FILENAME_CHARS); // cap length

    const sanitizedExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');

    const result = (sanitizedBase || 'file') + sanitizedExt;
    return result;
  }
}
