<task_spec id="TASK-PORTAL-001" version="1.0">

<metadata>
  <title>Public Landing Page Layout and Foundation</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>290</sequence>
  <implements>
    <requirement_ref>REQ-WEB-PUBLIC-01</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
    <task_ref>TASK-WEB-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the foundational layout and components for public-facing landing pages. This establishes the shared layout, navigation, footer, and component library for the marketing/public section of CrecheBooks separate from the authenticated dashboard.
</context>

<input_context_files>
  <file purpose="existing_layout">apps/web/src/components/layout/</file>
  <file purpose="shadcn_components">apps/web/src/components/ui/</file>
  <file purpose="current_landing">apps/web/src/app/page.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed (Next.js setup)</check>
  <check>TASK-WEB-002 completed (shadcn/ui setup)</check>
</prerequisites>

<scope>
  <in_scope>
    - Public layout wrapper with header navigation
    - Responsive navigation with mobile hamburger menu
    - Footer with contact info, quick links, legal links
    - SEO metadata configuration
    - Hero section component
    - Feature card component
    - Testimonial card component
    - CTA (Call-to-Action) section component
    - Stats counter component
    - Pricing card component
    - FAQ accordion component
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(public)/layout.tsx">
      export default function PublicLayout({ children }: { children: React.ReactNode })
    </signature>
    <signature file="apps/web/src/components/public/public-header.tsx">
      export function PublicHeader()
    </signature>
    <signature file="apps/web/src/components/public/public-footer.tsx">
      export function PublicFooter()
    </signature>
    <signature file="apps/web/src/components/public/hero-section.tsx">
      export function HeroSection({ title, subtitle, primaryCta, secondaryCta }: HeroSectionProps)
    </signature>
    <signature file="apps/web/src/components/public/feature-card.tsx">
      export function FeatureCard({ icon, title, description }: FeatureCardProps)
    </signature>
    <signature file="apps/web/src/components/public/pricing-card.tsx">
      export function PricingCard({ tier, price, features, cta, highlighted }: PricingCardProps)
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(public)/layout.tsx">Public pages layout wrapper</file>
  <file path="apps/web/src/components/public/public-header.tsx">Header with navigation</file>
  <file path="apps/web/src/components/public/public-footer.tsx">Footer with links</file>
  <file path="apps/web/src/components/public/hero-section.tsx">Hero banner component</file>
  <file path="apps/web/src/components/public/feature-card.tsx">Feature display card</file>
  <file path="apps/web/src/components/public/testimonial-card.tsx">Testimonial display</file>
  <file path="apps/web/src/components/public/cta-section.tsx">Call-to-action section</file>
  <file path="apps/web/src/components/public/stats-counter.tsx">Animated stats display</file>
  <file path="apps/web/src/components/public/pricing-card.tsx">Pricing tier card</file>
  <file path="apps/web/src/components/public/faq-accordion.tsx">FAQ accordion</file>
  <file path="apps/web/src/components/public/index.ts">Component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Public layout renders correctly</criterion>
  <criterion>Navigation is responsive on mobile</criterion>
  <criterion>Footer displays all required links</criterion>
  <criterion>Hero section accepts dynamic props</criterion>
  <criterion>Components follow shadcn/ui patterns</criterion>
</validation_criteria>

</task_spec>
