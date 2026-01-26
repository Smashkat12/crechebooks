/**
 * Chart of Accounts Controller
 * TASK-ACCT-001: Chart of Accounts API
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
  NotFoundException,
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
import { ChartOfAccountService } from '../../database/services/chart-of-account.service';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from '../../database/dto/chart-of-account.dto';
import { AccountType } from '@prisma/client';

@ApiTags('Chart of Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChartOfAccountController {
  private readonly logger = new Logger(ChartOfAccountController.name);

  constructor(private readonly accountService: ChartOfAccountService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List accounts' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of accounts' })
  async list(
    @CurrentUser() user: IUser,
    @Query('type') type?: AccountType,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`List accounts: tenant=${tenantId}, type=${type}`);
    return this.accountService.findAll(tenantId, {
      type,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get account summary by type' })
  @ApiResponse({ status: 200, description: 'Account summary' })
  async getSummary(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    return this.accountService.getAccountSummary(tenantId);
  }

  @Get('education-exempt')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get education VAT exempt accounts (Section 12(h))',
  })
  @ApiResponse({ status: 200, description: 'Education exempt accounts' })
  async getEducationExempt(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    return this.accountService.findEducationExemptAccounts(tenantId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Account details' })
  async getById(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const account = await this.accountService.findById(tenantId, id);
    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }
    return account;
  }

  @Get('code/:code')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get account by code' })
  @ApiParam({ name: 'code', description: 'Account code' })
  @ApiResponse({ status: 200, description: 'Account details' })
  async getByCode(@CurrentUser() user: IUser, @Param('code') code: string) {
    const tenantId = getTenantId(user);
    const account = await this.accountService.findByCode(tenantId, code);
    if (!account) {
      throw new NotFoundException(`Account with code ${code} not found`);
    }
    return account;
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  async create(
    @CurrentUser() user: IUser,
    @Body() body: CreateChartOfAccountDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Create account: tenant=${tenantId}, code=${body.code}`);
    return this.accountService.create(tenantId, userId, body);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Account updated' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: UpdateChartOfAccountDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Update account: id=${id}, tenant=${tenantId}`);
    return this.accountService.update(tenantId, userId, id, body);
  }

  @Post('seed-defaults')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Seed default SA chart of accounts' })
  @ApiResponse({ status: 200, description: 'Defaults seeded' })
  async seedDefaults(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Seed default accounts: tenant=${tenantId}`);
    return this.accountService.seedDefaults(tenantId, userId);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Account deactivated' })
  async deactivate(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Deactivate account: id=${id}, tenant=${tenantId}`);
    return this.accountService.deactivate(tenantId, userId, id);
  }

  @Post(':id/reactivate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivate account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Account reactivated' })
  async reactivate(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Reactivate account: id=${id}, tenant=${tenantId}`);
    return this.accountService.reactivate(tenantId, userId, id);
  }
}
