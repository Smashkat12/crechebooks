<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-DATA-001</task_id>
    <title>Fix Tenant Isolation in findById Methods</title>
    <priority>CRITICAL</priority>
    <category>Security</category>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <tags>tenant-isolation, security, data-access, critical-fix</tags>
  </metadata>

  <context>
    <background>
      The findById methods across repository classes currently lack tenantId verification,
      creating a critical security vulnerability where authenticated users from one tenant
      can potentially access data belonging to other tenants by manipulating resource IDs.
    </background>
    <problem_statement>
      CRITICAL SECURITY ISSUE: findById methods do not verify tenant ownership, allowing
      cross-tenant data access. An attacker with valid authentication could enumerate or
      guess resource IDs to access data from other organizations.
    </problem_statement>
    <business_impact>
      - Data breach risk across tenant boundaries
      - Regulatory compliance violations (GDPR, SOC2)
      - Loss of customer trust and potential legal liability
      - Complete compromise of multi-tenant data isolation
    </business_impact>
  </context>

  <scope>
    <in_scope>
      <item>All repository findById methods in apps/api/src/repositories/</item>
      <item>Adding tenantId parameter to method signatures</item>
      <item>Adding tenant ownership verification queries</item>
      <item>Updating all callers to pass tenantId</item>
      <item>Adding tests for tenant isolation</item>
    </in_scope>
    <out_of_scope>
      <item>Row-level security at database level (future enhancement)</item>
      <item>Refactoring repository base class (separate task)</item>
      <item>Performance optimization of added checks</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/repositories/parent.repository.ts</file>
      <file>apps/api/src/repositories/child.repository.ts</file>
      <file>apps/api/src/repositories/payment.repository.ts</file>
      <file>apps/api/src/repositories/attendance.repository.ts</file>
      <file>apps/api/src/repositories/user.repository.ts</file>
      <file>apps/api/src/repositories/tenant.repository.ts</file>
      <file>apps/api/src/services/*.service.ts (callers)</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Modify all findById methods to require tenantId parameter and verify ownership
      before returning data. Return null or throw NotFoundError when tenant mismatch.
    </approach>
    <steps>
      <step order="1">
        <description>Audit all repository files to identify findById methods</description>
        <details>
          Grep for findById patterns across all repository files and document
          current signatures and return types.
        </details>
      </step>
      <step order="2">
        <description>Update findById method signatures</description>
        <details>
          Add tenantId: string parameter to all findById methods:

          BEFORE:
          async findById(id: string): Promise&lt;Entity | null&gt;

          AFTER:
          async findById(id: string, tenantId: string): Promise&lt;Entity | null&gt;
        </details>
      </step>
      <step order="3">
        <description>Add tenant verification to queries</description>
        <details>
          Modify Prisma queries to include tenantId in where clause:

          return this.prisma.entity.findFirst({
            where: {
              id,
              tenantId,
            },
          });
        </details>
      </step>
      <step order="4">
        <description>Update all service layer callers</description>
        <details>
          Find and update all locations that call findById to pass the
          tenantId from the request context or authenticated user.
        </details>
      </step>
      <step order="5">
        <description>Add unit tests for tenant isolation</description>
        <details>
          Create tests that verify:
          - findById returns null for valid ID but wrong tenant
          - findById returns entity for valid ID and matching tenant
          - Cross-tenant access attempts are blocked
        </details>
      </step>
    </steps>
    <code_examples>
      <example name="Repository Method Update">
        <before><![CDATA[
async findById(id: string): Promise<Parent | null> {
  return this.prisma.parent.findUnique({
    where: { id },
    include: { children: true },
  });
}
        ]]></before>
        <after><![CDATA[
async findById(id: string, tenantId: string): Promise<Parent | null> {
  return this.prisma.parent.findFirst({
    where: {
      id,
      tenantId,
    },
    include: { children: true },
  });
}
        ]]></after>
      </example>
      <example name="Service Layer Update">
        <before><![CDATA[
async getParent(id: string): Promise<Parent> {
  const parent = await this.parentRepository.findById(id);
  if (!parent) throw new NotFoundException('Parent not found');
  return parent;
}
        ]]></before>
        <after><![CDATA[
async getParent(id: string, tenantId: string): Promise<Parent> {
  const parent = await this.parentRepository.findById(id, tenantId);
  if (!parent) throw new NotFoundException('Parent not found');
  return parent;
}
        ]]></after>
      </example>
    </code_examples>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Verify findById returns null for wrong tenant</description>
        <input>Valid entity ID, different tenantId</input>
        <expected_output>null returned, no entity data exposed</expected_output>
      </test_case>
      <test_case id="TC-002">
        <description>Verify findById returns entity for correct tenant</description>
        <input>Valid entity ID, matching tenantId</input>
        <expected_output>Entity returned with all expected fields</expected_output>
      </test_case>
      <test_case id="TC-003">
        <description>Verify cross-tenant enumeration blocked</description>
        <input>Sequential IDs with attacker's tenantId</input>
        <expected_output>All return null, no data leakage</expected_output>
      </test_case>
    </test_cases>
    <security_validation>
      <item>Penetration test: Attempt cross-tenant access via API</item>
      <item>Code review: Verify all findById calls pass tenantId</item>
      <item>Static analysis: No findById calls without tenantId</item>
    </security_validation>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All findById methods require tenantId parameter</criterion>
      <criterion>All findById queries filter by tenantId</criterion>
      <criterion>All service layer callers updated to pass tenantId</criterion>
      <criterion>Unit tests verify tenant isolation</criterion>
      <criterion>Integration tests confirm cross-tenant access blocked</criterion>
      <criterion>Security review completed and approved</criterion>
      <criterion>No regression in existing functionality</criterion>
      <criterion>Documentation updated for API changes</criterion>
    </criteria>
    <reviewers>
      <reviewer role="Security Lead">Required</reviewer>
      <reviewer role="Tech Lead">Required</reviewer>
    </reviewers>
  </definition_of_done>

  <references>
    <reference type="security">OWASP Broken Access Control</reference>
    <reference type="compliance">SOC2 CC6.1 - Logical Access Controls</reference>
    <reference type="internal">Multi-Tenant Architecture Guide</reference>
  </references>
</task_specification>
