<task_spec id="TASK-TRANS-032" version="3.0">

<metadata>
  <title>Transaction Import Endpoint</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>44</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-031</task_ref>
    <task_ref>TASK-TRANS-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the POST /transactions/import endpoint for the CrecheBooks system.
The endpoint accepts multipart/form-data file uploads (CSV, PDF) with size limits and type validation.
Processing is SYNCHRONOUS - the service parses, deduplicates, and stores transactions immediately,
returning a complete ImportResult with statistics (totalParsed, duplicatesSkipped, transactionsCreated).

The TransactionImportService already exists at src/database/services/transaction-import.service.ts
and implements all parsing/deduplication logic. This task ONLY creates the API endpoint and DTOs.
</context>

<input_context_files>
  <file purpose="import_service">src/database/services/transaction-import.service.ts</file>
  <file purpose="import_dtos">src/database/dto/import.dto.ts</file>
  <file purpose="current_controller">src/api/transaction/transaction.controller.ts</file>
  <file purpose="current_module">src/api/transaction/transaction.module.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="constitution">specs/constitution.md</file>
</input_context_files>

<existing_service_interface>
// From src/database/services/transaction-import.service.ts

export interface ImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// Method signature:
async importFromFile(
  file: ImportFile,
  bankAccount: string,
  tenantId: string,
): Promise<ImportResult>;

// From src/database/dto/import.dto.ts

export interface ImportResult {
  importBatchId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileName: string;
  totalParsed: number;
  duplicatesSkipped: number;
  transactionsCreated: number;
  errors: ImportError[];
}

export interface ImportError {
  row?: number;
  field?: string;
  message: string;
  code: string;
}
</existing_service_interface>

<prerequisites>
  <check>TASK-TRANS-031 completed - TransactionController exists at src/api/transaction/transaction.controller.ts</check>
  <check>TASK-TRANS-011 completed - TransactionImportService exists with importFromFile() method</check>
  <check>@nestjs/platform-express available for file upload interceptor</check>
</prerequisites>

<scope>
  <in_scope>
    - Add POST /transactions/import endpoint to TransactionController
    - Configure FileInterceptor with Multer for multipart/form-data
    - Create ImportTransactionsRequestDto (bank_account field only - source is auto-detected)
    - Create ImportTransactionsResponseDto matching ImportResult interface
    - Map Express.Multer.File to ImportFile interface for service call
    - Add Swagger/OpenAPI file upload documentation
    - Return 200 OK with full ImportResult (NOT 202 - processing is synchronous)
    - Add file size limit (10MB) and type validation (.csv, .pdf)
    - Add unit tests for controller endpoint
  </in_scope>
  <out_of_scope>
    - File parsing logic (already in TransactionImportService)
    - Duplicate detection (already in TransactionImportService)
    - Async/queue processing (service is synchronous)
    - Import status polling (not needed - synchronous response)
  </out_of_scope>
</scope>

<definition_of_done>
  <file path="src/api/transaction/dto/import-transactions.dto.ts">
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Request DTO for transaction import
 * Source is auto-detected from file extension (.csv or .pdf)
 */
export class ImportTransactionsRequestDto {
  @ApiProperty({
    description: 'Bank account identifier for imported transactions',
    example: 'fnb-business-001',
  })
  @IsString()
  @IsNotEmpty()
  bank_account: string;
}

/**
 * Error details for import failures
 */
export class ImportErrorDto {
  @ApiPropertyOptional({ example: 5, description: 'Row number where error occurred' })
  row?: number;

  @ApiPropertyOptional({ example: 'amount', description: 'Field that caused the error' })
  field?: string;

  @ApiProperty({ example: 'Invalid amount format', description: 'Human-readable error message' })
  message: string;

  @ApiProperty({ example: 'INVALID_AMOUNT', description: 'Machine-readable error code' })
  code: string;
}

/**
 * Import result data
 */
export class ImportResultDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  import_batch_id: string;

  @ApiProperty({ example: 'COMPLETED', enum: ['PROCESSING', 'COMPLETED', 'FAILED'] })
  status: string;

  @ApiProperty({ example: 'fnb-statement-2025-01.pdf' })
  file_name: string;

  @ApiProperty({ example: 45, description: 'Total transactions parsed from file' })
  total_parsed: number;

  @ApiProperty({ example: 3, description: 'Duplicate transactions skipped' })
  duplicates_skipped: number;

  @ApiProperty({ example: 42, description: 'New transactions created' })
  transactions_created: number;

  @ApiProperty({ type: [ImportErrorDto], description: 'Any errors encountered' })
  errors: ImportErrorDto[];
}

/**
 * Response DTO for transaction import
 */
export class ImportTransactionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: ImportResultDataDto })
  data: ImportResultDataDto;
}
```
  </file>

  <file path="src/api/transaction/transaction.controller.ts" action="modify">
```typescript
// ADD these imports at top of file
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionImportService, ImportFile } from '../../database/services/transaction-import.service';
// ... existing imports ...
import {
  ImportTransactionsRequestDto,
  ImportTransactionsResponseDto,
} from './dto';

// ADD TransactionImportService to constructor
constructor(
  private readonly transactionRepo: TransactionRepository,
  private readonly categorizationRepo: CategorizationRepository,
  private readonly importService: TransactionImportService,
) {}

// ADD this endpoint after listTransactions()
@Post('import')
@ApiOperation({
  summary: 'Import transactions from file',
  description: 'Upload CSV or PDF bank statement file. Processing is synchronous - response includes full import statistics.',
})
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    required: ['file', 'bank_account'],
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'Bank statement file (CSV or PDF, max 10MB)',
      },
      bank_account: {
        type: 'string',
        description: 'Bank account identifier',
        example: 'fnb-business-001',
      },
    },
  },
})
@ApiResponse({
  status: 200,
  description: 'Import completed successfully',
  type: ImportTransactionsResponseDto,
})
@ApiResponse({
  status: 400,
  description: 'Invalid file type, file too large, or missing required fields',
})
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
@UseInterceptors(
  FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'pdf') {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            `Invalid file type: .${ext}. Allowed: .csv, .pdf`,
          ),
          false,
        );
      }
    },
  }),
)
async importTransactions(
  @UploadedFile() file: Express.Multer.File,
  @Body() dto: ImportTransactionsRequestDto,
  @CurrentUser() user: IUser,
): Promise<ImportTransactionsResponseDto> {
  if (!file) {
    throw new BadRequestException('File is required');
  }

  if (!dto.bank_account) {
    throw new BadRequestException('bank_account is required');
  }

  this.logger.log(
    `Import request: file=${file.originalname}, size=${file.size}, bank=${dto.bank_account}, tenant=${user.tenantId}`,
  );

  // Map Express.Multer.File to ImportFile interface
  const importFile: ImportFile = {
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  };

  const result = await this.importService.importFromFile(
    importFile,
    dto.bank_account,
    user.tenantId,
  );

  return {
    success: result.status !== 'FAILED',
    data: {
      import_batch_id: result.importBatchId,
      status: result.status,
      file_name: result.fileName,
      total_parsed: result.totalParsed,
      duplicates_skipped: result.duplicatesSkipped,
      transactions_created: result.transactionsCreated,
      errors: result.errors.map((e) => ({
        row: e.row,
        field: e.field,
        message: e.message,
        code: e.code,
      })),
    },
  };
}
```
  </file>

  <file path="src/api/transaction/transaction.module.ts" action="modify">
```typescript
import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { TransactionImportService } from '../../database/services/transaction-import.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [TransactionController],
  providers: [
    TransactionRepository,
    CategorizationRepository,
    TransactionImportService,
  ],
})
export class TransactionModule {}
```
  </file>

  <file path="src/api/transaction/dto/index.ts" action="modify">
```typescript
// ADD to existing exports
export * from './import-transactions.dto';
```
  </file>

  <file path="tests/api/transaction/import.controller.spec.ts">
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { TransactionImportService } from '../../../src/database/services/transaction-import.service';
import { ImportResult } from '../../../src/database/dto/import.dto';
import type { IUser } from '../../../src/database/entities/user.entity';

describe('TransactionController.importTransactions', () => {
  let controller: TransactionController;
  let importService: jest.Mocked<TransactionImportService>;

  const mockUser: IUser = {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockImportResult: ImportResult = {
    importBatchId: 'batch-001',
    status: 'COMPLETED',
    fileName: 'test.csv',
    totalParsed: 10,
    duplicatesSkipped: 2,
    transactionsCreated: 8,
    errors: [],
  };

  beforeEach(async () => {
    const mockImportService = {
      importFromFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionRepository, useValue: {} },
        { provide: CategorizationRepository, useValue: {} },
        { provide: TransactionImportService, useValue: mockImportService },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    importService = module.get(TransactionImportService);
  });

  describe('successful imports', () => {
    it('should import CSV file and return import statistics', async () => {
      importService.importFromFile.mockResolvedValue(mockImportResult);

      const file = {
        buffer: Buffer.from('date,description,amount\n2025-01-01,Test,100'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 1024,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.import_batch_id).toBe('batch-001');
      expect(result.data.status).toBe('COMPLETED');
      expect(result.data.total_parsed).toBe(10);
      expect(result.data.duplicates_skipped).toBe(2);
      expect(result.data.transactions_created).toBe(8);
      expect(importService.importFromFile).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: file.buffer,
          originalname: 'test.csv',
        }),
        'fnb-001',
        'tenant-001',
      );
    });

    it('should import PDF file successfully', async () => {
      const pdfResult: ImportResult = {
        ...mockImportResult,
        fileName: 'statement.pdf',
      };
      importService.importFromFile.mockResolvedValue(pdfResult);

      const file = {
        buffer: Buffer.from('PDF content'),
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
        size: 5000,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.file_name).toBe('statement.pdf');
    });

    it('should return errors from import service', async () => {
      const resultWithErrors: ImportResult = {
        ...mockImportResult,
        status: 'COMPLETED',
        errors: [
          { row: 5, message: 'Invalid date', code: 'INVALID_DATE' },
          { field: 'amount', message: 'Negative value', code: 'INVALID_AMOUNT' },
        ],
      };
      importService.importFromFile.mockResolvedValue(resultWithErrors);

      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.data.errors).toHaveLength(2);
      expect(result.data.errors[0].row).toBe(5);
      expect(result.data.errors[1].field).toBe('amount');
    });

    it('should handle FAILED status from service', async () => {
      const failedResult: ImportResult = {
        ...mockImportResult,
        status: 'FAILED',
        transactionsCreated: 0,
        errors: [{ message: 'Parse failed', code: 'PARSE_ERROR' }],
      };
      importService.importFromFile.mockResolvedValue(failedResult);

      const file = {
        buffer: Buffer.from('bad data'),
        originalname: 'bad.csv',
        mimetype: 'text/csv',
        size: 50,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(false);
      expect(result.data.status).toBe('FAILED');
    });
  });

  describe('validation errors', () => {
    it('should throw BadRequestException when file is missing', async () => {
      await expect(
        controller.importTransactions(
          undefined as unknown as Express.Multer.File,
          { bank_account: 'fnb-001' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when bank_account is missing', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      await expect(
        controller.importTransactions(
          file,
          { bank_account: '' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('tenant isolation', () => {
    it('should pass user tenantId to import service', async () => {
      importService.importFromFile.mockResolvedValue(mockImportResult);

      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        { ...mockUser, tenantId: 'different-tenant' },
      );

      expect(importService.importFromFile).toHaveBeenCalledWith(
        expect.anything(),
        'fnb-001',
        'different-tenant',
      );
    });
  });
});
```
  </file>

  <constraints>
    - File size limit MUST be 10MB (enforced by FileInterceptor)
    - Accepted file extensions: .csv, .pdf (NOT by mimetype - use extension check)
    - MUST return 200 OK (NOT 202 - processing is synchronous)
    - MUST map Express.Multer.File to ImportFile interface before service call
    - MUST use snake_case for API response fields (import_batch_id, not importBatchId)
    - MUST use existing TransactionImportService - no new service logic
    - File validation MUST happen in FileInterceptor fileFilter callback
    - MUST throw BadRequestException for missing file or bank_account
    - Tests MUST use typed mock objects, NOT jest.mock() module mocking
  </constraints>

  <verification>
    - POST /transactions/import accepts CSV file and returns 200
    - POST /transactions/import accepts PDF file and returns 200
    - Rejects files over 10MB with 400 BadRequestException
    - Rejects .txt, .xlsx, .ofx files with 400 BadRequestException
    - Returns complete import statistics (total_parsed, duplicates_skipped, etc)
    - Returns errors array when import has parsing issues
    - Correctly maps ImportResult to snake_case response DTO
    - Swagger UI shows file upload interface with binary field
    - Tenant isolation: uses user.tenantId for service call
    - All 7+ unit tests pass
    - npm run build passes with no TypeScript errors
    - npm run lint passes with no warnings
  </verification>
</definition_of_done>

<files_to_create>
  <file path="src/api/transaction/dto/import-transactions.dto.ts">Import request/response DTOs with Swagger decorators</file>
  <file path="tests/api/transaction/import.controller.spec.ts">Unit tests for import endpoint (7+ tests)</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/transaction/transaction.controller.ts">Add POST import endpoint with FileInterceptor</file>
  <file path="src/api/transaction/transaction.module.ts">Add TransactionImportService to providers</file>
  <file path="src/api/transaction/dto/index.ts">Export new import DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>POST /transactions/import accepts CSV file and returns 200 with statistics</criterion>
  <criterion>POST /transactions/import accepts PDF file and returns 200 with statistics</criterion>
  <criterion>Rejects files over 10MB with 400 BadRequestException</criterion>
  <criterion>Rejects non-CSV/PDF files with 400 BadRequestException</criterion>
  <criterion>Response uses snake_case field names (import_batch_id, total_parsed)</criterion>
  <criterion>Swagger UI shows file upload interface correctly</criterion>
  <criterion>Tenant isolation verified - tenantId passed to service</criterion>
  <criterion>All unit tests pass with >80% coverage</criterion>
  <criterion>npm run build passes</criterion>
  <criterion>npm run lint passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- import.controller.spec</command>
  <command>npm run build</command>
  <command>npm run lint</command>
</test_commands>

<implementation_notes>
1. TransactionImportService is synchronous - NO Bull queue, NO 202 response
2. File type validation uses extension (.csv, .pdf), NOT mimetype (unreliable)
3. Service already handles file size validation internally, but interceptor provides earlier 413 response
4. Use `import type { IUser }` for decorator compatibility with isolatedModules
5. ImportFile interface expects `buffer`, `originalname`, `mimetype`, `size` - all available from Express.Multer.File
6. Response maps camelCase ImportResult to snake_case API response per REST conventions
</implementation_notes>

<completion_notes>
  <completed_date>2025-12-22</completed_date>
  <tests_added>7</tests_added>
  <files_created>
    - src/api/transaction/dto/import-transactions.dto.ts
    - tests/api/transaction/import.controller.spec.ts
  </files_created>
  <files_modified>
    - src/api/transaction/transaction.controller.ts
    - src/api/transaction/transaction.module.ts
    - src/api/transaction/dto/index.ts
    - package.json (@types/multer added)
  </files_modified>
  <learnings>
    - @types/multer required for Express.Multer.File type compatibility
    - FileInterceptor fileFilter uses extension check, not mimetype (more reliable)
    - ImportFile interface maps directly from Express.Multer.File properties
    - CategorizationService mock required in all controller tests
  </learnings>
</completion_notes>

</task_spec>
