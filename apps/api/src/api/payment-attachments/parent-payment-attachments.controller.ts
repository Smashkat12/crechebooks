/**
 * ParentPaymentAttachmentsController — parent portal routes
 *
 * Route prefix: /parent-portal/payment-attachments
 * Auth: ParentAuthGuard (session token — not the global JwtAuthGuard).
 *   @Public() skips the global guard; ParentAuthGuard is applied explicitly.
 * Ownership: every write/read verifies session.parentId === attachment.parentId.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import {
  CurrentParent,
  type ParentSession,
} from '../auth/decorators/current-parent.decorator';
import { PaymentAttachmentsService } from './payment-attachments.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { RegisterAttachmentDto } from './dto/register-attachment.dto';

@ApiTags('Parent Portal – Payment Attachments')
@ApiBearerAuth()
@Controller('parent-portal/payment-attachments')
@Public() // Skip global JwtAuthGuard — ParentAuthGuard handles auth
@UseGuards(ParentAuthGuard)
export class ParentPaymentAttachmentsController {
  private readonly logger = new Logger(ParentPaymentAttachmentsController.name);

  constructor(private readonly attachmentsService: PaymentAttachmentsService) {}

  // ------------------------------------------------------------------
  // POST /parent-portal/payment-attachments/presign
  // ------------------------------------------------------------------
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get a 15-min presigned S3 PUT URL. Upload the file, then call POST / to register.',
  })
  @ApiResponse({
    status: 200,
    description: '{ uploadUrl, key, expiresAt }',
  })
  @ApiResponse({ status: 400, description: 'Validation error (type/size)' })
  async presign(
    @CurrentParent() session: ParentSession,
    @Body() dto: PresignUploadDto,
  ) {
    return this.attachmentsService.presignUpload(session.tenantId, dto);
  }

  // ------------------------------------------------------------------
  // POST /parent-portal/payment-attachments  — register after upload
  // ------------------------------------------------------------------
  @Post()
  @ApiOperation({
    summary:
      'Register an uploaded attachment. Service verifies the object exists in S3.',
  })
  @ApiResponse({ status: 201, description: 'PaymentAttachmentResponseDto' })
  @ApiResponse({
    status: 403,
    description: 'Cross-tenant key or parent not in tenant',
  })
  @ApiResponse({
    status: 422,
    description: 'Object not found in S3 (upload did not complete)',
  })
  async register(
    @CurrentParent() session: ParentSession,
    @Body() dto: RegisterAttachmentDto,
  ) {
    return this.attachmentsService.register(
      session.tenantId,
      session.parentId,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // GET /parent-portal/payment-attachments  — list (last 90 days)
  // ------------------------------------------------------------------
  @Get()
  @ApiOperation({
    summary: "List parent's own attachments (default last 90 days)",
  })
  @ApiQuery({ name: 'paymentId', required: false })
  @ApiResponse({ status: 200, description: 'PaymentAttachmentResponseDto[]' })
  async list(
    @CurrentParent() session: ParentSession,
    @Query('paymentId') paymentId?: string,
  ) {
    return this.attachmentsService.listForParent(
      session.tenantId,
      session.parentId,
      paymentId,
    );
  }

  // ------------------------------------------------------------------
  // GET /parent-portal/payment-attachments/:id  — single
  // ------------------------------------------------------------------
  @Get(':id')
  @ApiOperation({
    summary: "Get single attachment (verifies parent's ownership)",
  })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 200, description: 'PaymentAttachmentResponseDto' })
  @ApiResponse({ status: 403, description: 'Attachment not owned by parent' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getOne(
    @CurrentParent() session: ParentSession,
    @Param('id') id: string,
  ) {
    return this.attachmentsService.getForParent(
      session.tenantId,
      session.parentId,
      id,
    );
  }

  // ------------------------------------------------------------------
  // GET /parent-portal/payment-attachments/:id/download-url
  // ------------------------------------------------------------------
  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get 5-min presigned download URL' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 200, description: '{ url, expiresAt }' })
  @ApiResponse({ status: 403, description: 'Not owned by parent' })
  async downloadUrl(
    @CurrentParent() session: ParentSession,
    @Param('id') id: string,
  ) {
    return this.attachmentsService.downloadUrlForParentById(
      session.tenantId,
      session.parentId,
      id,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /parent-portal/payment-attachments/:id
  // ------------------------------------------------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete own attachment (only allowed while PENDING; soft-friendly — S3 object retained for admin review)',
  })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete after review (APPROVED/REJECTED)',
  })
  @ApiResponse({ status: 403, description: 'Not owned by parent' })
  async remove(
    @CurrentParent() session: ParentSession,
    @Param('id') id: string,
  ) {
    await this.attachmentsService.deleteForParent(
      session.tenantId,
      session.parentId,
      id,
    );
  }
}
