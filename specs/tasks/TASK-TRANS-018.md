<task_spec id="TASK-TRANS-018" version="1.0">

<metadata>
  <title>Enable Payee Alias Matching in Categorization</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>99</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-TRANS-010</requirement_ref>
    <critical_issue_ref>CRIT-014</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use pattern recognition thinking.
This task involves:
1. Enabling existing but unused alias infrastructure
2. Creating aliases from user corrections
3. Using aliases during categorization lookups
4. Preventing duplicate aliases
</reasoning_mode>

<context>
ISSUE: Payee alias infrastructure exists in PatternLearningService (lines 204-216) but is NEVER called. This means variations of the same payee (e.g., "WOOLWORTHS", "WOOLWORTHS SANDTON", "W/WORTHS") are not recognized as the same entity.

REQ-TRANS-010 specifies: "System recognizes payee name variations as aliases to canonical names."

This task enables the existing infrastructure and integrates it into the categorization flow.
</context>

<current_state>
## Codebase State
- PayeePattern entity exists (TASK-TRANS-003)
- PatternLearningService has alias-related code (unused)
- TransactionCategorizationService does not use aliases

## What Exists but Unused
```typescript
// In pattern-learning.service.ts (lines 204-216)
// This code exists but is never invoked
async createPayeeAlias(
  tenantId: string,
  alias: string,
  canonicalName: string
): Promise<void> { ... }
```
</current_state>

<input_context_files>
  <file purpose="pattern_service">apps/api/src/database/services/pattern-learning.service.ts</file>
  <file purpose="categorization_service">apps/api/src/database/services/transaction-categorization.service.ts</file>
  <file purpose="payee_pattern_entity">apps/api/src/database/entities/payee-pattern.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Create PayeeAliasService for alias management
    - Auto-create aliases when user corrects payee
    - Integrate alias resolution in categorization
    - Prevent duplicate aliases
    - API for alias management
  </in_scope>
  <out_of_scope>
    - UI for alias management (surface layer)
    - Bulk alias import
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/payee-alias.service.ts">
      @Injectable()
      export class PayeeAliasService {
        async resolveAlias(tenantId: string, payeeName: string): Promise<string>;
        async createAlias(tenantId: string, alias: string, canonicalName: string): Promise<PayeeAlias>;
        async getAliases(tenantId: string, canonicalName: string): Promise<PayeeAlias[]>;
        async deleteAlias(tenantId: string, aliasId: string): Promise<void>;
        async findSimilar(tenantId: string, payeeName: string): Promise<string[]>;
      }
    </signature>
  </signatures>

  <constraints>
    - Alias resolution case-insensitive
    - Duplicate aliases prevented via unique constraint
    - Aliases tenant-isolated
    - resolveAlias returns original if no alias found
    - Similarity matching uses Levenshtein distance
  </constraints>

  <verification>
    - Aliases created from corrections
    - Categorization uses alias resolution
    - Duplicate aliases rejected
    - Similar names suggested
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/payee-alias.service.ts">Alias service</file>
  <file path="apps/api/src/database/services/__tests__/payee-alias.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/transaction-categorization.service.ts">Use alias resolution</file>
  <file path="apps/api/src/database/services/pattern-learning.service.ts">Create alias on correction</file>
</files_to_modify>

<validation_criteria>
  <criterion>PayeeAliasService created</criterion>
  <criterion>Aliases auto-created from corrections</criterion>
  <criterion>Categorization resolves aliases</criterion>
  <criterion>Duplicates prevented</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="payee-alias" --verbose</command>
</test_commands>

</task_spec>
