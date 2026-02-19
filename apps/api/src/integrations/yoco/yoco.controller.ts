/**
 * Yoco Payment Gateway Controller
 * TASK-ACCT-011: Online Payment Gateway Integration
 *
 * Public endpoints for payment link checkout flow.
 * Parents access these via short link from WhatsApp (no JWT required).
 */

import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../api/auth/decorators/public.decorator';
import { YocoService } from './yoco.service';

@Controller('yoco')
@ApiTags('Yoco Payments')
@Public()
export class YocoController {
  private readonly logger = new Logger(YocoController.name);

  constructor(private readonly yocoService: YocoService) {}

  /**
   * Get payment link details by short code
   * Used by the frontend checkout page to display payment info.
   */
  @Get('pay/:shortCode')
  @ApiOperation({ summary: 'Get payment link details by short code' })
  @ApiResponse({ status: 200, description: 'Payment link details' })
  @ApiResponse({ status: 404, description: 'Payment link not found' })
  async getPaymentLink(@Param('shortCode') shortCode: string) {
    const link = await this.yocoService.getPaymentLinkByShortCode(shortCode);

    if (!link) {
      throw new NotFoundException('Payment link not found');
    }

    const isExpired = link.expiresAt ? link.expiresAt < new Date() : false;

    return {
      shortCode: link.shortCode,
      amountCents: link.amountCents,
      description: link.description,
      status: isExpired && link.status === 'ACTIVE' ? 'EXPIRED' : link.status,
      expiresAt: link.expiresAt,
      parentName: `${link.parent.firstName} ${link.parent.lastName}`,
      invoiceNumber: link.invoice?.invoiceNumber || null,
      tenantName: (link as any).tenant?.name || null,
    };
  }

  /**
   * Initiate Yoco checkout for a payment link
   * Validates the link is active and not expired, then creates a Yoco checkout session.
   */
  @Post('pay/:shortCode/checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate Yoco checkout for a payment link' })
  @ApiResponse({ status: 200, description: 'Checkout URL returned' })
  @ApiResponse({ status: 400, description: 'Payment link expired or inactive' })
  @ApiResponse({ status: 404, description: 'Payment link not found' })
  async initiateCheckout(@Param('shortCode') shortCode: string) {
    const link = await this.yocoService.getPaymentLinkByShortCode(shortCode);

    if (!link) {
      throw new NotFoundException('Payment link not found');
    }

    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Payment link is ${link.status.toLowerCase()}`,
      );
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('Payment link has expired');
    }

    const result = await this.yocoService.initiateCheckout(link.id);

    this.logger.log(
      `Checkout initiated for payment link ${shortCode} → ${result.gatewayId}`,
    );

    return { checkoutUrl: result.checkoutUrl };
  }
}
