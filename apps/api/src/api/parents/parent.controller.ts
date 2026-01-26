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
import { ParentRepository } from '../../database/repositories/parent.repository';
import {
  CreateParentDto,
  UpdateParentDto,
  ParentFilterDto,
} from '../../database/dto/parent.dto';
import { Parent } from '@prisma/client';
import { XeroSyncService } from '../../database/services/xero-sync.service';
import { MagicLinkService } from '../auth/services/magic-link.service';

/**
 * Transform parent to camelCase response matching IParent interface
 */
function toResponse(
  parent: Parent & { children?: unknown[] },
): Record<string, unknown> {
  return {
    id: parent.id,
    tenantId: parent.tenantId,
    firstName: parent.firstName,
    lastName: parent.lastName,
    email: parent.email,
    phone: parent.phone,
    whatsapp: parent.whatsapp,
    idNumber: parent.idNumber,
    address: parent.address,
    preferredCommunication: parent.preferredContact || 'EMAIL',
    // TASK-WA-004: WhatsApp opt-in consent (POPIA compliant)
    whatsappOptIn: parent.whatsappOptIn ?? false,
    isActive: parent.isActive,
    children: parent.children || [],
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt,
  };
}

@ApiTags('Parents')
@ApiBearerAuth()
@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentController {
  private readonly logger = new Logger(ParentController.name);

  constructor(
    private readonly parentRepository: ParentRepository,
    private readonly xeroSyncService: XeroSyncService,
    private readonly magicLinkService: MagicLinkService,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all parents for tenant' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of parents' })
  async findAll(
    @CurrentUser() user: IUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    parents: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    // TASK-DATA-004: Pass pagination to repository for efficient querying
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const filter: ParentFilterDto = {
      page: pageNum,
      limit: limitNum,
    };
    if (search) filter.search = search;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const result = await this.parentRepository.findByTenant(
      getTenantId(user),
      filter,
    );

    return {
      parents: result.data.map(toResponse),
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
      hasNext: result.meta.hasNext,
      hasPrev: result.meta.hasPrev,
    };
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
    const parent = await this.parentRepository.findById(id, getTenantId(user));
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }
    return toResponse(parent);
  }

  @Get(':id/children')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get children for a parent' })
  @ApiParam({ name: 'id', description: 'Parent ID' })
  @ApiResponse({ status: 200, description: 'List of children' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async findChildren(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>[]> {
    const parent = await this.parentRepository.findById(id, getTenantId(user));
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }
    // Transform children to camelCase response
    const children =
      (parent as Parent & { children?: Array<Record<string, unknown>> })
        .children || [];
    return children.map((child) => ({
      id: child.id,
      parentId: child.parentId,
      firstName: child.firstName,
      lastName: child.lastName,
      dateOfBirth: child.dateOfBirth,
      gender: child.gender,
      allergies: child.allergies,
      medicalNotes: child.medicalNotes,
      status: child.status || 'ACTIVE',
      createdAt: child.createdAt,
      updatedAt: child.updatedAt,
    }));
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
      tenantId: getTenantId(user),
    });

    // TASK-XERO-004: Auto-sync to Xero as contact if connected
    // Fire-and-forget - don't block parent creation on Xero sync
    this.syncToXero(getTenantId(user), parent).catch((error) => {
      this.logger.warn(
        `Failed to auto-sync parent ${parent.id} to Xero: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    return toResponse(parent);
  }

  /**
   * Auto-sync parent to Xero as a contact
   * Called asynchronously after parent creation
   */
  private async syncToXero(tenantId: string, parent: Parent): Promise<void> {
    try {
      // Check if Xero is connected for this tenant
      const isConnected =
        await this.xeroSyncService.hasValidConnection(tenantId);
      if (!isConnected) {
        this.logger.debug(
          `Xero not connected for tenant ${tenantId}, skipping auto-sync`,
        );
        return;
      }

      // Create contact in Xero
      const xeroContactId = await this.xeroSyncService.createContactForParent(
        tenantId,
        {
          id: parent.id,
          firstName: parent.firstName,
          lastName: parent.lastName,
          email: parent.email,
          phone: parent.phone,
        },
      );

      if (xeroContactId) {
        this.logger.log(
          `Parent ${parent.id} auto-synced to Xero contact ${xeroContactId}`,
        );
      }
    } catch (error) {
      // Log but don't throw - parent creation should succeed even if Xero sync fails
      this.logger.error(
        `Failed to sync parent ${parent.id} to Xero`,
        error instanceof Error ? error.stack : String(error),
      );
    }
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
    const existing = await this.parentRepository.findById(
      id,
      getTenantId(user),
    );
    if (!existing) {
      throw new NotFoundException('Parent not found');
    }
    const parent = await this.parentRepository.update(
      id,
      getTenantId(user),
      dto,
    );
    return toResponse(parent);
  }

  @Post(':id/send-onboarding-invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send onboarding invite email with magic link to parent' })
  @ApiParam({ name: 'id', description: 'Parent ID' })
  @ApiResponse({ status: 200, description: 'Onboarding invite sent' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @ApiResponse({ status: 400, description: 'Parent has no email address' })
  async sendOnboardingInvite(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    const parent = await this.parentRepository.findById(id, getTenantId(user));
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    if (!parent.email) {
      throw new BadRequestException(
        'Parent does not have an email address. Please update their profile first.',
      );
    }

    await this.magicLinkService.generateMagicLink(parent.email);

    return {
      success: true,
      message: `Onboarding invite sent to ${parent.email}`,
    };
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
    const existing = await this.parentRepository.findById(
      id,
      getTenantId(user),
    );
    if (!existing) {
      throw new NotFoundException('Parent not found');
    }
    await this.parentRepository.delete(id, getTenantId(user));
  }
}
