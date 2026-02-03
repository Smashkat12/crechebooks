/**
 * Payroll Processing Service
 * Orchestrates payroll processing via SimplePay and Xero
 *
 * Flow:
 * 1. Check SimplePay connection
 * 2. Process pay run on SimplePay
 * 3. Sync payroll data to local database
 * 4. Create Xero journals (if connected)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimplePayPayRunService } from '../../integrations/simplepay/simplepay-payrun.service';
import { SimplePayConnectionService } from '../../integrations/simplepay/simplepay-connection.service';
import { XeroPayrollJournalService } from './xero-payroll-journal.service';
import { PayrollStatus } from '@prisma/client';
import { BusinessException } from '../../shared/exceptions';

export interface ProcessPayrollParams {
  tenantId: string;
  month: number;
  year: number;
  staffIds?: string[]; // Optional: specific staff to include
}

export interface ProcessPayrollResult {
  success: boolean;
  count: number;
  payrollIds: string[];
  simplePayPayRunId?: string;
  xeroJournalIds?: string[];
  errors?: Array<{ staffId: string; error: string }>;
}

@Injectable()
export class PayrollProcessingService {
  private readonly logger = new Logger(PayrollProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly simplePayConnection: SimplePayConnectionService,
    private readonly simplePayPayRun: SimplePayPayRunService,
    private readonly xeroJournalService: XeroPayrollJournalService,
  ) {}

  /**
   * Process monthly payroll via SimplePay
   */
  async processPayroll(
    params: ProcessPayrollParams,
  ): Promise<ProcessPayrollResult> {
    const { tenantId, month, year, staffIds } = params;

    // 1. Check SimplePay connection
    const connectionStatus =
      await this.simplePayConnection.getConnectionStatus(tenantId);
    if (!connectionStatus.isConnected) {
      throw new BusinessException(
        'SimplePay is not connected. Please connect SimplePay in Settings -> Integrations before processing payroll.',
        'SIMPLEPAY_NOT_CONNECTED',
        { tenantId },
      );
    }

    // 2. Get staff to process (only active staff with SimplePay mapping)
    const staffQuery = {
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        ...(staffIds && staffIds.length > 0 ? { id: { in: staffIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        basicSalaryCents: true,
        simplePayMapping: {
          select: {
            simplePayEmployeeId: true,
          },
        },
      },
    };
    const staffList = await this.prisma.staff.findMany(staffQuery);

    if (staffList.length === 0) {
      throw new BusinessException(
        'No active staff found to process payroll',
        'NO_STAFF_FOUND',
        { tenantId },
      );
    }

    // Filter staff that have SimplePay mapping
    const staffWithSimplePay = staffList.filter((s) => s.simplePayMapping);
    if (staffWithSimplePay.length === 0) {
      throw new BusinessException(
        'No staff are synced to SimplePay. Please sync employees first via Settings -> Integrations -> SimplePay.',
        'NO_SIMPLEPAY_MAPPING',
        { tenantId },
      );
    }

    this.logger.log(
      `Processing payroll for ${staffWithSimplePay.length}/${staffList.length} staff members for ${month}/${year}`,
    );

    // 3. Process pay run on SimplePay
    const { payRun, payslips, accounting } =
      await this.simplePayPayRun.processMonthlyPayroll(tenantId, month, year);

    // 4. Create local Payroll records from SimplePay data
    const payrollIds: string[] = [];
    const errors: Array<{ staffId: string; error: string }> = [];

    // Calculate period dates
    const payPeriodStart = new Date(year, month - 1, 1);
    const payPeriodEnd = new Date(year, month, 0);

    for (const staff of staffWithSimplePay) {
      try {
        // Find matching payslip from SimplePay
        const simplePayEmployeeId = staff.simplePayMapping?.simplePayEmployeeId;
        const payslip = payslips.find(
          (p) => String(p.employee_id) === simplePayEmployeeId,
        );

        if (!payslip) {
          errors.push({
            staffId: staff.id,
            error: `No payslip found in SimplePay for ${staff.firstName} ${staff.lastName}`,
          });
          continue;
        }

        // Create or update local Payroll record
        const payroll = await this.prisma.payroll.upsert({
          where: {
            tenantId_staffId_payPeriodStart: {
              tenantId,
              staffId: staff.id,
              payPeriodStart,
            },
          },
          create: {
            tenantId,
            staffId: staff.id,
            payPeriodStart,
            payPeriodEnd,
            basicSalaryCents: Math.round((payslip.basic || 0) * 100),
            overtimeCents: Math.round((payslip.overtime || 0) * 100),
            bonusCents: Math.round((payslip.bonus || 0) * 100),
            otherEarningsCents: Math.round((payslip.other_earnings || 0) * 100),
            grossSalaryCents: Math.round((payslip.gross || 0) * 100),
            payeCents: Math.round((payslip.paye || 0) * 100),
            uifEmployeeCents: Math.round((payslip.uif_employee || 0) * 100),
            uifEmployerCents: Math.round((payslip.uif_employer || 0) * 100),
            otherDeductionsCents: Math.round(
              (payslip.other_deductions || 0) * 100,
            ),
            netSalaryCents: Math.round((payslip.nett || 0) * 100),
            status: PayrollStatus.APPROVED,
            paymentDate: new Date(payRun.pay_date),
          },
          update: {
            basicSalaryCents: Math.round((payslip.basic || 0) * 100),
            overtimeCents: Math.round((payslip.overtime || 0) * 100),
            bonusCents: Math.round((payslip.bonus || 0) * 100),
            otherEarningsCents: Math.round((payslip.other_earnings || 0) * 100),
            grossSalaryCents: Math.round((payslip.gross || 0) * 100),
            payeCents: Math.round((payslip.paye || 0) * 100),
            uifEmployeeCents: Math.round((payslip.uif_employee || 0) * 100),
            uifEmployerCents: Math.round((payslip.uif_employer || 0) * 100),
            otherDeductionsCents: Math.round(
              (payslip.other_deductions || 0) * 100,
            ),
            netSalaryCents: Math.round((payslip.nett || 0) * 100),
            status: PayrollStatus.APPROVED,
            paymentDate: new Date(payRun.pay_date),
          },
        });

        payrollIds.push(payroll.id);
      } catch (error) {
        errors.push({
          staffId: staff.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 5. Sync pay run to local PayRunSync table
    await this.simplePayPayRun.syncPayRun(tenantId, payRun.id);

    // 6. Create Xero journals if connected
    let xeroJournalIds: string[] | undefined;
    try {
      const xeroResult =
        await this.xeroJournalService.generateJournalsForPeriod(
          tenantId,
          payPeriodStart,
          payPeriodEnd,
        );
      xeroJournalIds = xeroResult.created.map((j) => j.id);
    } catch (error) {
      this.logger.warn(
        `Xero journal creation skipped: ${error instanceof Error ? error.message : 'Xero not connected'}`,
      );
    }

    this.logger.log(
      `Payroll processed: ${payrollIds.length} records created, ${errors.length} errors`,
    );

    return {
      success: errors.length === 0,
      count: payrollIds.length,
      payrollIds,
      simplePayPayRunId: String(payRun.id),
      xeroJournalIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
