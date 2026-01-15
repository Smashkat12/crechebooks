<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-DATA-003</task_id>
    <title>Add Audit Logging to Delete Operations</title>
    <priority>HIGH</priority>
    <category>Compliance</category>
    <estimated_effort>3 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <tags>audit-logging, compliance, data-deletion, traceability</tags>
  </metadata>

  <context>
    <background>
      The Payment, Parent, and Child repositories perform hard deletes without
      creating audit log entries. This violates compliance requirements and
      makes it impossible to track who deleted what and when.
    </background>
    <problem_statement>
      HIGH COMPLIANCE ISSUE: Hard deletes in critical repositories lack audit
      trail. Delete operations are irreversible and untraceable, creating
      compliance gaps and making incident investigation impossible.
    </problem_statement>
    <business_impact>
      - Compliance audit failures (SOC2, GDPR)
      - Unable to investigate data deletion incidents
      - No accountability for destructive operations
      - Potential data recovery complications
      - Customer trust issues during audits
    </business_impact>
  </context>

  <scope>
    <in_scope>
      <item>Payment repository delete operations</item>
      <item>Parent repository delete operations</item>
      <item>Child repository delete operations</item>
      <item>Adding audit log entries before delete</item>
      <item>Capturing deletion metadata (who, what, when)</item>
    </in_scope>
    <out_of_scope>
      <item>Converting to soft deletes (future enhancement)</item>
      <item>Audit log viewer UI</item>
      <item>Audit log retention policies</item>
      <item>Other repository delete operations (separate tasks)</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/repositories/payment.repository.ts</file>
      <file>apps/api/src/repositories/parent.repository.ts</file>
      <file>apps/api/src/repositories/child.repository.ts</file>
      <file>apps/api/src/repositories/audit-log.repository.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Add audit log entries before executing delete operations using a transaction
      to ensure both the audit log and delete succeed or fail together. Capture
      entity data snapshot before deletion for recovery purposes.
    </approach>
    <steps>
      <step order="1">
        <description>Review existing AuditLog model and repository</description>
        <details>
          Examine the current AuditLog schema and repository methods to
          understand the expected data structure and available methods.
        </details>
      </step>
      <step order="2">
        <description>Create audit entry helper method</description>
        <details>
          Create a reusable method or base class method for creating
          delete audit entries with consistent structure.
        </details>
      </step>
      <step order="3">
        <description>Update Payment repository delete method</description>
        <details>
          Wrap delete in transaction with audit log creation:
          1. Fetch entity data for snapshot
          2. Create audit log entry
          3. Execute delete
        </details>
      </step>
      <step order="4">
        <description>Update Parent repository delete method</description>
        <details>
          Same pattern as Payment - transactional audit + delete.
        </details>
      </step>
      <step order="5">
        <description>Update Child repository delete method</description>
        <details>
          Same pattern as Payment - transactional audit + delete.
        </details>
      </step>
      <step order="6">
        <description>Add tests for audit logging</description>
        <details>
          Create tests verifying audit entries are created on delete
          and contain required metadata.
        </details>
      </step>
    </steps>
    <code_examples>
      <example name="Transactional Delete with Audit">
        <before><![CDATA[
async delete(id: string, tenantId: string): Promise<void> {
  const result = await this.prisma.payment.deleteMany({
    where: { id, tenantId },
  });

  if (result.count === 0) {
    throw new NotFoundException('Payment not found');
  }
}
        ]]></before>
        <after><![CDATA[
async delete(id: string, tenantId: string, userId: string): Promise<void> {
  // Use transaction to ensure audit and delete succeed together
  await this.prisma.$transaction(async (tx) => {
    // Step 1: Fetch entity data for audit snapshot
    const payment = await tx.payment.findFirst({
      where: { id, tenantId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Step 2: Create audit log entry
    await tx.auditLog.create({
      data: {
        action: 'DELETE',
        entityType: 'Payment',
        entityId: id,
        tenantId,
        userId,
        previousData: payment as any,
        metadata: {
          deletedAt: new Date().toISOString(),
          reason: 'User requested deletion',
        },
      },
    });

    // Step 3: Execute delete
    await tx.payment.delete({
      where: { id },
    });
  });
}
        ]]></after>
      </example>
      <example name="Reusable Audit Helper">
        <code><![CDATA[
// In base repository or utility
protected async auditDelete<T>(
  tx: PrismaTransaction,
  entityType: string,
  entityId: string,
  tenantId: string,
  userId: string,
  entityData: T,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: 'DELETE',
      entityType,
      entityId,
      tenantId,
      userId,
      previousData: entityData as any,
      metadata: {
        deletedAt: new Date().toISOString(),
      },
    },
  });
}
        ]]></code>
      </example>
      <example name="Parent Repository Update">
        <after><![CDATA[
async delete(id: string, tenantId: string, userId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const parent = await tx.parent.findFirst({
      where: { id, tenantId },
      include: { children: true },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    await tx.auditLog.create({
      data: {
        action: 'DELETE',
        entityType: 'Parent',
        entityId: id,
        tenantId,
        userId,
        previousData: parent as any,
        metadata: {
          childrenCount: parent.children.length,
          deletedAt: new Date().toISOString(),
        },
      },
    });

    await tx.parent.delete({
      where: { id },
    });
  });
}
        ]]></after>
      </example>
    </code_examples>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Verify audit log created on Payment delete</description>
        <input>Delete valid payment</input>
        <expected_output>Audit entry with action=DELETE, entityType=Payment</expected_output>
      </test_case>
      <test_case id="TC-002">
        <description>Verify audit log created on Parent delete</description>
        <input>Delete valid parent</input>
        <expected_output>Audit entry with action=DELETE, entityType=Parent</expected_output>
      </test_case>
      <test_case id="TC-003">
        <description>Verify audit log created on Child delete</description>
        <input>Delete valid child</input>
        <expected_output>Audit entry with action=DELETE, entityType=Child</expected_output>
      </test_case>
      <test_case id="TC-004">
        <description>Verify previousData contains entity snapshot</description>
        <input>Delete entity and check audit log</input>
        <expected_output>previousData field contains full entity data</expected_output>
      </test_case>
      <test_case id="TC-005">
        <description>Verify rollback on audit failure</description>
        <input>Simulate audit log creation failure</input>
        <expected_output>Entity NOT deleted, transaction rolled back</expected_output>
      </test_case>
    </test_cases>
    <compliance_validation>
      <item>Audit entries contain required fields (who, what, when)</item>
      <item>Entity data preserved in previousData field</item>
      <item>Audit entries cannot be deleted or modified</item>
    </compliance_validation>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Payment delete creates audit log entry</criterion>
      <criterion>Parent delete creates audit log entry</criterion>
      <criterion>Child delete creates audit log entry</criterion>
      <criterion>Audit entries include userId (who)</criterion>
      <criterion>Audit entries include entityData snapshot (what)</criterion>
      <criterion>Audit entries include timestamp (when)</criterion>
      <criterion>Delete and audit are transactional (both succeed or fail)</criterion>
      <criterion>Unit tests verify audit log creation</criterion>
      <criterion>Integration tests confirm audit trail completeness</criterion>
    </criteria>
    <reviewers>
      <reviewer role="Compliance Officer">Required</reviewer>
      <reviewer role="Tech Lead">Required</reviewer>
    </reviewers>
  </definition_of_done>

  <references>
    <reference type="compliance">SOC2 CC7.2 - System Activity Monitoring</reference>
    <reference type="compliance">GDPR Article 30 - Records of Processing</reference>
    <reference type="internal">Audit Log Schema Documentation</reference>
  </references>
</task_specification>
