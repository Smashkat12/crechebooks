<task_spec id="TASK-WEB-046" version="1.0">

<metadata>
  <title>Mobile Responsive Improvements</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>125</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WEB-14</requirement_ref>
    <critical_issue_ref>HIGH-010</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use responsive design and mobile-first thinking.
This task involves:
1. Audit all pages for mobile issues
2. Fix layout issues on small screens
3. Optimize touch targets
4. Add responsive navigation
5. Test across viewports
</reasoning_mode>

<context>
GAP: Limited mobile support across dashboard pages.

REQ-WEB-14 specifies: "Responsive design for all screen sizes."

This task improves mobile experience across the entire application.
</context>

<current_state>
## Codebase State
- Desktop-first design
- Some responsive breakpoints
- Navigation not optimized for mobile
- Touch targets too small
- Tables overflow on mobile

## What's Missing
- Mobile navigation drawer
- Responsive tables
- Touch-friendly buttons
- Mobile-optimized forms
</current_state>

<input_context_files>
  <file purpose="layout">apps/web/src/app/(dashboard)/layout.tsx</file>
  <file purpose="nav_component">apps/web/src/components/navigation/Sidebar.tsx</file>
  <file purpose="tailwind_config">apps/web/tailwind.config.js</file>
</input_context_files>

<scope>
  <in_scope>
    - Mobile navigation drawer
    - Responsive data tables
    - Touch targets minimum 44px
    - Form field sizing
    - Modal sizing on mobile
    - Card layouts for mobile
    - Hide/show elements by viewport
  </in_scope>
  <out_of_scope>
    - Native mobile app
    - PWA features
    - Offline support
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/navigation/MobileNav.tsx">
      export interface MobileNavProps {
        isOpen: boolean;
        onClose: () => void;
        items: NavItem[];
      }

      export function MobileNav(props: MobileNavProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/ui/ResponsiveTable.tsx">
      export interface ResponsiveTableProps<T> {
        data: T[];
        columns: Column<T>[];
        mobileCardRenderer?: (item: T) => JSX.Element;
      }

      export function ResponsiveTable<T>(props: ResponsiveTableProps<T>): JSX.Element;
    </signature>
    <signature file="apps/web/src/hooks/useBreakpoint.ts">
      export function useBreakpoint(): {
        isMobile: boolean;
        isTablet: boolean;
        isDesktop: boolean;
        breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
      };
    </signature>
  </signatures>

  <constraints>
    - Test on 320px, 375px, 414px, 768px, 1024px viewports
    - Touch targets minimum 44x44px
    - Font sizes readable on mobile (min 16px base)
    - No horizontal scroll on any page
    - Navigation accessible via hamburger menu
    - Tables convert to cards on mobile
  </constraints>

  <verification>
    - All pages tested on mobile viewports
    - No layout issues on screens &lt;768px
    - Touch targets meet minimum size
    - Navigation drawer works
    - Tables convert to cards
    - Forms usable on mobile
    - E2E tests on mobile viewport
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/navigation/MobileNav.tsx">Mobile navigation</file>
  <file path="apps/web/src/components/ui/ResponsiveTable.tsx">Responsive table</file>
  <file path="apps/web/src/hooks/useBreakpoint.ts">Breakpoint hook</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/layout.tsx">Add mobile nav</file>
  <file path="apps/web/src/components/navigation/Sidebar.tsx">Hide on mobile</file>
  <file path="apps/web/tailwind.config.js">Ensure breakpoints</file>
  <file path="apps/web/src/app/globals.css">Mobile styles</file>
</files_to_modify>

<validation_criteria>
  <criterion>Mobile navigation works</criterion>
  <criterion>Tables convert to cards</criterion>
  <criterion>Touch targets 44px+</criterion>
  <criterion>No horizontal scroll</criterion>
  <criterion>Forms usable on mobile</criterion>
  <criterion>All viewports tested</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run e2e --filter=web -- --project=mobile</command>
</test_commands>

</task_spec>
