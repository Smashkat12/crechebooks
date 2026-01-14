/**
 * SimplePay Reports Service
 * TASK-SPAY-005: SimplePay Reports Management
 *
 * Provides comprehensive payroll reporting integration including:
 * - ETI (Employment Tax Incentive) reports
 * - Transaction history reports
 * - Variance analysis reports
 * - Leave liability reports
 * - Leave comparison reports
 * - Tracked balances reports
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { ReportRequestRepository } from '../../database/repositories/report-request.repository';
import {
  ReportStatus,
  ReportType,
  ReportParams,
  ReportGenerationResult,
  ReportRequestFilterOptions,
  EtiReportParams,
  TransactionHistoryParams,
  VarianceReportParams,
  LeaveLiabilityParams,
  LeaveComparisonParams,
  TrackedBalancesParams,
  EtiReport,
  TransactionHistoryReport,
  VarianceReport,
  LeaveLiabilityReport,
  LeaveComparisonReport,
  TrackedBalancesReport,
  AsyncReportStatus,
  SimplePayEtiReport,
  SimplePayTransactionHistoryReport,
  SimplePayVarianceReport,
  SimplePayLeaveLiabilityReport,
  SimplePayLeaveComparisonReport,
  SimplePayTrackedBalancesReport,
  SimplePayAsyncReportStatus,
} from '../../database/entities/report-request.entity';
import { ReportRequest, Prisma } from '@prisma/client';

@Injectable()
export class SimplePayReportsService {
  private readonly logger = new Logger(SimplePayReportsService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly reportRequestRepo: ReportRequestRepository,
  ) {}

  /**
   * Convert object to Prisma InputJsonValue safely
   */
  private toJsonValue(obj: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
  }

  // ============================================
  // ETI Report
  // ============================================

  /**
   * Generate Employment Tax Incentive (ETI) report
   * ETI is a South African government incentive to encourage employment of young workers
   */
  async generateEtiReport(
    tenantId: string,
    params: EtiReportParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.ETI,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      // Build query params
      const queryParams: string[] = [];
      if (params.periodStart)
        queryParams.push(`from_date=${params.periodStart}`);
      if (params.periodEnd) queryParams.push(`to_date=${params.periodEnd}`);
      if (params.waveId) queryParams.push(`wave_id=${params.waveId}`);
      if (params.payRunId) queryParams.push(`pay_run_id=${params.payRunId}`);

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const endpoint = `/clients/${clientId}/reports/eti${queryString}`;

      const response = await this.apiClient.get<
        { report: SimplePayEtiReport } | SimplePayEtiReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformEtiReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.ETI,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating ETI report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate ETI report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.ETI,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Transaction History Report
  // ============================================

  /**
   * Generate transaction history report
   */
  async generateTransactionHistory(
    tenantId: string,
    params: TransactionHistoryParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.TRANSACTION_HISTORY,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      const queryParams: string[] = [];
      if (params.periodStart)
        queryParams.push(`from_date=${params.periodStart}`);
      if (params.periodEnd) queryParams.push(`to_date=${params.periodEnd}`);
      if (params.employeeId)
        queryParams.push(`employee_id=${params.employeeId}`);
      if (params.transactionType && params.transactionType !== 'all') {
        queryParams.push(`type=${params.transactionType}`);
      }

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const endpoint = `/clients/${clientId}/reports/transactions${queryString}`;

      const response = await this.apiClient.get<
        | { report: SimplePayTransactionHistoryReport }
        | SimplePayTransactionHistoryReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformTransactionHistoryReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.TRANSACTION_HISTORY,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating transaction history';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate transaction history for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.TRANSACTION_HISTORY,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Variance Report
  // ============================================

  /**
   * Generate variance report comparing two periods
   */
  async generateVarianceReport(
    tenantId: string,
    params: VarianceReportParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.VARIANCE,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      const queryParams = [
        `period1_start=${params.periodStart1}`,
        `period1_end=${params.periodEnd1}`,
        `period2_start=${params.periodStart2}`,
        `period2_end=${params.periodEnd2}`,
      ];
      if (params.includeEmployeeDetails) {
        queryParams.push('include_details=true');
      }

      const endpoint = `/clients/${clientId}/reports/variance?${queryParams.join('&')}`;

      const response = await this.apiClient.get<
        { report: SimplePayVarianceReport } | SimplePayVarianceReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformVarianceReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.VARIANCE,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating variance report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate variance report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.VARIANCE,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Leave Liability Report
  // ============================================

  /**
   * Generate leave liability report
   * Shows the monetary value of accumulated leave balances
   */
  async generateLeaveLiabilityReport(
    tenantId: string,
    params: LeaveLiabilityParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.LEAVE_LIABILITY,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      const queryParams: string[] = [];
      if (params.periodEnd) queryParams.push(`as_at_date=${params.periodEnd}`);
      if (params.leaveTypeId)
        queryParams.push(`leave_type_id=${params.leaveTypeId}`);
      if (params.includeProjectedAccrual)
        queryParams.push('include_projected=true');

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const endpoint = `/clients/${clientId}/reports/leave_liability${queryString}`;

      const response = await this.apiClient.get<
        | { report: SimplePayLeaveLiabilityReport }
        | SimplePayLeaveLiabilityReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformLeaveLiabilityReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.LEAVE_LIABILITY,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating leave liability report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate leave liability report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.LEAVE_LIABILITY,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Leave Comparison Report
  // ============================================

  /**
   * Generate leave comparison report between two years
   */
  async generateLeaveComparisonReport(
    tenantId: string,
    params: LeaveComparisonParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.LEAVE_COMPARISON,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      const queryParams = [`year1=${params.year1}`, `year2=${params.year2}`];
      if (params.leaveTypeId)
        queryParams.push(`leave_type_id=${params.leaveTypeId}`);

      const endpoint = `/clients/${clientId}/reports/leave_comparison?${queryParams.join('&')}`;

      const response = await this.apiClient.get<
        | { report: SimplePayLeaveComparisonReport }
        | SimplePayLeaveComparisonReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformLeaveComparisonReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.LEAVE_COMPARISON,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating leave comparison report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate leave comparison report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.LEAVE_COMPARISON,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Tracked Balances Report
  // ============================================

  /**
   * Generate tracked balances report
   * Shows accumulated balances like loans, advances, etc.
   */
  async generateTrackedBalancesReport(
    tenantId: string,
    params: TrackedBalancesParams,
    requestedBy?: string,
  ): Promise<ReportGenerationResult> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.TRACKED_BALANCES,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      await this.reportRequestRepo.markProcessing(reportRequest.id);

      const queryParams: string[] = [];
      if (params.periodEnd) queryParams.push(`as_at_date=${params.periodEnd}`);
      if (params.employeeId)
        queryParams.push(`employee_id=${params.employeeId}`);
      if (params.balanceTypes && params.balanceTypes.length > 0) {
        queryParams.push(`balance_types=${params.balanceTypes.join(',')}`);
      }

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const endpoint = `/clients/${clientId}/reports/tracked_balances${queryString}`;

      const response = await this.apiClient.get<
        | { report: SimplePayTrackedBalancesReport }
        | SimplePayTrackedBalancesReport
      >(endpoint);
      const rawReport = 'report' in response ? response.report : response;
      const report = this.transformTrackedBalancesReport(rawReport);

      await this.reportRequestRepo.markCompleted(
        reportRequest.id,
        this.toJsonValue(report),
      );

      return {
        success: true,
        reportRequestId: reportRequest.id,
        reportType: ReportType.TRACKED_BALANCES,
        status: ReportStatus.COMPLETED,
        data: report,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error generating tracked balances report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to generate tracked balances report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        reportRequestId: reportRequest.id,
        reportType: ReportType.TRACKED_BALANCES,
        status: ReportStatus.FAILED,
        data: null,
        errorMessage,
      };
    }
  }

  // ============================================
  // Async Report Operations
  // ============================================

  /**
   * Queue an async report for generation
   * Some reports may take longer and are processed asynchronously
   */
  async queueAsyncReport(
    tenantId: string,
    reportType: ReportType,
    params: ReportParams,
    requestedBy?: string,
  ): Promise<ReportRequest> {
    const reportRequest = await this.reportRequestRepo.create({
      tenantId,
      reportType,
      params: params as unknown as Prisma.InputJsonValue,
      requestedBy,
    });

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Queue the async report
      const response = await this.apiClient.post<{ uuid: string }>(
        `/clients/${clientId}/reports/async`,
        {
          report_type: reportType.toLowerCase(),
          params,
        },
      );

      await this.reportRequestRepo.markProcessing(
        reportRequest.id,
        response.uuid,
      );

      return await this.reportRequestRepo.findByIdOrThrow(reportRequest.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to queue async report';
      await this.reportRequestRepo.markFailed(reportRequest.id, errorMessage);

      this.logger.error(
        `Failed to queue async report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Poll async report status
   */
  async pollAsyncReport(
    tenantId: string,
    asyncUuid: string,
  ): Promise<AsyncReportStatus> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.get<SimplePayAsyncReportStatus>(
      `/reports/async/${asyncUuid}`,
    );

    const status: AsyncReportStatus = {
      uuid: response.uuid,
      status: this.mapAsyncStatus(response.status),
      progressPercentage: response.progress_percentage ?? null,
      downloadUrl: response.download_url ?? null,
      errorMessage: response.error_message ?? null,
      createdAt: new Date(response.created_at),
      completedAt: response.completed_at
        ? new Date(response.completed_at)
        : null,
    };

    // Update report request if we have one
    const reportRequest =
      await this.reportRequestRepo.findByAsyncUuid(asyncUuid);
    if (reportRequest) {
      if (status.status === ReportStatus.COMPLETED) {
        // Fetch and store the result
        if (status.downloadUrl) {
          try {
            const result = await this.downloadAsyncReport(
              tenantId,
              status.downloadUrl,
            );
            await this.reportRequestRepo.markCompleted(
              reportRequest.id,
              this.toJsonValue(result),
            );
          } catch {
            // Keep completed status even if download fails
          }
        }
      } else if (status.status === ReportStatus.FAILED) {
        await this.reportRequestRepo.markFailed(
          reportRequest.id,
          status.errorMessage || 'Async report generation failed',
        );
      }
    }

    return status;
  }

  /**
   * Download async report result
   */
  async downloadAsyncReport(
    tenantId: string,
    downloadUrl: string,
  ): Promise<Record<string, unknown>> {
    await this.apiClient.initializeForTenant(tenantId);

    const response =
      await this.apiClient.get<Record<string, unknown>>(downloadUrl);
    return response;
  }

  // ============================================
  // Report Request Management
  // ============================================

  /**
   * Get a report request by ID
   */
  async getReportRequest(reportRequestId: string): Promise<ReportRequest> {
    return this.reportRequestRepo.findByIdOrThrow(reportRequestId);
  }

  /**
   * Get report history for a tenant
   */
  async getReportHistory(
    tenantId: string,
    filter?: ReportRequestFilterOptions,
  ): Promise<ReportRequest[]> {
    return this.reportRequestRepo.findByTenant(tenantId, {
      status: filter?.status,
      reportType: filter?.reportType,
      requestedBy: filter?.requestedBy,
      fromDate: filter?.fromDate,
      toDate: filter?.toDate,
      page: filter?.offset
        ? Math.floor(filter.offset / (filter.limit || 20)) + 1
        : 1,
      limit: filter?.limit || 20,
    });
  }

  /**
   * Get pending reports for a tenant
   */
  async getPendingReports(tenantId: string): Promise<ReportRequest[]> {
    return this.reportRequestRepo.findPending(tenantId);
  }

  /**
   * Get report statistics for a tenant
   */
  async getReportStatistics(tenantId: string): Promise<{
    total: number;
    byStatus: Record<ReportStatus, number>;
    byType: Record<ReportType, number>;
  }> {
    return this.reportRequestRepo.getStatistics(tenantId);
  }

  /**
   * Delete old reports
   */
  async cleanupOldReports(
    tenantId: string,
    olderThanDays: number = 30,
  ): Promise<number> {
    return this.reportRequestRepo.deleteOldReports(tenantId, olderThanDays);
  }

  // ============================================
  // Transform Methods (snake_case to camelCase)
  // ============================================

  private transformEtiReport(raw: SimplePayEtiReport): EtiReport {
    return {
      periodStart: new Date(raw.period_start),
      periodEnd: new Date(raw.period_end),
      totalEtiCents: Math.round(raw.total_eti * 100),
      eligibleEmployees: raw.eligible_employees,
      entries: raw.entries.map((entry) => ({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        idNumber: entry.id_number,
        grossRemunerationCents: Math.round(entry.gross_remuneration * 100),
        etiEligible: entry.eti_eligible,
        etiAmountCents: Math.round(entry.eti_amount * 100),
        etiMonth: entry.eti_month,
        employmentStartDate: new Date(entry.employment_start_date),
        ageAtMonthEnd: entry.age_at_month_end,
      })),
    };
  }

  private transformTransactionHistoryReport(
    raw: SimplePayTransactionHistoryReport,
  ): TransactionHistoryReport {
    return {
      periodStart: new Date(raw.period_start),
      periodEnd: new Date(raw.period_end),
      totalEntries: raw.total_entries,
      totalAmountCents: Math.round(raw.total_amount * 100),
      entries: raw.entries.map((entry) => ({
        id: entry.id,
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        date: new Date(entry.date),
        code: entry.code,
        description: entry.description,
        type: entry.type,
        amountCents: Math.round(entry.amount * 100),
        payRunId: String(entry.pay_run_id),
      })),
    };
  }

  private transformVarianceReport(
    raw: SimplePayVarianceReport,
  ): VarianceReport {
    return {
      period1Start: new Date(raw.period1_start),
      period1End: new Date(raw.period1_end),
      period2Start: new Date(raw.period2_start),
      period2End: new Date(raw.period2_end),
      totalVarianceCents: Math.round(raw.total_variance * 100),
      entries: raw.entries.map((entry) => ({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        itemCode: entry.item_code,
        itemDescription: entry.item_description,
        period1AmountCents: Math.round(entry.period1_amount * 100),
        period2AmountCents: Math.round(entry.period2_amount * 100),
        varianceAmountCents: Math.round(entry.variance_amount * 100),
        variancePercentage: entry.variance_percentage,
      })),
    };
  }

  private transformLeaveLiabilityReport(
    raw: SimplePayLeaveLiabilityReport,
  ): LeaveLiabilityReport {
    return {
      asAtDate: new Date(raw.as_at_date),
      totalLiabilityCents: Math.round(raw.total_liability * 100),
      entries: raw.entries.map((entry) => ({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        leaveTypeId: entry.leave_type_id,
        leaveTypeName: entry.leave_type_name,
        balanceDays: entry.balance_days,
        balanceHours: entry.balance_hours,
        dailyRateCents: Math.round(entry.daily_rate * 100),
        liabilityAmountCents: Math.round(entry.liability_amount * 100),
      })),
    };
  }

  private transformLeaveComparisonReport(
    raw: SimplePayLeaveComparisonReport,
  ): LeaveComparisonReport {
    return {
      year1: raw.year1,
      year2: raw.year2,
      entries: raw.entries.map((entry) => ({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        leaveTypeId: entry.leave_type_id,
        leaveTypeName: entry.leave_type_name,
        year1TakenDays: entry.year1_taken,
        year2TakenDays: entry.year2_taken,
        differenceDays: entry.difference,
      })),
    };
  }

  private transformTrackedBalancesReport(
    raw: SimplePayTrackedBalancesReport,
  ): TrackedBalancesReport {
    return {
      asAtDate: new Date(raw.as_at_date),
      entries: raw.entries.map((entry) => ({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        balanceType: entry.balance_type,
        balanceName: entry.balance_name,
        openingBalanceCents: Math.round(entry.opening_balance * 100),
        additionsCents: Math.round(entry.additions * 100),
        deductionsCents: Math.round(entry.deductions * 100),
        closingBalanceCents: Math.round(entry.closing_balance * 100),
      })),
    };
  }

  private mapAsyncStatus(status: string): ReportStatus {
    switch (status) {
      case 'queued':
        return ReportStatus.QUEUED;
      case 'processing':
        return ReportStatus.PROCESSING;
      case 'completed':
        return ReportStatus.COMPLETED;
      case 'failed':
        return ReportStatus.FAILED;
      default:
        return ReportStatus.QUEUED;
    }
  }
}
