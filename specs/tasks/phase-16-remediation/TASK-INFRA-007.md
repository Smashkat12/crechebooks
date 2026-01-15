<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-007</task_id>
    <title>Add Bull Queue Graceful Shutdown</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Infrastructure</category>
    <subcategory>Reliability</subcategory>
    <estimated_effort>3 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      Bull queue jobs are not properly cleaned up during application shutdown.
      When the application restarts or scales down, active jobs may be
      interrupted mid-processing, leading to incomplete operations, stuck
      jobs, and data inconsistencies.
    </issue_description>
    <impact>
      - Jobs interrupted during processing
      - Incomplete database operations
      - Orphaned resources from partial processing
      - Jobs stuck in "active" state after restart
      - Manual intervention required to clean up
      - Potential data corruption from partial updates
    </impact>
    <root_cause>
      Application shutdown does not wait for active Bull queue jobs to
      complete before terminating, and queues are not properly closed.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Add graceful shutdown hooks for Bull queues
      </file>
      <file path="apps/api/src/queues/*.ts" action="modify">
        Ensure queues expose close methods
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/shutdown/shutdown.service.ts" action="create">
        Create centralized shutdown service
      </file>
      <file path="apps/api/src/common/shutdown/shutdown.module.ts" action="create">
        Create shutdown module
      </file>
    </files_to_create>
    <dependencies>
      <dependency>@nestjs/bull for queue management</dependency>
      <dependency>bull for underlying queue implementation</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement graceful shutdown by listening to SIGTERM/SIGINT signals,
      pausing Bull queues to stop accepting new jobs, waiting for active
      jobs to complete with a configurable timeout, and then closing
      queue connections properly.
    </approach>
    <steps>
      <step order="1">
        Create ShutdownService to manage application lifecycle
      </step>
      <step order="2">
        Register SIGTERM and SIGINT signal handlers
      </step>
      <step order="3">
        Implement queue pause logic to stop accepting new jobs
      </step>
      <step order="4">
        Wait for active jobs with configurable timeout
      </step>
      <step order="5">
        Close queue connections and Redis connections
      </step>
      <step order="6">
        Add health check degradation during shutdown
      </step>
    </steps>
    <code_example>
```typescript
// shutdown.service.ts
import { Injectable, OnApplicationShutdown, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private isShuttingDown = false;
  private readonly shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT || '30000');

  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('payment') private paymentQueue: Queue,
    @InjectQueue('notification') private notificationQueue: Queue,
  ) {}

  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Received shutdown signal: ${signal}`);
    this.isShuttingDown = true;

    const queues = [this.emailQueue, this.paymentQueue, this.notificationQueue];

    try {
      // Pause all queues to stop accepting new jobs
      this.logger.log('Pausing all queues...');
      await Promise.all(queues.map(q => q.pause(true)));

      // Wait for active jobs to complete
      this.logger.log('Waiting for active jobs to complete...');
      await this.waitForActiveJobs(queues);

      // Close all queues
      this.logger.log('Closing queue connections...');
      await Promise.all(queues.map(q => q.close()));

      this.logger.log('Graceful shutdown complete');
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error);
    }
  }

  private async waitForActiveJobs(queues: Queue[]): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.shutdownTimeout) {
      const activeCounts = await Promise.all(
        queues.map(q => q.getActiveCount())
      );

      const totalActive = activeCounts.reduce((a, b) => a + b, 0);

      if (totalActive === 0) {
        this.logger.log('All jobs completed');
        return;
      }

      this.logger.log(`Waiting for ${totalActive} active jobs...`);
      await this.sleep(1000);
    }

    this.logger.warn('Shutdown timeout reached, forcing close');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable shutdown hooks
  app.enableShutdownHooks();

  // Get shutdown service for health check integration
  const shutdownService = app.get(ShutdownService);

  // Graceful shutdown configuration
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, starting graceful shutdown...`);
      await app.close();
      process.exit(0);
    });
  });

  await app.listen(3000);
}

// health.controller.ts - integrate shutdown status
@Get()
@HealthCheck()
check() {
  if (this.shutdownService.shuttingDown) {
    throw new ServiceUnavailableException('Service is shutting down');
  }
  return this.health.check([...]);
}

// processor.ts - job processor with cleanup
@Processor('email')
export class EmailProcessor {
  @Process()
  async handleEmail(job: Job<EmailJobData>) {
    try {
      await this.sendEmail(job.data);
    } catch (error) {
      // Ensure partial work is cleaned up
      await this.cleanup(job.data);
      throw error;
    }
  }
}
```
    </code_example>
    <configuration>
      <env_vars>
        <var name="SHUTDOWN_TIMEOUT" default="30000">Max wait time for jobs in ms</var>
        <var name="GRACEFUL_SHUTDOWN" default="true">Enable graceful shutdown</var>
      </env_vars>
    </configuration>
  </implementation>

  <verification>
    <test_cases>
      <test name="Active jobs complete before shutdown">
        Start job, send SIGTERM, verify job completes
      </test>
      <test name="Queues paused during shutdown">
        Verify no new jobs accepted during shutdown
      </test>
      <test name="Timeout forces shutdown">
        Start long job, verify shutdown after timeout
      </test>
      <test name="Health check returns 503 during shutdown">
        Verify health endpoint returns unavailable during shutdown
      </test>
      <test name="Queue connections properly closed">
        Verify Redis connections released after shutdown
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API with active queue jobs</step>
      <step>Send SIGTERM signal to process</step>
      <step>Observe logs showing graceful shutdown progress</step>
      <step>Verify jobs completed before process exit</step>
      <step>Check Redis for any stuck jobs</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>ShutdownService handles SIGTERM/SIGINT signals</criterion>
      <criterion>Queues paused during shutdown</criterion>
      <criterion>Active jobs complete before shutdown</criterion>
      <criterion>Configurable shutdown timeout</criterion>
      <criterion>Health check returns 503 during shutdown</criterion>
      <criterion>Queue connections properly closed</criterion>
      <criterion>Logs capture shutdown progress</criterion>
      <criterion>Unit tests verify shutdown behavior</criterion>
      <criterion>Integration test with actual queue jobs</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
