/**
 * Off-Boarding Service
 * TASK-ENROL-005: Off-Boarding Workflow (Graduation & Withdrawal)
 *
 * @module database/services/offboarding
 * @description Orchestrates off-boarding operations including account settlement,
 * credit handling, and final statement generation.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { CreditBalanceSourceType } from '@prisma/client';
import { EnrollmentRepository } from '../repositories/enrollment.repository';
import { ChildRepository } from '../repositories/child.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentService } from './enrollment.service';
import { ProRataService } from './pro-rata.service';
import { CreditBalanceService } from './credit-balance.service';
import { StatementGenerationService } from './statement-generation.service';
import { AuditLogService } from './audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { TwilioWhatsAppService } from '../../integrations/whatsapp/services/twilio-whatsapp.service';
import { EnrollmentStatus } from '../entities/enrollment.entity';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from '../../shared/exceptions';
import {
  AccountSettlement,
  OffboardingResult,
  CreditAction,
  OffboardingReason,
} from '../dto/offboarding.dto';

@Injectable()
export class OffboardingService {
  private readonly logger = new Logger(OffboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly proRataService: ProRataService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly statementGenerationService: StatementGenerationService,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly twilioWhatsAppService?: TwilioWhatsAppService,
  ) {}

  /**
   * Calculate account settlement for an enrollment
   * This is a preview of what will happen during off-boarding
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to settle
   * @param endDate - Off-boarding date
   * @returns Account settlement calculation
   */
  async calculateAccountSettlement(
    tenantId: string,
    enrollmentId: string,
    endDate: Date,
  ): Promise<AccountSettlement> {
    // 1. Get enrollment and validate
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      tenantId,
    );
    if (!enrollment) {
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // 2. Get child info
    const child = await this.childRepo.findById(enrollment.childId, tenantId);
    if (!child) {
      throw new NotFoundException('Child', enrollment.childId);
    }

    // 3. Get parent info
    const parent = await this.parentRepo.findById(child.parentId, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent', child.parentId);
    }

    // 4. Get fee structure for pro-rata calculation
    const feeStructure = await this.feeStructureRepo.findById(
      enrollment.feeStructureId,
      tenantId,
    );

    // 5. Calculate outstanding balance from invoices
    const invoices = await this.invoiceRepo.findByChild(
      tenantId,
      enrollment.childId,
    );
    let outstandingBalance = 0;
    const invoiceDetails: AccountSettlement['invoices'] = [];

    for (const invoice of invoices) {
      if (invoice.status !== 'PAID' && invoice.status !== 'VOID') {
        const outstanding = invoice.totalCents - invoice.amountPaidCents;
        outstandingBalance += outstanding;
        invoiceDetails.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalCents: invoice.totalCents,
          paidCents: invoice.amountPaidCents,
          status: invoice.status,
        });
      }
    }

    // 6. Calculate pro-rata credit for unused days
    let proRataCredit = 0;
    if (feeStructure) {
      // Calculate unused days from endDate to end of month
      const endDateObj = new Date(endDate);
      endDateObj.setHours(0, 0, 0, 0);
      const monthEnd = new Date(
        endDateObj.getFullYear(),
        endDateObj.getMonth() + 1,
        0,
      );
      monthEnd.setHours(23, 59, 59, 999);

      // Only calculate pro-rata if not ending on last day of month
      if (endDateObj.getDate() < monthEnd.getDate()) {
        try {
          // Calculate credit for unused portion
          // Pro-rata credit = monthly fee * (days unused / total days in month)
          const daysInMonth = monthEnd.getDate();
          const daysUnused = monthEnd.getDate() - endDateObj.getDate();
          proRataCredit = Math.round(
            (feeStructure.amountCents * daysUnused) / daysInMonth,
          );
          this.logger.debug(
            `Pro-rata credit: ${proRataCredit} cents (${daysUnused}/${daysInMonth} days @ ${feeStructure.amountCents} cents/month)`,
          );
        } catch (error) {
          this.logger.warn(
            `Pro-rata calculation failed for enrollment ${enrollmentId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // 7. Calculate net amount (positive = owes, negative = owed to parent)
    const netAmount = outstandingBalance - proRataCredit;

    const settlement: AccountSettlement = {
      parentId: parent.id,
      parentName: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
      childId: child.id,
      childName: `${child.firstName || ''} ${child.lastName || ''}`.trim(),
      outstandingBalance,
      proRataCredit,
      netAmount,
      invoices: invoiceDetails,
    };

    this.logger.log(
      `Account settlement calculated for enrollment ${enrollmentId}: outstanding=${outstandingBalance}, proRataCredit=${proRataCredit}, net=${netAmount}`,
    );

    return settlement;
  }

  /**
   * Initiate off-boarding process for an enrollment
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to off-board
   * @param endDate - Off-boarding date
   * @param reason - Reason for off-boarding (GRADUATION or WITHDRAWAL)
   * @param creditAction - How to handle any credit balance
   * @param siblingEnrollmentId - Sibling enrollment for credit transfer (if applicable)
   * @param userId - User performing the off-boarding
   * @returns Off-boarding result
   */
  async initiateOffboarding(
    tenantId: string,
    enrollmentId: string,
    endDate: Date,
    reason: OffboardingReason,
    creditAction: CreditAction,
    siblingEnrollmentId: string | undefined,
    userId: string,
  ): Promise<OffboardingResult> {
    this.logger.log(
      `Initiating off-boarding for enrollment ${enrollmentId}: reason=${reason}, creditAction=${creditAction}`,
    );

    // 1. Validate enrollment exists and is ACTIVE
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      tenantId,
    );
    if (!enrollment) {
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    if (enrollment.status !== (EnrollmentStatus.ACTIVE as string)) {
      throw new ConflictException(
        'Only active enrollments can be off-boarded',
        {
          enrollmentId,
          currentStatus: enrollment.status,
        },
      );
    }

    // 2. Validate end date
    if (endDate <= enrollment.startDate) {
      throw new ValidationException('End date must be after start date', [
        {
          field: 'endDate',
          message: 'End date must be after start date',
          value: endDate,
        },
      ]);
    }

    // 3. Validate sibling enrollment if credit action is 'sibling'
    if (creditAction === 'sibling') {
      if (!siblingEnrollmentId) {
        throw new ValidationException(
          'Sibling enrollment ID required for credit transfer',
          [
            {
              field: 'siblingEnrollmentId',
              message:
                'Sibling enrollment ID is required when transferring credit to sibling',
              value: undefined,
            },
          ],
        );
      }

      const siblingEnrollment = await this.enrollmentRepo.findById(
        siblingEnrollmentId,
        tenantId,
      );
      if (!siblingEnrollment) {
        throw new NotFoundException('Sibling Enrollment', siblingEnrollmentId);
      }

      if (siblingEnrollment.status !== (EnrollmentStatus.ACTIVE as string)) {
        throw new ValidationException(
          'Sibling enrollment must be active for credit transfer',
          [
            {
              field: 'siblingEnrollmentId',
              message: 'Sibling enrollment must be active',
              value: siblingEnrollmentId,
            },
          ],
        );
      }
    }

    // 4. Calculate account settlement
    const settlement = await this.calculateAccountSettlement(
      tenantId,
      enrollmentId,
      endDate,
    );

    // 5. Process the off-boarding based on reason
    const status =
      reason === 'GRADUATION'
        ? EnrollmentStatus.GRADUATED
        : EnrollmentStatus.WITHDRAWN;

    // Update enrollment status
    if (reason === 'GRADUATION') {
      await this.enrollmentService.graduateChild(
        tenantId,
        enrollmentId,
        endDate,
        userId,
      );
    } else {
      await this.enrollmentService.withdrawChild(
        tenantId,
        enrollmentId,
        endDate,
        userId,
      );
    }

    // 6. Handle credit based on action
    let creditAmount = 0;
    let processedCreditAction: OffboardingResult['creditAction'] = 'none';

    if (settlement.netAmount < 0) {
      creditAmount = Math.abs(settlement.netAmount);

      switch (creditAction) {
        case 'apply':
          // Apply credit to outstanding invoices (already done through credit note)
          processedCreditAction = 'applied';
          this.logger.log(
            `Credit ${creditAmount} cents applied to parent account`,
          );
          break;

        case 'refund':
          // Mark as refund pending (manual process)
          processedCreditAction = 'refunded';
          this.logger.log(
            `Credit ${creditAmount} cents marked for refund to parent`,
          );
          break;

        case 'donate':
          // Mark as donation to school
          processedCreditAction = 'donated';
          this.logger.log(`Credit ${creditAmount} cents donated to school`);
          break;

        case 'sibling':
          // Transfer credit to sibling's parent account
          if (siblingEnrollmentId) {
            try {
              const siblingEnrollment = await this.enrollmentRepo.findById(
                siblingEnrollmentId,
                tenantId,
              );
              if (siblingEnrollment) {
                const siblingChild = await this.childRepo.findById(
                  siblingEnrollment.childId,
                  tenantId,
                );
                if (siblingChild) {
                  // Create credit balance for sibling's parent (using ADJUSTMENT type for transfers)
                  await this.prisma.creditBalance.create({
                    data: {
                      tenantId,
                      parentId: siblingChild.parentId,
                      amountCents: creditAmount,
                      sourceType: CreditBalanceSourceType.ADJUSTMENT,
                      sourceId: enrollmentId,
                      description: `Credit transferred from ${settlement.childName} (off-boarding)`,
                      isApplied: false,
                    },
                  });
                  processedCreditAction = 'sibling';
                  this.logger.log(
                    `Credit ${creditAmount} cents transferred to sibling enrollment ${siblingEnrollmentId}`,
                  );
                }
              }
            } catch (error) {
              this.logger.error(
                `Failed to transfer credit to sibling: ${error instanceof Error ? error.message : String(error)}`,
              );
              // Fall back to refund
              processedCreditAction = 'refunded';
            }
          }
          break;

        case 'none':
        default:
          processedCreditAction = 'none';
          break;
      }
    }

    // 7. Generate final statement
    let finalStatementId: string | null = null;
    try {
      // Generate statement covering the entire enrollment period
      const periodStart = new Date(enrollment.startDate);
      const periodEnd = new Date(endDate);

      const statement = await this.statementGenerationService.generateStatement(
        {
          tenantId,
          parentId: settlement.parentId,
          periodStart,
          periodEnd,
          userId,
        },
      );
      finalStatementId = statement.id;
      this.logger.log(`Generated final statement ${finalStatementId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to generate final statement: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 8. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Offboarding',
      entityId: enrollmentId,
      afterValue: JSON.parse(
        JSON.stringify({
          enrollmentId,
          status,
          reason,
          endDate,
          settlement,
          creditAction: processedCreditAction,
          creditAmount,
          finalStatementId,
        }),
      ),
    });

    const result: OffboardingResult = {
      enrollmentId,
      status: status as 'GRADUATED' | 'WITHDRAWN',
      endDate,
      settlement,
      creditAction: processedCreditAction,
      creditAmount,
      finalStatementId,
    };

    // 9. TASK-WA-009: Send parent notification (email + WhatsApp)
    await this.sendOffboardingNotification(
      tenantId,
      settlement,
      reason,
      endDate,
      processedCreditAction,
      creditAmount,
    );

    this.logger.log(
      `Off-boarding complete for enrollment ${enrollmentId}: status=${status}, creditAction=${processedCreditAction}`,
    );

    return result;
  }

  /**
   * Send off-boarding notification to parent via email and WhatsApp
   * TASK-WA-009: Off-boarding Notifications
   */
  private async sendOffboardingNotification(
    tenantId: string,
    settlement: AccountSettlement,
    reason: OffboardingReason,
    endDate: Date,
    creditAction: string,
    creditAmount: number,
  ): Promise<void> {
    // Get parent details
    const parent = await this.parentRepo.findById(
      settlement.parentId,
      tenantId,
    );
    if (!parent) {
      this.logger.warn(
        `Parent ${settlement.parentId} not found for offboarding notification`,
      );
      return;
    }

    // Get tenant details
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, tradingName: true, email: true, phone: true },
    });
    if (!tenant) {
      this.logger.warn(
        `Tenant ${tenantId} not found for offboarding notification`,
      );
      return;
    }

    const crecheName = tenant.tradingName || tenant.name;
    const reasonText = reason === 'GRADUATION' ? 'graduation' : 'withdrawal';
    const formattedDate = endDate.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Build credit message if applicable
    let creditMessage = '';
    if (creditAmount > 0) {
      const creditRands = (creditAmount / 100).toFixed(2);
      switch (creditAction) {
        case 'refunded':
          creditMessage = `\n\nA credit of R${creditRands} will be refunded to you.`;
          break;
        case 'applied':
          creditMessage = `\n\nA credit of R${creditRands} has been applied to your account.`;
          break;
        case 'sibling':
          creditMessage = `\n\nA credit of R${creditRands} has been transferred to your other child's account.`;
          break;
        case 'donated':
          creditMessage = `\n\nThank you for donating your credit of R${creditRands} to ${crecheName}.`;
          break;
      }
    }

    // Send email notification
    if (this.emailService && parent.email) {
      try {
        const subject =
          reason === 'GRADUATION'
            ? `Congratulations on ${settlement.childName}'s Graduation! 🎓`
            : `Confirmation: ${settlement.childName}'s Withdrawal from ${crecheName}`;

        const body =
          reason === 'GRADUATION'
            ? `Dear ${parent.firstName},

Congratulations! We are delighted to confirm that ${settlement.childName} has successfully completed their time at ${crecheName} and is ready to move on to the next exciting chapter of their educational journey.

Graduation Date: ${formattedDate}

It has been a privilege to be part of ${settlement.childName}'s early learning experience. We wish them all the best in big school!${creditMessage}

A final statement has been generated and will be sent to you separately.

Thank you for trusting ${crecheName} with your child's care and education.

Warm regards,
The ${crecheName} Team
${tenant.phone ? `Tel: ${tenant.phone}` : ''}
${tenant.email ? `Email: ${tenant.email}` : ''}`
            : `Dear ${parent.firstName},

This email confirms that ${settlement.childName}'s enrollment at ${crecheName} has been concluded as per your request.

Last Day: ${formattedDate}${creditMessage}

A final statement has been generated and will be sent to you separately.

We wish ${settlement.childName} and your family all the best for the future.

Kind regards,
The ${crecheName} Team
${tenant.phone ? `Tel: ${tenant.phone}` : ''}
${tenant.email ? `Email: ${tenant.email}` : ''}`;

        await this.emailService.sendEmail(parent.email, subject, body);

        this.logger.log(
          `TASK-WA-009: Offboarding email sent to ${parent.email} for ${settlement.childName}`,
        );
      } catch (error) {
        this.logger.warn(
          `TASK-WA-009: Failed to send offboarding email: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Send WhatsApp notification if opted in
    if (
      this.twilioWhatsAppService?.isConfigured() &&
      (parent.whatsapp || parent.phone) &&
      parent.whatsappOptIn
    ) {
      const whatsAppNumber = (parent.whatsapp || parent.phone) as string;

      try {
        let message: string;

        if (reason === 'GRADUATION') {
          message = `🎓 *Congratulations!*

Dear ${parent.firstName},

We're thrilled to confirm that *${settlement.childName}* has graduated from ${crecheName}!

📅 Graduation Date: ${formattedDate}

It's been a joy watching ${settlement.childName} grow and learn with us. We wish them all the best in big school!${creditMessage}

Your final statement will be sent separately.

Thank you for being part of the ${crecheName} family! 💙`;
        } else {
          message = `Dear ${parent.firstName},

This confirms that *${settlement.childName}'s* enrollment at ${crecheName} has ended.

📅 Last Day: ${formattedDate}${creditMessage}

Your final statement will be sent separately.

We wish ${settlement.childName} and your family all the best.

Kind regards,
${crecheName}`;
        }

        const result = await this.twilioWhatsAppService.sendMessage(
          whatsAppNumber,
          message,
          { tenantId },
        );

        if (result.success) {
          this.logger.log(
            `TASK-WA-009: Offboarding WhatsApp sent to ${whatsAppNumber} for ${settlement.childName}`,
          );
        } else {
          this.logger.warn(
            `TASK-WA-009: WhatsApp offboarding notification failed: ${result.error}`,
          );
        }
      } catch (error) {
        // Non-blocking - don't fail offboarding if WhatsApp fails
        this.logger.warn(
          `TASK-WA-009: WhatsApp error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
