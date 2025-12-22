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
import { ParentRepository } from '../../database/repositories/parent.repository';
import {
  CreateParentDto,
  UpdateParentDto,
  ParentFilterDto,
} from '../../database/dto/parent.dto';
import { Parent } from '@prisma/client';

/**
 * Transform parent to snake_case response
 */
function toSnakeCase(parent: Parent): Record<string, unknown> {
  return {
    id: parent.id,
    tenant_id: parent.tenantId,
    first_name: parent.firstName,
    last_name: parent.lastName,
    email: parent.email,
    phone: parent.phone,
    id_number: parent.idNumber,
    address: parent.address,
    is_active: parent.isActive,
    created_at: parent.createdAt,
    updated_at: parent.updatedAt,
  };
}

@ApiTags('Parents')
@ApiBearerAuth()
@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentController {
  constructor(private readonly parentRepository: ParentRepository) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all parents for tenant' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of parents' })
  async findAll(
    @CurrentUser() user: IUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ): Promise<Record<string, unknown>[]> {
    const filter: ParentFilterDto = {};
    if (search) filter.search = search;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const parents = await this.parentRepository.findByTenant(
      user.tenantId,
      filter,
    );
    return parents.map(toSnakeCase);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get parent by ID' })
  @ApiParam({ name: 'id', description: 'Parent ID' })
  @ApiResponse({ status: 200, description: 'Parent details' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async findOne(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const parent = await this.parentRepository.findById(id);
    if (!parent || parent.tenantId !== user.tenantId) {
      throw new Error('Parent not found');
    }
    return toSnakeCase(parent);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new parent' })
  @ApiResponse({ status: 201, description: 'Parent created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(
    @CurrentUser() user: IUser,
    @Body() dto: Omit<CreateParentDto, 'tenantId'>,
  ): Promise<Record<string, unknown>> {
    const parent = await this.parentRepository.create({
      ...dto,
      tenantId: user.tenantId,
    });
    return toSnakeCase(parent);
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a parent' })
  @ApiParam({ name: 'id', description: 'Parent ID' })
  @ApiResponse({ status: 200, description: 'Parent updated' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: UpdateParentDto,
  ): Promise<Record<string, unknown>> {
    // Verify parent belongs to tenant
    const existing = await this.parentRepository.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new Error('Parent not found');
    }
    const parent = await this.parentRepository.update(id, dto);
    return toSnakeCase(parent);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a parent' })
  @ApiParam({ name: 'id', description: 'Parent ID' })
  @ApiResponse({ status: 204, description: 'Parent deleted' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async delete(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<void> {
    // Verify parent belongs to tenant
    const existing = await this.parentRepository.findById(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new Error('Parent not found');
    }
    await this.parentRepository.delete(id);
  }
}
