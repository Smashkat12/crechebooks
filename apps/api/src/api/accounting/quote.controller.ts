/**
 * Quote Controller
 * TASK-ACCT-012: Quotes System API
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { QuoteService } from '../../database/services/quote.service';
import { CreateQuoteDto, UpdateQuoteDto } from '../../database/dto/quote.dto';
import { QuoteStatus } from '@prisma/client';

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuoteController {
  private readonly logger = new Logger(QuoteController.name);

  constructor(private readonly quoteService: QuoteService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List quotes' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'DRAFT',
      'SENT',
      'VIEWED',
      'ACCEPTED',
      'DECLINED',
      'EXPIRED',
      'CONVERTED',
    ],
  })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'recipientEmail', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of quotes' })
  async list(
    @CurrentUser() user: IUser,
    @Query('status') status?: QuoteStatus,
    @Query('parentId') parentId?: string,
    @Query('recipientEmail') recipientEmail?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`List quotes: tenant=${tenantId}, status=${status}`);

    return this.quoteService.listQuotes(tenantId, {
      status,
      parentId,
      recipientEmail,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get quotes summary' })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiResponse({ status: 200, description: 'Quotes summary' })
  async getSummary(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const tenantId = getTenantId(user);
    return this.quoteService.getQuoteSummary(
      tenantId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get quote by ID' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote details' })
  @ApiResponse({ status: 404, description: 'Quote not found' })
  async getById(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.getQuoteById(tenantId, id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create quote' })
  @ApiResponse({ status: 201, description: 'Quote created' })
  async create(@CurrentUser() user: IUser, @Body() body: CreateQuoteDto) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(
      `Create quote: tenant=${tenantId}, recipient=${body.recipientEmail}`,
    );
    return this.quoteService.createQuote(tenantId, userId, body);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update quote' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote updated' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: UpdateQuoteDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Update quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.updateQuote(tenantId, userId, id, body);
  }

  @Post(':id/send')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Send quote to recipient' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote sent' })
  async send(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Send quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.sendQuote(tenantId, userId, id);
  }

  @Post(':id/accept')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark quote as accepted' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote accepted' })
  async accept(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    this.logger.log(`Accept quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.acceptQuote(tenantId, id);
  }

  @Post(':id/decline')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark quote as declined' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote declined' })
  async decline(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Decline quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.declineQuote(tenantId, id, body.reason);
  }

  @Post(':id/convert')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Convert accepted quote (creates parent record)' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'Quote converted' })
  async convert(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: { dueDate?: string; notes?: string },
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Convert quote: id=${id}, tenant=${tenantId}`);
    return this.quoteService.convertToInvoice(
      tenantId,
      userId,
      id,
      body.dueDate ? new Date(body.dueDate) : undefined,
      body.notes,
    );
  }
}
