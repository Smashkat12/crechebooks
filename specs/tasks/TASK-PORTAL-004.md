<task_spec id="TASK-PORTAL-004" version="1.0">

<metadata>
  <title>Public About and Contact Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>293</sequence>
  <implements>
    <requirement_ref>REQ-WEB-PUBLIC-04</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
Create About Us and Contact pages for the public marketing site. The About page builds trust by sharing the company story and team, while the Contact page provides multiple ways for prospects to reach out.
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
    - About page with company story
    - Mission/vision statement
    - Team section (optional, can use placeholder)
    - Company values
    - Contact page with form
    - Contact information display
    - Office location (optional map)
    - FAQ link
    - Support hours
    - Form validation and submission to API
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(public)/about/page.tsx">
      export default function AboutPage()
    </signature>
    <signature file="apps/web/src/app/(public)/contact/page.tsx">
      export default function ContactPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(public)/about/page.tsx">About us page</file>
  <file path="apps/web/src/app/(public)/contact/page.tsx">Contact page with form</file>
  <file path="apps/web/src/components/public/contact-form.tsx">Contact form component</file>
  <file path="apps/web/src/components/public/team-member-card.tsx">Team member display</file>
</files_to_create>

<content_requirements>
  <section name="about">
    <headline>About CrecheBooks</headline>
    <story>Founded to simplify financial management for South African childcare centres</story>
    <mission>Empowering crèche owners to focus on children, not paperwork</mission>
    <values>Simplicity, Reliability, Compliance, Support</values>
  </section>
  <section name="contact">
    <email>hello@crechebooks.co.za</email>
    <phone>+27 (0)21 XXX XXXX</phone>
    <support_hours>Mon-Fri 8am-5pm SAST</support_hours>
    <form_fields>Name, Email, Phone, Subject, Message</form_fields>
  </section>
</content_requirements>

<validation_criteria>
  <criterion>About page tells company story</criterion>
  <criterion>Contact form validates inputs</criterion>
  <criterion>Form submission shows success message</criterion>
  <criterion>Contact info is accessible</criterion>
  <criterion>Pages are SEO optimized</criterion>
</validation_criteria>

</task_spec>
