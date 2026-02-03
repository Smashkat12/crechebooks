/**
 * TASK-QUOTE-002: Quote Public Acceptance Portal
 * Public endpoints for quote recipients to view, accept, or decline quotes
 *
 * NO AUTHENTICATION REQUIRED - Access controlled by viewToken (UUID)
 *
 * @module api/public/quotes
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators';
import { QuoteService } from '../../../database/services/quote.service';
import {
  AcceptQuoteDto,
  DeclineQuoteDto,
  PublicQuoteResponse,
  AcceptQuoteResponse,
  DeclineQuoteResponse,
} from './dto/quote-action.dto';

/**
 * Public endpoints for quote recipients
 * NO AUTHENTICATION REQUIRED - Access controlled by viewToken
 */
@ApiTags('Public - Quotes')
@Controller('public/quotes')
export class PublicQuoteController {
  private readonly logger = new Logger(PublicQuoteController.name);

  constructor(private readonly quoteService: QuoteService) {}

  /**
   * View quote by token (public access)
   * Marks as VIEWED if currently SENT
   */
  @Public()
  @Get(':token')
  @RateLimit({
    limit: 30,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:public:quote:view',
  })
  @ApiOperation({ summary: 'View quote by token (public access)' })
  @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
  @ApiResponse({ status: 200, description: 'Quote details for recipient' })
  @ApiResponse({ status: 404, description: 'Quote not found or expired' })
  async getQuoteByToken(
    @Param('token', new ParseUUIDPipe({ version: '4' })) token: string,
  ): Promise<PublicQuoteResponse> {
    this.logger.log(`Public quote view: token=${token.substring(0, 8)}...`);
    return this.quoteService.getQuoteByViewTokenPublic(token);
  }

  /**
   * Accept quote (public access)
   * Marks quote as ACCEPTED and logs the acceptance
   */
  @Public()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:public:quote:accept',
  })
  @ApiOperation({ summary: 'Accept quote (public access)' })
  @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
  @ApiResponse({ status: 200, description: 'Quote accepted' })
  @ApiResponse({ status: 400, description: 'Quote cannot be accepted' })
  @ApiResponse({ status: 404, description: 'Quote not found' })
  async acceptQuote(
    @Param('token', new ParseUUIDPipe({ version: '4' })) token: string,
    @Body() body: AcceptQuoteDto,
  ): Promise<AcceptQuoteResponse> {
    this.logger.log(`Public quote accept: token=${token.substring(0, 8)}...`);
    return this.quoteService.acceptQuoteByToken(token, body.confirmedBy);
  }

  /**
   * Decline quote (public access)
   * Marks quote as DECLINED with optional reason
   */
  @Public()
  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: 5,
    windowSeconds: 300,
    keyPrefix: 'ratelimit:public:quote:decline',
  })
  @ApiOperation({ summary: 'Decline quote (public access)' })
  @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
  @ApiResponse({ status: 200, description: 'Quote declined' })
  @ApiResponse({ status: 400, description: 'Quote cannot be declined' })
  @ApiResponse({ status: 404, description: 'Quote not found' })
  async declineQuote(
    @Param('token', new ParseUUIDPipe({ version: '4' })) token: string,
    @Body() body: DeclineQuoteDto,
  ): Promise<DeclineQuoteResponse> {
    this.logger.log(`Public quote decline: token=${token.substring(0, 8)}...`);
    return this.quoteService.declineQuoteByToken(token, body.reason);
  }
}
