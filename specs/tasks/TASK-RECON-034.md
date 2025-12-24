<task_spec id="TASK-RECON-034" version="1.0">

<metadata>
  <title>Audit Log Pagination and Filtering</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>113</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-RECON-009</requirement_ref>
    <critical_issue_ref>HIGH-008</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-010</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use API design and performance thinking.
This task involves:
1. Offset/limit pagination
2. Date range filtering
3. Entity type filtering
4. Search by user/entity
5. Export filtered results
</reasoning_mode>

<context>
GAP: Audit log endpoint returns all records without pagination.

REQ-RECON-009 specifies: "Scalable audit log access."

This task adds pagination and filtering to prevent performance issues.
</context>

<current_state>
## Codebase State
- AuditLog entity exists
- Audit log endpoint returns all records
- No pagination parameters
- No filtering options

## What's Missing
- Pagination (offset/limit)
- Date range filter
- Entity type filter
- Action filter
- User filter
- Export capability
</current_state>

<input_context_files>
  <file purpose="audit_service">apps/api/src/database/services/audit-log.service.ts</file>
  <file purpose="audit_entity">apps/api/src/database/entities/audit-log.entity.ts</file>
  <file purpose="controller">apps/api/src/modules/reconciliation/reconciliation.controller.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Pagination with offset/limit
    - Date range filtering
    - Entity type filtering
    - Action type filtering
    - User ID filtering
    - Search by entity ID
    - CSV export of filtered results
  </in_scope>
  <out_of_scope>
    - Full-text search
    - Real-time audit streaming
    - Audit log archival
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/audit-log.service.ts">
      @Injectable()
      export class AuditLogService {
        async findAll(
          tenantId: string,
          options: AuditLogQueryOptions
        ): Promise<PaginatedResult<AuditLog>>;

        async export(
          tenantId: string,
          options: AuditLogQueryOptions,
          format: 'csv' | 'json'
        ): Promise<Buffer>;

        async getById(tenantId: string, id: string): Promise<AuditLog>;

        async getByEntityId(tenantId: string, entityId: string): Promise<AuditLog[]>;
      }
    </signature>
    <signature file="apps/api/src/database/dto/audit-log.dto.ts">
      export interface AuditLogQueryOptions {
        offset?: number;
        limit?: number;
        startDate?: Date;
        endDate?: Date;
        entityType?: string;
        action?: string;
        userId?: string;
        entityId?: string;
        sortBy?: 'createdAt' | 'entityType' | 'action';
        sortOrder?: 'asc' | 'desc';
      }

      export interface PaginatedResult<T> {
        data: T[];
        total: number;
        offset: number;
        limit: number;
        hasMore: boolean;
      }
    </signature>
  </signatures>

  <constraints>
    - Default limit: 50, max limit: 500
    - Default sort: createdAt DESC
    - Date range required for exports
    - Index on createdAt, entityType, entityId
    - Response includes total count
    - Cursor-based pagination for large datasets (future)
  </constraints>

  <verification>
    - Pagination returns correct page
    - Filters work independently
    - Filters combine correctly
    - Export includes all filtered records
    - Performance acceptable with 100K+ records
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/dto/audit-log.dto.ts">Query DTOs</file>
  <file path="apps/api/src/database/services/__tests__/audit-log-pagination.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/audit-log.service.ts">Add pagination</file>
  <file path="apps/api/src/modules/reconciliation/reconciliation.controller.ts">Update endpoint</file>
</files_to_modify>

<validation_criteria>
  <criterion>Pagination works correctly</criterion>
  <criterion>Filters work independently</criterion>
  <criterion>Filters combine correctly</criterion>
  <criterion>Export works with filters</criterion>
  <criterion>Performance acceptable</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="audit-log" --verbose</command>
</test_commands>

</task_spec>
