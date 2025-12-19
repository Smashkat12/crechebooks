<task_spec id="TASK-TRANS-032" version="1.0">

<metadata>
  <title>Transaction Import Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>44</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the transaction import endpoint for the CrecheBooks system. It creates
the multipart/form-data POST endpoint for uploading bank statement files (CSV, PDF, OFX),
with file validation, size limits, and asynchronous queue processing. The endpoint returns
immediately with a job ID while processing happens in the background.
</context>

<input_context_files>
  <file purpose="transaction_service">src/core/transaction/transaction.service.ts</file>
  <file purpose="import_processor">src/core/transaction/import.processor.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#transactions/import</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-031 completed (Transaction controller base)</check>
  <check>TASK-TRANS-011 completed (Transaction service with import logic)</check>
  <check>Bull queue configured for background processing</check>
</prerequisites>

<scope>
  <in_scope>
    - Add POST /transactions/import endpoint to TransactionController
    - Configure multipart/form-data with file upload
    - Implement file validation (type, size, format)
    - Create import request/response DTOs
    - Queue import job for background processing
    - Add Swagger/OpenAPI file upload documentation
    - Return 202 Accepted with job status
    - Add file size limit (10MB) and type validation
  </in_scope>
  <out_of_scope>
    - File parsing logic (in TransactionService)
    - Background queue processor (in TASK-TRANS-011)
    - Import status polling endpoint (future enhancement)
    - Duplicate detection (in service layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/transaction/transaction.controller.ts">
      @Post('import')
      @HttpCode(202)
      @ApiOperation({ summary: 'Import transactions from file' })
      @ApiConsumes('multipart/form-data')
      @ApiResponse({ status: 202, type: ImportResponseDto })
      @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
          const allowedTypes = ['text/csv', 'application/pdf', 'application/x-ofx'];
          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new BadRequestException('Invalid file type. Allowed: CSV, PDF, OFX'), false);
          }
        }
      }))
      async importTransactions(
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: ImportTransactionsDto,
        @CurrentUser() user: User
      ): Promise&lt;ImportResponseDto&gt;;
    </signature>
    <signature file="src/api/transaction/dto/import-transactions.dto.ts">
      export class ImportTransactionsDto {
        @IsEnum(ImportSource)
        @ApiProperty({ enum: ImportSource, example: 'CSV_IMPORT' })
        source: ImportSource;

        @IsString()
        @ApiProperty({ example: 'main-checking-account' })
        bank_account: string;
      }

      export class ImportResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          import_id: string;
          status: string;
          file_name: string;
          estimated_count: number;
        };
      }
    </signature>
    <signature file="src/api/transaction/dto/import-file.dto.ts">
      export class ImportFileDto {
        @ApiProperty({ type: 'string', format: 'binary' })
        file: Express.Multer.File;

        @ApiProperty({ enum: ImportSource })
        source: ImportSource;

        @ApiProperty()
        bank_account: string;
      }
    </signature>
  </signatures>

  <constraints>
    - File size limit must be 10MB
    - Accepted file types: text/csv, application/pdf, application/x-ofx
    - Must return 202 Accepted (not 201 Created)
    - Must queue job and return immediately
    - File validation must happen before queueing
    - Must include estimated_count in response (from file size heuristic)
    - Swagger must show file upload UI
    - Must clean up uploaded file after queueing
    - Must validate bank_account exists for tenant
  </constraints>

  <verification>
    - POST /transactions/import accepts CSV file
    - POST /transactions/import accepts PDF file
    - POST /transactions/import accepts OFX file
    - Rejects files over 10MB with 400
    - Rejects invalid file types with 400
    - Returns 202 with import_id and status: PROCESSING
    - Background job is queued successfully
    - Swagger shows file upload interface
    - Uploaded file is cleaned up after processing
  </verification>
</definition_of_done>

<pseudo_code>
TransactionController (src/api/transaction/transaction.controller.ts):
  @Post('import')
  @HttpCode(202)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', fileUploadConfig))
  async importTransactions(
    file: Express.Multer.File,
    dto: ImportTransactionsDto,
    user: User
  ):
    # Validate file exists
    if (!file):
      throw new BadRequestException('File is required')

    # Validate bank account belongs to tenant
    bankAccountExists = await bankAccountService.exists(
      dto.bank_account,
      user.tenantId
    )
    if (!bankAccountExists):
      throw new BadRequestException('Invalid bank account')

    # Estimate transaction count from file size
    estimatedCount = Math.ceil(file.size / 100) # rough heuristic

    # Queue import job
    importJob = await transactionService.queueImport({
      file: file,
      source: dto.source,
      bankAccount: dto.bank_account,
      tenantId: user.tenantId,
      userId: user.id
    })

    # Return immediately
    return {
      success: true,
      data: {
        import_id: importJob.id,
        status: 'PROCESSING',
        file_name: file.originalname,
        estimated_count: estimatedCount
      }
    }

File Upload Configuration:
  const fileUploadConfig = {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'text/csv',
        'application/pdf',
        'application/x-ofx'
      ]

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new BadRequestException(
          'Invalid file type. Allowed: CSV, PDF, OFX'
        ), false)
      }
    }
  }

Swagger Configuration for File Upload:
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary'
        },
        source: {
          type: 'string',
          enum: ['CSV_IMPORT', 'PDF_IMPORT']
        },
        bank_account: {
          type: 'string'
        }
      }
    }
  })
</pseudo_code>

<files_to_create>
  <file path="src/api/transaction/dto/import-transactions.dto.ts">Import request/response DTOs</file>
  <file path="src/api/transaction/dto/import-file.dto.ts">File upload DTO for Swagger</file>
  <file path="src/api/transaction/config/file-upload.config.ts">File upload configuration</file>
  <file path="tests/api/transaction/import.spec.ts">Import endpoint unit tests</file>
  <file path="tests/api/transaction/import.e2e-spec.ts">Import E2E tests with file uploads</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/transaction/transaction.controller.ts">Add import endpoint</file>
  <file path="src/api/transaction/transaction.module.ts">Import MulterModule</file>
  <file path="package.json">Add @nestjs/platform-express dependency</file>
</files_to_modify>

<validation_criteria>
  <criterion>Accepts CSV files and returns 202</criterion>
  <criterion>Accepts PDF files and returns 202</criterion>
  <criterion>Accepts OFX files and returns 202</criterion>
  <criterion>Rejects files over 10MB with 400</criterion>
  <criterion>Rejects invalid file types with 400</criterion>
  <criterion>Returns import_id for tracking</criterion>
  <criterion>Background job is queued</criterion>
  <criterion>Swagger shows file upload UI correctly</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- import.spec</command>
  <command>npm run test:e2e -- import.e2e-spec</command>
  <command>curl -H "Authorization: Bearer TOKEN" -F "file=@statement.csv" -F "source=CSV_IMPORT" -F "bank_account=main" http://localhost:3000/v1/transactions/import</command>
  <command>curl -H "Authorization: Bearer TOKEN" -F "file=@statement.pdf" -F "source=PDF_IMPORT" -F "bank_account=main" http://localhost:3000/v1/transactions/import</command>
</test_commands>

</task_spec>
