<task_spec id="TASK-PORTAL-005" version="1.0">

<metadata>
  <title>Public Demo Request and Legal Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>294</sequence>
  <implements>
    <requirement_ref>REQ-WEB-PUBLIC-05</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
Create demo request page for lead generation and legal pages (privacy policy, terms of service) for compliance. The demo request page should capture prospect information for sales follow-up, while legal pages ensure POPIA and regulatory compliance.
</context>

<input_context_files>
  <file purpose="public_layout">apps/web/src/app/(public)/layout.tsx</file>
  <file purpose="public_components">apps/web/src/components/public/</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-001 completed (public layout and components)</check>
</prerequisites>

<scope>
  <in_scope>
    - Demo request page with lead capture form
    - Creche details collection (name, size, location)
    - Current challenges selection
    - Preferred demo time slots
    - Privacy policy page (POPIA compliant)
    - Terms of service page
    - Acceptable use policy
    - Cookie policy
    - Form submission to lead API endpoint
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(public)/demo/page.tsx">
      export default function DemoRequestPage()
    </signature>
    <signature file="apps/web/src/app/(public)/privacy/page.tsx">
      export default function PrivacyPolicyPage()
    </signature>
    <signature file="apps/web/src/app/(public)/terms/page.tsx">
      export default function TermsOfServicePage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(public)/demo/page.tsx">Demo request form page</file>
  <file path="apps/web/src/app/(public)/privacy/page.tsx">Privacy policy (POPIA)</file>
  <file path="apps/web/src/app/(public)/terms/page.tsx">Terms of service</file>
  <file path="apps/web/src/app/(public)/cookies/page.tsx">Cookie policy</file>
  <file path="apps/web/src/components/public/demo-form.tsx">Demo request form component</file>
</files_to_create>

<form_fields>
  <field name="fullName" required="true">Full Name</field>
  <field name="email" required="true">Work Email</field>
  <field name="phone" required="true">Phone Number</field>
  <field name="crecheName" required="true">Crèche Name</field>
  <field name="childrenCount" required="true">Number of Children (dropdown: 1-30, 31-50, 51-100, 100+)</field>
  <field name="location" required="true">Province</field>
  <field name="currentSoftware" required="false">Current Accounting Software</field>
  <field name="challenges" required="false">Main Challenges (multi-select)</field>
  <field name="preferredTime" required="false">Preferred Demo Time</field>
</form_fields>

<legal_sections>
  <privacy>
    <section>Information We Collect</section>
    <section>How We Use Information</section>
    <section>Data Sharing and Disclosure</section>
    <section>Data Security</section>
    <section>Your Rights (POPIA)</section>
    <section>Contact Information Officer</section>
  </privacy>
  <terms>
    <section>Account Terms</section>
    <section>Payment Terms</section>
    <section>Service Level Agreement</section>
    <section>Data Ownership</section>
    <section>Termination</section>
    <section>Limitation of Liability</section>
  </terms>
</legal_sections>

<validation_criteria>
  <criterion>Demo form validates all required fields</criterion>
  <criterion>Form submission creates lead record</criterion>
  <criterion>Confirmation message shown on submit</criterion>
  <criterion>Legal pages have proper headings/sections</criterion>
  <criterion>POPIA compliance sections present</criterion>
</validation_criteria>

</task_spec>
