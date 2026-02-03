/**
 * Payroll Controller
 * Handles payroll processing via SimplePay integration
 */

import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { getTenantId } from '../auth/utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import {
  PayrollProcessingService,
  ProcessPayrollResult,
} from '../../database/services/payroll-processing.service';

class ProcessPayrollDto {
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2020)
  year: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffIds?: string[];
}

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  private readonly logger = new Logger(PayrollController.name);

  constructor(
    private readonly payrollProcessingService: PayrollProcessingService,
  ) {}

  @Post('process')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Process payroll via SimplePay',
    description:
      'Initiates payroll processing on SimplePay, fetches results, stores locally, and creates Xero journals. ' +
      'Requires SimplePay to be connected. Xero journals are created if Xero is connected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        count: { type: 'number', description: 'Number of payrolls processed' },
        payrollIds: { type: 'array', items: { type: 'string' } },
        simplePayPayRunId: { type: 'string' },
        xeroJournalIds: { type: 'array', items: { type: 'string' } },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              staffId: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'SimplePay not connected or no staff to process',
  })
  async processPayroll(
    @CurrentUser() user: IUser,
    @Body() dto: ProcessPayrollDto,
  ): Promise<ProcessPayrollResult> {
    const tenantId = getTenantId(user);

    this.logger.log(
      `Processing payroll for tenant ${tenantId}: ${dto.month}/${dto.year}`,
    );

    return this.payrollProcessingService.processPayroll({
      tenantId,
      month: dto.month,
      year: dto.year,
      staffIds: dto.staffIds,
    });
  }
}
