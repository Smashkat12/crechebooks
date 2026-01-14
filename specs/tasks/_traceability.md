# SimplePay Integration Traceability Matrix

## Overview

This document maps SimplePay API capabilities to CrecheBooks implementation tasks, ensuring comprehensive coverage of all available functionality.

## API Resource Mapping

### 1. Client Management

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/` | GET | ✅ | TASK-STAFF-004 | List accessible clients |
| Client ID validation | — | ✅ | TASK-STAFF-004 | Via testConnection |

### 2. Employee Management

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/employees` | GET | ✅ | TASK-STAFF-004 | List employees |
| `/v1/clients/:client_id/employees` | POST | ✅ | TASK-STAFF-004 | Create employee |
| `/v1/employees/:id` | GET | ✅ | TASK-STAFF-004 | Get employee details |
| `/v1/employees/:id` | PATCH | ✅ | TASK-STAFF-004 | Update employee |
| `/v1/employees/:id` | DELETE | ⭕ | — | Not implemented |

### 3. Service Periods (Employment Lifecycle)

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/service_periods` | GET | ⭕ | TASK-SPAY-004 | Pending |
| `/v1/employees/:id/service_periods/end_service` | POST | ⭕ | TASK-SPAY-004 | Pending |
| `/v1/employees/:id/service_periods/reinstate` | POST | ⭕ | TASK-SPAY-004 | Pending |
| `/v1/employees/:id/service_periods/undo_end_service` | DELETE | ⭕ | TASK-SPAY-004 | Pending |

### 4. Waves (Pay Frequencies)

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/waves` | GET | ✅ | TASK-STAFF-004 | Get pay frequencies |
| `/v1/clients/:client_id/waves` | POST | ⭕ | — | Not planned |

### 5. Payslips

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/payslips` | GET | ✅ | TASK-STAFF-004 | List employee payslips |
| `/v1/payslips/:id` | GET | ✅ | TASK-STAFF-004 | Get payslip JSON |
| `/v1/payslips/:id.pdf` | GET | ✅ | TASK-STAFF-004 | Download payslip PDF |

### 6. Pay Runs (Payment Runs)

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/payment_runs` | GET | ⭕ | TASK-SPAY-002 | Pending |
| `/v1/payment_runs/:id/payslips` | GET | ⭕ | TASK-SPAY-002 | Pending |
| `/v1/payment_runs/:id/accounting` | GET | ⭕ | TASK-SPAY-002 | Pending |

### 7. Calculations (Payslip Items)

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/calculations` | GET | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/employees/:id/calculations` | POST | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/payslips/:id/calculations` | GET | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/payslips/:id/calculations` | POST | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/calculations/:id` | GET | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/calculations/:id` | PATCH | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/calculations/:id` | DELETE | ⭕ | TASK-SPAY-003 | Pending |

### 8. Inherited Calculations

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/inherited_calculations` | GET | ⭕ | TASK-SPAY-003 | Pending |
| `/v1/employees/:id/inherited_calculations` | PATCH | ⭕ | TASK-SPAY-003 | Pending |

### 9. Items and Outputs

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/items_and_outputs` | GET | ⭕ | TASK-SPAY-003 | Pending |

### 10. Leave Management

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/leave_types` | GET | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/employees/:id/leave_balances` | GET | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/employees/:id/leave_days` | GET | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/employees/:id/leave_days` | POST | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/employees/:id/leave_days/create_multiple` | POST | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/leave_days/:id` | PATCH | ⭕ | TASK-SPAY-001 | Pending |
| `/v1/leave_days/:id` | DELETE | ⭕ | TASK-SPAY-001 | Pending |

### 11. Tax Certificates

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/tax_certificates` | GET | ✅ | TASK-STAFF-004 | List IRP5 certificates |
| `/v1/tax_certificates/:id` | GET | ✅ | TASK-STAFF-004 | Download IRP5 PDF |

### 12. Submissions (EMP201)

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/submissions/emp201` | GET | ✅ | TASK-STAFF-004 | Get EMP201 data |

### 13. Reports

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/reports/eti` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/transaction_history` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/variance` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/comparison_leave` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/leave_liability_v2` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/tracked_balances` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/:report/async` | POST | ⭕ | TASK-SPAY-005 | Pending |
| `/v1/clients/:client_id/reports/poll/:uuid` | GET | ⭕ | TASK-SPAY-005 | Pending |

### 14. Profile Mappings

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/employees/:id/profile_mappings` | GET | ⭕ | TASK-SPAY-006 | Pending |
| `/v1/employees/:id/profile_mappings` | POST | ⭕ | TASK-SPAY-006 | Pending |
| `/v1/profile_mappings/:id` | PUT | ⭕ | TASK-SPAY-006 | Pending |
| `/v1/profile_mappings/:id` | DELETE | ⭕ | TASK-SPAY-006 | Pending |

### 15. Custom Employee Fields

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/custom_employee_fields` | GET | ⭕ | — | Not planned |

### 16. Bulk Operations

| SimplePay Endpoint | HTTP Method | Implemented | Task ID | Notes |
|-------------------|-------------|-------------|---------|-------|
| `/v1/clients/:client_id/bulk_input` | POST | ⭕ | TASK-SPAY-007 | Pending |

---

## Implementation Coverage Summary

| Category | Total Endpoints | Implemented | Pending | Coverage |
|----------|----------------|-------------|---------|----------|
| Clients | 1 | 1 | 0 | 100% |
| Employees | 4 | 4 | 0 | 100% |
| Service Periods | 4 | 0 | 4 | 0% |
| Waves | 2 | 1 | 1 | 50% |
| Payslips | 3 | 3 | 0 | 100% |
| Pay Runs | 3 | 0 | 3 | 0% |
| Calculations | 7 | 0 | 7 | 0% |
| Inherited Calculations | 2 | 0 | 2 | 0% |
| Items/Outputs | 1 | 0 | 1 | 0% |
| Leave | 7 | 0 | 7 | 0% |
| Tax Certificates | 2 | 2 | 0 | 100% |
| EMP201 | 1 | 1 | 0 | 100% |
| Reports | 8 | 0 | 8 | 0% |
| Profile Mappings | 4 | 0 | 4 | 0% |
| Bulk Operations | 1 | 0 | 1 | 0% |
| **Total** | **50** | **12** | **38** | **24%** |

---

## Task Dependencies

```mermaid
graph TD
    subgraph "Foundation (Complete)"
        A[TASK-STAFF-004<br/>SimplePay Base Integration]
    end

    subgraph "Phase 14 - Leave"
        B[TASK-SPAY-001<br/>Leave Management]
    end

    subgraph "Phase 14 - Pay Runs"
        C[TASK-SPAY-002<br/>Pay Run Service]
    end

    subgraph "Phase 14 - Calculations"
        D[TASK-SPAY-003<br/>Calculations Service]
    end

    subgraph "Phase 14 - Service Periods"
        E[TASK-SPAY-004<br/>Service Period Management]
    end

    subgraph "Phase 14 - Reports"
        F[TASK-SPAY-005<br/>Reports Service]
    end

    subgraph "Phase 14 - Profiles"
        G[TASK-SPAY-006<br/>Profile Mappings]
    end

    subgraph "Phase 14 - Bulk"
        H[TASK-SPAY-007<br/>Bulk Operations]
    end

    subgraph "Phase 14 - Auto-Setup"
        I[TASK-SPAY-008<br/>Auto-Setup Pipeline]
    end

    A --> B
    A --> C
    A --> E
    C --> D
    D --> G
    D --> H
    A --> F
    B --> I
    D --> I
    G --> I
```

---

## SA Compliance Mapping

| Requirement | SimplePay Feature | Task ID | Status |
|-------------|------------------|---------|--------|
| BCEA Leave Entitlements | Leave Management | TASK-SPAY-001 | Pending |
| UI-19 Termination Codes | Service Periods | TASK-SPAY-004 | Pending |
| PAYE Tax Calculations | Tax Certificates | TASK-STAFF-004 | ✅ Complete |
| UIF Contributions | Calculations | TASK-SPAY-003 | Pending |
| SDL Contributions | Calculations | TASK-SPAY-003 | Pending |
| EMP201 Submissions | EMP201 API | TASK-STAFF-004 | ✅ Complete |
| IRP5 Certificates | Tax Certificates | TASK-STAFF-004 | ✅ Complete |
| ETI Reporting | Reports | TASK-SPAY-005 | Pending |

---

## Integration Points

### CrecheBooks → SimplePay

| CrecheBooks Action | SimplePay API | Task |
|-------------------|---------------|------|
| Create Staff | Create Employee | TASK-STAFF-004 ✅ |
| Update Staff | Update Employee | TASK-STAFF-004 ✅ |
| Offboard Staff | End Service Period | TASK-SPAY-004 |
| Rehire Staff | Reinstate | TASK-SPAY-004 |
| Submit Leave | Create Leave Days | TASK-SPAY-001 |
| Add Bonus | Create Calculation | TASK-SPAY-003 |
| Salary Increase | Update Inherited Calc | TASK-SPAY-003 |

### SimplePay → CrecheBooks

| SimplePay Data | CrecheBooks Feature | Task |
|----------------|---------------------|------|
| Payslips | Payslip Archive | TASK-STAFF-004 ✅ |
| IRP5 Certificates | Tax Document Archive | TASK-STAFF-004 ✅ |
| EMP201 Data | SARS Compliance | TASK-STAFF-004 ✅ |
| Leave Balances | Staff Leave Dashboard | TASK-SPAY-001 |
| Pay Run Journals | Xero Sync | TASK-SPAY-002 |
| Variance Reports | Financial Analytics | TASK-SPAY-005 |

---

## Rate Limiting Considerations

SimplePay API: **60 requests per minute** (1000 requests per hour)

| Operation | Est. API Calls | Mitigation Strategy |
|-----------|---------------|---------------------|
| Single Employee Sync | 1-2 | Direct call |
| Bulk Employee Sync (50) | 50-100 | Use bulk API (TASK-SPAY-007) |
| Payslip Import (100) | 100-200 | Batch over time |
| Leave Balance Check (All) | N employees | Cache results |
| Report Generation | 1-3 | Use async reports |
| Salary Review (All Staff) | N employees | Use bulk API |

---

## Security Considerations

| Concern | Mitigation | Implementation |
|---------|-----------|----------------|
| API Key Storage | AES-256 Encryption | EncryptionService |
| API Key Transmission | HTTPS only | SimplePayApiClient |
| Rate Limit Handling | Exponential Backoff | SimplePayApiClient |
| Data Validation | Input sanitization | DTOs with validation |
| Audit Trail | Log all API calls | AuditLogService |
| Error Handling | Mask sensitive data | Logger configuration |

---

## Testing Strategy

### Unit Tests
- Mock SimplePay API responses
- Test data transformation
- Test error handling

### Integration Tests
- Sandbox environment testing
- Real API call verification
- Rate limit handling

### E2E Tests
- Full workflow testing
- UI integration verification
- Error scenario coverage

---

## SA VAT Compliance Traceability Matrix

Analysis Date: 2026-01-13
Based on South African VAT Act No. 89 of 1991, Section 12(h).

### Invoice Line Type to VAT Treatment Mapping

| Line Type | VAT Treatment | Rate | Legal Basis | Task ID | Status |
|-----------|--------------|------|-------------|---------|--------|
| MONTHLY_FEE | EXEMPT | 0% | VAT Act s.12(h)(iii) - Childcare services | Existing | ✅ Implemented |
| REGISTRATION | EXEMPT | 0% | VAT Act s.12(h)(ii) - School fees | Existing | ✅ Implemented |
| RE_REGISTRATION | EXEMPT | 0% | VAT Act s.12(h)(ii) - School fees | TASK-BILL-038 | ⭕ Pending |
| EXTRA_MURAL | EXEMPT | 0% | VAT Act s.12(h)(ii) - Subordinate to education | TASK-BILL-038 | ⭕ Pending |
| BOOKS | APPLICABLE | 15% | Goods - not exempt | Existing | ✅ Implemented |
| STATIONERY | APPLICABLE | 15% | Goods - not exempt | Existing | ✅ Implemented |
| UNIFORM | APPLICABLE | 15% | Goods - not exempt | Existing | ✅ Implemented |
| SCHOOL_TRIP | APPLICABLE | 15% | Service - not educational | Existing | ✅ Implemented |
| MEALS | APPLICABLE | 15% | Prepared food - not zero-rated | TASK-BILL-038 | ⭕ Pending |
| TRANSPORT | APPLICABLE | 15% | Service - not educational | TASK-BILL-038 | ⭕ Pending |
| LATE_PICKUP | APPLICABLE | 15% | Penalty - not educational | TASK-BILL-038 | ⭕ Pending |
| DAMAGED_EQUIPMENT | APPLICABLE | 15% | Replacement - goods | TASK-BILL-038 | ⭕ Pending |
| AD_HOC | CONFIGURABLE | 0%/15% | Depends on isVatExempt flag | TASK-BILL-038 | ⭕ Pending |
| DISCOUNT | N/A | 0% | Adjustment - no VAT | Existing | ✅ Implemented |
| CREDIT | N/A | 0% | Adjustment - no VAT | Existing | ✅ Implemented |

### SA VAT Act Section 12(h) Reference

| Section | Description | Applicable Items |
|---------|-------------|------------------|
| 12(h)(i) | Educational services by registered institutions | School fees, tuition |
| 12(h)(ii) | Goods/services subordinate to education | Registration, extra-mural if educational |
| 12(h)(iii) | Childcare services specifically | Creche fees, after-school care |
| Schedule 2, Part B | Zero-rated basic foodstuffs | Raw food items (NOT prepared meals) |

### Implementation Coverage

| Category | Line Types | Status |
|----------|-----------|--------|
| VAT Exempt (Educational) | MONTHLY_FEE, REGISTRATION | ✅ Complete |
| VAT Exempt (New Types) | RE_REGISTRATION, EXTRA_MURAL | ⭕ TASK-BILL-038 |
| VAT Applicable (Goods) | BOOKS, STATIONERY, UNIFORM | ✅ Complete |
| VAT Applicable (New Services) | MEALS, TRANSPORT, LATE_PICKUP | ⭕ TASK-BILL-038 |
| Configurable VAT | AD_HOC with isVatExempt flag | ⭕ TASK-BILL-038 |

### Key Research Sources

- VAT Act No. 89 of 1991, Section 12(h)
- SARS VAT 404 Guide for Vendors
- Grant Thornton SA - Education Sector VAT Advisory
- Tax Faculty SA - Creche Tax FAQ

---

**Last Updated**: 2026-01-13
**Author**: Claude Code
**Review Status**: Pending
