<task_spec id="TASK-PERF-103" version="1.0">

<metadata>
  <title>Stream-based Bank Statement Import</title>
  <status>ready</status>
  <phase>usacf-sprint-2</phase>
  <layer>performance</layer>
  <sequence>205</sequence>
  <priority>P1-HIGH</priority>
  <sprint>2</sprint>
  <estimated_effort>6 days (48 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP007</opportunity_ref>
    <gap_ref>P003</gap_ref>
    <edge_case_ref>EC038</edge_case_ref>
  </implements>
  <depends_on>
    <!-- No strict dependencies -->
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <confidence>85%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP007</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
    Bank statement import is critical for reconciliation - handles large CSV files.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <queue>BullMQ with Redis for background import jobs</queue>
    <streaming>Node.js streams with csv-parse library</streaming>
    <testing>Jest for unit/integration, no mock data - use real test files</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real CSV test fixtures, not mocked parsers</rule>
    <rule id="3">ROBUST ERROR LOGGING - log malformed rows with line number and content</rule>
    <rule id="4">TENANT ISOLATION - all imported transactions tagged with tenantId</rule>
    <rule id="5">MEMORY EFFICIENCY - never load entire file into memory</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="streaming">Use AsyncGenerator for row-by-row processing</pattern>
    <pattern name="batching">Batch database writes in chunks of 100</pattern>
  </coding_patterns>

  <existing_import_structure>
    - Bank import service at apps/api/src/database/services/bank-import.service.ts
    - Currently loads ENTIRE file into memory (this task adds streaming)
    - Import controller at apps/api/src/api/reconciliation/bank-import.controller.ts
  </existing_import_structure>
</project_context>

<executive_summary>
Implement stream-based processing for bank statement imports to handle large files (50MB+)
without memory spikes. Currently, entire file is loaded into memory causing OOM risk with
large imports. Stream processing will maintain flat memory usage regardless of file size.
</executive_summary>

<business_case>
  <problem>Large bank imports (50MB+) cause memory spikes and potential OOM crashes</problem>
  <solution>Stream-based processing with chunked database writes</solution>
  <benefit>Handle unlimited file sizes, flat memory profile</benefit>
  <roi>Infrastructure savings, reliability improvement</roi>
</business_case>

<context>
GAP P003: Memory spike on large bank imports causing OOM risk.
Edge Case EC038: Large file upload timeout.

Current State (bank-import.service.ts):
```typescript
// MEMORY INTENSIVE - loads entire file
async importStatement(file: Express.Multer.File): Promise<ImportResult> {
  const content = file.buffer.toString('utf-8');  // Entire file in memory!
  const rows = parse(content, { columns: true });  // Entire parsed result in memory!

  for (const row of rows) {
    await this.createTransaction(row);  // One at a time, slow
  }
}
```

Memory Profile (50MB file):
- File buffer: 50MB
- Parsed rows: ~75MB (overhead)
- Transaction objects: ~25MB
- Peak: 150MB+ (vs 512MB container limit)
</context>

<input_context_files>
  <file purpose="bank_import_service">apps/api/src/database/services/bank-import.service.ts</file>
  <file purpose="transaction_import">apps/api/src/database/services/transaction-import.service.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Implement stream-based CSV parsing
    - Chunked database writes (batch of 100)
    - Progress tracking and reporting
    - Memory-efficient file handling
    - Support for large files (50MB+)
    - Cancellation support for long imports
    - Import progress WebSocket updates
  </in_scope>
  <out_of_scope>
    - PDF statement parsing (different approach needed)
    - Real-time duplicate detection during stream
    - Multi-file concurrent import
    - Resume interrupted imports
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/bank-import-stream.service.ts">
      @Injectable()
      export class BankImportStreamService {
        async importFromStream(
          stream: Readable,
          bankAccount: string,
          tenantId: string,
          options?: StreamImportOptions
        ): AsyncGenerator&lt;ImportProgress&gt;;

        async parseCSVStream(stream: Readable): AsyncGenerator&lt;TransactionRow&gt;;

        async writeBatch(
          transactions: TransactionRow[],
          tenantId: string
        ): Promise&lt;BatchWriteResult&gt;;
      }
    </signature>
    <signature file="apps/api/src/api/reconciliation/bank-import.controller.ts">
      @Post('/import/stream')
      @UseInterceptors(FileInterceptor('file'))
      async importBankStatementStream(
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: ImportBankStatementDto,
        @CurrentUser() user: IUser
      ): Promise&lt;ImportJobResponse&gt;;

      @Get('/import/:jobId/progress')
      @Sse()
      streamProgress(@Param('jobId') jobId: string): Observable&lt;ImportProgress&gt;;
    </signature>
  </signatures>

  <constraints>
    - Memory usage must stay flat regardless of file size
    - Maximum memory: 100MB for import processing
    - Batch size: 100 transactions per database write
    - Progress updates every 500 rows
    - Must handle malformed rows gracefully (skip with error log)
    - Timeout: 10 minutes max for any import
  </constraints>

  <verification>
    - 50MB file imports with &lt;100MB memory usage
    - 100MB file imports successfully
    - Progress events sent every 500 rows
    - Malformed rows logged and skipped
    - Import completes within 10 minutes
    - No memory leaks on repeated imports
  </verification>
</definition_of_done>

<implementation_approach>
  <step order="1">
    Create stream CSV parser using csv-parse/stream:
    ```typescript
    import { parse } from 'csv-parse';
    import { Transform } from 'stream';

    async *parseCSVStream(readable: Readable): AsyncGenerator<TransactionRow> {
      const parser = readable.pipe(parse({ columns: true }));

      for await (const record of parser) {
        yield this.transformRow(record);
      }
    }
    ```
  </step>
  <step order="2">
    Implement batch accumulator with flush:
    ```typescript
    async *processBatches(
      rows: AsyncGenerator<TransactionRow>,
      batchSize: number = 100
    ): AsyncGenerator<BatchWriteResult> {
      let batch: TransactionRow[] = [];

      for await (const row of rows) {
        batch.push(row);
        if (batch.length >= batchSize) {
          yield await this.writeBatch(batch);
          batch = [];
        }
      }

      if (batch.length > 0) {
        yield await this.writeBatch(batch);
      }
    }
    ```
  </step>
  <step order="3">
    Add progress tracking and SSE endpoint
  </step>
  <step order="4">
    Implement cancellation support
  </step>
  <step order="5">
    Create background job for large imports
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/database/services/bank-import-stream.service.ts">
    Stream-based import service
  </file>
  <file path="apps/api/src/jobs/bank-import.processor.ts">
    Bull queue processor for background imports
  </file>
  <file path="apps/api/src/database/services/__tests__/bank-import-stream.service.spec.ts">
    Stream import tests
  </file>
  <file path="apps/api/tests/fixtures/bank-statements/large-50mb.csv">
    Large test file for performance testing
  </file>
  <file path="apps/api/tests/performance/bank-import.perf.ts">
    Memory and performance benchmarks
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/api/reconciliation/bank-import.controller.ts">
    Add stream import endpoint
  </file>
  <file path="apps/api/src/database/services/bank-import.service.ts">
    Refactor to use stream service
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>50MB file imports with &lt;100MB memory peak</criterion>
  <criterion>Progress events sent during import</criterion>
  <criterion>Malformed rows handled gracefully</criterion>
  <criterion>Import can be cancelled mid-progress</criterion>
  <criterion>All existing import tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="bank-import-stream" --verbose</command>
  <command>npm run test:perf -- bank-import</command>
</test_commands>

<success_metrics>
  <metric name="memory_peak_50mb">&lt;100MB</metric>
  <metric name="memory_peak_100mb">&lt;150MB</metric>
  <metric name="throughput">1000 rows/second</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: STREAM_IMPORT_ENABLED (default: true)
  - Fallback to original buffer-based import
  - File size limit on fallback: 10MB
</rollback_plan>

</task_spec>
