<task_spec id="TASK-PORTAL-025" version="1.0">

<metadata>
  <title>Staff Portal Tax Documents and Profile</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>314</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-STAFF-05</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-021</task_ref>
    <task_ref>TASK-STAFF-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the staff portal tax documents page for IRP5 certificate access and profile management page for viewing/updating personal information. This completes the staff self-service portal with document access and profile management capabilities.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(staff-portal)/layout.tsx</file>
  <file purpose="simplepay_service">apps/api/src/database/services/simplepay/simplepay.service.ts</file>
  <file purpose="staff_controller">apps/api/src/api/staff/staff.controller.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-021 completed (staff auth and layout)</check>
  <check>TASK-STAFF-004 completed (SimplePay integration)</check>
</prerequisites>

<scope>
  <in_scope>
    - Tax documents page (IRP5 certificates)
    - IRP5 list by tax year
    - IRP5 PDF download from SimplePay
    - Tax year selector
    - Profile page with personal info
    - Banking details view (read-only for security)
    - Emergency contact information
    - Address update capability
    - Communication preferences
    - Document repository access
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(staff-portal)/documents/page.tsx">
      export default function StaffDocumentsPage()
    </signature>
    <signature file="apps/web/src/app/(staff-portal)/profile/page.tsx">
      export default function StaffProfilePage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(staff-portal)/documents/page.tsx">Tax documents page</file>
  <file path="apps/web/src/app/(staff-portal)/profile/page.tsx">Staff profile page</file>
  <file path="apps/web/src/components/staff-portal/irp5-list.tsx">IRP5 certificates list</file>
  <file path="apps/web/src/components/staff-portal/document-card.tsx">Document download card</file>
  <file path="apps/web/src/components/staff-portal/staff-profile-form.tsx">Profile edit form</file>
  <file path="apps/web/src/components/staff-portal/banking-details.tsx">Banking info display</file>
  <file path="apps/web/src/components/staff-portal/emergency-contact.tsx">Emergency contact form</file>
  <file path="apps/web/src/hooks/staff-portal/use-staff-documents.ts">React Query hook</file>
  <file path="apps/web/src/hooks/staff-portal/use-staff-profile.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/staff-portal/documents/irp5">
    <description>Get IRP5 certificates for authenticated staff</description>
    <query_params>taxYear (optional)</query_params>
    <response>List of available IRP5 certificates from SimplePay</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/documents/irp5/:id/pdf">
    <description>Download IRP5 PDF from SimplePay</description>
    <response>PDF file stream</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/profile">
    <description>Get staff profile information</description>
    <response>Personal info, contact details, employment info</response>
  </endpoint>
  <endpoint method="PUT" path="/api/staff-portal/profile">
    <description>Update staff profile (limited fields)</description>
    <body>Address, phone, emergency contact</body>
    <response>Updated profile</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/banking">
    <description>Get banking details (read-only display)</description>
    <response>Masked account number, bank name</response>
  </endpoint>
</api_endpoints>

<profile_sections>
  <section name="personal">
    <field editable="false">Full Name</field>
    <field editable="false">ID Number</field>
    <field editable="false">Date of Birth</field>
    <field editable="true">Phone Number</field>
    <field editable="true">Email</field>
    <field editable="true">Address</field>
  </section>
  <section name="employment">
    <field editable="false">Position</field>
    <field editable="false">Department</field>
    <field editable="false">Start Date</field>
    <field editable="false">Employment Type</field>
  </section>
  <section name="banking">
    <field editable="false">Bank Name</field>
    <field editable="false">Account Number (masked)</field>
    <field editable="false">Branch Code</field>
    <note>Contact HR to update banking details</note>
  </section>
  <section name="emergency">
    <field editable="true">Contact Name</field>
    <field editable="true">Contact Relationship</field>
    <field editable="true">Contact Phone</field>
  </section>
</profile_sections>

<validation_criteria>
  <criterion>IRP5 list shows available tax years</criterion>
  <criterion>IRP5 PDF downloads correctly</criterion>
  <criterion>Profile displays all sections</criterion>
  <criterion>Editable fields can be updated</criterion>
  <criterion>Banking details are masked</criterion>
  <criterion>Emergency contact saves correctly</criterion>
</validation_criteria>

</task_spec>
