<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-003</task_id>
    <title>Add SimplePay Sync Retry Queue</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>integration</category>
    <estimated_effort>6 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-25</due_date>
    <tags>simplepay, integration, queue, bull, retry, resilience</tags>
  </metadata>

  <context>
    <problem_statement>
      SimplePay synchronization failures are not being retried, causing data inconsistencies
      between CrecheBooks and SimplePay. When a sync operation fails due to network issues,
      rate limiting, or temporary SimplePay outages, the data remains out of sync with no
      automatic recovery mechanism.
    </problem_statement>

    <business_impact>
      - Staff payroll data may be missing in SimplePay
      - Manual intervention required to re-sync failed operations
      - Payroll processing delays when SimplePay sync fails
      - Data inconsistencies between systems
      - Staff potentially not paid correctly due to sync failures
    </business_impact>

    <technical_background>
      SimplePay API calls can fail for transient reasons (network timeouts, rate limits,
      temporary outages). A queue-based retry system with Bull/BullMQ provides reliable
      message processing with configurable retry strategies and dead letter handling.
    </technical_background>

    <dependencies>
      - Bull or BullMQ package
      - Redis for queue storage
      - SimplePay API credentials configured
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Implement Bull queue for SimplePay sync operations</item>
      <item>Add exponential backoff retry strategy</item>
      <item>Implement dead letter queue for failed jobs</item>
      <item>Add job status tracking and monitoring</item>
      <item>Create admin endpoints to view/retry failed syncs</item>
      <item>Add alerting for repeated failures</item>
    </in_scope>

    <out_of_scope>
      <item>SimplePay API client implementation (existing)</item>
      <item>Queue infrastructure setup (ops task)</item>
      <item>Dashboard UI for queue monitoring</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/integrations/simplepay/simplepay-sync.service.ts</file>
      <file action="create">apps/api/src/integrations/simplepay/simplepay-sync.processor.ts</file>
      <file action="create">apps/api/src/integrations/simplepay/simplepay-sync.queue.ts</file>
      <file action="create">apps/api/src/integrations/simplepay/dto/sync-job.dto.ts</file>
      <file action="modify">apps/api/src/integrations/simplepay/simplepay.module.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Integrate Bull queue system to handle all SimplePay sync operations. Convert direct
      API calls to queue jobs with automatic retry on failure using exponential backoff.
    </approach>

    <steps>
      <step order="1">
        <description>Install and configure Bull queue</description>
        <details>
          ```bash
          npm install @nestjs/bull bull
          ```

          Configure in simplepay.module.ts:
          ```typescript
          import { BullModule } from '@nestjs/bull';

          @Module({
            imports: [
              BullModule.registerQueue({
                name: 'simplepay-sync',
                defaultJobOptions: {
                  attempts: 5,
                  backoff: {
                    type: 'exponential',
                    delay: 2000 // Start with 2s, then 4s, 8s, 16s, 32s
                  },
                  removeOnComplete: 100,
                  removeOnFail: false
                }
              })
            ],
            providers: [SimplePaySyncService, SimplePaySyncProcessor],
            exports: [SimplePaySyncService]
          })
          export class SimplePayModule {}
          ```
        </details>
      </step>

      <step order="2">
        <description>Create sync job DTOs</description>
        <details>
          ```typescript
          // sync-job.dto.ts
          export enum SyncJobType {
            CREATE_EMPLOYEE = 'CREATE_EMPLOYEE',
            UPDATE_EMPLOYEE = 'UPDATE_EMPLOYEE',
            SYNC_LEAVE = 'SYNC_LEAVE',
            SYNC_PAYROLL = 'SYNC_PAYROLL',
            SYNC_TAX_INFO = 'SYNC_TAX_INFO'
          }

          export interface SyncJobData {
            type: SyncJobType;
            staffId: string;
            tenantId: string;
            payload: Record<string, any>;
            attemptsMade?: number;
            lastError?: string;
          }

          export interface SyncJobResult {
            success: boolean;
            simplePayId?: string;
            error?: string;
            timestamp: Date;
          }
          ```
        </details>
      </step>

      <step order="3">
        <description>Create queue processor</description>
        <details>
          ```typescript
          // simplepay-sync.processor.ts
          import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
          import { Job } from 'bull';
          import { Logger } from '@nestjs/common';

          @Processor('simplepay-sync')
          export class SimplePaySyncProcessor {
            private readonly logger = new Logger(SimplePaySyncProcessor.name);

            constructor(
              private readonly simplePayClient: SimplePayClientService,
              private readonly alertService: AlertService
            ) {}

            @Process()
            async handleSync(job: Job<SyncJobData>): Promise<SyncJobResult> {
              this.logger.log(`Processing sync job ${job.id}: ${job.data.type}`);

              try {
                switch (job.data.type) {
                  case SyncJobType.CREATE_EMPLOYEE:
                    return await this.createEmployee(job.data);
                  case SyncJobType.UPDATE_EMPLOYEE:
                    return await this.updateEmployee(job.data);
                  case SyncJobType.SYNC_LEAVE:
                    return await this.syncLeave(job.data);
                  case SyncJobType.SYNC_PAYROLL:
                    return await this.syncPayroll(job.data);
                  default:
                    throw new Error(`Unknown job type: ${job.data.type}`);
                }
              } catch (error) {
                this.logger.error(`Sync job ${job.id} failed: ${error.message}`);
                throw error; // Let Bull handle retry
              }
            }

            private async createEmployee(data: SyncJobData): Promise<SyncJobResult> {
              const result = await this.simplePayClient.createEmployee(
                data.tenantId,
                data.payload
              );
              return {
                success: true,
                simplePayId: result.employeeId,
                timestamp: new Date()
              };
            }

            // ... other handlers

            @OnQueueFailed()
            async onFailed(job: Job<SyncJobData>, error: Error) {
              this.logger.error(
                `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
              );

              if (job.attemptsMade >= job.opts.attempts) {
                // Max retries reached - alert and move to dead letter
                await this.alertService.sendAlert({
                  type: 'SIMPLEPAY_SYNC_FAILED',
                  message: `SimplePay sync failed for staff ${job.data.staffId}`,
                  details: {
                    jobId: job.id,
                    jobType: job.data.type,
                    error: error.message,
                    attempts: job.attemptsMade
                  }
                });
              }
            }

            @OnQueueCompleted()
            async onCompleted(job: Job<SyncJobData>, result: SyncJobResult) {
              this.logger.log(
                `Job ${job.id} completed: ${result.success ? 'success' : 'failed'}`
              );
            }
          }
          ```
        </details>
      </step>

      <step order="4">
        <description>Update sync service to use queue</description>
        <details>
          ```typescript
          // simplepay-sync.service.ts
          import { InjectQueue } from '@nestjs/bull';
          import { Queue } from 'bull';

          @Injectable()
          export class SimplePaySyncService {
            constructor(
              @InjectQueue('simplepay-sync') private syncQueue: Queue<SyncJobData>
            ) {}

            async queueEmployeeCreate(staffId: string, tenantId: string, data: any): Promise<string> {
              const job = await this.syncQueue.add({
                type: SyncJobType.CREATE_EMPLOYEE,
                staffId,
                tenantId,
                payload: data
              }, {
                priority: 1, // High priority for new employees
                jobId: `create-${staffId}-${Date.now()}`
              });

              return job.id.toString();
            }

            async queuePayrollSync(staffId: string, tenantId: string, payrollData: any): Promise<string> {
              const job = await this.syncQueue.add({
                type: SyncJobType.SYNC_PAYROLL,
                staffId,
                tenantId,
                payload: payrollData
              }, {
                priority: 2,
                delay: 0 // Immediate for payroll
              });

              return job.id.toString();
            }

            async getJobStatus(jobId: string): Promise<JobStatus> {
              const job = await this.syncQueue.getJob(jobId);
              if (!job) return null;

              const state = await job.getState();
              return {
                id: job.id,
                state,
                progress: job.progress(),
                attemptsMade: job.attemptsMade,
                data: job.data,
                failedReason: job.failedReason,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn
              };
            }

            async retryFailedJob(jobId: string): Promise<void> {
              const job = await this.syncQueue.getJob(jobId);
              if (job) {
                await job.retry();
              }
            }

            async getFailedJobs(limit: number = 50): Promise<Job<SyncJobData>[]> {
              return this.syncQueue.getFailed(0, limit);
            }
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Add admin controller endpoints</description>
        <details>
          ```typescript
          // simplepay-admin.controller.ts
          @Controller('admin/simplepay-sync')
          @UseGuards(AdminGuard)
          export class SimplePayAdminController {
            constructor(private readonly syncService: SimplePaySyncService) {}

            @Get('jobs/failed')
            async getFailedJobs(@Query('limit') limit: number = 50) {
              const jobs = await this.syncService.getFailedJobs(limit);
              return jobs.map(job => ({
                id: job.id,
                type: job.data.type,
                staffId: job.data.staffId,
                error: job.failedReason,
                attempts: job.attemptsMade,
                createdAt: job.timestamp
              }));
            }

            @Post('jobs/:id/retry')
            async retryJob(@Param('id') jobId: string) {
              await this.syncService.retryFailedJob(jobId);
              return { success: true, message: 'Job queued for retry' };
            }

            @Get('status')
            async getQueueStatus() {
              return this.syncService.getQueueStats();
            }
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Add queue monitoring and metrics</description>
        <details>
          ```typescript
          async getQueueStats(): Promise<QueueStats> {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
              this.syncQueue.getWaitingCount(),
              this.syncQueue.getActiveCount(),
              this.syncQueue.getCompletedCount(),
              this.syncQueue.getFailedCount(),
              this.syncQueue.getDelayedCount()
            ]);

            return {
              waiting,
              active,
              completed,
              failed,
              delayed,
              timestamp: new Date()
            };
          }
          ```
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Exponential Backoff">
        ```typescript
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000 // 2s -> 4s -> 8s -> 16s -> 32s
          }
        }
        ```
      </pattern>

      <pattern name="Job Priority">
        ```typescript
        // Priority 1 = highest, processed first
        await queue.add(data, { priority: 1 });
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test queue job creation</description>
        <file>apps/api/src/integrations/simplepay/__tests__/simplepay-sync.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test processor handles different job types</description>
        <file>apps/api/src/integrations/simplepay/__tests__/simplepay-sync.processor.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test retry behavior with mocked failures</description>
        <file>apps/api/src/integrations/simplepay/__tests__/simplepay-sync.integration.spec.ts</file>
      </test>

      <test type="e2e">
        <description>Test full sync flow with queue</description>
        <file>apps/api/test/e2e/simplepay-sync.e2e-spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>All SimplePay sync operations go through the queue</criterion>
      <criterion>Failed syncs are automatically retried up to 5 times</criterion>
      <criterion>Exponential backoff prevents API hammering</criterion>
      <criterion>Admin can view failed jobs and manually retry them</criterion>
      <criterion>Alerts sent after max retries exceeded</criterion>
      <criterion>Queue metrics available for monitoring</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Bull queue configured and processing jobs</item>
      <item>All sync operations refactored to use queue</item>
      <item>Exponential backoff retry strategy implemented</item>
      <item>Failed job alerting in place</item>
      <item>Admin endpoints for job management</item>
      <item>Queue metrics and monitoring implemented</item>
      <item>Unit and integration tests passing</item>
      <item>Redis connection properly configured</item>
      <item>Code reviewed and approved</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="documentation">https://docs.nestjs.com/techniques/queues</reference>
    <reference type="package">https://github.com/OptimalBits/bull</reference>
    <reference type="related_task">TASK-STAFF-001 (Xero Journal - similar retry pattern)</reference>
  </references>
</task_specification>
