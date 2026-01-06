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
  NotFoundException,
  BadRequestException,
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
import { StaffRepository } from '../../database/repositories/staff.repository';
import {
  UpdateStaffDto,
  StaffFilterDto,
} from '../../database/dto/staff.dto';
import {
  EmploymentType,
  PayFrequency,
} from '../../database/entities/staff.entity';
import { Staff } from '@prisma/client';
import { ApiCreateStaffDto } from './dto';

/**
 * Transform staff to snake_case response
 */
function toSnakeCase(staff: Staff): Record<string, unknown> {
  return {
    id: staff.id,
    tenant_id: staff.tenantId,
    employee_number: staff.employeeNumber,
    first_name: staff.firstName,
    last_name: staff.lastName,
    id_number: staff.idNumber,
    tax_number: staff.taxNumber,
    email: staff.email,
    phone: staff.phone,
    date_of_birth: staff.dateOfBirth,
    start_date: staff.startDate,
    end_date: staff.endDate,
    employment_type: staff.employmentType,
    pay_frequency: staff.payFrequency,
    basic_salary_cents: staff.basicSalaryCents,
    bank_name: staff.bankName,
    bank_account: staff.bankAccount,
    bank_branch_code: staff.bankBranchCode,
    medical_aid_members: staff.medicalAidMembers,
    is_active: staff.isActive,
    created_at: staff.createdAt,
    updated_at: staff.updatedAt,
  };
}

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staffRepository: StaffRepository) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all staff for tenant' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, ID number, or employee number',
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'employmentType', required: false, enum: EmploymentType })
  @ApiQuery({ name: 'payFrequency', required: false, enum: PayFrequency })
  @ApiResponse({ status: 200, description: 'List of staff members' })
  async findAll(
    @CurrentUser() user: IUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('employmentType') employmentType?: EmploymentType,
    @Query('payFrequency') payFrequency?: PayFrequency,
  ): Promise<{
    staff: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter: StaffFilterDto = {};
    if (search) filter.search = search;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (employmentType) filter.employmentType = employmentType;
    if (payFrequency) filter.payFrequency = payFrequency;

    const staffMembers = await this.staffRepository.findByTenantId(
      user.tenantId,
      filter,
    );
    return {
      staff: staffMembers.map(toSnakeCase),
      total: staffMembers.length,
      page: 1,
      limit: staffMembers.length,
    };
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'Staff member details' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async findOne(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const staff = await this.staffRepository.findById(id);
    if (!staff || staff.tenantId !== user.tenantId) {
      throw new NotFoundException('Staff member not found');
    }
    return toSnakeCase(staff);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new staff member' })
  @ApiResponse({ status: 201, description: 'Staff member created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(
    @CurrentUser() user: IUser,
    @Body() dto: ApiCreateStaffDto,
  ): Promise<Record<string, unknown>> {
    try {
      // Transform API snake_case to service camelCase
      // Note: isActive defaults to true in Prisma schema, no need to pass explicitly
      const staff = await this.staffRepository.create({
        tenantId: user.tenantId,
        employeeNumber: dto.employee_number,
        firstName: dto.first_name,
        lastName: dto.last_name,
        idNumber: dto.id_number,
        taxNumber: dto.tax_number,
        dateOfBirth: new Date(dto.date_of_birth),
        startDate: new Date(dto.start_date),
        endDate: dto.end_date ? new Date(dto.end_date) : undefined,
        employmentType: EmploymentType.PERMANENT, // Default to PERMANENT
        payFrequency: PayFrequency.MONTHLY, // Default to MONTHLY
        basicSalaryCents: dto.salary,
        bankAccount: dto.bank_account_number,
        bankBranchCode: dto.bank_branch_code,
      });
      return toSnakeCase(staff);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a staff member' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'Staff member updated' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<Record<string, unknown>> {
    // Verify staff belongs to tenant
    const existing = await this.staffRepository.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException('Staff member not found');
    }
    const staff = await this.staffRepository.update(id, dto);
    return toSnakeCase(staff);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a staff member' })
  @ApiParam({ name: 'id', description: 'Staff ID' })
  @ApiResponse({ status: 204, description: 'Staff member deactivated' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async delete(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<void> {
    // Verify staff belongs to tenant
    const existing = await this.staffRepository.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException('Staff member not found');
    }
    // Use deactivate instead of hard delete to preserve payroll history
    await this.staffRepository.deactivate(id);
  }
}
