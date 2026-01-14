# TASK-STAFF-006: SimplePay Offboarding Integration

## Overview
Integrate the staff offboarding workflow with SimplePay to automatically terminate employees in SimplePay when offboarding is completed.

## Problem Statement
Currently, completing an offboarding in CrecheBooks only:
- Marks the staff as inactive locally
- Generates documents (UI-19, Certificate of Service)
- Creates audit logs

It does NOT sync the termination to SimplePay, meaning:
- Employee remains active in SimplePay payroll
- Termination date is not set
- Service period is not closed
- Final pay calculations may be incorrect

## Solution

### 1. Map Offboarding Reasons to Termination Codes

The `OffboardingReason` enum needs to map to `TerminationCode` for SimplePay:

| OffboardingReason | TerminationCode | SimplePay Code |
|-------------------|-----------------|----------------|
| RESIGNATION | RESIGNATION | 1 |
| TERMINATION | DISMISSAL_MISCONDUCT | 2 |
| RETRENCHMENT | RETRENCHMENT | 4 |
| RETIREMENT | RETIREMENT | 6 |
| CONTRACT_END | CONTRACT_EXPIRY | 5 |
| MUTUAL_AGREEMENT | RESIGNATION | 1 |
| DEATH | DEATH | 7 |
| DISMISSAL | DISMISSAL_MISCONDUCT | 2 |
| ABSCONDED | ABSCONDED | 8 |

### 2. Integration Points

**On Offboarding Completion (`completeOffboarding`):**
1. Get SimplePay employee mapping
2. If employee is linked to SimplePay:
   - Map offboarding reason to termination code
   - Call `SimplePayServicePeriodService.terminateEmployee()`
   - Record sync status in offboarding record
3. If sync fails:
   - Log the error
   - Mark offboarding as complete but flag SimplePay sync failed
   - Allow manual retry

### 3. Database Changes

Add fields to `StaffOffboarding` model:
```prisma
simplePaySyncStatus   String?   // 'PENDING', 'SUCCESS', 'FAILED', 'NOT_APPLICABLE'
simplePaySyncError    String?   // Error message if sync failed
simplePaySyncedAt     DateTime? // When sync completed
```

### 4. API Changes

Add endpoint to retry SimplePay sync:
- `POST /staff/:staffId/offboarding/:offboardingId/sync-simplepay`

## Implementation

### Files to Modify

1. **`apps/api/src/database/services/staff-offboarding.service.ts`**
   - Inject `SimplePayServicePeriodService`
   - Add reason-to-code mapping function
   - Call SimplePay termination on completion
   - Add retry method

2. **`apps/api/src/database/entities/staff-offboarding.entity.ts`**
   - Add SimplePay sync status fields

3. **`prisma/schema.prisma`**
   - Add sync status fields to StaffOffboarding model

4. **`apps/api/src/api/staff/offboarding.controller.ts`**
   - Add sync retry endpoint

5. **`apps/web/src/components/staff/OffboardingStatusCard.tsx`**
   - Display SimplePay sync status
   - Add retry button if sync failed

## Acceptance Criteria

- [ ] Offboarding reasons map correctly to SimplePay termination codes
- [ ] Completing offboarding triggers SimplePay employee termination
- [ ] SimplePay sync errors are handled gracefully
- [ ] Failed syncs can be retried manually
- [ ] Sync status is displayed in UI
- [ ] Employees without SimplePay link are handled correctly
- [ ] Audit logs record SimplePay sync events

## Related Tasks
- TASK-STAFF-002: Staff Offboarding Workflow
- TASK-SPAY-004: SimplePay Service Period Management

## Dependencies
- `SimplePayServicePeriodService` must be available
- SimplePay connection must be configured for tenant
- Employee must have SimplePay mapping
