/**
 * Session Interactive Handler
 * TASK-WA-010: Session-Based Interactive Features
 *
 * Handles WhatsApp session-based interactive features:
 * - Statement period selector (list picker)
 * - Invoice list display (list picker)
 * - Help menu (list picker)
 * - Balance inquiry (quick reply)
 *
 * Session messages can only be sent during the 24-hour conversation window.
 * List pickers CANNOT be approved templates (session only).
 *
 * IMPORTANT: All messages use tenant.tradingName for branding, NOT "CrecheBooks"
 */

import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';
import { TwilioContentService } from '../services/twilio-content.service';
import {
  StatementPeriod,
  HelpMenuOption,
  createListId,
} from '../types/session.types';

/**
 * Date range for statement generation
 */
export interface StatementDateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Result of session interactive operations
 */
export interface SessionInteractiveResult {
  success: boolean;
  error?: string;
}

/**
 * Handler for WhatsApp session-based interactive features
 *
 * This service provides interactive menus and selections using
 * Twilio's list picker and quick reply features. These are session-only
 * features that do not require template approval.
 */
@Injectable()
export class SessionInteractiveHandler {
  private readonly logger = new Logger(SessionInteractiveHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: TwilioContentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Send statement period selector (list picker)
   *
   * Displays a list picker with 5 period options:
   * - Current Month
   * - Previous Month
   * - Last 3 Months
   * - Year to Date
   * - Last Tax Year (March to February)
   *
   * @param to - Recipient phone number in E.164 format
   * @param tenantId - Tenant ID for the creche
   */
  async sendStatementPeriodSelector(
    to: string,
    tenantId: string,
  ): Promise<SessionInteractiveResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;
    const now = new Date();

    // Generate descriptive labels for each period
    const currentMonth = now.toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const prevMonthStr = prevMonth.toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });

    // Calculate tax year description (March to February)
    const taxYearStart =
      now.getMonth() >= 2 // March is index 2
        ? now.getFullYear()
        : now.getFullYear() - 1;
    const taxYearEnd = taxYearStart + 1;
    const taxYearDesc = `Mar ${taxYearStart} - Feb ${taxYearEnd}`;

    try {
      const result = await this.contentService.sendListPicker(
        to,
        `Which statement would you like from ${tenantName}?`,
        'Select Period',
        [
          {
            item: 'Current Month',
            id: createListId('statement', 'current'),
            description: currentMonth,
          },
          {
            item: 'Previous Month',
            id: createListId('statement', 'prev'),
            description: prevMonthStr,
          },
          {
            item: 'Last 3 Months',
            id: createListId('statement', '3mo'),
            description: 'Transaction summary',
          },
          {
            item: 'Year to Date',
            id: createListId('statement', 'ytd'),
            description: `Jan - ${now.toLocaleDateString('en-ZA', { month: 'short' })}`,
          },
          {
            item: 'Last Tax Year',
            id: createListId('statement', 'tax'),
            description: taxYearDesc,
          },
        ],
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Statement period selector sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send statement period selector: ${errorMessage}`,
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle statement period selection
   *
   * Generates and sends the statement PDF for the selected period.
   *
   * @param to - Recipient phone number
   * @param period - Selected period (current, prev, 3mo, ytd, tax)
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID for statement generation
   */
  async handleStatementSelection(
    to: string,
    period: string,
    tenantId: string,
    parentId: string,
  ): Promise<SessionInteractiveResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;
    const periodLabel = this.periodToLabel(period);

    // Determine date range for the statement
    const { startDate, endDate } = this.calculateStatementPeriod(
      period as StatementPeriod,
    );

    try {
      // Send "generating" message
      await this.contentService.sendSessionMessage(
        to,
        `Generating your ${periodLabel} statement from ${tenantName}. This may take a moment...`,
        tenantId,
      );

      // TODO: Integrate with StatementPdfService when available
      // For now, we'll send a placeholder message about statement generation
      // In the future, this will call:
      // const statementUrl = await this.statementService.generateStatementPdf(
      //   tenantId, parentId, startDate, endDate
      // );

      // Log the statement request
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'StatementRequest',
        entityId: parentId,
        action: AuditAction.CREATE,
        afterValue: {
          parentId,
          parentPhone: to,
          period,
          periodLabel,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          requestedAt: new Date().toISOString(),
          source: 'WHATSAPP',
        },
        changeSummary: `Statement requested for ${periodLabel} via WhatsApp`,
      });

      // Send confirmation (placeholder until PDF service is integrated)
      await this.contentService.sendSessionMessage(
        to,
        `Your ${periodLabel} statement request has been received. ${tenantName} will send your statement shortly.\n\n` +
          `Period: ${startDate.toLocaleDateString('en-ZA')} to ${endDate.toLocaleDateString('en-ZA')}`,
        tenantId,
      );

      this.logger.log(
        `Statement request logged for period ${period} from ${to}`,
      );
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to handle statement selection: ${errorMessage}`,
      );

      await this.contentService.sendSessionMessage(
        to,
        `Sorry, we couldn't generate your statement. Please contact ${tenantName} at ${tenant.phone} for assistance.`,
        tenantId,
      );

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send invoice list for selection
   *
   * Displays a list picker with up to 10 unpaid invoices.
   * Queries invoices with status: SENT, VIEWED, OVERDUE, PARTIALLY_PAID
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   */
  async sendInvoiceList(
    to: string,
    tenantId: string,
    parentId: string,
  ): Promise<SessionInteractiveResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    try {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'] },
          isDeleted: false,
        },
        orderBy: { dueDate: 'desc' },
        take: 10, // Max list items
      });

      if (invoices.length === 0) {
        await this.contentService.sendSessionMessage(
          to,
          `Good news! You have no unpaid invoices with ${tenantName}.`,
          tenantId,
        );
        return { success: true };
      }

      // Format invoices for list picker (character limits: title 24, description 72)
      const items = invoices.map((inv) => {
        const amountDue = inv.totalCents - inv.amountPaidCents;
        const amountFormatted = (amountDue / 100).toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        return {
          item: inv.invoiceNumber.substring(0, 24), // Max 24 chars
          id: createListId('invoice', inv.id),
          description: `R${amountFormatted} - ${inv.status}`.substring(0, 72), // Max 72 chars
        };
      });

      const result = await this.contentService.sendListPicker(
        to,
        `You have ${invoices.length} unpaid invoice(s) with ${tenantName}. Select one to view details:`,
        'View Invoices',
        items,
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Invoice list (${invoices.length} items) sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send invoice list: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send help menu
   *
   * Displays a list picker with 5 help options:
   * - View My Balance
   * - Payment Methods
   * - Request Statement
   * - Update Details
   * - Speak to Someone
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   */
  async sendHelpMenu(
    to: string,
    tenantId: string,
  ): Promise<SessionInteractiveResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    try {
      const result = await this.contentService.sendListPicker(
        to,
        `How can ${tenantName} help you today?`,
        'Select Topic',
        [
          {
            item: 'View My Balance',
            id: createListId('help', 'balance'),
            description: 'Check outstanding amount',
          },
          {
            item: 'Payment Methods',
            id: createListId('help', 'payment'),
            description: 'How to pay your fees',
          },
          {
            item: 'Request Statement',
            id: createListId('help', 'statement'),
            description: 'Get account statement',
          },
          {
            item: 'Update Details',
            id: createListId('help', 'update'),
            description: 'Change contact info',
          },
          {
            item: 'Speak to Someone',
            id: createListId('help', 'human'),
            description: 'Request callback',
          },
        ],
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Help menu sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send help menu: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle help menu selection
   *
   * Routes to the appropriate handler based on selection.
   *
   * @param to - Recipient phone number
   * @param selection - Selected help option
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   */
  async handleHelpSelection(
    to: string,
    selection: string,
    tenantId: string,
    parentId: string,
  ): Promise<SessionInteractiveResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    try {
      switch (selection as HelpMenuOption) {
        case 'balance':
          return await this.sendBalanceInfo(to, tenantId, parentId, tenant);
        case 'payment':
          return await this.sendPaymentMethods(to, tenantId, tenant);
        case 'statement':
          return await this.sendStatementPeriodSelector(to, tenantId);
        case 'update':
          return await this.sendUpdateDetailsLink(to, tenantId, tenant);
        case 'human':
          return await this.requestHumanCallback(
            to,
            tenantId,
            parentId,
            tenant,
          );
        default:
          this.logger.warn(`Unknown help selection: ${selection}`);
          await this.contentService.sendSessionMessage(
            to,
            `Sorry, I didn't understand that option. Please contact ${tenant.tradingName || tenant.name} at ${tenant.phone} for assistance.`,
            tenantId,
          );
          return {
            success: false,
            error: `Unknown help selection: ${selection}`,
          };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle help selection: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send balance information with quick reply buttons
   *
   * Shows current outstanding balance and offers 3 quick actions:
   * - Pay Now
   * - View Invoices
   * - Get Statement
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param tenant - Tenant entity (optional, will be fetched if not provided)
   */
  async sendBalanceInfo(
    to: string,
    tenantId: string,
    parentId: string,
    tenant?: Tenant | null,
  ): Promise<SessionInteractiveResult> {
    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
    }

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    try {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'] },
          isDeleted: false,
        },
      });

      const totalOutstanding = invoices.reduce(
        (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
        0,
      );

      const formatted = (totalOutstanding / 100).toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const result = await this.contentService.sendSessionQuickReply(
        to,
        `Your current balance with ${tenantName} is R${formatted}.\n\n` +
          `${invoices.length} unpaid invoice(s).\n\n` +
          `What would you like to do?`,
        [
          { title: 'Pay Now', id: 'menu_pay' },
          { title: 'View Invoices', id: 'menu_invoices' },
          { title: 'Get Statement', id: 'menu_statement' },
        ],
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Balance info (R${formatted}) sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send balance info: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send payment methods information
   *
   * Displays EFT details with tenant's bank information.
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   * @param tenant - Tenant entity (optional)
   */
  async sendPaymentMethods(
    to: string,
    tenantId: string,
    tenant?: Tenant | null,
  ): Promise<SessionInteractiveResult> {
    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
    }

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    // Build payment methods message based on available bank details
    let message = `Payment Methods for ${tenantName}:\n\n`;

    // Check if bank details are available
    const hasBankDetails =
      tenant.bankName && tenant.bankAccountNumber && tenant.bankBranchCode;

    if (hasBankDetails) {
      message +=
        `1. EFT Transfer:\n` +
        `   Bank: ${tenant.bankName}\n` +
        `   Account: ${tenant.bankAccountNumber}\n` +
        `   Branch: ${tenant.bankBranchCode}\n` +
        `   Reference: Your invoice number\n\n`;
    }

    message +=
      `${hasBankDetails ? '2' : '1'}. Online Payment:\n` +
      `   Use the "Pay Now" button on any invoice\n\n` +
      `${hasBankDetails ? '3' : '2'}. Cash/Card at Office:\n` +
      `   Visit us during office hours`;

    try {
      const result = await this.contentService.sendSessionMessage(
        to,
        message,
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Payment methods sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send payment methods: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send update details portal link
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   * @param tenant - Tenant entity (optional)
   */
  async sendUpdateDetailsLink(
    to: string,
    tenantId: string,
    tenant?: Tenant | null,
  ): Promise<SessionInteractiveResult> {
    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
    }

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    try {
      const result = await this.contentService.sendSessionMessage(
        to,
        `To update your contact details with ${tenantName}:\n\n` +
          `1. Log into your Parent Portal\n` +
          `2. Go to Profile > Contact Details\n` +
          `3. Update and save your information\n\n` +
          `Portal: https://app.crechebooks.co.za/portal`,
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Update details link sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send update details link: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Request human callback
   *
   * Logs the callback request and confirms receipt.
   *
   * @param to - Recipient phone number
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param tenant - Tenant entity (optional)
   */
  async requestHumanCallback(
    to: string,
    tenantId: string,
    parentId: string,
    tenant?: Tenant | null,
  ): Promise<SessionInteractiveResult> {
    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
    }

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const tenantName = tenant.tradingName || tenant.name;

    try {
      // Log the callback request in audit log
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'CallbackRequest',
        entityId: parentId,
        action: AuditAction.CREATE,
        afterValue: {
          parentId,
          parentPhone: to,
          requestedAt: new Date().toISOString(),
          source: 'WHATSAPP_HELP_MENU',
          status: 'PENDING',
        },
        changeSummary: `Callback requested via WhatsApp help menu`,
      });

      const result = await this.contentService.sendSessionMessage(
        to,
        `We'll have someone from ${tenantName} call you back during office hours (08:00-17:00, Mon-Fri).\n\n` +
          `For urgent matters, please call us directly at ${tenant.phone}.`,
        tenantId,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.logger.log(`Callback request logged for ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to request callback: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Calculate statement date range based on period selection
   *
   * @param period - Statement period identifier
   * @returns Start and end dates for the statement
   */
  calculateStatementPeriod(period: StatementPeriod): StatementDateRange {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of current month

    switch (period) {
      case 'current':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;

      case 'prev':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        break;

      case '3mo':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;

      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1); // January 1st
        break;

      case 'tax': {
        // SA tax year: March to February
        // If we're in March or later, tax year started this year
        // If we're in Jan/Feb, tax year started last year
        const taxYearStartYear =
          now.getMonth() >= 2 // March is index 2
            ? now.getFullYear()
            : now.getFullYear() - 1;
        startDate = new Date(taxYearStartYear, 2, 1); // March 1st
        // End date is Feb of next year, but capped to current date if still in tax year
        const taxYearEnd = new Date(taxYearStartYear + 1, 1, 28); // Feb 28 (or 29)
        endDate = taxYearEnd < now ? taxYearEnd : now;
        break;
      }

      default:
        // Default to current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { startDate, endDate };
  }

  /**
   * Convert period identifier to human-readable label
   *
   * @param period - Statement period identifier
   * @returns Human-readable period label
   */
  periodToLabel(period: string): string {
    const labels: Record<string, string> = {
      current: 'current month',
      prev: 'previous month',
      '3mo': 'last 3 months',
      ytd: 'year to date',
      tax: 'tax year',
    };
    return labels[period] || period;
  }
}
