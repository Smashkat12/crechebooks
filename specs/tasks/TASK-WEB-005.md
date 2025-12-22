<task_spec id="TASK-WEB-005" version="1.0">

<metadata>
  <title>Zustand State Management Setup</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>5</sequence>
  <implements>
    <requirement_ref>REQ-WEB-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Set up Zustand for client-side state management including UI state, filters, preferences, and transient application state that doesn't need server synchronization.
</context>

<input_context_files>
  <file purpose="shared_types">packages/types/src/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed</check>
  <check>zustand installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Create app-wide UI state store
    - Create transaction filter store
    - Create invoice filter store
    - Create user preferences store (persisted)
    - Create sidebar/navigation state
  </in_scope>
  <out_of_scope>
    - Server state (handled by React Query)
    - Authentication state (handled by NextAuth)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/stores/ui-store.ts">
      export const useUIStore: UseBoundStore&lt;StoreApi&lt;UIState&gt;&gt;
    </signature>
    <signature file="apps/web/src/stores/filter-store.ts">
      export const useFilterStore: UseBoundStore&lt;StoreApi&lt;FilterState&gt;&gt;
    </signature>
    <signature file="apps/web/src/stores/preferences-store.ts">
      export const usePreferencesStore: UseBoundStore&lt;StoreApi&lt;PreferencesState&gt;&gt;
    </signature>
  </signatures>

  <constraints>
    - Preferences store must persist to localStorage
    - Stores must be properly typed
    - Actions must follow immutable patterns
  </constraints>

  <verification>
    - Stores update UI correctly
    - Persisted state survives page reload
    - No TypeScript errors
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/stores/ui-store.ts">UI state (sidebar, modals)</file>
  <file path="apps/web/src/stores/filter-store.ts">Filter state for lists</file>
  <file path="apps/web/src/stores/preferences-store.ts">User preferences (theme, etc)</file>
  <file path="apps/web/src/stores/index.ts">Store exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Stores can be imported and used in components</criterion>
  <criterion>State updates trigger re-renders</criterion>
  <criterion>Persisted stores restore on page load</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
</test_commands>

</task_spec>
