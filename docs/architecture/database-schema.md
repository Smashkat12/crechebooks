# Database Schema

> PostgreSQL database schema with Prisma ORM - 50+ models supporting multi-tenant architecture.

## Entity Relationship Overview

```mermaid
erDiagram
    Organization ||--o{ User : has
    Organization ||--o{ Parent : has
    Organization ||--o{ Child : has
    Organization ||--o{ Staff : has
    Organization ||--o{ Invoice : has
    Organization ||--o{ FeeStructure : has

    Parent ||--o{ Child : "guardian of"
    Parent ||--o{ Invoice : receives
    Parent ||--o{ Payment : makes

    Child ||--o{ Enrollment : has
    Child ||--o{ InvoiceLine : "fees for"

    Staff ||--o{ PayrollRun : "paid via"
    Staff ||--o{ LeaveRequest : submits

    Invoice ||--o{ InvoiceLine : contains
    Invoice ||--o{ Payment : "paid by"

    FeeStructure ||--o{ FeeItem : contains

    BankStatement ||--o{ BankTransaction : contains
    BankTransaction ||--o{ ReconciliationMatch : "matched to"
    Payment ||--o{ ReconciliationMatch : "matched to"
```

## Core Domain Models

### Organization (Tenant)

```mermaid
classDiagram
    class Organization {
        +String id
        +String name
        +String tradingName
        +String registrationNumber
        +String vatNumber
        +String taxNumber
        +Address physicalAddress
        +Address postalAddress
        +String phone
        +String email
        +String logoUrl
        +BillingSettings billingSettings
        +DateTime createdAt
        +DateTime updatedAt
        +DateTime deletedAt
    }

    class BillingSettings {
        +Int invoiceDay
        +Int paymentTermDays
        +String currency
        +Boolean autoGenerateInvoices
        +String invoicePrefix
        +Int nextInvoiceNumber
    }

    Organization *-- BillingSettings
```

### Parent & Child

```mermaid
classDiagram
    class Parent {
        +String id
        +String organizationId
        +String firstName
        +String lastName
        +String email
        +String phone
        +String idNumber
        +Address address
        +String employerName
        +String employerPhone
        +Decimal balance
        +DateTime createdAt
        +DateTime deletedAt
    }

    class Child {
        +String id
        +String organizationId
        +String parentId
        +String firstName
        +String lastName
        +DateTime dateOfBirth
        +String gender
        +String allergies
        +String medicalNotes
        +String emergencyContact
        +EnrollmentStatus status
        +DateTime createdAt
        +DateTime deletedAt
    }

    class Enrollment {
        +String id
        +String childId
        +String feeStructureId
        +DateTime startDate
        +DateTime endDate
        +EnrollmentType type
        +AttendancePattern pattern
        +Decimal monthlyFee
        +DateTime createdAt
    }

    Parent "1" --> "*" Child : guardian
    Child "1" --> "*" Enrollment : enrollments
```

### Billing Domain

```mermaid
classDiagram
    class Invoice {
        +String id
        +String organizationId
        +String parentId
        +String invoiceNumber
        +DateTime issueDate
        +DateTime dueDate
        +Decimal subtotal
        +Decimal vatAmount
        +Decimal total
        +Decimal amountPaid
        +Decimal balance
        +InvoiceStatus status
        +DateTime createdAt
    }

    class InvoiceLine {
        +String id
        +String invoiceId
        +String childId
        +String description
        +Decimal quantity
        +Decimal unitPrice
        +Decimal vatRate
        +Decimal lineTotal
        +LineType type
    }

    class Payment {
        +String id
        +String organizationId
        +String parentId
        +String invoiceId
        +Decimal amount
        +PaymentMethod method
        +String reference
        +DateTime paymentDate
        +PaymentStatus status
        +DateTime createdAt
    }

    class FeeStructure {
        +String id
        +String organizationId
        +String name
        +EnrollmentType type
        +Boolean isActive
        +DateTime effectiveFrom
        +DateTime effectiveTo
    }

    class FeeItem {
        +String id
        +String feeStructureId
        +String name
        +FeeType type
        +Decimal amount
        +Frequency frequency
        +Boolean isVatable
    }

    Invoice "1" --> "*" InvoiceLine
    Invoice "1" --> "*" Payment
    FeeStructure "1" --> "*" FeeItem
```

### Staff & Payroll

```mermaid
classDiagram
    class Staff {
        +String id
        +String organizationId
        +String firstName
        +String lastName
        +String email
        +String idNumber
        +String taxNumber
        +DateTime startDate
        +DateTime endDate
        +EmploymentType type
        +Decimal salary
        +String bankName
        +String bankAccount
        +String bankBranch
        +StaffStatus status
        +DateTime createdAt
    }

    class PayrollRun {
        +String id
        +String organizationId
        +DateTime periodStart
        +DateTime periodEnd
        +PayrollStatus status
        +Decimal grossTotal
        +Decimal netTotal
        +Decimal payeTotal
        +Decimal uifTotal
        +DateTime processedAt
    }

    class PayrollItem {
        +String id
        +String payrollRunId
        +String staffId
        +Decimal grossPay
        +Decimal paye
        +Decimal uif
        +Decimal deductions
        +Decimal netPay
    }

    class LeaveRequest {
        +String id
        +String staffId
        +LeaveType type
        +DateTime startDate
        +DateTime endDate
        +Int days
        +LeaveStatus status
        +String reason
    }

    Staff "1" --> "*" PayrollItem
    Staff "1" --> "*" LeaveRequest
    PayrollRun "1" --> "*" PayrollItem
```

### Reconciliation

```mermaid
classDiagram
    class BankStatement {
        +String id
        +String organizationId
        +String accountName
        +String accountNumber
        +DateTime periodStart
        +DateTime periodEnd
        +Decimal openingBalance
        +Decimal closingBalance
        +DateTime importedAt
    }

    class BankTransaction {
        +String id
        +String statementId
        +DateTime date
        +String description
        +Decimal amount
        +TransactionType type
        +String reference
        +MatchStatus matchStatus
    }

    class ReconciliationMatch {
        +String id
        +String bankTransactionId
        +String paymentId
        +MatchType type
        +Decimal confidence
        +Boolean isConfirmed
        +DateTime matchedAt
    }

    BankStatement "1" --> "*" BankTransaction
    BankTransaction "1" --> "0..1" ReconciliationMatch
```

## Audit Trail

```mermaid
classDiagram
    class AuditLog {
        +String id
        +String organizationId
        +String userId
        +String entityType
        +String entityId
        +AuditAction action
        +Json previousState
        +Json newState
        +String ipAddress
        +String userAgent
        +DateTime createdAt
    }

    note for AuditLog "Immutable - no updates or deletes allowed"
```

## Key Schema Features

### Multi-Tenant Isolation

Every tenant-scoped table includes:
```prisma
model Entity {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  organization   Organization @relation(fields: [organizationId], references: [id])

  // ... other fields

  @@index([organizationId])
}
```

### Soft Deletes

All entities support soft deletion:
```prisma
model Entity {
  // ... fields
  deletedAt DateTime? @map("deleted_at")

  @@index([deletedAt])
}
```

### Audit Timestamps

Standard timestamp fields:
```prisma
model Entity {
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
}
```

### Financial Precision

All monetary values use `Decimal` for precision:
```prisma
model Invoice {
  subtotal   Decimal @db.Decimal(10, 2)
  vatAmount  Decimal @db.Decimal(10, 2)
  total      Decimal @db.Decimal(10, 2)
}
```

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| All tenant tables | `organizationId` | Tenant isolation queries |
| All tables | `deletedAt` | Soft delete filtering |
| `Invoice` | `(organizationId, status)` | Invoice listing |
| `Payment` | `(organizationId, paymentDate)` | Payment history |
| `BankTransaction` | `(statementId, matchStatus)` | Reconciliation |
| `Child` | `(organizationId, status)` | Active enrollments |
| `Staff` | `(organizationId, status)` | Active staff |

## Enums

```prisma
enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  PARTIAL
  OVERDUE
  CANCELLED
}

enum PaymentMethod {
  CASH
  EFT
  CARD
  DEBIT_ORDER
}

enum EnrollmentType {
  FULL_DAY
  HALF_DAY
  AFTER_CARE
}

enum StaffStatus {
  ACTIVE
  ON_LEAVE
  TERMINATED
}

enum LeaveType {
  ANNUAL
  SICK
  FAMILY
  MATERNITY
  UNPAID
}
```

## Migration Strategy

1. **Schema Changes**: All via Prisma migrations
2. **Data Migrations**: Separate scripts for data transforms
3. **Rollback**: Each migration has down migration
4. **Testing**: Migrations tested in staging first
