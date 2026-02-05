/**
 * TASK-WA-010: Public Document Access Controller
 * Public endpoints for viewing documents via signed URLs
 *
 * NO AUTHENTICATION REQUIRED - Access controlled by signed JWT token
 *
 * Used by:
 * - WhatsApp hybrid flow (Option A) - PDF delivery in session messages
 * - Any future public document sharing needs
 *
 * Security:
 * - Tokens are short-lived (15 minutes default)
 * - Tenant isolation enforced via token payload
 * - Rate limited to prevent abuse
 *
 * @module api/public/documents
 */

import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators';
import { DocumentUrlService } from '../../../integrations/whatsapp/services/document-url.service';

/**
 * Public endpoints for document access via signed URLs
 * NO AUTHENTICATION REQUIRED - Access controlled by signed token
 */
@ApiTags('Public - Documents')
@Controller('public/documents')
export class PublicDocumentController {
  private readonly logger = new Logger(PublicDocumentController.name);

  constructor(private readonly documentUrlService: DocumentUrlService) {}

  /**
   * View/download document by signed token
   *
   * Token encodes:
   * - Document type (invoice, statement, receipt)
   * - Document ID
   * - Tenant ID (for isolation)
   * - Expiry time
   */
  @Public()
  @Get('view')
  @RateLimit({
    limit: 30, // 30 requests
    windowSeconds: 60, // per minute
    keyPrefix: 'ratelimit:document-view',
  })
  @ApiOperation({
    summary: 'View document via signed URL',
    description:
      'Access a document using a short-lived signed token. Returns the PDF file.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Signed JWT token for document access',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF document',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 401,
    description: 'Token expired or invalid',
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async viewDocument(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    this.logger.debug('Document view request received');

    try {
      // Verify token and get document info
      const access = this.documentUrlService.verifyDocumentToken(token);

      this.logger.debug(`Verified token for ${access.docType} ${access.docId}`);

      // Get the document PDF
      const { buffer, filename } =
        await this.documentUrlService.getDocumentPdf(access);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);

      // Cache headers - short cache since token is temporary
      res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes

      // Send PDF
      res.status(HttpStatus.OK).send(buffer);

      this.logger.log(`Document ${filename} served via signed URL`);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        `Failed to serve document: ${error instanceof Error ? error.message : String(error)}`,
      );

      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'Document not found or unavailable',
      });
    }
  }
}
