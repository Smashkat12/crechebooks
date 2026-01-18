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
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { UserRole, type Tenant } from '@prisma/client';

/**
 * Serializable tenant response type with BigInt converted to string
 */
type SerializedTenant = Omit<Tenant, 'cumulativeTurnoverCents'> & {
  cumulativeTurnoverCents: string;
};

/**
 * Transform tenant with BigInt fields to JSON-serializable format
 * BigInt cannot be serialized by JSON.stringify, so we convert to string
 */
function serializeTenant(tenant: Tenant): SerializedTenant {
  return {
    ...tenant,
    cumulativeTurnoverCents: tenant.cumulativeTurnoverCents.toString(),
  };
}

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
  async getCurrentTenant(
    @CurrentUser() user: IUser,
  ): Promise<SerializedTenant> {
    this.logger.debug(`Getting tenant for user ${user.id}`);
    const tenant = await this.tenantRepository.findByIdOrThrow(user.tenantId);
    return serializeTenant(tenant);
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
  ): Promise<SerializedTenant> {
    // Verify user belongs to this tenant
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    this.logger.debug(`Getting tenant ${tenantId}`);
    const tenant = await this.tenantRepository.findByIdOrThrow(tenantId);
    return serializeTenant(tenant);
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update tenant',
    description:
      'Updates tenant information (organization details). Requires OWNER or ADMIN role.',
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
    description:
      'User does not belong to this tenant or lacks required role (OWNER/ADMIN)',
  })
  async updateTenant(
    @CurrentUser() user: IUser,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<SerializedTenant> {
    // Verify user belongs to this tenant (tenant isolation check)
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    this.logger.debug(`Updating tenant ${tenantId}: ${JSON.stringify(dto)}`);
    const tenant = await this.tenantRepository.update(tenantId, dto);
    return serializeTenant(tenant);
  }
}
