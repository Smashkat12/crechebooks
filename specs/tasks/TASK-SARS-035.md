<task_spec id="TASK-SARS-035" version="2.0">

<metadata>
  <title>Replace Mock eFiling with File Generation</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>182</sequence>
  <implements>
    <requirement_ref>REQ-SARS-EFILING-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-033</task_ref>
    <task_ref status="complete">TASK-SPAY-001</task_ref> <!-- SimplePay Tax Service -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort> <!-- Reduced: leveraging existing SimplePay integration -->
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create/Modify:**
  - `apps/api/src/database/services/sars-file-generator.service.ts` (NEW)
  - `apps/api/src/database/dto/sars-file.dto.ts` (NEW)
  - `apps/api/src/api/sars/sars.controller.ts`
  - `apps/api/src/api/sars/sars.module.ts`

  **Existing SimplePay Integration to Leverage:**
  - `apps/api/src/integrations/simplepay/simplepay-tax.service.ts`
  - `apps/api/src/integrations/simplepay/entities/simplepay.entity.ts`

  **Current Problem:**
  The SARS eFiling submission currently uses mock/placeholder implementation.
  SARS eFiling API is not publicly available - submissions are done via:
  1. Manual upload of CSV/XML files through SARS eFiling portal
  2. Third-party payroll software with SARS integration

  **Required Solution:**
  Leverage existing SimplePay integration to fetch authoritative payroll data, then format into SARS-compliant CSV files that users can download and manually upload to eFiling portal.

  **SimplePay Data Already Available:**
  - `SimplePayTaxService.fetchEmp201()` - Returns EMP201 data (PAYE, UIF, SDL, ETI totals)
  - `SimplePayTaxService.fetchIrp5Certificates()` - Returns employee IRP5 data for EMP501
  - `SimplePayTaxService.getIrp5Pdf()` - Downloads IRP5 PDF (already implemented)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. SARS File Format - EMP201 CSV
  ```csv
  EMP201,2026,01,1234567890,MONTHLY,0
  PAYE_PAID,150000.00
  UIF_PAID,30000.00
  SDL_PAID,15000.00
  ETI_CLAIMED,5000.00
  TOTAL_PAID,190000.00
  EMPLOYEE_COUNT,25
  ```

  ### 3. SARS File Format - EMP501 CSV (Annual Reconciliation)
  ```csv
  EMP501,2025,2026,1234567890
  EMPLOYEE,8501015800084,MODISE,THABO,180000.00,32400.00,1800.00,3600.00
  EMPLOYEE,8701025800085,NKOSI,NOMVULA,240000.00,48240.00,2400.00,4800.00
  SUMMARY,TOTAL_GROSS,420000.00
  SUMMARY,TOTAL_PAYE,80640.00
  SUMMARY,TOTAL_UIF_EE,4200.00
  SUMMARY,TOTAL_UIF_ER,8400.00
  ```

  ### 4. Service Pattern (Leveraging SimplePay Integration)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';
  import { SimplePayTaxService } from '../../integrations/simplepay/simplepay-tax.service';

  @Injectable()
  export class SarsFileGeneratorService {
    private readonly logger = new Logger(SarsFileGeneratorService.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly simplePayTaxService: SimplePayTaxService,
    ) {}

    async generateEmp201Csv(
      tenantId: string,
      taxYear: number,
      taxPeriod: number,
    ): Promise<{ filename: string; content: string; mimeType: string }> {
      // Fetch EMP201 data from SimplePay (source of truth for payroll)
      const periodDate = new Date(taxYear, taxPeriod - 1, 1);
      const emp201Data = await this.simplePayTaxService.fetchEmp201(tenantId, periodDate);

      // Get tenant's PAYE reference number
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { payeReferenceNumber: true },
      });

      // Format as SARS-compliant CSV with CRLF line endings
      const lines = [
        `EMP201,${taxYear},${String(taxPeriod).padStart(2, '0')},${tenant.payeReferenceNumber},MONTHLY,0`,
        `PAYE_PAID,${emp201Data.total_paye.toFixed(2)}`,
        `UIF_PAID,${(emp201Data.total_uif_employer + emp201Data.total_uif_employee).toFixed(2)}`,
        `SDL_PAID,${emp201Data.total_sdl.toFixed(2)}`,
        `ETI_CLAIMED,${emp201Data.total_eti.toFixed(2)}`,
        `TOTAL_PAID,${(emp201Data.total_paye + emp201Data.total_uif_employer + emp201Data.total_uif_employee + emp201Data.total_sdl).toFixed(2)}`,
        `EMPLOYEE_COUNT,${emp201Data.employees_count}`,
      ];

      const content = lines.join('\r\n');
      const filename = `EMP201_${tenant.payeReferenceNumber}_${taxYear}_${String(taxPeriod).padStart(2, '0')}.csv`;

      return { filename, content, mimeType: 'text/csv' };
    }

    async generateEmp501Csv(
      tenantId: string,
      taxYearStart: number,
      taxYearEnd: number,
    ): Promise<{ filename: string; content: string; mimeType: string }> {
      // Fetch IRP5 certificates from SimplePay for all employees
      const staff = await this.prisma.staff.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, idNumber: true },
      });

      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { payeReferenceNumber: true },
      });

      const lines: string[] = [
        `EMP501,${taxYearStart},${taxYearEnd},${tenant.payeReferenceNumber}`,
      ];

      let totalGross = 0, totalPaye = 0, totalUifEe = 0, totalUifEr = 0;

      for (const employee of staff) {
        const irp5 = await this.simplePayTaxService.fetchIrp5Certificates(
          tenantId, employee.id, taxYearEnd
        );
        if (irp5) {
          lines.push(`EMPLOYEE,${employee.idNumber},${employee.lastName},${employee.firstName},${irp5.gross_remuneration.toFixed(2)},${irp5.paye_deducted.toFixed(2)},${irp5.uif_employee.toFixed(2)},${irp5.uif_employer.toFixed(2)}`);
          totalGross += irp5.gross_remuneration;
          totalPaye += irp5.paye_deducted;
          totalUifEe += irp5.uif_employee;
          totalUifEr += irp5.uif_employer;
        }
      }

      lines.push(`SUMMARY,TOTAL_GROSS,${totalGross.toFixed(2)}`);
      lines.push(`SUMMARY,TOTAL_PAYE,${totalPaye.toFixed(2)}`);
      lines.push(`SUMMARY,TOTAL_UIF_EE,${totalUifEe.toFixed(2)}`);
      lines.push(`SUMMARY,TOTAL_UIF_ER,${totalUifEr.toFixed(2)}`);
      lines.push(`SUMMARY,EMPLOYEE_COUNT,${staff.length}`);

      const content = lines.join('\r\n');
      const filename = `EMP501_${tenant.payeReferenceNumber}_${taxYearStart}_${taxYearEnd}.csv`;

      return { filename, content, mimeType: 'text/csv' };
    }
  }
  ```

  ### 5. Controller Pattern
  ```typescript
  @Get('emp201/download')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Download EMP201 CSV for SARS eFiling upload' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  async downloadEmp201(
    @CurrentUser() user: IUser,
    @Query('taxYear') taxYear: number,
    @Query('taxPeriod') taxPeriod: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.sarsFileService.generateEmp201Csv(
      user.tenantId,
      taxYear,
      taxPeriod,
    );

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task replaces the mock eFiling implementation with actual file generation. Since SARS doesn't provide a public API, we generate CSV files that users can download and manually upload to the SARS eFiling portal.

**CRITICAL: Leverage Existing SimplePay Integration**

SimplePay is the authoritative source for payroll data. The `SimplePayTaxService` already provides:

| Method | Data Returned | Use For |
|--------|---------------|---------|
| `fetchEmp201(tenantId, periodDate)` | PAYE, UIF, SDL, ETI totals, employee count | EMP201 CSV generation |
| `fetchIrp5Certificates(tenantId, staffId, taxYear)` | Gross remuneration, PAYE deducted, UIF amounts | EMP501 employee rows |
| `getIrp5Pdf(tenantId, staffId, taxYear)` | IRP5 PDF document | Already implemented |
| `compareEmp201(tenantId, periodDate)` | Comparison of local vs SimplePay data | Validation/reconciliation |

**Benefits of Using SimplePay Data:**
1. **Data Consistency** - SARS files match SimplePay payroll exactly
2. **No Duplication** - Avoid recalculating values already computed by SimplePay
3. **Audit Trail** - Single source of truth for tax submissions
4. **Error Reduction** - SimplePay handles complex PAYE/UIF/SDL calculations

**File Types:**
1. **EMP201** - Monthly employer declaration (PAYE, UIF, SDL) - Use `fetchEmp201()`
2. **EMP501** - Annual reconciliation (employee earnings summary) - Use `fetchIrp5Certificates()`
3. **IRP5** - Employee tax certificate (PDF already implemented via `getIrp5Pdf()`)

**User Workflow:**
1. User generates EMP201/EMP501 in CrecheBooks
2. System fetches data from SimplePay via existing integration
3. System formats data into SARS-compliant CSV
4. User downloads CSV file
5. User logs into SARS eFiling and uploads CSV
6. SARS validates and accepts submission
</context>

<scope>
  <in_scope>
    - Create SarsFileGeneratorService with CSV generation methods
    - **Inject SimplePayTaxService to fetch authoritative payroll data**
    - Add EMP201 CSV generation using `fetchEmp201()` data
    - Add EMP501 CSV generation using `fetchIrp5Certificates()` data
    - Add download endpoints to SarsController
    - Add file metadata DTOs
    - Create comprehensive tests for file format
    - Validate CSV format matches SARS specifications
    - Add tests that mock SimplePayTaxService responses
  </in_scope>
  <out_of_scope>
    - Direct SARS eFiling API integration (not publicly available)
    - XML format generation (CSV is sufficient for eFiling)
    - IRP5 PDF generation (already implemented via SimplePayTaxService)
    - VAT201 filing (separate VAT module)
    - Automated submission tracking
    - Recalculating PAYE/UIF/SDL (use SimplePay values)
  </out_of_scope>
</scope>

<sars_file_specifications>
## EMP201 CSV Format

### Header Row
```
EMP201,{TAX_YEAR},{TAX_PERIOD},{PAYE_REF_NO},{PAYMENT_FREQ},{VERSION}
```

### Data Rows
```
PAYE_PAID,{AMOUNT}
UIF_PAID,{AMOUNT}
SDL_PAID,{AMOUNT}
ETI_CLAIMED,{AMOUNT}
TOTAL_PAID,{AMOUNT}
EMPLOYEE_COUNT,{COUNT}
```

### Example
```csv
EMP201,2026,01,1234567890,MONTHLY,0
PAYE_PAID,15000.00
UIF_PAID,3000.00
SDL_PAID,1500.00
ETI_CLAIMED,500.00
TOTAL_PAID,19000.00
EMPLOYEE_COUNT,5
```

## EMP501 CSV Format

### Header Row
```
EMP501,{TAX_YEAR_START},{TAX_YEAR_END},{PAYE_REF_NO}
```

### Employee Rows
```
EMPLOYEE,{ID_NUMBER},{SURNAME},{FIRST_NAME},{GROSS_REMUN},{PAYE},{UIF_EE},{UIF_ER}
```

### Summary Rows
```
SUMMARY,TOTAL_GROSS,{AMOUNT}
SUMMARY,TOTAL_PAYE,{AMOUNT}
SUMMARY,TOTAL_UIF_EE,{AMOUNT}
SUMMARY,TOTAL_UIF_ER,{AMOUNT}
SUMMARY,EMPLOYEE_COUNT,{COUNT}
```
</sars_file_specifications>

<verification_commands>
## Execution Order

```bash
# 1. Create DTO file
# Create apps/api/src/database/dto/sars-file.dto.ts

# 2. Create service file
# Create apps/api/src/database/services/sars-file-generator.service.ts

# 3. Update controller
# Edit apps/api/src/api/sars/sars.controller.ts

# 4. Update module
# Edit apps/api/src/api/sars/sars.module.ts

# 5. Create tests
# Create apps/api/tests/database/services/sars-file-generator.service.spec.ts

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing

# 7. Manual verification
# Download generated CSV and validate format
```
</verification_commands>

<definition_of_done>
  <constraints>
    - CSV format must match SARS eFiling specifications
    - All monetary values formatted with 2 decimal places
    - ID numbers validated (13 digits)
    - Tax year validation (must be valid tax year)
    - File encoding must be UTF-8
    - Line endings must be CRLF (Windows format) for SARS compatibility
    - Filename format: EMP201_{PAYE_REF}_{YYYY}_{MM}.csv
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: EMP201 CSV format validation
    - Test: EMP501 CSV format validation
    - Test: Monetary value formatting (2 decimals)
    - Test: ID number validation
    - Test: Empty data handling
    - Test: Multi-employee EMP501 generation
    - **Test: SimplePayTaxService.fetchEmp201() is called with correct params**
    - **Test: SimplePayTaxService.fetchIrp5Certificates() is called for each employee**
    - **Test: SimplePay data is correctly mapped to CSV format**
    - **Test: Error handling when SimplePay API unavailable**
    - Manual: Download and verify CSV opens in Excel
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Use LF line endings (SARS requires CRLF)
  - Format monetary values without decimals
  - Skip ID number validation
  - Return JSON when CSV is requested
  - Include header row in data section
  - Use streams for small files (just return string)
  - **Recalculate PAYE/UIF/SDL values** - Use SimplePay data as source of truth
  - **Query local payroll tables** for tax calculations - SimplePay already did this
  - **Bypass SimplePayTaxService** - Always fetch from SimplePay for data consistency
  - **Duplicate IRP5 logic** - Use existing `fetchIrp5Certificates()` method
</anti_patterns>

</task_spec>
