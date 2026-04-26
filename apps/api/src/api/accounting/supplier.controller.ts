/**
 * Supplier Controller
 * TASK-ACCT-013: Supplier Management API
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
import { SupplierService } from '../../database/services/supplier.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateSupplierBillDto,
  RecordBillPaymentDto,
} from '../../database/dto/supplier.dto';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierController {
  private readonly logger = new Logger(SupplierController.name);

  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List suppliers' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of suppliers' })
  async list(
    @CurrentUser() user: IUser,
    @Query('is_active') isActive?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`List suppliers: tenant=${tenantId}`);
    const suppliers = await this.supplierService.listSuppliers(tenantId, {
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
    return { success: true, data: suppliers };
  }

  @Get('payables-summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get accounts payable summary' })
  @ApiResponse({ status: 200, description: 'Payables summary' })
  async getPayablesSummary(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    const summary = await this.supplierService.getPayablesSummary(tenantId);
    return { success: true, data: summary };
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  async getById(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    const supplier = await this.supplierService.getSupplierById(tenantId, id);
    return { success: true, data: supplier };
  }

  @Get(':id/statement')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get supplier statement' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiQuery({ name: 'from_date', required: true })
  @ApiQuery({ name: 'to_date', required: true })
  @ApiResponse({ status: 200, description: 'Supplier statement' })
  async getStatement(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Query('from_date') fromDate: string,
    @Query('to_date') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    const statement = await this.supplierService.getSupplierStatement(
      tenantId,
      id,
      new Date(fromDate),
      new Date(toDate),
    );
    return { success: true, data: statement };
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create supplier' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  async create(@CurrentUser() user: IUser, @Body() body: CreateSupplierDto) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Create supplier: tenant=${tenantId}, name=${body.name}`);
    const supplier = await this.supplierService.createSupplier(
      tenantId,
      userId,
      body,
    );
    return { success: true, data: supplier };
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update supplier' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() body: UpdateSupplierDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Update supplier: id=${id}, tenant=${tenantId}`);
    const supplier = await this.supplierService.updateSupplier(
      tenantId,
      userId,
      id,
      body,
    );
    return { success: true, data: supplier };
  }

  @Post(':id/bills')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create bill for supplier' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiResponse({ status: 201, description: 'Bill created' })
  async createBill(
    @CurrentUser() user: IUser,
    @Param('id') supplierId: string,
    @Body() body: CreateSupplierBillDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Create bill: supplier=${supplierId}, tenant=${tenantId}`);
    const billData = { ...body, supplierId };
    const bill = await this.supplierService.createBill(
      tenantId,
      userId,
      billData,
    );
    return { success: true, data: bill };
  }

  @Post('bills/:billId/payments')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record payment for bill' })
  @ApiParam({ name: 'billId', description: 'Bill ID' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  async recordPayment(
    @CurrentUser() user: IUser,
    @Param('billId') billId: string,
    @Body() body: RecordBillPaymentDto,
  ) {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Record bill payment: bill=${billId}, tenant=${tenantId}`);
    const payment = await this.supplierService.recordBillPayment(
      tenantId,
      userId,
      billId,
      body,
    );
    return { success: true, data: payment };
  }
}
