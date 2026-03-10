# Batch Bank Statement Upload & Reconciliation

Upload and reconcile monthly bank statements sequentially from the local `bank-statements/` folder.

## Bank Statement Folder

```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/bank-statements/
```

Files are named: `63061274808 YYYY-MM-DD.pdf` (FNB account, statement date)

## Configuration

| Setting | Value |
|---------|-------|
| Bank Account | `Business Account` |
| Account Number | `63061274808` |
| Tenant ID | `$CB_TENANT_ID` (from settings.json) |
| Statement folder | `bank-statements/` (project root) |
| API endpoint | `POST /api/v1/reconciliation/bank-statement` |

## How It Works

### 1. Determine Next Period

Query the database for the latest reconciliation period:

```bash
$CB_HELPER_DB "SELECT period_end FROM reconciliations WHERE tenant_id = '\$TENANT' ORDER BY period_end DESC LIMIT 1"
```

Where `$CB_HELPER_DB` is:
- Staging: `CB_ENVIRONMENT=staging .claude/helpers/cb-db.sh`
- Production: `CB_ENVIRONMENT=production .claude/helpers/cb-db.sh`

### 2. Find Next Statement File

Statement files are sorted chronologically by filename date. The next file to upload is the first one whose date is **after** the last reconciled `period_end`.

Example: If last `period_end` = `2024-04-30`, then next file = `63061274808 2024-06-02.pdf` (the June 2024 statement covering May).

### 3. Upload via API

```bash
# Get auth token (staging)
TOKEN=$(curl -s -X POST "$CB_API_URL/api/v1/auth/dev-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@crechebooks.dev","password":"CrecheBooks2026"}' | jq -r '.access_token')

# Upload statement
curl -X POST "$CB_API_URL/api/v1/reconciliation/bank-statement" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/statement.pdf" \
  -F "bank_account=Business Account"
```

The API will:
- Parse the PDF (LLM-based extraction)
- Auto-detect the statement period from the PDF
- Match bank transactions to book transactions (auto-recon)
- Return match summary with counts

### 4. Review Results

After each upload, check:
- **RECONCILED**: All transactions matched, proceed to next month
- **DISCREPANCY**: Some unmatched transactions — review before proceeding

```bash
$CB_HELPER_DB "SELECT status, period_start, period_end FROM reconciliations WHERE tenant_id = '\$TENANT' ORDER BY period_end DESC LIMIT 1"
```

### 5. Repeat or Stop

- If RECONCILED: proceed to next statement
- If DISCREPANCY: stop and report unmatched items for manual review
- If no more files: report completion

## Additional Endpoints

### Rematch (no PDF re-parsing)

Re-run matching on existing parsed data without consuming LLMWhisperer credits:

```bash
# Single period
curl -X POST "$CB_API_URL/api/v1/reconciliation/$RECON_ID/rematch" \
  -H "Authorization: Bearer $TOKEN"

# All DISCREPANCY periods (processes chronologically)
curl -X POST "$CB_API_URL/api/v1/reconciliation/bank-statement/rematch-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bank_account":"Business Account"}'
```

### Accept Discrepancies

Mark a period as RECONCILED after reviewing remaining small discrepancies:

```bash
curl -X POST "$CB_API_URL/api/v1/reconciliation/$RECON_ID/accept-discrepancies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Bank fee R3.18 not in Xero, accepted as minor variance"}'
```

## Matching Logic

The matching engine uses multiple strategies:

1. **Exact match**: Same amount, date within tolerance, description similarity >= 70%
2. **Keyword match**: Short book description (e.g. "Xero") found inside long bank description
3. **Amount+date match**: Exact amount and date but different descriptions (from different data sources)
4. **Fee-adjusted match**: Bank shows NET, Xero shows GROSS (difference within 10%)
5. **ATM Cash**: Recognized as ATM_WITHDRAWAL with 2.5% fee rate

### Boundary-Date Exclusion

Transactions on period boundary dates (e.g., Apr 30) appear in both adjacent periods.
The system automatically excludes transactions already matched in prior periods.

## Sequential Processing Rules

1. **Always upload in chronological order** — never skip a month
2. **Stop on DISCREPANCY** — do not continue until resolved (user must review)
3. **One statement at a time** — wait for API response before uploading next
4. **Check for duplicates** — if period already exists, skip it
5. **Report progress** after each upload with match summary
6. **Use rematch-all** after code changes to re-run matching without re-parsing PDFs
7. **bank_account must be `Business Account`** (NOT `FNB`) to match book transactions

## Known Discrepancy Types

| Type | Example | Action |
|------|---------|--------|
| IN_XERO_ONLY | Refund in Xero not on statement | Accept with note |
| IN_BANK_ONLY | Bank service fee not in Xero | Import to Xero or accept |
| AMOUNT_MISMATCH | ATM fee difference | Auto-detected as FEE_ADJUSTED_MATCH |
| Missing book txns | Bank feed not synced (Nov 2025+) | Sync Xero bank feed first |

## Environment Selection

Default to the environment set in `CB_ENVIRONMENT` (usually `staging`).
For production uploads, the user must explicitly request it.

## Progress Reporting Format

After each statement:

```
Statement: 63061274808 2024-06-02.pdf
Period:    2024-05-01 to 2024-05-31
Status:    RECONCILED
Matched:   45/50 (90%)
Bank Only: 3
Book Only: 2
Progress:  [===>        ] 1/20 statements remaining
```
