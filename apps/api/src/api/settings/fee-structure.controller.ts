/**
 * Fee Structure Controller
 * Manages fee structures for tenant billing configuration
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { FeeType } from '../../database/entities/fee-structure.entity';
import { FeeStructure } from '@prisma/client';

/**
 * Transform fee structure to snake_case response
 */
function toSnakeCase(fee: FeeStructure): Record<string, unknown> {
  return {
    id: fee.id,
    tenant_id: fee.tenantId,
    name: fee.name,
    description: fee.description,
    fee_type: fee.feeType,
    amount_cents: fee.amountCents,
    amount: fee.amountCents / 100,
    registration_fee_cents: fee.registrationFeeCents,
    registration_fee: fee.registrationFeeCents / 100,
    vat_inclusive: fee.vatInclusive,
    sibling_discount_percent: fee.siblingDiscountPercent,
    effective_from: fee.effectiveFrom,
    effective_to: fee.effectiveTo,
    is_active: fee.isActive,
    created_at: fee.createdAt,
    updated_at: fee.updatedAt,
  };
}

@ApiTags('Fee Structures')
@ApiBearerAuth()
@Controller('fee-structures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeeStructureController {
  private readonly logger = new Logger(FeeStructureController.name);

  constructor(private readonly feeStructureRepo: FeeStructureRepository) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all fee structures for tenant' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'feeType', required: false, enum: FeeType })
  @ApiResponse({ status: 200, description: 'List of fee structures' })
  async findAll(
    @CurrentUser() user: IUser,
    @Query('isActive') isActive?: string,
    @Query('feeType') feeType?: FeeType,
  ): Promise<{ fee_structures: Record<string, unknown>[]; total: number }> {
    this.logger.log(`List fee structures: tenant=${user.tenantId}`);

    const filter: { isActive?: boolean; feeType?: FeeType } = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (feeType) filter.feeType = feeType;

    const feeStructures = await this.feeStructureRepo.findByTenant(
      user.tenantId,
      filter,
    );

    return {
      fee_structures: feeStructures.map(toSnakeCase),
      total: feeStructures.length,
    };
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get fee structure by ID' })
  @ApiParam({ name: 'id', description: 'Fee Structure ID' })
  @ApiResponse({ status: 200, description: 'Fee structure details' })
  @ApiResponse({ status: 404, description: 'Fee structure not found' })
  async findOne(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    this.logger.log(`Get fee structure: id=${id}, tenant=${user.tenantId}`);

    const fee = await this.feeStructureRepo.findById(id);
    if (!fee || fee.tenantId !== user.tenantId) {
      throw new Error('Fee structure not found');
    }
    return toSnakeCase(fee);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create fee structure' })
  @ApiResponse({ status: 201, description: 'Fee structure created' })
  async create(
    @CurrentUser() user: IUser,
    @Body()
    body: {
      name: string;
      description?: string;
      fee_type: FeeType;
      amount: number;
      registration_fee?: number;
      vat_inclusive?: boolean;
      sibling_discount_percent?: number;
      effective_from: string;
      effective_to?: string;
    },
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    this.logger.log(
      `Create fee structure: tenant=${user.tenantId}, name=${body.name}`,
    );

    const fee = await this.feeStructureRepo.create({
      tenantId: user.tenantId,
      name: body.name,
      description: body.description,
      feeType: body.fee_type,
      amountCents: Math.round(body.amount * 100),
      registrationFeeCents: body.registration_fee
        ? Math.round(body.registration_fee * 100)
        : 0,
      vatInclusive: body.vat_inclusive ?? true,
      siblingDiscountPercent: body.sibling_discount_percent,
      effectiveFrom: new Date(body.effective_from),
      effectiveTo: body.effective_to ? new Date(body.effective_to) : undefined,
    });

    this.logger.log(`Fee structure created: id=${fee.id}`);

    return {
      success: true,
      data: toSnakeCase(fee),
    };
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update fee structure' })
  @ApiParam({ name: 'id', description: 'Fee Structure ID' })
  @ApiResponse({ status: 200, description: 'Fee structure updated' })
  @ApiResponse({ status: 404, description: 'Fee structure not found' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      fee_type?: FeeType;
      amount?: number;
      registration_fee?: number;
      vat_inclusive?: boolean;
      sibling_discount_percent?: number;
      effective_from?: string;
      effective_to?: string;
    },
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    this.logger.log(`Update fee structure: id=${id}, tenant=${user.tenantId}`);

    // Verify ownership
    const existing = await this.feeStructureRepo.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new Error('Fee structure not found');
    }

    const fee = await this.feeStructureRepo.update(id, {
      name: body.name,
      description: body.description,
      feeType: body.fee_type,
      amountCents:
        body.amount !== undefined ? Math.round(body.amount * 100) : undefined,
      registrationFeeCents:
        body.registration_fee !== undefined
          ? Math.round(body.registration_fee * 100)
          : undefined,
      vatInclusive: body.vat_inclusive,
      siblingDiscountPercent: body.sibling_discount_percent,
      effectiveFrom: body.effective_from
        ? new Date(body.effective_from)
        : undefined,
      effectiveTo: body.effective_to ? new Date(body.effective_to) : undefined,
    });

    return {
      success: true,
      data: toSnakeCase(fee),
    };
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate fee structure' })
  @ApiParam({ name: 'id', description: 'Fee Structure ID' })
  @ApiResponse({ status: 200, description: 'Fee structure deactivated' })
  @ApiResponse({ status: 404, description: 'Fee structure not found' })
  async deactivate(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Deactivate fee structure: id=${id}, tenant=${user.tenantId}`,
    );

    // Verify ownership
    const existing = await this.feeStructureRepo.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new Error('Fee structure not found');
    }

    await this.feeStructureRepo.deactivate(id);

    return { success: true };
  }
}
