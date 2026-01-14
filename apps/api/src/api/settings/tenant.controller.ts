import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { UpdateTenantDto } from '../../database/dto/tenant.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import type { Tenant } from '@prisma/client';

@Controller('tenants')
@ApiTags('Tenants')
@ApiBearerAuth('JWT-auth')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(private readonly tenantRepository: TenantRepository) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current tenant',
    description: 'Returns the tenant associated with the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getCurrentTenant(@CurrentUser() user: IUser): Promise<Tenant> {
    this.logger.debug(`Getting tenant for user ${user.id}`);
    return this.tenantRepository.findByIdOrThrow(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tenant by ID',
    description: 'Returns a specific tenant by ID (user must belong to tenant)',
  })
  @ApiParam({
    name: 'id',
    description: 'Tenant ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'User does not belong to this tenant',
  })
  async getTenant(
    @CurrentUser() user: IUser,
    @Param('id') tenantId: string,
  ): Promise<Tenant> {
    // Verify user belongs to this tenant
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    this.logger.debug(`Getting tenant ${tenantId}`);
    return this.tenantRepository.findByIdOrThrow(tenantId);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update tenant',
    description: 'Updates tenant information (organization details)',
  })
  @ApiParam({
    name: 'id',
    description: 'Tenant ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant updated successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'User does not belong to this tenant or lacks permission',
  })
  async updateTenant(
    @CurrentUser() user: IUser,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    // Verify user belongs to this tenant
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    // For now, allow any authenticated user to update their tenant
    // In production, you might want to check for OWNER/ADMIN role
    this.logger.debug(
      `Updating tenant ${tenantId}: ${JSON.stringify(dto)}`,
    );

    return this.tenantRepository.update(tenantId, dto);
  }
}
