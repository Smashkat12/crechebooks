# Enrollment Lifecycle Architecture

## Document Control
- **Version**: 1.0
- **Created**: 2026-01-07
- **Status**: Design Complete

---

## Executive Summary

This document defines the complete enrollment lifecycle for CrecheBooks, covering:
1. **Onboarding**: New student enrollment with registration fee
2. **Active Period**: Monthly billing cycle
3. **Year-End Processing**: Identify continuing vs graduating students
4. **Year-Start Re-Registration**: Automatic re-registration fee for continuing students
5. **Off-Boarding**: Graduation and withdrawal workflows

---

## Key Terminology

| Term | Definition | Fee |
|------|------------|-----|
| **New Student** | Child being enrolled for the first time | Registration Fee (R500) |
| **Continuing Student** | Child currently ACTIVE, returning next academic year | Re-Registration Fee (R300) |
| **Graduating Student** | Child leaving for primary school (Grade R) | Off-boarding process |
| **Withdrawing Student** | Child leaving before school age (parent choice) | Off-boarding process |

---

## Enrollment Status Flow

```
                                    ┌──────────────────┐
                                    │                  │
                    ┌───────────────▼──────────────┐   │
     New Child      │                              │   │ Year-End
     Enrolls        │           ACTIVE             │   │ Year-Start
        │           │    (Currently Enrolled)      │◀──┘
        │           │                              │
        ▼           └────────┬─────────┬───────────┘
   ┌─────────┐               │         │
   │ PENDING │               │         │
   │(Awaiting│               │         │
   │Approval)│               │         │
   └────┬────┘               │         │
        │                    │         │
   Admin Approves       Graduation  Withdrawal
        │                    │         │
        ▼                    ▼         ▼
   ┌─────────┐         ┌─────────┐ ┌─────────┐
   │ ACTIVE  │         │GRADUATED│ │WITHDRAWN│
   └─────────┘         └─────────┘ └─────────┘
                       (Off-board)  (Off-board)
```

---

## Phase 1: Onboarding (New Enrollment)

### 1.1 Parent Registration
- Parent creates account with contact details
- Preferred contact method (Email/WhatsApp)
- ID number for account verification

### 1.2 Child Registration
- Child basic info (name, DOB, gender)
- Medical notes, emergency contact
- Child linked to parent account

### 1.3 Enrollment Creation
- Select fee structure (Full Day, Half Day, etc.)
- Set start date
- Initial status: **PENDING** (awaiting admin approval)

### 1.4 Enrollment Approval
- Admin reviews and approves enrollment
- Status changes: PENDING → **ACTIVE**
- Enrollment invoice generated automatically

### 1.5 Enrollment Invoice
| Line Item | Amount | Notes |
|-----------|--------|-------|
| Registration Fee | R500 | One-time, first enrollment only |
| Monthly Fee (Pro-rated) | Varies | Based on start date |
| **Total** | R500 + Pro-rated | Due within 7 days |

---

## Phase 2: Active Period (Monthly Billing)

### 2.1 Monthly Invoice Generation
- Trigger: 1st of each month at 06:00 SAST
- Applies to all ACTIVE enrollments

### 2.2 Invoice Line Items
| Line Item | Condition |
|-----------|-----------|
| Monthly Fee | Always included |
| Sibling Discount | If multiple siblings enrolled |
| Ad-Hoc Charges | Books, trips, uniforms, etc. |
| Credit Applied | If parent has credit balance |

### 2.3 January Invoice (Year-Start)
**CRITICAL**: January is special - continuing students pay re-registration.

| Line Item | Amount | Condition |
|-----------|--------|-----------|
| **Re-Registration Fee** | R300 | Student was ACTIVE in previous December |
| Monthly Fee | Standard | Always included |
| Other charges | Varies | As applicable |

**Logic**: If student has ACTIVE enrollment on December 31st of previous year AND has ACTIVE enrollment in January of current year → Add re-registration fee.

---

## Phase 3: Year-End Processing (November-December)

### 3.1 Year-End Review Period
- **When**: November 15 - December 15
- **Purpose**: Identify student intentions for next year

### 3.2 Student Categories

#### A. Continuing Students (Default)
- Under primary school age (< 6 years by January)
- No withdrawal notice received
- **Action**: No status change, remains ACTIVE
- **January**: Auto-charged re-registration fee (R300)

#### B. Graduating Students
- Turning 6 or moving to Grade R
- Parent confirms graduation
- **Action**: Admin sets status to GRADUATED with end date
- **Trigger**: Off-boarding workflow

#### C. Withdrawing Students
- Parent gives notice of withdrawal
- Any age, any reason
- **Action**: Admin sets status to WITHDRAWN with end date
- **Trigger**: Off-boarding workflow

### 3.3 Year-End Checklist (Admin)
1. [ ] Review all ACTIVE enrollments
2. [ ] Identify graduating children (age-based)
3. [ ] Send year-end notices to parents
4. [ ] Confirm intentions for each child
5. [ ] Process graduations (bulk or individual)
6. [ ] Process withdrawals
7. [ ] Verify account balances settled

---

## Phase 4: Off-Boarding Workflow

### 4.1 Triggers
- Graduation (going to primary school)
- Withdrawal (parent-initiated departure)
- Both result in enrollment END but different status

### 4.2 Off-Boarding Steps

#### Step 1: Notice Period
- Parent provides notice (ideally 1 month)
- End date set on enrollment

#### Step 2: Account Settlement
- Calculate any outstanding balance
- Calculate credit for unused days (pro-rata)
- Generate final statement

#### Step 3: Status Update
- Status changes to GRADUATED or WITHDRAWN
- End date recorded
- Audit log captures all changes

#### Step 4: Final Documentation
- Progress report (for graduating students)
- Certificate of completion (optional)
- Final statement to parent

#### Step 5: Credit Handling
If credit balance exists:
- Option A: Refund to parent
- Option B: Keep on account (if sibling remains)
- Option C: Donation to school

### 4.3 Credit Note Generation
If withdrawal/graduation mid-month:
- Calculate unused days in billing period
- Generate credit note automatically
- Apply to outstanding invoices or create refund

---

## Phase 5: Re-Enrollment (Future)

### 5.1 When Does This Apply?
A child who was previously GRADUATED or WITHDRAWN returns.

**Example**: Child graduated to Grade R but returns for aftercare.

### 5.2 Re-Enrollment Fee Logic
| Previous Status | Gap | New Fee |
|-----------------|-----|---------|
| GRADUATED | Any | Registration Fee (R500) - new enrollment |
| WITHDRAWN | < 3 months | Re-Registration Fee (R300) |
| WITHDRAWN | ≥ 3 months | Registration Fee (R500) |

**Note**: This is different from year-start re-registration. This is for students returning after leaving.

---

## Implementation Tasks

### Task 1: Fix Re-Registration Logic (TASK-BILL-024 Revision)
**Current Bug**: `isReturningStudent()` checks for WITHDRAWN/GRADUATED - this is WRONG.

**Correct Logic**:
```typescript
// For January invoice generation
isEligibleForReRegistration(tenantId: string, childId: string, billingMonth: string): Promise<boolean> {
  // Check if billing month is January
  if (!billingMonth.endsWith('-01')) return false;

  // Check if child was ACTIVE on December 31st of previous year
  const previousYear = parseInt(billingMonth.substring(0, 4)) - 1;
  const december31 = new Date(previousYear, 11, 31);

  return this.hadActiveEnrollmentOnDate(tenantId, childId, december31);
}
```

### Task 2: Year-End Processing Feature (NEW TASK)
- Bulk graduation workflow (TASK-ENROL-003 - already implemented)
- Year-end review dashboard
- Age-based graduation suggestions
- Parent notification system

### Task 3: Off-Boarding Workflow (NEW TASK)
- Account settlement calculation
- Final statement generation
- Credit note automation
- Document generation (progress report, certificate)

### Task 4: Update Invoice Generation
- Modify January invoice generation to include re-registration fee
- Only for continuing students (ACTIVE as of Dec 31 previous year)

---

## Data Model Considerations

### Existing Fields (Sufficient)
- `Enrollment.status`: ACTIVE, PENDING, WITHDRAWN, GRADUATED
- `Enrollment.startDate`: When enrollment began
- `Enrollment.endDate`: When enrollment ended (null if active)
- `FeeStructure.registrationFeeCents`: R500 (new students)
- `FeeStructure.reRegistrationFeeCents`: R300 (continuing students)

### No New Fields Needed
The current data model supports the complete lifecycle.

---

## API Changes Required

### 1. Invoice Generation Service
Add re-registration fee to January invoices:
```typescript
// In generateMonthlyInvoices()
if (this.isJanuary(billingMonth)) {
  const eligibleForReReg = await this.isEligibleForReRegistration(
    tenantId,
    enrollment.childId,
    billingMonth
  );

  if (eligibleForReReg && reRegistrationFeeCents > 0) {
    lineItems.push({
      description: 'Annual Re-Registration Fee',
      unitPriceCents: reRegistrationFeeCents,
      lineType: LineType.REGISTRATION,
      // ...
    });
  }
}
```

### 2. Year-End Dashboard API
New endpoints:
- `GET /enrollments/year-end/review` - List students by category
- `POST /enrollments/year-end/confirm-intentions` - Bulk confirm

### 3. Off-Boarding API
New endpoints:
- `POST /enrollments/:id/offboard` - Initiate off-boarding
- `GET /parents/:id/final-statement` - Generate final statement

---

## User Interface Changes

### 1. Enrollments Page
- Add "Year-End Processing" button (visible Nov-Dec)
- Show student age and graduation eligibility
- Bulk graduation action (already implemented)

### 2. Year-End Review Dialog
- List all students grouped by category
- Confirm continuing/graduating/withdrawing
- Send bulk notifications

### 3. Off-Boarding Dialog
- End date picker
- Account settlement preview
- Credit handling options

---

## Business Rules Summary

| Scenario | Status | Fee | When |
|----------|--------|-----|------|
| New enrollment | PENDING → ACTIVE | R500 registration | On enrollment |
| Monthly billing | ACTIVE | Monthly fee | 1st of month |
| Year start (continuing) | ACTIVE → ACTIVE | R300 re-reg | January |
| Graduation | ACTIVE → GRADUATED | Credit note | On graduation |
| Withdrawal | ACTIVE → WITHDRAWN | Credit note | On withdrawal |
| Return after leaving | New enrollment | R500 registration | On re-enrollment |

---

## Testing Checklist

- [ ] New enrollment generates R500 registration invoice
- [ ] January invoice includes R300 re-registration for continuing students
- [ ] January invoice does NOT include re-registration for new January enrollments
- [ ] Graduation updates status and triggers credit note
- [ ] Withdrawal updates status and triggers credit note
- [ ] Off-boarding generates final statement
- [ ] Year-end review shows correct categorization
- [ ] Audit logs capture all status changes

---

## Related Task Specifications

| Task ID | Title | Status |
|---------|-------|--------|
| TASK-BILL-024 | Re-Registration Fee Feature | NEEDS REVISION |
| TASK-ENROL-003 | Bulk Year-End Graduation | Complete |
| TASK-ENROL-004 | Year-End Processing Dashboard | NEW |
| TASK-ENROL-005 | Off-Boarding Workflow | NEW |
| TASK-BILL-037 | January Re-Registration Invoice Logic | NEW |
