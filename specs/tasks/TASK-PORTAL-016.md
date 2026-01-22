<task_spec id="TASK-PORTAL-016" version="1.0">

<metadata>
  <title>Parent Portal Profile and Preferences</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>305</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-06</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-011</task_ref>
    <task_ref>TASK-WA-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the parent portal profile and preferences page where parents can view/update their contact information, manage children details, configure communication preferences (including WhatsApp opt-in as per TASK-WA-004), and manage their account settings.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(parent-portal)/layout.tsx</file>
  <file purpose="parent_controller">apps/api/src/api/parents/parent.controller.ts</file>
  <file purpose="whatsapp_optin">apps/web/src/components/parent-portal/</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-011 completed (parent auth and layout)</check>
  <check>TASK-WA-004 completed (WhatsApp opt-in UI)</check>
</prerequisites>

<scope>
  <in_scope>
    - Profile page with contact info
    - Edit contact details (phone, email, address)
    - Children list with details
    - Communication preferences
    - WhatsApp opt-in toggle (POPIA compliant)
    - Email notification preferences
    - Invoice delivery method preference
    - Update password/security (if applicable)
    - Account deletion request
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/profile/page.tsx">
      export default function ParentProfilePage()
    </signature>
    <signature file="apps/web/src/app/(parent-portal)/children/page.tsx">
      export default function ChildrenPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/profile/page.tsx">Profile settings page</file>
  <file path="apps/web/src/app/(parent-portal)/children/page.tsx">Children details page</file>
  <file path="apps/web/src/components/parent-portal/profile-form.tsx">Profile edit form</file>
  <file path="apps/web/src/components/parent-portal/child-card.tsx">Child info card</file>
  <file path="apps/web/src/components/parent-portal/communication-prefs.tsx">Communication preferences</file>
  <file path="apps/web/src/components/parent-portal/whatsapp-consent.tsx">WhatsApp opt-in (POPIA)</file>
  <file path="apps/web/src/hooks/parent-portal/use-parent-profile.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/parent-portal/profile">
    <description>Get parent profile with preferences</description>
    <response>Parent details and communication preferences</response>
  </endpoint>
  <endpoint method="PUT" path="/api/parent-portal/profile">
    <description>Update parent profile</description>
    <body>Contact details updates</body>
  </endpoint>
  <endpoint method="PUT" path="/api/parent-portal/preferences">
    <description>Update communication preferences</description>
    <body>Email, WhatsApp, invoice delivery prefs</body>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/children">
    <description>Get children for parent</description>
    <response>List of enrolled children</response>
  </endpoint>
</api_endpoints>

<communication_preferences>
  <preference name="invoiceDelivery">Email, WhatsApp, or Both</preference>
  <preference name="paymentReminders">Enable/disable reminders</preference>
  <preference name="whatsappOptIn">POPIA consent toggle</preference>
  <preference name="emailNotifications">Enable/disable emails</preference>
</communication_preferences>

<validation_criteria>
  <criterion>Profile form updates parent record</criterion>
  <criterion>Phone validation for SA numbers</criterion>
  <criterion>WhatsApp opt-in records consent timestamp</criterion>
  <criterion>Children list displays accurately</criterion>
  <criterion>Preferences save correctly</criterion>
  <criterion>POPIA consent notice displayed</criterion>
</validation_criteria>

</task_spec>
