<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-DATA-002</task_id>
    <title>Fix Cross-Tenant Deletion Vulnerability</title>
    <priority>CRITICAL</priority>
    <category>Security</category>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <tags>tenant-isolation, security, data-deletion, critical-fix</tags>
  </metadata>

  <context>
    <background>
      Delete operations in repository classes do not verify tenant ownership before
      executing destructive operations. This allows authenticated users to potentially
      delete data belonging to other tenants by providing valid resource IDs.
    </background>
    <problem_statement>
      CRITICAL SECURITY ISSUE: Delete operations execute without tenant verification,
      enabling cross-tenant data destruction. An attacker could delete records from
      other organizations by guessing or enumerating resource IDs.
    </problem_statement>
    <business_impact>
      - Potential data loss across tenant boundaries
      - Sabotage risk from malicious actors
      - Regulatory compliance violations
      - Business continuity risk for affected customers
      - Legal liability for data destruction
    </business_impact>
  </context>

  <scope>
    <in_scope>
      <item>All repository delete methods in apps/api/src/repositories/</item>
      <item>Adding tenantId verification before delete execution</item>
      <item>Adding ownership check queries</item>
      <item>Updating all callers to pass tenantId</item>
      <item>Adding tests for delete tenant isolation</item>
    </in_scope>
    <out_of_scope>
      <item>Soft delete implementation (handled in TASK-DATA-003)</item>
      <item>Cascade delete behavior changes</item>
      <item>Bulk delete operations</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/repositories/parent.repository.ts</file>
      <file>apps/api/src/repositories/child.repository.ts</file>
      <file>apps/api/src/repositories/payment.repository.ts</file>
      <file>apps/api/src/repositories/attendance.repository.ts</file>
      <file>apps/api/src/repositories/user.repository.ts</file>
      <file>apps/api/src/services/*.service.ts (callers)</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Modify all delete methods to first verify tenant ownership before executing
      the delete. Use a two-step process: verify ownership, then delete. Throw
      appropriate error if ownership verification fails.
    </approach>
    <steps>
      <step order="1">
        <description>Audit all repository files to identify delete methods</description>
        <details>
          Grep for delete, remove, destroy patterns across all repository files
          and document current implementations.
        </details>
      </step>
      <step order="2">
        <description>Update delete method signatures</description>
        <details>
          Add tenantId: string parameter to all delete methods:

          BEFORE:
          async delete(id: string): Promise&lt;void&gt;

          AFTER:
          async delete(id: string, tenantId: string): Promise&lt;void&gt;
        </details>
      </step>
      <step order="3">
        <description>Add ownership verification before delete</description>
        <details>
          Implement two-step verification using deleteMany with tenant filter
          or verify existence first then delete:

          Option 1: Use deleteMany with tenant filter (atomic)
          Option 2: Verify ownership then delete (explicit)
        </details>
      </step>
      <step order="4">
        <description>Add appropriate error handling</description>
        <details>
          Throw NotFoundException when entity doesn't exist or belongs to
          different tenant. Do not differentiate between "not found" and
          "wrong tenant" to prevent enumeration attacks.
        </details>
      </step>
      <step order="5">
        <description>Update all service layer callers</description>
        <details>
          Find and update all locations that call delete methods to pass
          the tenantId from the request context.
        </details>
      </step>
      <step order="6">
        <description>Add unit tests for delete tenant isolation</description>
        <details>
          Create tests that verify delete operations respect tenant boundaries.
        </details>
      </step>
    </steps>
    <code_examples>
      <example name="Atomic Delete with Tenant Verification">
        <before><![CDATA[
async delete(id: string): Promise<void> {
  await this.prisma.parent.delete({
    where: { id },
  });
}
        ]]></before>
        <after><![CDATA[
async delete(id: string, tenantId: string): Promise<void> {
  const result = await this.prisma.parent.deleteMany({
    where: {
      id,
      tenantId,
    },
  });

  if (result.count === 0) {
    throw new NotFoundException('Parent not found');
  }
}
        ]]></after>
      </example>
      <example name="Two-Step Delete with Verification">
        <before><![CDATA[
async delete(id: string): Promise<void> {
  await this.prisma.child.delete({
    where: { id },
  });
}
        ]]></before>
        <after><![CDATA[
async delete(id: string, tenantId: string): Promise<void> {
  // Step 1: Verify ownership
  const entity = await this.prisma.child.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!entity) {
    throw new NotFoundException('Child not found');
  }

  // Step 2: Execute delete
  await this.prisma.child.delete({
    where: { id },
  });
}
        ]]></after>
      </example>
      <example name="Service Layer Update">
        <before><![CDATA[
async deleteParent(id: string): Promise<void> {
  await this.parentRepository.delete(id);
}
        ]]></before>
        <after><![CDATA[
async deleteParent(id: string, tenantId: string): Promise<void> {
  await this.parentRepository.delete(id, tenantId);
}
        ]]></after>
      </example>
    </code_examples>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Verify delete fails for wrong tenant</description>
        <input>Valid entity ID, different tenantId</input>
        <expected_output>NotFoundException thrown, entity NOT deleted</expected_output>
      </test_case>
      <test_case id="TC-002">
        <description>Verify delete succeeds for correct tenant</description>
        <input>Valid entity ID, matching tenantId</input>
        <expected_output>Entity deleted successfully</expected_output>
      </test_case>
      <test_case id="TC-003">
        <description>Verify cross-tenant deletion blocked</description>
        <input>Tenant A's ID, Tenant B's entity</input>
        <expected_output>NotFoundException, no data destroyed</expected_output>
      </test_case>
      <test_case id="TC-004">
        <description>Verify error message doesn't leak tenant info</description>
        <input>Cross-tenant delete attempt</input>
        <expected_output>Generic "not found" message</expected_output>
      </test_case>
    </test_cases>
    <security_validation>
      <item>Penetration test: Attempt cross-tenant deletion via API</item>
      <item>Code review: Verify all delete calls pass tenantId</item>
      <item>Database audit: Confirm no cross-tenant deletes occurred</item>
    </security_validation>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All delete methods require tenantId parameter</criterion>
      <criterion>All delete operations verify tenant ownership first</criterion>
      <criterion>All service layer callers updated to pass tenantId</criterion>
      <criterion>Error messages do not leak tenant information</criterion>
      <criterion>Unit tests verify delete tenant isolation</criterion>
      <criterion>Integration tests confirm cross-tenant deletion blocked</criterion>
      <criterion>Security review completed and approved</criterion>
      <criterion>No regression in existing delete functionality</criterion>
    </criteria>
    <reviewers>
      <reviewer role="Security Lead">Required</reviewer>
      <reviewer role="Tech Lead">Required</reviewer>
    </reviewers>
  </definition_of_done>

  <references>
    <reference type="security">OWASP Broken Access Control</reference>
    <reference type="security">CWE-639: Authorization Bypass</reference>
    <reference type="compliance">SOC2 CC6.1 - Logical Access Controls</reference>
  </references>
</task_specification>
