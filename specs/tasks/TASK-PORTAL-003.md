<task_spec id="TASK-PORTAL-003" version="1.0">

<metadata>
  <title>Public Features and Pricing Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>292</sequence>
  <implements>
    <requirement_ref>REQ-WEB-PUBLIC-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create detailed features and pricing pages for the public marketing site. The features page should comprehensively explain each capability of CrecheBooks, while the pricing page should clearly display subscription tiers with feature comparisons.
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
    - Features page with category sections
    - Feature detail cards with icons
    - Integration showcase (Xero, SimplePay, WhatsApp)
    - Pricing page with 3 tiers (Starter, Professional, Enterprise)
    - Feature comparison table
    - FAQ section for pricing questions
    - Annual vs monthly toggle
    - Enterprise contact form
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(public)/features/page.tsx">
      export default function FeaturesPage()
    </signature>
    <signature file="apps/web/src/app/(public)/pricing/page.tsx">
      export default function PricingPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(public)/features/page.tsx">Features overview page</file>
  <file path="apps/web/src/app/(public)/pricing/page.tsx">Pricing tiers page</file>
  <file path="apps/web/src/components/public/pricing-table.tsx">Feature comparison table</file>
  <file path="apps/web/src/components/public/integration-card.tsx">Integration showcase card</file>
</files_to_create>

<pricing_structure>
  <tier name="Starter">
    <price>R499/month</price>
    <children_limit>50</children_limit>
    <features>Invoicing, Parent payments, Bank reconciliation, Email notifications</features>
  </tier>
  <tier name="Professional">
    <price>R999/month</price>
    <children_limit>150</children_limit>
    <features>All Starter + Staff payroll, SARS submissions, WhatsApp, Xero integration</features>
    <highlighted>true</highlighted>
  </tier>
  <tier name="Enterprise">
    <price>Custom</price>
    <children_limit>Unlimited</children_limit>
    <features>All Professional + Multi-location, API access, Dedicated support, Custom reports</features>
  </tier>
</pricing_structure>

<validation_criteria>
  <criterion>Features page displays all product capabilities</criterion>
  <criterion>Pricing toggle switches correctly</criterion>
  <criterion>Comparison table is responsive</criterion>
  <criterion>Enterprise form submits correctly</criterion>
  <criterion>CTA buttons navigate to signup</criterion>
</validation_criteria>

</task_spec>
