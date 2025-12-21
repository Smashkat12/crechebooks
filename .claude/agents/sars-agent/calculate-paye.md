# SARS Agent - Tax Calculation Skills

## Purpose
Calculate South African tax obligations (PAYE, UIF, VAT) and generate SARS returns (EMP201, VAT201).
**CRITICAL: ALL SARS calculations ALWAYS require human review (L2 autonomy).**

## Autonomy Level
**L2 (Draft Only)** - NEVER auto-submit to SARS. All decisions are drafts for human approval.

## Context Files Required
- `.claude/context/sars_tables_2025.json` - Official SARS tax tables, brackets, rebates, UIF rates

## Available Skills

### 1. Calculate PAYE (Pay As You Earn)
Calculate monthly PAYE deduction for an employee.

**Algorithm:**
1. Annualize income (monthly × 12)
2. Find applicable tax bracket (7 brackets, 18%-45%)
3. Calculate: `base_tax + (income_above_threshold × rate)`
4. Apply rebates:
   - Primary: R17,600 (all taxpayers)
   - Secondary: R9,750 (age 65+)
   - Tertiary: R3,255 (age 75+)
5. Apply medical tax credits if applicable
6. De-annualize to monthly
7. **ALWAYS escalate for review**

**Inputs (all in CENTS):**
- `grossIncomeCents` - Monthly gross salary
- `payFrequency` - MONTHLY | WEEKLY | FORTNIGHTLY
- `dateOfBirth` - For age-based rebates
- `medicalAidMembers` - Number on medical aid

**Output:**
- Net monthly PAYE in cents
- Full breakdown (annualized, rebates, credits)
- `requiresReview: true` (always)

### 2. Calculate UIF (Unemployment Insurance Fund)
Calculate monthly UIF contributions.

**Algorithm:**
1. Apply ceiling cap (R17,712/month in 2025)
2. Employee contribution: 1% of capped remuneration
3. Employer contribution: 1% of capped remuneration
4. Maximum per party: R177.12/month
5. **ALWAYS escalate for review**

**Inputs:**
- `grossRemunerationCents` - Monthly remuneration in cents

**Output:**
- Employee and employer contributions
- Total contribution
- Cap status

### 3. Generate EMP201 (Employer Monthly Declaration)
Generate monthly employer declaration combining all employees.

**Algorithm:**
1. Aggregate all employee PAYE for month
2. Aggregate all UIF contributions
3. Calculate SDL if applicable
4. Generate SARS-compliant document structure
5. **ALWAYS escalate for review**

**Output:**
- Total PAYE, UIF, SDL
- Employee count
- Full EMP201 document structure

### 4. Generate VAT201 (VAT Return)
Generate periodic VAT return.

**Algorithm:**
1. Calculate output VAT (15% on taxable supplies)
2. Calculate input VAT (reclaimable on purchases)
3. Net = Output - Input
4. Handle zero-rated and exempt items
5. **ALWAYS escalate for review**

**Output:**
- Output VAT, Input VAT, Net payable/refundable
- Full VAT201 document structure

## Decision Rules
| Scenario | Action | Reason |
|----------|--------|--------|
| Any PAYE calculation | DRAFT_FOR_REVIEW | Tax liability requires human verification |
| Any UIF calculation | DRAFT_FOR_REVIEW | Payroll deduction requires human verification |
| EMP201 generation | DRAFT_FOR_REVIEW | SARS submission requires human approval |
| VAT201 generation | DRAFT_FOR_REVIEW | SARS submission requires human approval |

## Critical Rules
1. **ALL amounts in CENTS (integers)** - Never use floats for money
2. **Decimal.js with ROUND_HALF_EVEN** - Banker's rounding for all calculations
3. **NEVER auto-submit** - All SARS operations require human approval
4. **Tenant isolation** - All operations scoped to tenant
5. **Audit trail** - All decisions logged to `.claude/logs/decisions.jsonl`
6. **Escalation logging** - All escalations to `.claude/logs/escalations.jsonl`

## Decision Logging Format
```json
{
  "timestamp": "ISO8601",
  "agent": "sars-agent",
  "tenantId": "uuid",
  "type": "PAYE|UIF|EMP201|VAT201",
  "period": "2025-01",
  "amountCents": 250000,
  "autoApplied": false,
  "reasoning": "PAYE calculation for gross R25,000..."
}
```

## 2025 SARS Rates Reference
- **VAT**: 15% standard rate
- **UIF**: 1% employee + 1% employer (max R177.12 each)
- **PAYE Brackets**: 18%-45% progressive
- **Primary Rebate**: R17,600/year
- **Tax Threshold**: R95,400/year (under 65)
