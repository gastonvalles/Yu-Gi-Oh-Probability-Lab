# Implementation Plan: Auto Card Classification

## Overview

Build a heuristic-based classification engine that suggests origin and roles for Yu-Gi-Oh! cards on add, import, and bulk action. The engine is a pure-function module; integration touches deck-builder, deck-builder-slice, deck-import, role-step, and DeckRolesPanel. All auto-classified cards get `needsReview: true` for user review.

## Tasks

- [x] 1. Create the classification engine module
  - [x] 1.1 Create `src/app/classification-engine.ts` with `ClassificationSuggestion` and `HeuristicRule` interfaces, `GAME_PLAN_ROLES` and `INTERACTION_ROLES` constants, and the `deriveOrigin` function
    - Export `ClassificationSuggestion` interface with `origin: CardOrigin` and `roles: CardRole[]`
    - Export `HeuristicRule` interface with `id: string` and `evaluate: (card: ApiCardReference) => CardRole[]`
    - Define `GAME_PLAN_ROLES` set (starter, extender, enabler, searcher, draw, combo_piece, payoff, recovery)
    - Define `INTERACTION_ROLES` set (handtrap, disruption, boardbreaker, floodgate, removal)
    - Implement `deriveOrigin(roles)`: empty→non_engine, tech→non_engine, brick/garnet→engine, only interaction→non_engine, only game-plan→engine, both→hybrid
    - _Requirements: 1.1, 1.3, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 Implement the 10 heuristic rules as `RULE_SET` and the `classifyCard` function
    - Rule 1 `handtrap`: Monster + hand-activation disruption patterns in description
    - Rule 2 `draw`: Spell Card + unconditional draw/filter patterns
    - Rule 3 `searcher`: Description matches "add.*from your Deck to your hand" patterns
    - Rule 4 `boardbreaker`: Description matches mass removal ("destroy all", "return all", "send all")
    - Rule 5 `removal`: Targeted removal ("destroy 1", "banish 1", "return 1") — only if boardbreaker didn't match
    - Rule 6 `recovery`: GY/banish recovery patterns
    - Rule 7 `floodgate`: Continuous Spell/Trap or persistent restriction patterns
    - Rule 8 `disruption`: Trap with reactive negation, Quick-Play with negation — only if floodgate didn't match
    - Rule 9 `payoff`: Extra Deck monster (fusion/synchro/xyz/link frameType)
    - Rule 10 `brick`: High level (≥7) monster with no other matched roles, or "cannot be Normal Summoned" without special summon clause
    - `classifyCard` runs all rules in order, collects unique roles, calls `deriveOrigin`, returns `ClassificationSuggestion`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ]* 1.3 Write property test: Output Structure Invariant
    - **Property 1: Output Structure Invariant**
    - For any valid `ApiCardReference`, `classifyCard` returns origin in {engine, non_engine, hybrid} and roles array with only valid CardRole values and no duplicates
    - Reuse `arbApiCardReference` arbitrary from existing test file
    - **Validates: Requirements 1.1, 1.3, 1.4**
  - [ ]* 1.4 Write property test: Origin Derivation from Roles
    - **Property 2: Origin Derivation from Roles**
    - For any valid `ApiCardReference`, the origin in the suggestion is consistent with the role categories (interaction-only→non_engine, game-plan-only→engine, both→hybrid, tech→non_engine, brick/garnet→engine, empty→non_engine)
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 1.3**
  - [ ]* 1.5 Write property test: Round-Trip and Idempotence
    - **Property 8: Classification Suggestion Round-Trip**
    - For any valid `ApiCardReference`, `JSON.parse(JSON.stringify(classifyCard(card)))` deeply equals `classifyCard(card)`
    - **Property 9: Classification Idempotence**
    - For any valid `ApiCardReference`, calling `classifyCard` twice produces deeply equal outputs
    - **Validates: Requirements 9.2, 9.3, 1.2, 1.5**
  - [ ]* 1.6 Write unit tests for individual heuristic rules
    - Test known hand traps (Ash Blossom-like descriptions, Effect Veiler-like descriptions)
    - Test known draw spells (Pot of Desires-like, Allure of Darkness-like descriptions)
    - Test known searchers ("add 1" patterns)
    - Test known board breakers (Raigeki-like, Dark Hole-like descriptions)
    - Test known floodgates (Skill Drain-like, Anti-Spell Fragrance-like descriptions)
    - Test Extra Deck monsters for payoff detection
    - Test edge cases: null description, no rules match → non_engine with empty roles
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 2. Checkpoint — Ensure classification engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Integrate auto-classification on card add
  - [x] 3.1 Modify `addSearchResultToZone` in `src/app/deck-builder.ts` to call `classifyCard` on the new `DeckCardInstance` and set `origin`, `roles`, and `needsReview: true`
    - Import `classifyCard` from `classification-engine`
    - After creating the `DeckCardInstance`, call `classifyCard(cloneApiCardReference(searchResult))`
    - Apply `suggestion.origin`, `[...suggestion.roles]`, and `needsReview: true` to the instance
    - The same change applies to `addSearchResultToDefaultZone` since it delegates to `addSearchResultToZone`
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 3.2 Write property test: Auto-Classification on Card Add
    - **Property 3: Auto-Classification on Card Add**
    - For any valid `ApiCardSearchResult` added to any deck zone, the resulting `DeckCardInstance` has non-null origin and `needsReview === true`
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 4. Implement classify-all action
  - [x] 4.1 Add `classifyAllUnclassified` function to `src/app/deck-builder.ts`
    - Iterate main, extra, side zones
    - For each card with `origin === null && roles.length === 0`, run `classifyCard` and set `needsReview: true`
    - Leave already-classified cards untouched
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 4.2 Add `classifyAllUnclassifiedCards` reducer action to `src/app/deck-builder-slice.ts`
    - Import `classifyAllUnclassified` from `deck-builder`
    - Add reducer: `classifyAllUnclassifiedCards(state) { return classifyAllUnclassified(state) }`
    - Export the new action
    - _Requirements: 5.1_
  - [ ]* 4.3 Write property test: Classify-All Fills Unclassified and Preserves Existing
    - **Property 4: Classify-All Fills Unclassified and Preserves Existing**
    - For any `DeckBuilderState` with mixed classified/unclassified cards, after `classifyAllUnclassified`: previously-unclassified cards have non-null origin and `needsReview=true`, previously-classified cards retain original values
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 5. Integrate auto-classification on deck import
  - [x] 5.1 Modify `src/app/deck-import.ts` to apply `classifyCard` on text and YDK imports
    - In `appendResolvedEntryCopies`, after calling `addSearchResultToZone`, the card already gets classified via the modified `addSearchResultToZone` (from task 3.1) — verify this works end-to-end
    - For `buildDeckImportPreviewFromDeckBuilder` (used by JSON import path), apply classification to cards that have `origin === null && roles.length === 0`, set `needsReview: true`
    - For JSON imports with existing classification data, preserve `origin`/`roles` and set `needsReview: false`
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ]* 5.2 Write property test: Import Auto-Classifies All Cards
    - **Property 5: Import Auto-Classifies All Cards**
    - For any deck imported via text or YDK, every card has non-null origin and `needsReview === true`
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 5.3 Write property test: JSON Import Preserves Existing Classifications
    - **Property 6: JSON Import Preserves Existing Classifications**
    - For JSON-imported cards with existing origin/roles, those are preserved with `needsReview === false`; cards without classification get auto-classified with `needsReview === true`
    - **Validates: Requirements 6.3**

- [x] 6. Checkpoint — Ensure all engine and integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Fix review state and add UI controls
  - [x] 7.1 Fix `isCardPendingReview` in `src/app/role-step.ts` to return `card.needsReview === true`
    - Change from `void card; return false` to `return card.needsReview === true`
    - This activates the existing "Revisión pendiente" filter and `countCardsPendingReview` in DeckRolesPanel
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 7.2 Add "Clasificar todo" button to `src/components/DeckRolesPanel.tsx`
    - Import `classifyAllUnclassifiedCards` action from `deck-builder-slice`
    - Add a button in the panel header area that dispatches `classifyAllUnclassifiedCards`
    - Button label: "Clasificar todo"
    - Only show the button when there are unclassified cards (origin === null && roles.length === 0)
    - _Requirements: 5.1, 8.1_
  - [ ]* 7.3 Write property test: User Override Clears needsReview
    - **Property 7: User Override Clears needsReview**
    - For any `DeckBuilderState` with an auto-classified card (`needsReview=true`), calling `setOriginForCard` or `toggleRoleForCard` sets `needsReview=false` for all copies across all zones
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The classification engine is a pure module with zero side effects — all integration is done in deck-builder.ts
- Existing `setOriginForCard` and `toggleRoleForCard` already set `needsReview: false`, satisfying Requirement 7 without additional changes
- The existing test file `src/__tests__/remove-dead-modes.test.ts` provides reusable arbitraries (`arbApiCardReference`, `arbDeckCardInstance`) for property-based tests
- Property tests should be placed in `src/__tests__/classification-engine.test.ts`
