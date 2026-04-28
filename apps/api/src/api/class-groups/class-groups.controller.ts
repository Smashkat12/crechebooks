import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { ClassGroupsService } from './class-groups.service';
import { CreateClassGroupDto } from './dto/create-class-group.dto';
import { UpdateClassGroupDto } from './dto/update-class-group.dto';
import { AssignChildrenDto } from './dto/assign-children.dto';

@ApiTags('Class Groups')
@ApiBearerAuth()
@Controller('class-groups')
@UseGuards(RolesGuard)
export class ClassGroupsController {
  private readonly logger = new Logger(ClassGroupsController.name);

  constructor(private readonly classGroupsService: ClassGroupsService) {}

  // ------------------------------------------------------------------
  // GET /class-groups
  // ------------------------------------------------------------------
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List class groups for tenant' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include inactive groups (default: false)',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of class groups with child counts',
  })
  async findAll(
    @CurrentUser() user: IUser,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.classGroupsService.findAll(getTenantId(user), includeInactive);
  }

  // ------------------------------------------------------------------
  // GET /class-groups/:id
  // ------------------------------------------------------------------
  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a single class group with child count' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiResponse({ status: 200, description: 'ClassGroup details' })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  async findOne(@CurrentUser() user: IUser, @Param('id') id: string) {
    return this.classGroupsService.findOne(getTenantId(user), id);
  }

  // ------------------------------------------------------------------
  // POST /class-groups
  // ------------------------------------------------------------------
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a class group' })
  @ApiResponse({ status: 201, description: 'ClassGroup created' })
  @ApiResponse({ status: 409, description: 'Name already used in this tenant' })
  async create(@CurrentUser() user: IUser, @Body() dto: CreateClassGroupDto) {
    return this.classGroupsService.create(getTenantId(user), user.id, dto);
  }

  // ------------------------------------------------------------------
  // PATCH /class-groups/:id
  // ------------------------------------------------------------------
  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a class group (partial)' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiResponse({ status: 200, description: 'ClassGroup updated' })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  @ApiResponse({ status: 409, description: 'Name conflict' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: UpdateClassGroupDto,
  ) {
    return this.classGroupsService.update(getTenantId(user), id, user.id, dto);
  }

  // ------------------------------------------------------------------
  // DELETE /class-groups/:id
  // ------------------------------------------------------------------
  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a class group' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiResponse({ status: 204, description: 'ClassGroup soft-deleted' })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  async remove(@CurrentUser() user: IUser, @Param('id') id: string) {
    await this.classGroupsService.remove(getTenantId(user), id, user.id);
  }

  // ------------------------------------------------------------------
  // POST /class-groups/:id/children  (bulk assign)
  // ------------------------------------------------------------------
  @Post(':id/children')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-assign children to a class group' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiResponse({
    status: 200,
    description: 'Children assigned; returns { assigned: N }',
  })
  @ApiResponse({
    status: 400,
    description: 'One or more childIds not in tenant',
  })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  async assignChildren(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: AssignChildrenDto,
  ) {
    return this.classGroupsService.assignChildren(
      getTenantId(user),
      id,
      dto.childIds,
      user.id,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /class-groups/:id/children/:childId  (unassign single)
  // ------------------------------------------------------------------
  @Delete(':id/children/:childId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unassign a child from a class group' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 204, description: 'Child unassigned' })
  @ApiResponse({
    status: 404,
    description: 'ClassGroup or Child not found in group',
  })
  async unassignChild(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Param('childId') childId: string,
  ) {
    await this.classGroupsService.unassignChild(
      getTenantId(user),
      id,
      childId,
      user.id,
    );
  }

  // ------------------------------------------------------------------
  // GET /class-groups/:id/children
  // ------------------------------------------------------------------
  @Get(':id/children')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List children assigned to a class group' })
  @ApiParam({ name: 'id', description: 'ClassGroup ID' })
  @ApiResponse({ status: 200, description: 'Array of children in this group' })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  async findChildren(@CurrentUser() user: IUser, @Param('id') id: string) {
    return this.classGroupsService.findChildren(getTenantId(user), id);
  }
}
