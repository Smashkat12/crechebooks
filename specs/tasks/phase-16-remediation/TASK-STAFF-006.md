<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-006</task_id>
    <title>Enforce UI-19 14-Day Deadline</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>compliance</category>
    <estimated_effort>4 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-30</due_date>
    <tags>ui-19, uif, compliance, deadlines, validation</tags>
  </metadata>

  <context>
    <problem_statement>
      The UI-19 form (UIF commencement/termination notification) must be submitted within
      14 days of an employee starting or leaving. Currently, the system does not enforce
      this deadline, allowing submissions that may result in compliance penalties from the
      Department of Labour.
    </problem_statement>

    <business_impact>
      - Non-compliance with UIF Act requirements
      - Potential fines from Department of Labour
      - Late submissions may affect employee UIF benefits
      - Manual tracking of submission deadlines
      - Audit findings for late/missing submissions
    </business_impact>

    <technical_background>
      The UI-19 form must be submitted to the Department of Labour:
      - Within 14 days of an employee starting work (commencement)
      - Within 14 days of an employee leaving work (termination)

      The system should track submission deadlines, warn users of approaching deadlines,
      and optionally block or flag late submissions.
    </technical_background>

    <dependencies>
      - Staff start/end date tracking
      - UI-19 submission status tracking
      - Notification system for warnings
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Add deadline calculation for UI-19 submissions</item>
      <item>Implement validation preventing/warning on late submissions</item>
      <item>Add dashboard alerts for approaching deadlines</item>
      <item>Create scheduled job to check for overdue submissions</item>
      <item>Add configuration for deadline enforcement mode</item>
      <item>Track submission history with timestamps</item>
    </in_scope>

    <out_of_scope>
      <item>Actual UI-19 form generation (existing functionality)</item>
      <item>Electronic submission to Department of Labour</item>
      <item>Historical data cleanup/migration</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/staff/ui19.service.ts</file>
      <file action="create">apps/api/src/staff/ui19-deadline.service.ts</file>
      <file action="create">apps/api/src/staff/dto/ui19-submission.dto.ts</file>
      <file action="create">apps/api/src/staff/entities/ui19-submission.entity.ts</file>
      <file action="create">apps/api/src/staff/jobs/ui19-deadline.job.ts</file>
      <file action="modify">apps/api/src/staff/staff.controller.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Create a deadline tracking system that calculates UI-19 due dates based on staff
      employment events. Implement configurable enforcement (warn vs block) with dashboard
      alerts and scheduled notifications for approaching deadlines.
    </approach>

    <steps>
      <step order="1">
        <description>Create UI-19 submission entity</description>
        <details>
          ```typescript
          // ui19-submission.entity.ts
          import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';

          export enum UI19Type {
            COMMENCEMENT = 'COMMENCEMENT',
            TERMINATION = 'TERMINATION'
          }

          export enum UI19Status {
            PENDING = 'PENDING',
            SUBMITTED = 'SUBMITTED',
            LATE_SUBMITTED = 'LATE_SUBMITTED',
            OVERDUE = 'OVERDUE'
          }

          @Entity('ui19_submissions')
          export class UI19Submission {
            @PrimaryGeneratedColumn('uuid')
            id: string;

            @ManyToOne(() => Staff, staff => staff.ui19Submissions)
            @JoinColumn({ name: 'staff_id' })
            staff: Staff;

            @Column()
            staffId: string;

            @Column({ type: 'enum', enum: UI19Type })
            type: UI19Type;

            @Column({ type: 'date' })
            eventDate: Date; // Start or end date

            @Column({ type: 'date' })
            dueDate: Date; // 14 days from event

            @Column({ type: 'enum', enum: UI19Status, default: UI19Status.PENDING })
            status: UI19Status;

            @Column({ type: 'timestamp', nullable: true })
            submittedAt: Date;

            @Column({ nullable: true })
            submittedBy: string;

            @Column({ nullable: true })
            referenceNumber: string; // DoL reference if available

            @Column({ type: 'text', nullable: true })
            notes: string;

            @Column({ default: false })
            lateSubmissionAcknowledged: boolean;

            @Column({ nullable: true })
            lateReason: string;

            @CreateDateColumn()
            createdAt: Date;
          }
          ```
        </details>
      </step>

      <step order="2">
        <description>Create deadline calculation service</description>
        <details>
          ```typescript
          // ui19-deadline.service.ts
          import { Injectable, Logger, BadRequestException } from '@nestjs/common';
          import { InjectRepository } from '@nestjs/typeorm';
          import { Repository, LessThan, In } from 'typeorm';
          import { addDays, differenceInDays, isAfter, startOfDay } from 'date-fns';

          export interface DeadlineConfig {
            deadlineDays: number;
            warningDays: number;
            enforcementMode: 'warn' | 'block' | 'log';
          }

          @Injectable()
          export class UI19DeadlineService {
            private readonly logger = new Logger(UI19DeadlineService.name);
            private readonly DEFAULT_CONFIG: DeadlineConfig = {
              deadlineDays: 14,
              warningDays: 7,
              enforcementMode: 'warn'
            };

            constructor(
              @InjectRepository(UI19Submission)
              private readonly submissionRepo: Repository<UI19Submission>,
              private readonly configService: ConfigService,
              private readonly notificationService: NotificationService
            ) {}

            getConfig(): DeadlineConfig {
              return {
                deadlineDays: this.configService.get('UI19_DEADLINE_DAYS', this.DEFAULT_CONFIG.deadlineDays),
                warningDays: this.configService.get('UI19_WARNING_DAYS', this.DEFAULT_CONFIG.warningDays),
                enforcementMode: this.configService.get('UI19_ENFORCEMENT_MODE', this.DEFAULT_CONFIG.enforcementMode)
              };
            }

            calculateDueDate(eventDate: Date): Date {
              const config = this.getConfig();
              return addDays(startOfDay(eventDate), config.deadlineDays);
            }

            getDaysRemaining(dueDate: Date): number {
              return differenceInDays(dueDate, startOfDay(new Date()));
            }

            isOverdue(dueDate: Date): boolean {
              return isAfter(startOfDay(new Date()), dueDate);
            }

            isApproachingDeadline(dueDate: Date): boolean {
              const config = this.getConfig();
              const daysRemaining = this.getDaysRemaining(dueDate);
              return daysRemaining <= config.warningDays && daysRemaining > 0;
            }

            async createCommencementSubmission(staff: Staff): Promise<UI19Submission> {
              const dueDate = this.calculateDueDate(staff.startDate);

              const submission = this.submissionRepo.create({
                staffId: staff.id,
                type: UI19Type.COMMENCEMENT,
                eventDate: staff.startDate,
                dueDate,
                status: UI19Status.PENDING
              });

              return this.submissionRepo.save(submission);
            }

            async createTerminationSubmission(staff: Staff, endDate: Date): Promise<UI19Submission> {
              const dueDate = this.calculateDueDate(endDate);

              const submission = this.submissionRepo.create({
                staffId: staff.id,
                type: UI19Type.TERMINATION,
                eventDate: endDate,
                dueDate,
                status: UI19Status.PENDING
              });

              return this.submissionRepo.save(submission);
            }

            async submitUI19(
              submissionId: string,
              userId: string,
              referenceNumber?: string,
              lateReason?: string
            ): Promise<UI19Submission> {
              const submission = await this.submissionRepo.findOne({
                where: { id: submissionId },
                relations: ['staff']
              });

              if (!submission) {
                throw new NotFoundException(`UI-19 submission not found: ${submissionId}`);
              }

              const isLate = this.isOverdue(submission.dueDate);
              const config = this.getConfig();

              if (isLate) {
                if (config.enforcementMode === 'block' && !lateReason) {
                  throw new BadRequestException(
                    'UI-19 submission is past due date. A reason for late submission is required.'
                  );
                }

                this.logger.warn(
                  `Late UI-19 submission for staff ${submission.staffId}: ` +
                  `Due ${submission.dueDate}, submitted ${new Date()}`
                );
              }

              submission.status = isLate ? UI19Status.LATE_SUBMITTED : UI19Status.SUBMITTED;
              submission.submittedAt = new Date();
              submission.submittedBy = userId;
              submission.referenceNumber = referenceNumber;
              submission.lateSubmissionAcknowledged = isLate;
              submission.lateReason = lateReason;

              return this.submissionRepo.save(submission);
            }

            async getPendingSubmissions(tenantId: string): Promise<UI19Submission[]> {
              return this.submissionRepo.find({
                where: {
                  status: In([UI19Status.PENDING, UI19Status.OVERDUE]),
                  staff: { tenantId }
                },
                relations: ['staff'],
                order: { dueDate: 'ASC' }
              });
            }

            async getOverdueSubmissions(tenantId: string): Promise<UI19Submission[]> {
              const today = startOfDay(new Date());

              return this.submissionRepo.find({
                where: {
                  status: UI19Status.PENDING,
                  dueDate: LessThan(today),
                  staff: { tenantId }
                },
                relations: ['staff'],
                order: { dueDate: 'ASC' }
              });
            }

            async getDashboardAlerts(tenantId: string): Promise<UI19Alert[]> {
              const pending = await this.getPendingSubmissions(tenantId);

              return pending.map(submission => ({
                submissionId: submission.id,
                staffId: submission.staffId,
                staffName: `${submission.staff.firstName} ${submission.staff.lastName}`,
                type: submission.type,
                eventDate: submission.eventDate,
                dueDate: submission.dueDate,
                daysRemaining: this.getDaysRemaining(submission.dueDate),
                isOverdue: this.isOverdue(submission.dueDate),
                isApproaching: this.isApproachingDeadline(submission.dueDate),
                severity: this.getAlertSeverity(submission.dueDate)
              }));
            }

            private getAlertSeverity(dueDate: Date): 'critical' | 'warning' | 'info' {
              if (this.isOverdue(dueDate)) return 'critical';
              if (this.isApproachingDeadline(dueDate)) return 'warning';
              return 'info';
            }
          }

          export interface UI19Alert {
            submissionId: string;
            staffId: string;
            staffName: string;
            type: UI19Type;
            eventDate: Date;
            dueDate: Date;
            daysRemaining: number;
            isOverdue: boolean;
            isApproaching: boolean;
            severity: 'critical' | 'warning' | 'info';
          }
          ```
        </details>
      </step>

      <step order="3">
        <description>Create scheduled job for deadline monitoring</description>
        <details>
          ```typescript
          // ui19-deadline.job.ts
          import { Injectable, Logger } from '@nestjs/common';
          import { Cron, CronExpression } from '@nestjs/schedule';

          @Injectable()
          export class UI19DeadlineJob {
            private readonly logger = new Logger(UI19DeadlineJob.name);

            constructor(
              private readonly deadlineService: UI19DeadlineService,
              private readonly notificationService: NotificationService,
              private readonly tenantService: TenantService
            ) {}

            @Cron(CronExpression.EVERY_DAY_AT_8AM)
            async checkDeadlines() {
              this.logger.log('Running UI-19 deadline check');

              const tenants = await this.tenantService.getAllActive();

              for (const tenant of tenants) {
                await this.checkTenantDeadlines(tenant.id);
              }
            }

            private async checkTenantDeadlines(tenantId: string) {
              // Update overdue status
              await this.updateOverdueStatuses(tenantId);

              // Send notifications
              await this.sendDeadlineNotifications(tenantId);
            }

            private async updateOverdueStatuses(tenantId: string) {
              const overdue = await this.deadlineService.getOverdueSubmissions(tenantId);

              for (const submission of overdue) {
                submission.status = UI19Status.OVERDUE;
                await this.submissionRepo.save(submission);

                this.logger.warn(
                  `UI-19 overdue: Staff ${submission.staffId}, Type ${submission.type}, ` +
                  `Due ${submission.dueDate}`
                );
              }
            }

            private async sendDeadlineNotifications(tenantId: string) {
              const alerts = await this.deadlineService.getDashboardAlerts(tenantId);
              const tenant = await this.tenantService.findById(tenantId);

              // Critical alerts (overdue)
              const critical = alerts.filter(a => a.severity === 'critical');
              if (critical.length > 0) {
                await this.notificationService.sendToAdmins(tenantId, {
                  type: 'UI19_OVERDUE',
                  title: `${critical.length} UI-19 submission(s) overdue`,
                  message: `The following UI-19 forms are past their submission deadline and require immediate attention.`,
                  data: { alerts: critical },
                  priority: 'high'
                });
              }

              // Warning alerts (approaching deadline)
              const warnings = alerts.filter(a => a.severity === 'warning');
              if (warnings.length > 0) {
                await this.notificationService.sendToAdmins(tenantId, {
                  type: 'UI19_APPROACHING',
                  title: `${warnings.length} UI-19 submission(s) due soon`,
                  message: `The following UI-19 forms are approaching their submission deadline.`,
                  data: { alerts: warnings },
                  priority: 'medium'
                });
              }
            }
          }
          ```
        </details>
      </step>

      <step order="4">
        <description>Add API endpoints for UI-19 management</description>
        <details>
          ```typescript
          // In staff.controller.ts or create ui19.controller.ts

          @Controller('staff/ui19')
          @UseGuards(AuthGuard)
          export class UI19Controller {
            constructor(private readonly ui19Service: UI19Service) {}

            @Get('pending')
            async getPendingSubmissions(@Request() req) {
              return this.ui19Service.getPendingSubmissions(req.user.tenantId);
            }

            @Get('alerts')
            async getAlerts(@Request() req) {
              return this.ui19Service.getDashboardAlerts(req.user.tenantId);
            }

            @Get(':id')
            async getSubmission(@Param('id') id: string) {
              return this.ui19Service.getSubmissionById(id);
            }

            @Post(':id/submit')
            async submitUI19(
              @Param('id') id: string,
              @Body() dto: SubmitUI19Dto,
              @Request() req
            ) {
              return this.ui19Service.submitUI19(
                id,
                req.user.id,
                dto.referenceNumber,
                dto.lateReason
              );
            }

            @Get('staff/:staffId')
            async getStaffSubmissions(@Param('staffId') staffId: string) {
              return this.ui19Service.getSubmissionsForStaff(staffId);
            }
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Create submission DTOs with validation</description>
        <details>
          ```typescript
          // ui19-submission.dto.ts
          import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

          export class SubmitUI19Dto {
            @IsString()
            @IsOptional()
            @MaxLength(50)
            referenceNumber?: string;

            @IsString()
            @IsOptional()
            @MaxLength(500)
            lateReason?: string;
          }

          export class UI19FilterDto {
            @IsEnum(UI19Type)
            @IsOptional()
            type?: UI19Type;

            @IsEnum(UI19Status)
            @IsOptional()
            status?: UI19Status;

            @IsOptional()
            @IsDateString()
            fromDate?: string;

            @IsOptional()
            @IsDateString()
            toDate?: string;
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Integrate with staff creation/termination flows</description>
        <details>
          ```typescript
          // In staff.service.ts

          async createStaff(dto: CreateStaffDto, tenantId: string): Promise<Staff> {
            const staff = await this.staffRepository.save({
              ...dto,
              tenantId
            });

            // Automatically create UI-19 commencement submission
            await this.ui19DeadlineService.createCommencementSubmission(staff);

            return staff;
          }

          async terminateStaff(staffId: string, endDate: Date): Promise<Staff> {
            const staff = await this.staffRepository.findOneOrFail({ where: { id: staffId } });

            staff.endDate = endDate;
            staff.status = StaffStatus.TERMINATED;

            await this.staffRepository.save(staff);

            // Automatically create UI-19 termination submission
            await this.ui19DeadlineService.createTerminationSubmission(staff, endDate);

            return staff;
          }
          ```
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Configurable Enforcement">
        ```typescript
        const config = this.getConfig();
        if (isLate && config.enforcementMode === 'block') {
          throw new BadRequestException('...');
        } else if (isLate && config.enforcementMode === 'warn') {
          this.logger.warn('...');
        }
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test deadline calculation (14 days)</description>
        <file>apps/api/src/staff/__tests__/ui19-deadline.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test overdue detection</description>
        <file>apps/api/src/staff/__tests__/ui19-deadline.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test enforcement modes (warn, block, log)</description>
        <file>apps/api/src/staff/__tests__/ui19-deadline.service.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test automatic submission creation on staff events</description>
        <file>apps/api/src/staff/__tests__/staff.service.integration.spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>UI-19 submission records automatically created on staff start/end</criterion>
      <criterion>14-day deadline calculated correctly from event date</criterion>
      <criterion>Dashboard shows overdue and approaching deadline alerts</criterion>
      <criterion>Late submissions are flagged and require reason in block mode</criterion>
      <criterion>Daily job sends notifications for upcoming/overdue submissions</criterion>
      <criterion>Enforcement mode is configurable per tenant</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>UI19Submission entity created and migrated</item>
      <item>Deadline calculation service implemented</item>
      <item>Automatic submission creation on staff events</item>
      <item>Dashboard alerts API endpoint working</item>
      <item>Scheduled job checking deadlines daily</item>
      <item>Notification integration complete</item>
      <item>Configurable enforcement modes tested</item>
      <item>Unit and integration tests passing</item>
      <item>Code reviewed and approved</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="legislation">Unemployment Insurance Act 63 of 2001</reference>
    <reference type="form">UI-19 Form - Declaration of Employee Commencement/Termination</reference>
    <reference type="documentation">https://www.labour.gov.za/ui-forms</reference>
  </references>
</task_specification>
