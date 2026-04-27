/**
 * PaymentAttachmentsController — admin/staff routes
 *
 * Route prefix: /payment-attachments
 * Auth: JwtAuthGuard (global) + RolesGuard
 * Roles:
 *   - Read (GET):   OWNER, ADMIN, VIEWER
 *   - Mutate:       OWNER, ADMIN
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
import { PaymentAttachmentStatus } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { PaymentAttachmentsService } from './payment-attachments.service';
import { ReviewAttachmentDto } from './dto/review-attachment.dto';
import { LinkPaymentDto } from './dto/link-payment.dto';
import { RegisterAttachmentDto } from './dto/register-attachment.dto';

/** Inline admin-register DTO — extends RegisterAttachmentDto with parentId */
class AdminRegisterAttachmentDto extends RegisterAttachmentDto {
  parentId: string;
}

@ApiTags('Payment Attachments (Admin)')
@ApiBearerAuth()
@Controller('payment-attachments')
@UseGuards(RolesGuard)
export class PaymentAttachmentsController {
  private readonly logger = new Logger(PaymentAttachmentsController.name);

  constructor(private readonly attachmentsService: PaymentAttachmentsService) {}

  // ------------------------------------------------------------------
  // GET /payment-attachments  — list with filters (cap 200)
  // ------------------------------------------------------------------
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'List payment attachments with optional filters' })
  @ApiQuery({ name: 'paymentId', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PaymentAttachmentStatus })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiResponse({ status: 200, description: 'PaymentAttachmentResponseDto[]' })
  async list(
    @CurrentUser() user: IUser,
    @Query('paymentId') paymentId?: string,
    @Query('parentId') parentId?: string,
    @Query('status') status?: PaymentAttachmentStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attachmentsService.listForAdmin(getTenantId(user), {
      paymentId,
      parentId,
      status,
      from,
      to,
    });
  }

  // ------------------------------------------------------------------
  // GET /payment-attachments/pending  — review queue (cap 100)
  // ------------------------------------------------------------------
  @Get('pending')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'List PENDING attachments for review queue' })
  @ApiResponse({ status: 200, description: 'PaymentAttachmentResponseDto[]' })
  async pending(@CurrentUser() user: IUser) {
    return this.attachmentsService.listPendingForAdmin(getTenantId(user));
  }

  // ------------------------------------------------------------------
  // GET /payment-attachments/:id  — single detail
  // ------------------------------------------------------------------
  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get single attachment with all joins' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 200, description: 'PaymentAttachmentResponseDto' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getOne(@CurrentUser() user: IUser, @Param('id') id: string) {
    return this.attachmentsService.getForAdmin(getTenantId(user), id);
  }

  // ------------------------------------------------------------------
  // GET /payment-attachments/:id/download-url  — presigned (access-logged)
  // ------------------------------------------------------------------
  @Get(':id/download-url')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get presigned 5-min download URL (access-logged)' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 200, description: '{ url, expiresAt }' })
  async downloadUrl(@CurrentUser() user: IUser, @Param('id') id: string) {
    return this.attachmentsService.downloadUrlForAdmin(
      getTenantId(user),
      user.id,
      id,
    );
  }

  // ------------------------------------------------------------------
  // POST /payment-attachments/:id/review  — approve or reject
  // ------------------------------------------------------------------
  @Post(':id/review')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a PENDING attachment' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({
    status: 200,
    description: 'Updated PaymentAttachmentResponseDto',
  })
  @ApiResponse({ status: 400, description: 'Attachment not in PENDING state' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async review(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: ReviewAttachmentDto,
  ) {
    return this.attachmentsService.review(getTenantId(user), user.id, id, dto);
  }

  // ------------------------------------------------------------------
  // POST /payment-attachments/:id/link-payment  — link to a Payment
  // ------------------------------------------------------------------
  @Post(':id/link-payment')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an attachment to a Payment (idempotent)' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({
    status: 200,
    description: 'Updated PaymentAttachmentResponseDto',
  })
  @ApiResponse({ status: 404, description: 'Attachment or Payment not found' })
  async linkPayment(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: LinkPaymentDto,
  ) {
    return this.attachmentsService.linkPayment(
      getTenantId(user),
      user.id,
      id,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /payment-attachments/:id/link-payment  — unlink
  // ------------------------------------------------------------------
  @Delete(':id/link-payment')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink attachment from its current Payment' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({
    status: 200,
    description: 'Updated PaymentAttachmentResponseDto',
  })
  async unlinkPayment(@CurrentUser() user: IUser, @Param('id') id: string) {
    return this.attachmentsService.unlinkPayment(
      getTenantId(user),
      user.id,
      id,
    );
  }

  // ------------------------------------------------------------------
  // POST /payment-attachments  — admin upload on behalf of parent
  // ------------------------------------------------------------------
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin registers an attachment on behalf of a parent',
  })
  @ApiResponse({
    status: 201,
    description: 'Created PaymentAttachmentResponseDto',
  })
  async adminRegister(
    @CurrentUser() user: IUser,
    @Body() dto: AdminRegisterAttachmentDto,
  ) {
    const { parentId, ...rest } = dto;
    return this.attachmentsService.adminRegister(
      getTenantId(user),
      user.id,
      parentId,
      rest,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /payment-attachments/:id  — hard delete (admin only, deletes S3)
  // ------------------------------------------------------------------
  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete attachment and remove from S3' })
  @ApiParam({ name: 'id', description: 'PaymentAttachment ID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async adminDelete(@CurrentUser() user: IUser, @Param('id') id: string) {
    await this.attachmentsService.adminDelete(getTenantId(user), user.id, id);
  }
}
