<task_spec id="TASK-TRANS-035" version="1.0">

<metadata>
  <title>Offline OCR Fallback for Scanned PDF Bank Statements</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>140</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <gap_ref>GAP-001</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use integration-focused thinking with fallback strategy awareness.
This task involves:
1. Detecting scanned/image-based PDF pages
2. Tesseract.js OCR for offline text extraction
3. Fallback chain: pdf-parse -> Tesseract.js -> LLMWhisperer
4. No external API dependency for basic OCR
</reasoning_mode>

<context>
GAP-001: Scanned PDF OCR currently depends on LLMWhisperer API. When this external service is unavailable, scanned PDFs cannot be processed.

REQ-TRANS-001 specifies: "Import transactions via bank feed, PDF, or CSV upload."

This task adds Tesseract.js as an offline OCR fallback between local pdf-parse and LLMWhisperer, ensuring scanned PDFs can be processed without external API calls.
</context>

<current_state>
## Codebase State
- HybridPdfParser exists: `apps/api/src/database/parsers/hybrid-pdf-parser.ts`
- PdfParser (pdf-parse) for native text PDFs
- LLMWhispererParser for scanned PDFs (requires API)
- No offline OCR capability exists

## What Exists
- Confidence-based routing between parsers
- Fallback to local results when LLMWhisperer unavailable
- Transaction extraction with confidence scoring

## What's Missing
- Tesseract.js integration for offline OCR
- Scanned page detection logic
- Enhanced fallback chain with OCR step
</current_state>

<input_context_files>
  <file purpose="hybrid_parser">apps/api/src/database/parsers/hybrid-pdf-parser.ts</file>
  <file purpose="pdf_parser">apps/api/src/database/parsers/pdf-parser.ts</file>
  <file purpose="import_dto">apps/api/src/database/dto/import.dto.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - TesseractOcrParser class using tesseract.js
    - Scanned page detection (low text-to-page ratio)
    - Integration into HybridPdfParser fallback chain
    - Confidence scoring for OCR results
    - Unit tests for OCR parser
  </in_scope>
  <out_of_scope>
    - Training custom OCR models
    - Multi-language support (English/Afrikaans only)
    - Real-time OCR progress streaming
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/parsers/tesseract-ocr-parser.ts">
      import { createWorker } from 'tesseract.js';

      export class TesseractOcrParser {
        async parse(buffer: Buffer): Promise&lt;ParsedTransaction[]&gt;;
        async extractText(buffer: Buffer): Promise&lt;string&gt;;
        isScannedPdf(textContent: string, pageCount: number): boolean;
      }
    </signature>
  </signatures>

  <constraints>
    - Use tesseract.js v5 for Node.js compatibility
    - Language: eng (English) for SA bank statements
    - Minimum confidence threshold: 70%
    - Must not block event loop (use worker)
    - Memory limit: 256MB per document
  </constraints>

  <verification>
    - Scanned PDFs processed without LLMWhisperer
    - Text PDFs continue using pdf-parse (faster)
    - OCR results include confidence scores
    - Fallback chain: pdf-parse -> Tesseract -> LLMWhisperer
    - Tests pass with sample scanned statement
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/parsers/tesseract-ocr-parser.ts">Tesseract.js OCR parser</file>
  <file path="apps/api/src/database/parsers/__tests__/tesseract-ocr-parser.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/parsers/hybrid-pdf-parser.ts">Add Tesseract.js to fallback chain</file>
  <file path="apps/api/src/database/parsers/index.ts">Export TesseractOcrParser</file>
  <file path="apps/api/package.json">Add tesseract.js dependency</file>
</files_to_modify>

<validation_criteria>
  <criterion>TesseractOcrParser extracts text from scanned PDFs</criterion>
  <criterion>isScannedPdf correctly detects image-based PDFs</criterion>
  <criterion>HybridPdfParser uses Tesseract when pdf-parse yields low confidence</criterion>
  <criterion>No external API calls for basic scanned PDFs</criterion>
  <criterion>Tests pass including OCR integration test</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="tesseract-ocr" --verbose</command>
</test_commands>

</task_spec>
