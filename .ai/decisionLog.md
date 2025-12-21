# Decision Log

## 2025-12-21: TASK-TRANS-015 LLMWhisperer Integration

### Decision: Multi-line Parsing for LLMWhisperer Output
- LLMWhisperer outputs clean multi-line format (date, description, amount, balance, optional bank charges)
- Implemented state machine parsing to handle this format

### Decision: Bank Charges Handling
- FNB statements have optional "Accrued Bank Charges" after balance
- Updated regex pattern to `^[\d,]+\.\d{2}$` to capture varied amounts

### Decision: Hybrid Parser Confidence Threshold
- Local parser first with 70% confidence threshold
- LLMWhisperer fallback when <70% or <3 transactions extracted

### Decision: No Mock Tests for LLMWhisperer
- All tests use REAL FNB PDFs from /bank-statements/ folder
- Tests skip gracefully when API rate limited (HTTP 402)

---

## 2025-12-21: TASK-RECON-01* Implementation

### Decision: Test Cleanup Strategy
- Use afterEach with tenant-scoped deletes (not global deleteMany)

### Decision: Financial Report Data Sources
- Use paid invoices for school fees income + categorized transactions

### Decision: Chart of Accounts Structure
- Follow SA IFRS for SMEs (1xxx-8xxx ranges)
