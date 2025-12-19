<technical_spec id="TECH-API" version="1.0">

<metadata>
  <title>CrecheBooks API Contracts</title>
  <status>approved</status>
  <last_updated>2025-12-19</last_updated>
  <implements>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
    <spec_ref>SPEC-RECON</spec_ref>
  </implements>
</metadata>

<api_overview>

## Base URL
```
Production: https://api.crechebooks.co.za/v1
Staging: https://api.staging.crechebooks.co.za/v1
Development: http://localhost:3000/v1
```

## Authentication
All endpoints except `/health` and `/auth/*` require Bearer token authentication.

```http
Authorization: Bearer <access_token>
```

## Common Headers
```http
Content-Type: application/json
X-Tenant-ID: <tenant_uuid>  # Extracted from JWT, validated server-side
X-Request-ID: <uuid>        # For request tracing
```

## Standard Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "requestId": "uuid"
}
```

## HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (delete) |
| 400 | Bad Request (validation) |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Rate Limited |
| 500 | Server Error |
| 502 | Bad Gateway (external service) |

</api_overview>

<api_contracts>

## Authentication Endpoints

<endpoint path="/auth/login" method="POST">
  <description>Initiate OAuth login flow</description>
  <auth_required>false</auth_required>

  <request_body content_type="application/json">
    <field name="redirect_uri" type="string" required="true" validation="valid URL"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "auth_url": "https://auth0.com/authorize?..."
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/auth/callback" method="POST">
  <description>Handle OAuth callback and exchange code for tokens</description>
  <auth_required>false</auth_required>

  <request_body content_type="application/json">
    <field name="code" type="string" required="true"/>
    <field name="state" type="string" required="true"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "access_token": "jwt_string",
          "refresh_token": "string",
          "expires_in": 86400,
          "user": {
            "id": "uuid",
            "email": "string",
            "name": "string",
            "role": "OWNER|ADMIN|VIEWER|ACCOUNTANT",
            "tenant_id": "uuid"
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

## Transaction Endpoints

<endpoint path="/transactions" method="GET">
  <description>List transactions with filtering and pagination</description>
  <implements>REQ-TRANS-001</implements>

  <query_params>
    <param name="page" type="integer" default="1"/>
    <param name="limit" type="integer" default="20" max="100"/>
    <param name="status" type="string" enum="PENDING,CATEGORIZED,REVIEW_REQUIRED,SYNCED"/>
    <param name="date_from" type="date" format="YYYY-MM-DD"/>
    <param name="date_to" type="date" format="YYYY-MM-DD"/>
    <param name="is_reconciled" type="boolean"/>
    <param name="search" type="string" description="Search description/payee"/>
  </query_params>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": [
            {
              "id": "uuid",
              "date": "2025-01-15",
              "description": "WOOLWORTHS SANDTON",
              "payee_name": "WOOLWORTHS",
              "reference": "REF123",
              "amount": -1250.00,
              "is_credit": false,
              "status": "CATEGORIZED",
              "is_reconciled": false,
              "categorization": {
                "account_code": "6100",
                "account_name": "Food and Provisions",
                "confidence_score": 92.5,
                "source": "AI_AUTO"
              },
              "created_at": "2025-01-15T08:30:00Z"
            }
          ],
          "meta": { "page": 1, "limit": 20, "total": 156 }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/transactions/import" method="POST">
  <description>Import transactions from file</description>
  <implements>REQ-TRANS-001</implements>

  <request_body content_type="multipart/form-data">
    <field name="file" type="file" required="true" validation="CSV, PDF, OFX; max 10MB"/>
    <field name="source" type="string" required="true" enum="CSV_IMPORT,PDF_IMPORT"/>
    <field name="bank_account" type="string" required="true"/>
  </request_body>

  <responses>
    <response status="202">
      <description>Import queued for processing</description>
      <body>
        {
          "success": true,
          "data": {
            "import_id": "uuid",
            "status": "PROCESSING",
            "file_name": "statement.csv",
            "estimated_count": 150
          }
        }
      </body>
    </response>
    <response status="400">
      <description>Invalid file format</description>
    </response>
  </responses>
</endpoint>

<endpoint path="/transactions/{id}/categorize" method="PUT">
  <description>Update transaction categorization (manual correction)</description>
  <implements>REQ-TRANS-005</implements>

  <path_params>
    <param name="id" type="uuid" required="true"/>
  </path_params>

  <request_body content_type="application/json">
    <field name="account_code" type="string" required="true"/>
    <field name="is_split" type="boolean" required="false" default="false"/>
    <field name="splits" type="array" required="false">
      <item>
        <field name="account_code" type="string"/>
        <field name="amount" type="number"/>
        <field name="vat_type" type="string" enum="STANDARD,ZERO_RATED,EXEMPT,NO_VAT"/>
      </item>
    </field>
    <field name="create_pattern" type="boolean" required="false" default="true"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "categorization": {
              "account_code": "6100",
              "account_name": "Food and Provisions",
              "source": "USER_OVERRIDE",
              "reviewed_at": "2025-01-15T10:30:00Z"
            },
            "pattern_created": true
          }
        }
      </body>
    </response>
    <response status="400">
      <description>Split amounts don't equal total</description>
    </response>
  </responses>
</endpoint>

<endpoint path="/transactions/categorize/batch" method="POST">
  <description>Trigger AI categorization for pending transactions</description>
  <implements>REQ-TRANS-002</implements>

  <request_body content_type="application/json">
    <field name="transaction_ids" type="array" required="false" description="Specific IDs; if empty, all PENDING"/>
    <field name="force_recategorize" type="boolean" required="false" default="false"/>
  </request_body>

  <responses>
    <response status="202">
      <body>
        {
          "success": true,
          "data": {
            "job_id": "uuid",
            "transaction_count": 45,
            "estimated_seconds": 90
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

## Invoice Endpoints

<endpoint path="/invoices" method="GET">
  <description>List invoices with filtering</description>
  <implements>REQ-BILL-003</implements>

  <query_params>
    <param name="page" type="integer" default="1"/>
    <param name="limit" type="integer" default="20"/>
    <param name="status" type="string" enum="DRAFT,SENT,PARTIALLY_PAID,PAID,OVERDUE,VOID"/>
    <param name="parent_id" type="uuid"/>
    <param name="child_id" type="uuid"/>
    <param name="date_from" type="date"/>
    <param name="date_to" type="date"/>
  </query_params>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": [
            {
              "id": "uuid",
              "invoice_number": "INV-2025-001",
              "parent": {
                "id": "uuid",
                "name": "John Smith"
              },
              "child": {
                "id": "uuid",
                "name": "Emily Smith"
              },
              "issue_date": "2025-01-01",
              "due_date": "2025-01-08",
              "subtotal": 3000.00,
              "vat": 450.00,
              "total": 3450.00,
              "amount_paid": 0.00,
              "status": "SENT",
              "delivery_status": "DELIVERED"
            }
          ]
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/invoices/generate" method="POST">
  <description>Generate monthly invoices for enrolled children</description>
  <implements>REQ-BILL-001</implements>

  <request_body content_type="application/json">
    <field name="billing_month" type="string" required="true" format="YYYY-MM"/>
    <field name="child_ids" type="array" required="false" description="Specific children; if empty, all active"/>
    <field name="include_adhoc" type="boolean" required="false" default="true"/>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "invoices_created": 45,
            "total_amount": 155250.00,
            "invoices": [
              {
                "id": "uuid",
                "invoice_number": "INV-2025-001",
                "child_name": "Emily Smith",
                "total": 3450.00,
                "status": "DRAFT"
              }
            ]
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/invoices/send" method="POST">
  <description>Send approved invoices to parents</description>
  <implements>REQ-BILL-006, REQ-BILL-007</implements>

  <request_body content_type="application/json">
    <field name="invoice_ids" type="array" required="true"/>
    <field name="delivery_method" type="string" required="false" enum="EMAIL,WHATSAPP,BOTH"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "sent": 43,
            "failed": 2,
            "failures": [
              {
                "invoice_id": "uuid",
                "reason": "Invalid email address"
              }
            ]
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

## Payment Endpoints

<endpoint path="/payments/match" method="POST">
  <description>Trigger AI payment matching for unallocated transactions</description>
  <implements>REQ-PAY-001, REQ-PAY-002</implements>

  <request_body content_type="application/json">
    <field name="transaction_ids" type="array" required="false"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "auto_matched": 12,
            "requires_review": 3,
            "no_match": 1,
            "matches": [
              {
                "transaction_id": "uuid",
                "invoice_id": "uuid",
                "match_type": "EXACT",
                "confidence": 100,
                "auto_applied": true
              }
            ],
            "review_required": [
              {
                "transaction_id": "uuid",
                "suggested_matches": [
                  {
                    "invoice_id": "uuid",
                    "invoice_number": "INV-2025-001",
                    "confidence": 75,
                    "match_reason": "Amount matches; payer name partial match"
                  }
                ]
              }
            ]
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/payments" method="POST">
  <description>Manually allocate payment to invoice</description>
  <implements>REQ-PAY-005, REQ-PAY-006</implements>

  <request_body content_type="application/json">
    <field name="transaction_id" type="uuid" required="true"/>
    <field name="allocations" type="array" required="true">
      <item>
        <field name="invoice_id" type="uuid"/>
        <field name="amount" type="number"/>
      </item>
    </field>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "payments": [
              {
                "id": "uuid",
                "invoice_id": "uuid",
                "amount": 3450.00,
                "invoice_status": "PAID"
              }
            ],
            "unallocated_amount": 0.00
          }
        }
      </body>
    </response>
    <response status="400">
      <description>Allocation exceeds transaction amount</description>
    </response>
  </responses>
</endpoint>

<endpoint path="/arrears" method="GET">
  <description>Get arrears dashboard data</description>
  <implements>REQ-PAY-007</implements>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "summary": {
              "total_outstanding": 45600.00,
              "aging": {
                "current": 15000.00,
                "days_30": 12000.00,
                "days_60": 8600.00,
                "days_90_plus": 10000.00
              }
            },
            "top_debtors": [
              {
                "parent_id": "uuid",
                "parent_name": "John Smith",
                "outstanding": 6900.00,
                "oldest_invoice_date": "2024-10-01"
              }
            ]
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

## SARS Endpoints

<endpoint path="/sars/vat201" method="POST">
  <description>Generate VAT201 return</description>
  <implements>REQ-SARS-003</implements>

  <request_body content_type="application/json">
    <field name="period_start" type="date" required="true"/>
    <field name="period_end" type="date" required="true"/>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "submission_type": "VAT201",
            "period": "2025-01",
            "status": "DRAFT",
            "output_vat": 23175.00,
            "input_vat": 8450.00,
            "net_vat": 14725.00,
            "items_requiring_review": [
              {
                "transaction_id": "uuid",
                "issue": "Missing VAT number on supplier invoice"
              }
            ],
            "document_url": "/sars/vat201/uuid/document"
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/sars/emp201" method="POST">
  <description>Generate EMP201 return</description>
  <implements>REQ-SARS-009</implements>

  <request_body content_type="application/json">
    <field name="period_month" type="string" required="true" format="YYYY-MM"/>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "submission_type": "EMP201",
            "period": "2025-01",
            "status": "DRAFT",
            "total_paye": 12450.00,
            "total_uif": 1770.00,
            "total_sdl": 0.00,
            "employee_count": 5,
            "document_url": "/sars/emp201/uuid/document"
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/sars/{id}/submit" method="POST">
  <description>Mark SARS submission as submitted</description>
  <implements>REQ-SARS-012</implements>

  <path_params>
    <param name="id" type="uuid" required="true"/>
  </path_params>

  <request_body content_type="application/json">
    <field name="sars_reference" type="string" required="false"/>
    <field name="submitted_date" type="date" required="true"/>
  </request_body>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "status": "SUBMITTED",
            "submitted_at": "2025-01-25T14:30:00Z",
            "is_finalized": true
          }
        }
      </body>
    </response>
    <response status="409">
      <description>Already submitted</description>
    </response>
  </responses>
</endpoint>

## Reconciliation Endpoints

<endpoint path="/reconciliation" method="POST">
  <description>Run bank reconciliation</description>
  <implements>REQ-RECON-001</implements>

  <request_body content_type="application/json">
    <field name="bank_account" type="string" required="true"/>
    <field name="period_start" type="date" required="true"/>
    <field name="period_end" type="date" required="true"/>
    <field name="opening_balance" type="number" required="true"/>
    <field name="closing_balance" type="number" required="true"/>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "status": "RECONCILED",
            "opening_balance": 50000.00,
            "closing_balance": 62500.00,
            "calculated_balance": 62500.00,
            "discrepancy": 0.00,
            "matched_count": 145,
            "unmatched_count": 0
          }
        }
      </body>
    </response>
    <response status="200">
      <description>Discrepancies found</description>
      <body>
        {
          "success": true,
          "data": {
            "id": "uuid",
            "status": "DISCREPANCY",
            "discrepancy": -250.00,
            "discrepancies": [
              {
                "type": "IN_XERO_NOT_BANK",
                "transaction_id": "uuid",
                "amount": -250.00,
                "description": "Manual entry - needs verification"
              }
            ]
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

<endpoint path="/reports/income-statement" method="GET">
  <description>Generate Income Statement</description>
  <implements>REQ-RECON-005</implements>

  <query_params>
    <param name="period_start" type="date" required="true"/>
    <param name="period_end" type="date" required="true"/>
    <param name="format" type="string" default="json" enum="json,pdf,excel"/>
  </query_params>

  <responses>
    <response status="200">
      <body>
        {
          "success": true,
          "data": {
            "period": {
              "start": "2025-01-01",
              "end": "2025-01-31"
            },
            "income": {
              "total": 154500.00,
              "breakdown": [
                {"account": "School Fees", "amount": 150000.00},
                {"account": "Registration Fees", "amount": 4500.00}
              ]
            },
            "expenses": {
              "total": 85200.00,
              "breakdown": [
                {"account": "Salaries", "amount": 55000.00},
                {"account": "Food", "amount": 15200.00},
                {"account": "Utilities", "amount": 8000.00},
                {"account": "Other", "amount": 7000.00}
              ]
            },
            "net_profit": 69300.00
          }
        }
      </body>
    </response>
  </responses>
</endpoint>

## Enrollment Endpoints

<endpoint path="/children" method="POST">
  <description>Enroll a new child</description>
  <implements>REQ-BILL-009</implements>

  <request_body content_type="application/json">
    <field name="parent_id" type="uuid" required="true"/>
    <field name="first_name" type="string" required="true"/>
    <field name="last_name" type="string" required="true"/>
    <field name="date_of_birth" type="date" required="true"/>
    <field name="gender" type="string" required="false" enum="MALE,FEMALE,OTHER"/>
    <field name="fee_structure_id" type="uuid" required="true"/>
    <field name="start_date" type="date" required="true"/>
    <field name="medical_notes" type="string" required="false"/>
    <field name="emergency_contact" type="string" required="false"/>
    <field name="emergency_phone" type="string" required="false"/>
  </request_body>

  <responses>
    <response status="201">
      <body>
        {
          "success": true,
          "data": {
            "child": {
              "id": "uuid",
              "first_name": "Emily",
              "last_name": "Smith"
            },
            "enrollment": {
              "id": "uuid",
              "fee_structure": {
                "name": "Full Day",
                "amount": 3000.00
              },
              "start_date": "2025-02-01",
              "status": "ACTIVE"
            }
          }
        }
      </body>
    </response>
    <response status="409">
      <description>Child already enrolled</description>
    </response>
  </responses>
</endpoint>

</api_contracts>

<component_contracts>

<component name="TransactionService" path="src/core/transaction/transaction.service.ts">
  <description>Core transaction processing and categorization</description>

  <method name="importFromFile">
    <signature>async importFromFile(file: Express.Multer.File, source: ImportSource, bankAccount: string, tenantId: string): Promise&lt;ImportResult&gt;</signature>
    <implements>REQ-TRANS-001</implements>
    <behavior>
      1. Validate file format (CSV, PDF, OFX)
      2. Parse transactions based on format
      3. Detect and flag duplicates
      4. Store raw transactions with PENDING status
      5. Queue categorization job
      6. Return import summary
    </behavior>
    <throws>
      - FileFormatError: Unrecognized or corrupt file
      - ValidationError: Invalid data in file
    </throws>
  </method>

  <method name="categorizeTransactions">
    <signature>async categorizeTransactions(transactionIds: string[], tenantId: string): Promise&lt;CategorizationResult&gt;</signature>
    <implements>REQ-TRANS-002, REQ-TRANS-003, REQ-TRANS-004</implements>
    <behavior>
      1. Load tenant context (patterns, Chart of Accounts)
      2. Invoke Claude Code categorization agent
      3. For each transaction:
         a. Get AI categorization with confidence
         b. If confidence >= 80%, apply automatically
         c. If confidence < 80%, flag for review
      4. Store categorizations with audit trail
      5. Queue Xero sync for auto-categorized
      6. Return results with statistics
    </behavior>
  </method>

  <method name="updateCategorization">
    <signature>async updateCategorization(transactionId: string, dto: UpdateCategorizationDto, userId: string): Promise&lt;Transaction&gt;</signature>
    <implements>REQ-TRANS-005</implements>
    <behavior>
      1. Validate account code exists in CoA
      2. If split, validate amounts equal total
      3. Update categorization with USER_OVERRIDE source
      4. If createPattern enabled, create/update PayeePattern
      5. Log audit trail
      6. Queue Xero sync
    </behavior>
  </method>
</component>

<component name="BillingService" path="src/core/billing/billing.service.ts">
  <description>Invoice generation and delivery</description>

  <method name="generateMonthlyInvoices">
    <signature>async generateMonthlyInvoices(billingMonth: string, childIds?: string[]): Promise&lt;InvoiceGenerationResult&gt;</signature>
    <implements>REQ-BILL-001, REQ-BILL-004, REQ-BILL-005</implements>
    <behavior>
      1. Get active enrollments (all or filtered by childIds)
      2. For each enrollment:
         a. Calculate monthly fee based on fee structure
         b. Apply sibling discount if applicable
         c. Add any pending ad-hoc charges
         d. Calculate VAT based on tenant tax status
         e. Calculate pro-rata if mid-month start/end
         f. Create invoice with line items
      3. Sync drafts to Xero via MCP
      4. Return generation summary
    </behavior>
  </method>

  <method name="sendInvoices">
    <signature>async sendInvoices(invoiceIds: string[], method?: DeliveryMethod): Promise&lt;DeliveryResult&gt;</signature>
    <implements>REQ-BILL-006, REQ-BILL-007, REQ-BILL-008</implements>
    <behavior>
      1. Validate all invoices are in DRAFT status
      2. For each invoice:
         a. Get parent contact preferences
         b. Determine delivery method (param or preference)
         c. Send via appropriate channel (Email MCP or WhatsApp MCP)
         d. Update delivery status
         e. Update invoice status to SENT
      3. Return delivery summary with failures
    </behavior>
  </method>
</component>

<component name="PaymentService" path="src/core/payment/payment.service.ts">
  <description>Payment matching and arrears management</description>

  <method name="matchPayments">
    <signature>async matchPayments(transactionIds?: string[]): Promise&lt;MatchingResult&gt;</signature>
    <implements>REQ-PAY-001, REQ-PAY-002, REQ-PAY-003, REQ-PAY-004</implements>
    <behavior>
      1. Get unallocated credit transactions (or specified IDs)
      2. Get outstanding invoices
      3. Invoke Claude Code payment matcher agent
      4. For each transaction:
         a. Find potential matches (reference, amount, name)
         b. Calculate match confidence
         c. If exact match (100%), apply automatically
         d. If high confidence (>=80%), apply automatically
         e. If lower confidence, add to review queue
      5. Apply automatic matches via Xero MCP
      6. Return matching summary
    </behavior>
  </method>

  <method name="allocatePayment">
    <signature>async allocatePayment(transactionId: string, allocations: AllocationDto[], userId: string): Promise&lt;Payment[]&gt;</signature>
    <implements>REQ-PAY-005, REQ-PAY-006</implements>
    <behavior>
      1. Validate transaction is credit and unallocated
      2. Validate allocations don't exceed transaction amount
      3. For each allocation:
         a. Create payment record
         b. Update invoice amount_paid
         c. Update invoice status (PARTIALLY_PAID or PAID)
      4. Sync to Xero via MCP
      5. Log audit trail
    </behavior>
  </method>

  <method name="getArrearsReport">
    <signature>async getArrearsReport(tenantId: string): Promise&lt;ArrearsReport&gt;</signature>
    <implements>REQ-PAY-007</implements>
    <behavior>
      1. Query invoices with outstanding balance
      2. Calculate aging buckets (current, 30, 60, 90+)
      3. Aggregate by parent for top debtors
      4. Return structured report
    </behavior>
  </method>
</component>

<component name="SarsService" path="src/core/sars/sars.service.ts">
  <description>SARS tax calculations and submissions</description>

  <method name="generateVat201">
    <signature>async generateVat201(periodStart: Date, periodEnd: Date): Promise&lt;SarsSubmission&gt;</signature>
    <implements>REQ-SARS-001, REQ-SARS-002, REQ-SARS-003, REQ-SARS-004</implements>
    <behavior>
      1. Verify tenant is VAT registered
      2. Get all invoices in period (output VAT)
      3. Get all categorized expenses with VAT (input VAT)
      4. Invoke SARS Agent for calculations
      5. Distinguish zero-rated vs exempt
      6. Flag items missing VAT details
      7. Generate VAT201 document structure
      8. Store as DRAFT submission
    </behavior>
  </method>

  <method name="generateEmp201">
    <signature>async generateEmp201(periodMonth: string): Promise&lt;SarsSubmission&gt;</signature>
    <implements>REQ-SARS-006, REQ-SARS-007, REQ-SARS-008, REQ-SARS-009</implements>
    <behavior>
      1. Get all payroll records for period
      2. Calculate PAYE per current tax tables
      3. Calculate UIF (capped at max)
      4. Calculate SDL if applicable
      5. Generate EMP201 document structure
      6. Store as DRAFT submission
    </behavior>
  </method>

  <method name="markSubmitted">
    <signature>async markSubmitted(submissionId: string, sarsReference: string, userId: string): Promise&lt;SarsSubmission&gt;</signature>
    <implements>REQ-SARS-012</implements>
    <behavior>
      1. Verify submission is in READY status
      2. Update status to SUBMITTED
      3. Set is_finalized to true (immutable)
      4. Store SARS reference
      5. Log audit trail
    </behavior>
  </method>
</component>

<component name="ReconciliationService" path="src/core/reconciliation/reconciliation.service.ts">
  <description>Bank reconciliation and financial reporting</description>

  <method name="reconcile">
    <signature>async reconcile(dto: ReconcileDto): Promise&lt;Reconciliation&gt;</signature>
    <implements>REQ-RECON-001, REQ-RECON-002, REQ-RECON-003, REQ-RECON-004</implements>
    <behavior>
      1. Get all transactions in period
      2. Calculate sum: opening + debits - credits
      3. Compare to closing balance
      4. Find unmatched items:
         a. In bank, not in Xero
         b. In Xero, not in bank
         c. Amount mismatches
      5. Mark matched items as reconciled
      6. Create reconciliation record
      7. Return with discrepancies if any
    </behavior>
  </method>

  <method name="generateIncomeStatement">
    <signature>async generateIncomeStatement(periodStart: Date, periodEnd: Date): Promise&lt;IncomeStatement&gt;</signature>
    <implements>REQ-RECON-005</implements>
    <behavior>
      1. Get all income transactions in period
      2. Get all expense transactions in period
      3. Group by account code
      4. Calculate totals
      5. Format per SA accounting standards
    </behavior>
  </method>
</component>

</component_contracts>

</technical_spec>
