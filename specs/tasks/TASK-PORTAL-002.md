<task_spec id="TASK-PORTAL-002" version="1.0">

<metadata>
  <title>Public Homepage</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>291</sequence>
  <implements>
    <requirement_ref>REQ-WEB-PUBLIC-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the main public homepage that serves as the primary marketing landing page for CrecheBooks. This page should clearly communicate the value proposition, showcase key features, display social proof through testimonials, and drive conversions with clear CTAs to sign up or request a demo.
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
    - Hero section with value proposition
    - Key features grid (6-8 features)
    - How it works section (3 steps)
    - Statistics section (childcare centers, parents, transactions)
    - Testimonials carousel
    - Pricing preview section
    - CTA section with demo/signup buttons
    - SEO optimization (meta tags, structured data)
    - Performance optimization (image loading, LCP)
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(public)/page.tsx">
      export default function HomePage()
    </signature>
    <signature file="apps/web/src/app/(public)/page.tsx">
      export const metadata: Metadata
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(public)/page.tsx">Homepage with all sections</file>
</files_to_create>

<content_requirements>
  <section name="hero">
    <headline>Simplify Your Crèche Bookkeeping</headline>
    <subheadline>Complete financial management for South African childcare centres. From invoicing to SARS compliance, we handle it all.</subheadline>
    <primary_cta>Start Free Trial</primary_cta>
    <secondary_cta>Book a Demo</secondary_cta>
  </section>
  <section name="features">
    <feature>Automated Invoicing</feature>
    <feature>Parent Payments Tracking</feature>
    <feature>Staff Payroll (SimplePay)</feature>
    <feature>SARS VAT201/EMP201</feature>
    <feature>Bank Reconciliation</feature>
    <feature>WhatsApp Notifications</feature>
    <feature>Xero Integration</feature>
    <feature>Multi-Location Support</feature>
  </section>
  <section name="social_proof">
    <stat>500+ Crèches</stat>
    <stat>10,000+ Parents</stat>
    <stat>R50M+ Processed</stat>
  </section>
</content_requirements>

<validation_criteria>
  <criterion>Page loads under 2 seconds</criterion>
  <criterion>Mobile responsive design</criterion>
  <criterion>All CTAs navigate correctly</criterion>
  <criterion>SEO meta tags present</criterion>
  <criterion>Lighthouse score > 90</criterion>
</validation_criteria>

</task_spec>
