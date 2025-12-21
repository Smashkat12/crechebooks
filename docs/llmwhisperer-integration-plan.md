# LLMWhisperer PDF Extraction Investigation

## Executive Summary

LLMWhisperer is an AI-powered document extraction service that could replace or augment the current `pdf-parse` implementation for extracting transactions from South African bank statements.

---

## Current Implementation

**File:** `src/database/parsers/pdf-parser.ts`

| Aspect | Current (pdf-parse) |
|--------|---------------------|
| Library | `pdf-parse` (npm) |
| Approach | Regex pattern matching on extracted text |
| Banks Supported | Standard Bank, FNB, ABSA |
| Cost | Free (open source) |
| Accuracy | Pattern-dependent, brittle to format changes |
| Scanned PDFs | No OCR support |
| Handwriting | Not supported |

---

## LLMWhisperer Capabilities

### Extraction Modes

| Mode | Use Case | Bank Statement Fit |
|------|----------|-------------------|
| `native_text` | Digital/machine-readable PDFs | Most bank PDFs |
| `low_cost` | Clean scanned images | Scanned statements |
| `high_quality` | Handwritten/degraded docs | Rarely needed |
| `form` | Checkboxes, structured fields | Not applicable |
| `table` | Dense tabular data | Transaction tables |

### Key Features

1. **Layout Preservation** - Maintains document structure (critical for transaction tables)
2. **OCR Built-in** - Handles scanned statements automatically
3. **Multi-format** - PDF, DOCX, XLSX, CSV, images
4. **Page Selection** - Extract specific pages (`pages_to_extract: "1-5"`)
5. **Line Numbers** - Enables highlighting API for UI feedback
6. **Async Processing** - Webhook callbacks for large documents

### Integration Options

| Option | Description |
|--------|-------------|
| **JavaScript Client** | `npm install llmwhisperer-client` - Direct API integration |
| **MCP Server** | Claude Code tool integration via Docker |
| **REST API** | Direct HTTP calls to extraction endpoint |

---

## Comparison: Current vs LLMWhisperer

| Feature | Current (pdf-parse) | LLMWhisperer |
|---------|---------------------|--------------|
| **Digital PDFs** | Good | Excellent |
| **Scanned PDFs** | No | Yes (OCR) |
| **Layout Structure** | Lost | Preserved |
| **Table Extraction** | Regex-based | Native support |
| **New Bank Formats** | Need new regex | Auto-adapts |
| **Handwritten Notes** | No | Yes (high_quality mode) |
| **Cost** | Free | Pay-per-use |
| **Offline** | Yes | No (cloud API) |
| **Latency** | ~100ms | ~1-5s (async) |

---

## Architecture Options

### Option A: Full Replacement

Replace `pdf-parse` entirely with LLMWhisperer.

```
PDF Upload → LLMWhisperer API → Structured Text → Transaction Parser
```

**Pros:** Unified solution, better accuracy, OCR support
**Cons:** External dependency, cost, latency

### Option B: Hybrid (Recommended)

Use LLMWhisperer only when `pdf-parse` fails or for scanned documents.

```
PDF Upload → Try pdf-parse
           ├── Success → Transaction Parser
           └── Failure/Scanned → LLMWhisperer → Transaction Parser
```

**Pros:** Cost-effective, fast for known formats, fallback for edge cases
**Cons:** More complexity

### Option C: MCP Tool Integration

Add LLMWhisperer as an MCP tool for Claude Code agent use.

```
Agent receives PDF → Calls MCP extract_text tool → Gets structured text
```

**Pros:** Agent-friendly, no code changes to parser
**Cons:** Only available in agent context, not for direct API imports

---

## API Details

### Endpoint
```
POST https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper
Header: unstract-key: <API_KEY>
Body: Binary PDF data
```

### Request Parameters
```javascript
{
  mode: 'native_text' | 'low_cost' | 'high_quality' | 'table',
  output_mode: 'layout_preserving' | 'text',
  pages_to_extract: '1-5',  // Optional
  page_seperator: '<<<',
  webhook_url: 'https://...',  // For async
}
```

### Response Flow
1. Submit PDF → Get `whisper_hash`
2. Poll status API OR wait for webhook
3. Retrieve extracted text

### JavaScript Client Usage
```javascript
const { LLMWhispererClientV2 } = require('llmwhisperer-client');

const client = new LLMWhispererClientV2({
  apiKey: process.env.LLMWHISPERER_API_KEY,
});

// Synchronous extraction
const result = await client.whisper({
  filePath: '/path/to/statement.pdf',
  mode: 'native_text',
  outputMode: 'layout_preserving',
  waitForCompletion: true,
});

console.log(result.extractedText);
```

---

## Implementation Considerations

### Environment Variables
```env
LLMWHISPERER_API_KEY=<your-api-key>
LLMWHISPERER_BASE_URL=https://llmwhisperer-api.us-central.unstract.com
```

### Error Handling
- API timeout (30s default)
- Rate limiting
- Invalid file format
- OCR failures

### Files to Modify (if implementing)
```
src/database/parsers/
├── pdf-parser.ts          # Add LLMWhisperer integration
├── llmwhisperer-client.ts # New: API client wrapper
└── index.ts               # Export new parser

src/config/
└── llmwhisperer.config.ts # New: Configuration

.env.example               # Add new env vars
```

---

## Questions for Decision

1. **Cost tolerance?** - LLMWhisperer is pay-per-use vs free pdf-parse
2. **Scanned PDF support needed?** - Current solution doesn't support OCR
3. **Latency acceptable?** - Cloud API adds 1-5s vs local ~100ms
4. **MCP vs Direct API?** - Agent-only or service-level integration?
5. **Which banks fail currently?** - Prioritize based on actual failures

---

## Decision

**Selected Approach: Hybrid Fallback + MCP Integration**

User goals:
- **Future-proofing** - Handle edge cases before they become issues
- **Agent integration** - Make extraction available as an MCP tool

---

## Implementation Plan (When Ready)

### Phase 1: MCP Tool Integration
Add LLMWhisperer MCP server for agent-level PDF extraction.

```bash
# Add to Claude Code MCP configuration
claude mcp add llmwhisperer -- docker run -i --rm \
  -v /tmp:/tmp \
  -e LLMWHISPERER_API_KEY=$LLMWHISPERER_API_KEY \
  unstract/mcp-server llm_whisperer
```

**Files:**
- `.claude/settings.json` - Add MCP server configuration
- `.claude/commands/extraction/` - Add skill documentation

### Phase 2: Service-Level Hybrid Parser
Integrate LLMWhisperer as fallback in TransactionImportService.

**Files to create/modify:**
```
src/database/parsers/
├── pdf-parser.ts              # Modify: Add fallback trigger
├── llmwhisperer-parser.ts     # New: LLMWhisperer wrapper
└── index.ts                   # Export new parser

src/config/
└── llmwhisperer.config.ts     # New: API configuration

.env.example                   # Add LLMWHISPERER_API_KEY
```

**Confidence-Based Fallback Logic:**

Each extracted transaction gets a parsing confidence score. Low-confidence transactions are re-extracted via LLMWhisperer.

```typescript
interface ParsedTransactionWithConfidence extends ParsedTransaction {
  parsingConfidence: number;  // 0-100
  confidenceReasons: string[];
}

async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
  // Try local parser first
  const localResults = await this.localPdfParser.parseWithConfidence(buffer);

  // Separate by confidence threshold
  const CONFIDENCE_THRESHOLD = 70;
  const confident: ParsedTransaction[] = [];
  const uncertain: ParsedTransactionWithConfidence[] = [];

  for (const tx of localResults) {
    if (tx.parsingConfidence >= CONFIDENCE_THRESHOLD) {
      confident.push(tx);
    } else {
      uncertain.push(tx);
    }
  }

  // Re-extract uncertain transactions via LLMWhisperer
  if (uncertain.length > 0) {
    const llmResults = await this.llmWhispererParser.parse(buffer, {
      transactionsToVerify: uncertain,
    });
    return [...confident, ...llmResults];
  }

  return confident;
}
```

**Confidence Scoring Factors:**

| Factor | Impact | Example |
|--------|--------|---------|
| Date parsing | -30 if ambiguous | "01/02/2025" (DD/MM or MM/DD?) |
| Amount parsing | -25 if uncertain | "1,234" (thousand separator or decimal?) |
| Bank detection | -40 if unknown | Unrecognized bank format |
| Description quality | -15 if truncated | Text cut off mid-word |
| Line structure | -20 if multi-line | Transaction spans multiple lines |

**Threshold Configuration:**
```typescript
// src/config/pdf-parser.config.ts
export const PDF_PARSER_CONFIG = {
  confidenceThreshold: 70,        // Below this → LLMWhisperer
  minTransactionsForLocal: 3,     // If < 3 extracted, try LLMWhisperer
  maxLLMWhispererCalls: 50,       // Rate limit per import batch
};
```

### Phase 3: Agent PDF Extraction Skill
Create a skill for agents to extract and analyze PDFs.

```
.claude/commands/extraction/
├── pdf-extract.md        # Skill for direct extraction
└── bank-statement.md     # Skill for bank statement analysis
```

---

## Prerequisites

1. [ ] **API Key** - Register at unstract.com, get LLMWHISPERER_API_KEY
2. [ ] **Docker** - Required for MCP server
3. [ ] **Test PDFs** - Collect sample statements from each bank

---

## Cost Considerations

| Volume | Estimated Cost |
|--------|---------------|
| 100 PDFs/month | ~$5-10 (fallback only) |
| 1000 PDFs/month | ~$20-50 (fallback only) |
| Full replacement | 3-5x higher |

Hybrid approach minimizes cost by only using cloud API for edge cases.

---

## Status: Investigation Complete

This document serves as the technical specification for LLMWhisperer integration when you're ready to implement.

---

# Spec & Task File Changes Required

## 1. New Task Specification

**Create:** `specs/tasks/TASK-TRANS-015.md`

```markdown
<task_spec id="TASK-TRANS-015" version="1.0">

<metadata>
  <title>LLMWhisperer PDF Extraction Integration</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>REQ-TRANS-011</requirement_ref>
    <requirement_ref>EC-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Integrates LLMWhisperer cloud API as a fallback PDF extraction service.
Uses confidence-based routing: local pdf-parse first, then LLMWhisperer
for low-confidence extractions. Supports OCR for scanned bank statements.
</context>

<scope>
  <in_scope>
    - LLMWhisperer client wrapper service
    - Confidence scoring for PDF extraction results
    - Hybrid parser with fallback logic
    - MCP server configuration for agent integration
    - Configuration management for API keys
    - Rate limiting and cost controls
  </in_scope>
  <out_of_scope>
    - Xero sync changes
    - UI for extraction quality review
    - Other document types (DOCX, XLSX)
  </out_of_scope>
</scope>

<files_to_create>
  <file>src/database/parsers/llmwhisperer-parser.ts</file>
  <file>src/database/parsers/hybrid-pdf-parser.ts</file>
  <file>src/config/llmwhisperer.config.ts</file>
  <file>src/config/pdf-parser.config.ts</file>
  <file>tests/database/parsers/hybrid-pdf-parser.spec.ts</file>
</files_to_create>

<files_to_modify>
  <file>src/database/parsers/pdf-parser.ts</file>
  <file>src/database/parsers/index.ts</file>
  <file>src/database/services/transaction-import.service.ts</file>
  <file>.env.example</file>
  <file>.claude/settings.json</file>
</files_to_modify>

</task_spec>
```

---

## 2. Update Task Index

**Modify:** `specs/tasks/_index.md`

Add to Phase 2 (Logic Layer) table after TASK-TRANS-014:

```markdown
| 37 | TASK-TRANS-015 | LLMWhisperer PDF Extraction | logic | TASK-TRANS-011 | Pending |
```

Update dependency graph to include:
```
L1[TASK-TRANS-011] --> L1a[TASK-TRANS-015<br/>LLMWhisperer]
```

---

## 3. Update Traceability Matrix

**Modify:** `specs/tasks/_traceability.md`

### Add new requirement coverage:

```markdown
| REQ-TRANS-011 | LLMWhisperer fallback extraction | TASK-TRANS-015 | Pending |
| EC-TRANS-010 | Low-confidence PDF extraction | TASK-TRANS-015 | Pending |
```

### Add to Component Contracts section:

```markdown
| TransactionImportService.parseWithConfidence | method | TASK-TRANS-015 | Pending |
| LLMWhispererParser.parse | method | TASK-TRANS-015 | Pending |
| HybridPdfParser.parse | method | TASK-TRANS-015 | Pending |
```

### Add to Change Log:

```markdown
| 2025-12-21 | Added TASK-TRANS-015 (LLMWhisperer Integration) - new requirement REQ-TRANS-011 | AI Agent |
```

---

## 4. Update Functional Spec

**Modify:** `specs/functional/transaction-categorization.md`

### Add new requirement:

```xml
<requirement id="REQ-TRANS-011" story_ref="US-TRANS-001" priority="should">
  <description>PDF extraction uses confidence-based fallback to cloud OCR for low-quality extractions</description>
  <rationale>Scanned and complex PDFs require OCR; confidence routing minimizes cloud API costs</rationale>
</requirement>
```

### Add new edge case:

```xml
<edge_case id="EC-TRANS-010" req_ref="REQ-TRANS-011">
  <scenario>Local PDF parser extracts transaction with low confidence (ambiguous date, amount, or description)</scenario>
  <expected_behavior>
    1. Calculate confidence score based on parsing quality factors
    2. If confidence < 70%, re-extract using LLMWhisperer cloud API
    3. Use higher-confidence result
    4. Log extraction source for audit trail
  </expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-011" req_ref="REQ-TRANS-011">
  <scenario>Scanned PDF with no extractable text (image-only)</scenario>
  <expected_behavior>
    Detect low text-to-page ratio; automatically route to LLMWhisperer OCR mode;
    extract transactions from OCR text; flag as "OCR extracted" in audit log
  </expected_behavior>
</edge_case>
```

### Add new error state:

```xml
<error id="ERR-TRANS-006" http_code="503">
  <condition>LLMWhisperer API unavailable or rate limited</condition>
  <message>Cloud extraction service temporarily unavailable. Using local extraction only.</message>
  <recovery>Fall back to local extraction results; log degraded mode; retry on next import</recovery>
</error>
```

---

## 5. Update Technical Spec

**Modify:** `specs/technical/api-contracts.md`

Add component contract:

```markdown
### LLMWhisperer Integration

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| LLMWhispererParser.parse | Buffer, mode | ParsedTransaction[] | Cloud OCR extraction |
| HybridPdfParser.parse | Buffer | ParsedTransactionWithConfidence[] | Routes to local or cloud |
| PdfParser.parseWithConfidence | Buffer | ParsedTransactionWithConfidence[] | Local + confidence scores |
```

---

## 6. MCP Configuration

**Modify:** `.claude/settings.json`

Add LLMWhisperer MCP server:

```json
{
  "mcpServers": {
    "llmwhisperer": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "/tmp:/tmp", "-e", "LLMWHISPERER_API_KEY", "unstract/mcp-server", "llm_whisperer"]
    }
  }
}
```

---

## Summary of All Files to Change

| File | Action | Description |
|------|--------|-------------|
| `docs/llmwhisperer-integration-plan.md` | CREATE | This complete plan document |
| `specs/tasks/TASK-TRANS-015.md` | CREATE | New task specification |
| `specs/tasks/_index.md` | MODIFY | Add TASK-TRANS-015 to execution order |
| `specs/tasks/_traceability.md` | MODIFY | Add requirement coverage mapping |
| `specs/functional/transaction-categorization.md` | MODIFY | Add REQ-TRANS-011, EC-TRANS-010, EC-TRANS-011, ERR-TRANS-006 |
| `specs/technical/api-contracts.md` | MODIFY | Add LLMWhisperer component contracts |
| `.env.example` | MODIFY | Add LLMWHISPERER_API_KEY |
| `.claude/settings.json` | MODIFY | Add MCP server configuration |
