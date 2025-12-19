<task_spec id="TASK-TRANS-011" version="1.0">

<metadata>
  <title>Transaction Import Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>16</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the TransactionImportService which handles file uploads and parsing
for CSV, PDF, and OFX bank statement imports. The service validates file formats,
parses transaction data, detects duplicates based on date/amount/description, and
queues categorization jobs using Bull. This is the entry point for all transaction
data into the system before AI categorization.
</context>

<input_context_files>
  <file purpose="api_contract">specs/technical/api-contracts.md#TransactionService.importFromFile</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="transaction_repository">src/database/repositories/transaction.repository.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Bull queue infrastructure configured</check>
  <check>CSV parser library available (papaparse or csv-parse)</check>
  <check>PDF parser library available (pdf-parse)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create TransactionImportService in src/core/transaction/
    - Implement file validation (format, size, structure)
    - Implement CSV parsing with configurable column mapping
    - Implement PDF parsing for common SA bank formats
    - Implement duplicate detection algorithm
    - Queue categorization jobs after successful import
    - Create ImportResult DTOs
    - Handle multi-tenant isolation
  </in_scope>
  <out_of_scope>
    - OFX/QIF parsing (future enhancement)
    - Categorization logic (TASK-TRANS-012)
    - Bank feed integration (future)
    - File storage (use temp files)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/transaction/transaction-import.service.ts">
      @Injectable()
      export class TransactionImportService {
        constructor(
          private readonly transactionRepo: TransactionRepository,
          @InjectQueue('categorization') private categorizationQueue: Queue
        )

        async importFromFile(
          file: Express.Multer.File,
          source: ImportSource,
          bankAccount: string,
          tenantId: string
        ): Promise&lt;ImportResult&gt;

        private async parseCSV(file: Express.Multer.File): Promise&lt;ParsedTransaction[]&gt;
        private async parsePDF(file: Express.Multer.File): Promise&lt;ParsedTransaction[]&gt;
        private async detectDuplicates(
          transactions: ParsedTransaction[],
          tenantId: string,
          bankAccount: string
        ): Promise&lt;DuplicateCheckResult&gt;
        private async storeBatch(
          transactions: ParsedTransaction[],
          tenantId: string,
          source: ImportSource,
          importBatchId: string
        ): Promise&lt;Transaction[]&gt;
        private async queueCategorization(transactionIds: string[]): Promise&lt;void&gt;
      }
    </signature>
    <signature file="src/core/transaction/dto/import.dto.ts">
      export interface ParsedTransaction {
        date: Date;
        description: string;
        payeeName?: string;
        reference?: string;
        amountCents: number;
        isCredit: boolean;
      }

      export interface ImportResult {
        importBatchId: string;
        status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
        fileName: string;
        totalParsed: number;
        duplicatesSkipped: number;
        transactionsCreated: number;
        errors: ImportError[];
      }

      export interface DuplicateCheckResult {
        unique: ParsedTransaction[];
        duplicates: ParsedTransaction[];
      }

      export interface ImportError {
        row?: number;
        field?: string;
        message: string;
      }
    </signature>
    <signature file="src/core/transaction/parsers/csv-parser.ts">
      export class CsvParser {
        parse(buffer: Buffer): Promise&lt;ParsedTransaction[]&gt;
        private detectDelimiter(sample: string): string
        private mapColumns(row: Record&lt;string, string&gt;): ParsedTransaction
      }
    </signature>
    <signature file="src/core/transaction/parsers/pdf-parser.ts">
      export class PdfParser {
        parse(buffer: Buffer): Promise&lt;ParsedTransaction[]&gt;
        private extractText(buffer: Buffer): Promise&lt;string&gt;
        private parseStandardBank(text: string): ParsedTransaction[]
        private parseFNB(text: string): ParsedTransaction[]
        private parseAbsa(text: string): ParsedTransaction[]
      }
    </signature>
  </signatures>

  <constraints>
    - Maximum file size: 10MB
    - Must validate file extensions (.csv, .pdf only)
    - Must use tenant_id for all queries
    - Duplicate detection window: 90 days before each transaction
    - Must store import_batch_id for traceability
    - All amounts must be converted to cents (integer)
    - Must handle SA currency formats (1,234.56 or 1 234.56)
    - Must NOT use 'any' type anywhere
    - Queue jobs must include tenant context
  </constraints>

  <verification>
    - Service successfully imports valid CSV files
    - Service successfully imports valid PDF files
    - Duplicate detection correctly identifies existing transactions
    - Import batch ID is assigned and tracked
    - Categorization jobs are queued after import
    - Multi-tenant isolation verified (no cross-tenant duplicates)
    - Unit tests pass for all parsers
    - Integration tests pass for full import flow
  </verification>
</definition_of_done>

<pseudo_code>
TransactionImportService (src/core/transaction/transaction-import.service.ts):
  @Injectable()
  export class TransactionImportService:
    constructor(
      private transactionRepo: TransactionRepository,
      @InjectQueue('categorization') private categorizationQueue: Queue
    )

    async importFromFile(file, source, bankAccount, tenantId):
      // 1. Validate file
      if file.size > 10MB:
        throw FileValidationError('File too large')
      if !['csv', 'pdf'].includes(file.extension):
        throw FileValidationError('Invalid format')

      // 2. Parse based on format
      const importBatchId = uuid()
      let parsedTxns: ParsedTransaction[]

      if source === CSV_IMPORT:
        parsedTxns = await this.parseCSV(file)
      else if source === PDF_IMPORT:
        parsedTxns = await this.parsePDF(file)

      // 3. Detect duplicates
      const { unique, duplicates } = await this.detectDuplicates(
        parsedTxns,
        tenantId,
        bankAccount
      )

      // 4. Store unique transactions
      const created = await this.storeBatch(
        unique,
        tenantId,
        source,
        importBatchId
      )

      // 5. Queue categorization
      const ids = created.map(tx => tx.id)
      await this.queueCategorization(ids)

      // 6. Return result
      return {
        importBatchId,
        status: 'PROCESSING',
        fileName: file.originalname,
        totalParsed: parsedTxns.length,
        duplicatesSkipped: duplicates.length,
        transactionsCreated: created.length,
        errors: []
      }

    private async parseCSV(file):
      const parser = new CsvParser()
      return await parser.parse(file.buffer)

    private async parsePDF(file):
      const parser = new PdfParser()
      return await parser.parse(file.buffer)

    private async detectDuplicates(transactions, tenantId, bankAccount):
      // Get existing transactions from last 90 days
      const oldestDate = min(transactions.map(tx => tx.date))
      const lookbackDate = subDays(oldestDate, 90)

      const existing = await this.transactionRepo.findByTenant(tenantId, {
        bankAccount,
        dateFrom: lookbackDate,
        isDeleted: false
      })

      // Build hash set for O(1) lookup
      const existingSet = new Set(
        existing.map(tx =>
          `${tx.date}|${tx.description}|${tx.amountCents}`
        )
      )

      // Separate unique from duplicates
      const unique = []
      const duplicates = []

      for (const tx of transactions):
        const hash = `${tx.date}|${tx.description}|${tx.amountCents}`
        if existingSet.has(hash):
          duplicates.push(tx)
        else:
          unique.push(tx)
          existingSet.add(hash) // Prevent intra-file duplicates

      return { unique, duplicates }

    private async storeBatch(transactions, tenantId, source, importBatchId):
      const dtos = transactions.map(tx => ({
        tenantId,
        bankAccount: this.bankAccount,
        date: tx.date,
        description: tx.description,
        payeeName: tx.payeeName,
        reference: tx.reference,
        amountCents: tx.amountCents,
        isCredit: tx.isCredit,
        source,
        importBatchId,
        status: 'PENDING'
      }))

      // Bulk insert for performance
      return await this.transactionRepo.createMany(dtos)

    private async queueCategorization(transactionIds):
      await this.categorizationQueue.add('categorize-batch', {
        transactionIds,
        tenantId: this.tenantId
      }, {
        priority: 10,
        removeOnComplete: true
      })

CsvParser (src/core/transaction/parsers/csv-parser.ts):
  export class CsvParser:
    async parse(buffer: Buffer): Promise&lt;ParsedTransaction[]&gt;:
      const text = buffer.toString('utf-8')

      // Auto-detect delimiter
      const delimiter = this.detectDelimiter(text)

      // Parse CSV
      const records = await csvParse(text, {
        delimiter,
        columns: true,
        skip_empty_lines: true,
        trim: true
      })

      // Map to ParsedTransaction
      return records.map((row, index) => {
        try:
          return this.mapColumns(row)
        catch (error):
          throw new ParseError(`Row ${index + 2}: ${error.message}`)
      })

    private detectDelimiter(sample: string): string:
      const firstLine = sample.split('\n')[0]
      if firstLine.includes('\t'):
        return '\t'
      if firstLine.split(',').length > firstLine.split(';').length:
        return ','
      return ';'

    private mapColumns(row: Record&lt;string, string&gt;): ParsedTransaction:
      // Flexible mapping - try common column names
      const dateValue = row['Date'] || row['Transaction Date'] || row['date']
      const descValue = row['Description'] || row['Narration'] || row['description']
      const amountValue = row['Amount'] || row['Value'] || row['amount']
      const debitValue = row['Debit'] || row['debit']
      const creditValue = row['Credit'] || row['credit']

      if (!dateValue || !descValue):
        throw new Error('Missing required fields')

      // Parse date (support DD/MM/YYYY and YYYY-MM-DD)
      const date = parseDate(dateValue)

      // Parse amount
      let amountCents: number
      let isCredit: boolean

      if amountValue:
        // Single amount column (negative = debit)
        const parsed = parseCurrency(amountValue)
        amountCents = Math.abs(parsed * 100)
        isCredit = parsed > 0
      else if debitValue || creditValue:
        // Separate debit/credit columns
        if creditValue && parseCurrency(creditValue) !== 0:
          amountCents = Math.abs(parseCurrency(creditValue) * 100)
          isCredit = true
        else:
          amountCents = Math.abs(parseCurrency(debitValue) * 100)
          isCredit = false

      return {
        date,
        description: descValue.trim(),
        payeeName: this.extractPayeeName(descValue),
        reference: row['Reference'] || row['Ref'] || null,
        amountCents,
        isCredit
      }

    private extractPayeeName(description: string): string | null:
      // Extract payee from description (heuristic)
      // e.g., "POS PURCHASE WOOLWORTHS SANDTON" -> "WOOLWORTHS"
      const cleaned = description.replace(/^(POS|ATM|EFT|DEBIT ORDER)\s+/i, '')
      const words = cleaned.split(/\s+/)
      return words.length > 0 ? words[0] : null

PdfParser (src/core/transaction/parsers/pdf-parser.ts):
  export class PdfParser:
    async parse(buffer: Buffer): Promise&lt;ParsedTransaction[]&gt;:
      // Extract text from PDF
      const text = await this.extractText(buffer)

      // Detect bank format from header
      if text.includes('STANDARD BANK'):
        return this.parseStandardBank(text)
      else if text.includes('FNB') || text.includes('FIRST NATIONAL BANK'):
        return this.parseFNB(text)
      else if text.includes('ABSA'):
        return this.parseAbsa(text)
      else:
        throw new Error('Unsupported bank format')

    private async extractText(buffer: Buffer): Promise&lt;string&gt;:
      const data = await pdfParse(buffer)
      return data.text

    private parseStandardBank(text: string): ParsedTransaction[]:
      // Standard Bank format: DD/MM/YYYY | Description | Amount
      const lines = text.split('\n')
      const transactions = []

      for (const line of lines):
        // Regex: date | description | amount
        const match = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.\d{2})/)
        if match:
          const [_, dateStr, description, amountStr] = match
          const date = parseDate(dateStr)
          const amount = parseCurrency(amountStr)

          transactions.push({
            date,
            description: description.trim(),
            payeeName: this.extractPayeeName(description),
            reference: null,
            amountCents: Math.abs(amount * 100),
            isCredit: amount > 0
          })

      return transactions

    private parseFNB(text: string): ParsedTransaction[]:
      // FNB format parsing logic
      // Similar structure, adapt regex

    private parseAbsa(text: string): ParsedTransaction[]:
      // ABSA format parsing logic
      // Similar structure, adapt regex

Utility Functions (src/core/transaction/parsers/parse-utils.ts):
  export function parseCurrency(value: string): number:
    // Handle SA formats: "1,234.56" or "1 234.56" or "-1234.56"
    const cleaned = value.replace(/\s/g, '').replace(/,/g, '')
    return parseFloat(cleaned)

  export function parseDate(value: string): Date:
    // Try DD/MM/YYYY first
    if value.match(/^\d{2}\/\d{2}\/\d{4}$/):
      const [day, month, year] = value.split('/')
      return new Date(`${year}-${month}-${day}`)
    // Try YYYY-MM-DD
    else if value.match(/^\d{4}-\d{2}-\d{2}$/):
      return new Date(value)
    else:
      throw new Error(`Invalid date format: ${value}`)
</pseudo_code>

<files_to_create>
  <file path="src/core/transaction/transaction-import.service.ts">Main import service</file>
  <file path="src/core/transaction/dto/import.dto.ts">Import DTOs and interfaces</file>
  <file path="src/core/transaction/parsers/csv-parser.ts">CSV parsing logic</file>
  <file path="src/core/transaction/parsers/pdf-parser.ts">PDF parsing logic</file>
  <file path="src/core/transaction/parsers/parse-utils.ts">Shared parsing utilities</file>
  <file path="tests/core/transaction/transaction-import.service.spec.ts">Service tests</file>
  <file path="tests/core/transaction/parsers/csv-parser.spec.ts">CSV parser tests</file>
  <file path="tests/core/transaction/parsers/pdf-parser.spec.ts">PDF parser tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/transaction/index.ts">Export TransactionImportService</file>
  <file path="src/database/repositories/transaction.repository.ts">Add createMany method for bulk insert</file>
  <file path="src/config/queue.config.ts">Add categorization queue configuration</file>
</files_to_modify>

<validation_criteria>
  <criterion>CSV files parse correctly with auto-delimiter detection</criterion>
  <criterion>PDF files parse for Standard Bank, FNB, and ABSA formats</criterion>
  <criterion>Duplicate detection works correctly across 90-day window</criterion>
  <criterion>Import batch IDs are unique and tracked</criterion>
  <criterion>Categorization jobs are queued after successful import</criterion>
  <criterion>Multi-tenant isolation verified (duplicates checked per tenant)</criterion>
  <criterion>File size validation prevents uploads > 10MB</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- --grep "TransactionImportService"</command>
  <command>npm run test -- --grep "CsvParser"</command>
  <command>npm run test -- --grep "PdfParser"</command>
  <command>npm run build</command>
</test_commands>

</task_spec>
