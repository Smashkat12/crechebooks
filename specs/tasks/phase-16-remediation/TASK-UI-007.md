<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-007</task_id>
    <title>Add Accessibility Skip Links</title>
    <type>accessibility</type>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <estimated_effort>1-2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <tags>accessibility, a11y, wcag, keyboard-navigation, screen-reader</tags>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The application lacks skip links, which are essential for keyboard and screen reader
      users to bypass repetitive navigation elements. Without skip links, users must tab
      through the entire navigation on every page, creating a poor experience for those
      using assistive technologies.
    </issue_description>
    <current_behavior>
      - No skip links present
      - Keyboard users must tab through all navigation items
      - Screen reader users hear full navigation on every page
      - No landmark roles properly defined
    </current_behavior>
    <accessibility_impact>
      - WCAG 2.4.1 Bypass Blocks (Level A) violation
      - Poor keyboard navigation experience
      - Inefficient screen reader navigation
      - Accessibility audit failures
    </accessibility_impact>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/web/src/app/layout.tsx" action="modify">
        Add skip link component to root layout
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/web/src/components/SkipLink.tsx">
        Skip link component with proper styling
      </file>
      <file path="apps/web/src/components/__tests__/SkipLink.test.tsx">
        Skip link accessibility tests
      </file>
    </files_to_create>
    <wcag_requirements>
      <requirement code="2.4.1" level="A">Bypass Blocks</requirement>
      <requirement code="2.4.3" level="A">Focus Order</requirement>
      <requirement code="2.4.7" level="AA">Focus Visible</requirement>
    </wcag_requirements>
  </scope>

  <implementation>
    <step order="1" description="Create SkipLink component">
      <action>
        ```typescript
        // apps/web/src/components/SkipLink.tsx
        'use client';

        interface SkipLinkProps {
          href: string;
          children: React.ReactNode;
        }

        export function SkipLink({ href, children }: SkipLinkProps) {
          return (
            <a
              href={href}
              className="
                sr-only focus:not-sr-only
                focus:absolute focus:top-4 focus:left-4 focus:z-50
                focus:px-4 focus:py-2
                focus:bg-blue-600 focus:text-white
                focus:rounded-md focus:shadow-lg
                focus:outline-none focus:ring-2 focus:ring-blue-400
                focus:font-medium
              "
            >
              {children}
            </a>
          );
        }
        ```
      </action>
    </step>
    <step order="2" description="Add skip links to root layout">
      <action>
        ```typescript
        // apps/web/src/app/layout.tsx
        import { SkipLink } from '@/components/SkipLink';

        export default function RootLayout({ children }: { children: React.ReactNode }) {
          return (
            <html lang="en">
              <body>
                <SkipLink href="#main-content">
                  Skip to main content
                </SkipLink>
                <SkipLink href="#main-navigation">
                  Skip to navigation
                </SkipLink>

                <nav id="main-navigation" role="navigation" aria-label="Main navigation">
                  {/* Navigation content */}
                </nav>

                <main id="main-content" role="main" tabIndex={-1}>
                  {children}
                </main>
              </body>
            </html>
          );
        }
        ```
      </action>
    </step>
    <step order="3" description="Add proper landmark roles">
      <action>
        Ensure all major sections have appropriate ARIA roles:

        ```typescript
        <header role="banner">...</header>
        <nav role="navigation" aria-label="Main">...</nav>
        <main role="main">...</main>
        <aside role="complementary">...</aside>
        <footer role="contentinfo">...</footer>
        ```
      </action>
    </step>
    <step order="4" description="Style skip links for visibility on focus">
      <action>
        Add Tailwind/CSS for skip link focus states:

        ```css
        /* Only visible when focused */
        .skip-link {
          position: absolute;
          left: -9999px;
        }

        .skip-link:focus {
          position: fixed;
          top: 1rem;
          left: 1rem;
          z-index: 9999;
          padding: 0.75rem 1rem;
          background: #1d4ed8;
          color: white;
          border-radius: 0.375rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        ```
      </action>
    </step>
    <step order="5" description="Write accessibility tests">
      <action>
        ```typescript
        // apps/web/src/components/__tests__/SkipLink.test.tsx
        import { render, screen } from '@testing-library/react';
        import userEvent from '@testing-library/user-event';
        import { SkipLink } from '../SkipLink';

        describe('SkipLink', () => {
          it('is hidden by default', () => {
            render(<SkipLink href="#main">Skip</SkipLink>);
            const link = screen.getByRole('link', { name: 'Skip' });
            expect(link).toHaveClass('sr-only');
          });

          it('becomes visible on focus', async () => {
            render(<SkipLink href="#main">Skip</SkipLink>);
            const link = screen.getByRole('link', { name: 'Skip' });
            await userEvent.tab();
            expect(link).toHaveFocus();
            expect(link).toHaveClass('focus:not-sr-only');
          });

          it('links to correct target', () => {
            render(<SkipLink href="#main-content">Skip</SkipLink>);
            const link = screen.getByRole('link', { name: 'Skip' });
            expect(link).toHaveAttribute('href', '#main-content');
          });
        });
        ```
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="Skip link visible on Tab">
        Press Tab key, verify skip link appears and is visible
      </test>
      <test name="Skip link navigates to main">
        Activate skip link, verify focus moves to main content
      </test>
      <test name="Screen reader announces skip link">
        Use screen reader, verify skip link is announced
      </test>
      <test name="Landmark roles present">
        Verify main, nav, banner, contentinfo roles in DOM
      </test>
    </test_cases>
    <accessibility_tools>
      <tool>axe DevTools - Automated accessibility testing</tool>
      <tool>WAVE - Web accessibility evaluation</tool>
      <tool>VoiceOver/NVDA - Screen reader testing</tool>
      <tool>Keyboard only navigation test</tool>
    </accessibility_tools>
  </verification>

  <definition_of_done>
    <criteria>
      <item>Skip to main content link present</item>
      <item>Skip link hidden until focused</item>
      <item>Skip link visible and styled on focus</item>
      <item>Skip link navigates to main content area</item>
      <item>Main content has proper landmark role</item>
      <item>Navigation has proper landmark role</item>
      <item>Screen reader correctly announces skip link</item>
      <item>axe DevTools shows no bypass blocks violation</item>
      <item>Keyboard navigation test passes</item>
    </criteria>
  </definition_of_done>
</task_specification>
