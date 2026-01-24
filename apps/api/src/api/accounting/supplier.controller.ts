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
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of suppliers' })
  async list(
    @CurrentUser() user: IUser,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`List suppliers: tenant=${tenantId}`);
    return this.supplierService.listSuppliers(tenantId, {
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('payables-summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get accounts payable summary' })
  @ApiResponse({ status: 200, description: 'Payables summary' })
  async getPayablesSummary(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    return this.supplierService.getPayablesSummary(tenantId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  async getById(@CurrentUser() user: IUser, @Param('id') id: string) {
    const tenantId = getTenantId(user);
    return this.supplierService.getSupplierById(tenantId, id);
  }

  @Get(':id/statement')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get supplier statement' })
  @ApiParam({ name: 'id', description: 'Supplier ID' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: 'Supplier statement' })
  async getStatement(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    return this.supplierService.getSupplierStatement(
      tenantId,
      id,
      new Date(fromDate),
      new Date(toDate),
    );
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
    return this.supplierService.createSupplier(tenantId, userId, body);
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
    return this.supplierService.updateSupplier(tenantId, userId, id, body);
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
    // Service expects supplierId in the body, not as separate param
    const billData = { ...body, supplierId };
    return this.supplierService.createBill(tenantId, userId, billData);
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
    return this.supplierService.recordBillPayment(tenantId, userId, billId, body);
  }
}
