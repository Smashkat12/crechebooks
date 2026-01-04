<task_spec id="TASK-EC-001" version="1.0">

<metadata>
  <title>Payee Name Variation Detection Algorithm</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>136</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <edge_case_ref>EC-TRANS-002</edge_case_ref>
    <requirement_ref>REQ-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-013</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-018</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use string similarity, NLP, and fuzzy matching algorithms.
This task involves:
1. Detecting variations of the same payee name
2. Algorithms: Levenshtein distance, Jaro-Winkler, phonetic matching
3. Common abbreviation handling (PTY LTD → PTY, WOOLWORTHS → WOOLIES)
4. Location suffix handling (WOOLWORTHS SANDTON → WOOLWORTHS)
5. Confidence scoring for matches
6. Suggestion generation for user confirmation
</reasoning_mode>

<context>
EDGE CASE EC-TRANS-002: "Payee name varies significantly (e.g., 'WOOLWORTHS SANDTON' vs 'WOOLIES' vs 'WW FOODS')."

Expected behavior:
- Alias detection algorithm identifies potential matches
- Prompt user to confirm grouping
- Store confirmed aliases for future matching

This is critical for accurate categorization - the same vendor appearing with different names should be recognized as one entity.
</context>

<current_state>
## Codebase State
- PayeeAliasService exists (TASK-TRANS-018)
- Manual alias creation supported
- No automatic detection of variations
- No suggestion of potential aliases

## Common Variations in SA Bank Statements
- Company suffixes: PTY LTD, (PTY) LTD, PTY, CC
- Location suffixes: WOOLWORTHS SANDTON, WOOLWORTHS JHB
- Abbreviations: WOOLWORTHS → WOOLIES, CHECKERS → CHKRS
- Reference additions: VENDOR-REF123, VENDOR/PAYMENT
</current_state>

<input_context_files>
  <file purpose="alias_service">apps/api/src/database/services/payee-alias.service.ts</file>
  <file purpose="pattern_service">apps/api/src/database/services/pattern-learning.service.ts</file>
  <file purpose="payee_entity">apps/api/src/database/entities/payee-pattern.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - PayeeVariationDetector service
    - Multiple similarity algorithms
    - SA-specific normalization (PTY LTD removal, etc.)
    - Phonetic matching for similar-sounding names
    - Batch detection across all payees
    - Confidence scoring
    - Suggestion API for UI
  </in_scope>
  <out_of_scope>
    - UI for confirmation (surface layer)
    - Auto-confirmation without user input
    - Cross-tenant payee matching
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/payee-variation-detector.service.ts">
      export interface VariationMatch {
        payeeA: string;
        payeeB: string;
        similarity: number;  // 0-1
        matchType: 'exact' | 'abbreviation' | 'suffix' | 'phonetic' | 'fuzzy';
        confidence: number;  // 0-100
        normalizedA: string;
        normalizedB: string;
      }

      @Injectable()
      export class PayeeVariationDetectorService {
        async detectVariations(
          tenantId: string,
          payeeName: string
        ): Promise<VariationMatch[]>;

        async findAllPotentialGroups(
          tenantId: string
        ): Promise<PayeeGroup[]>;

        normalize(payeeName: string): string;

        calculateSimilarity(
          nameA: string,
          nameB: string
        ): { score: number; method: string };

        async getSuggestedAliases(
          tenantId: string,
          limit?: number
        ): Promise<AliasSuggestion[]>;
      }
    </signature>
    <signature file="apps/api/src/database/services/payee-normalizer.service.ts">
      @Injectable()
      export class PayeeNormalizerService {
        normalize(payeeName: string): string;
        removeSuffixes(name: string): string;  // PTY LTD, CC, etc.
        removeLocationSuffix(name: string): string;  // SANDTON, JHB, etc.
        removeReferenceCodes(name: string): string;  // -REF123, /PMT, etc.
        toPhonetic(name: string): string;  // Soundex or Metaphone
        getAbbreviations(name: string): string[];  // Known abbreviations
      }
    </signature>
  </signatures>

  <constraints>
    - Levenshtein threshold: 0.8 similarity for fuzzy match
    - Jaro-Winkler threshold: 0.85 for name match
    - Common SA suffixes: PTY LTD, (PTY) LTD, CC, NPC, INC, LIMITED
    - Common SA cities: JHB, CPT, DBN, PTA, SANDTON, ROSEBANK, etc.
    - Minimum payee length after normalization: 3 characters
    - Max suggestions per batch: 50
    - Confidence levels: >90% = high, 70-90% = medium, <70% = low
  </constraints>

  <verification>
    - WOOLWORTHS SANDTON matches WOOLWORTHS
    - PTY LTD suffix removed correctly
    - Abbreviations detected (if in dictionary)
    - Phonetic matching works
    - Confidence scores accurate
    - Suggestions generated correctly
    - Performance: <100ms for single detection
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/payee-variation-detector.service.ts">Main detection service</file>
  <file path="apps/api/src/database/services/payee-normalizer.service.ts">Normalization utilities</file>
  <file path="apps/api/src/database/services/__tests__/payee-variation-detector.service.spec.ts">Tests</file>
  <file path="apps/api/src/database/data/sa-abbreviations.json">SA abbreviation dictionary</file>
  <file path="apps/api/src/database/data/sa-locations.json">SA location list</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/payee-alias.service.ts">Use variation detector</file>
  <file path="apps/api/src/database/services/transaction-import.service.ts">Suggest variations on import</file>
</files_to_modify>

<validation_criteria>
  <criterion>PayeeVariationDetectorService created</criterion>
  <criterion>Normalization handles SA-specific patterns</criterion>
  <criterion>Multiple similarity algorithms implemented</criterion>
  <criterion>Phonetic matching works</criterion>
  <criterion>Confidence scoring accurate</criterion>
  <criterion>Suggestions generated</criterion>
  <criterion>Tests pass with real SA payee examples</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="payee-variation|payee-normalizer" --verbose</command>
</test_commands>

</task_spec>
