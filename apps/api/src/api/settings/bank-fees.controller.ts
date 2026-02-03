/**
 * TASK-FIX-005: Bank Fee Configuration Controller
 * API endpoints for managing bank fee configurations per tenant
 */
import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { UserRole } from '@prisma/client';
import {
  BankFeeService,
  SouthAfricanBank,
} from '../../database/services/bank-fee.service';
import { UpdateBankFeeConfigDto, ApplyBankPresetDto } from './dto/bank-fee.dto';

@Controller('settings/bank-fees')
@ApiTags('Bank Fee Configuration')
@ApiBearerAuth('JWT-auth')
export class BankFeesController {
  private readonly logger = new Logger(BankFeesController.name);

  constructor(private readonly bankFeeService: BankFeeService) {}

  @Get()
  @ApiOperation({
    summary: 'Get bank fee configuration',
    description: 'Returns the bank fee configuration for the current tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank fee configuration retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getConfiguration(@CurrentUser() user: IUser) {
    this.logger.debug(
      `Getting bank fee configuration for tenant ${getTenantId(user)}`,
    );
    const config = await this.bankFeeService.getConfiguration(
      getTenantId(user),
    );
    return {
      success: true,
      data: config,
    };
  }

  @Get('banks')
  @ApiOperation({
    summary: 'Get supported banks',
    description: 'Returns the list of supported South African banks',
  })
  @ApiResponse({
    status: 200,
    description: 'Supported banks retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getSupportedBanks() {
    return {
      success: true,
      data: this.bankFeeService.getSupportedBanks(),
    };
  }

  @Get('banks/:bankCode/defaults')
  @ApiOperation({
    summary: 'Get default fee rules for a bank',
    description: 'Returns the default fee rules for a specific bank',
  })
  @ApiParam({
    name: 'bankCode',
    description: 'Bank code (e.g., FNB, STANDARD_BANK)',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Default fee rules retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getBankDefaults(@Param('bankCode') bankCode: string) {
    this.logger.debug(`Getting default fee rules for bank ${bankCode}`);
    return {
      success: true,
      data: this.bankFeeService.getDefaultFeeRules(bankCode),
    };
  }

  @Put()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update bank fee configuration',
    description:
      'Updates the bank fee configuration for the current tenant. Requires OWNER or ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank fee configuration updated successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'User lacks required role (OWNER/ADMIN)',
  })
  async updateConfiguration(
    @CurrentUser() user: IUser,
    @Body() dto: UpdateBankFeeConfigDto,
  ) {
    this.logger.log(
      `Updating bank fee configuration for tenant ${getTenantId(user)}`,
    );
    const config = await this.bankFeeService.saveConfiguration(
      getTenantId(user),
      dto,
    );
    return {
      success: true,
      data: config,
    };
  }

  @Post('apply-preset')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Apply bank preset',
    description:
      'Applies the default fee rules for a specific bank. Requires OWNER or ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank preset applied successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'User lacks required role (OWNER/ADMIN)',
  })
  async applyPreset(
    @CurrentUser() user: IUser,
    @Body() dto: ApplyBankPresetDto,
  ) {
    this.logger.log(
      `Applying bank preset ${dto.bankCode} for tenant ${getTenantId(user)}`,
    );
    const config = await this.bankFeeService.applyBankPreset(
      getTenantId(user),
      dto.bankCode as SouthAfricanBank,
    );
    return {
      success: true,
      data: config,
    };
  }
}
