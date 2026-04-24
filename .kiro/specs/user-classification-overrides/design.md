# User Classification Overrides Bugfix Design

## Overview

Manual card classifications (origin + roles) are lost when the same card appears in a different deck, after re-import, or after reclassification. The root cause is that `classifyCard` is a pure function with no awareness of user overrides, and `setOriginForCard`/`toggleRoleForCard` only mutate in-memory `DeckCardInstance` objects without persisting the decision.

The fix introduces a persistent override map in `localStorage` keyed by normalized card name. `classifyCard` gains an optional `overrides` parameter so it remains pure. The override map is loaded once at startup, kept in memory, and written to whenever a user confirms a classification (`needsReview` becomes `false`).

## Glossary

- **Bug_Condition (C)**: A card has been manually classified by the user (origin set and/or roles toggled, `needsReview === false`) but the classification is not persisted — so it is lost on re-import, deck switch, or reclassification.
- **Property (P)**: User-confirmed classifications are persisted to `localStorage` and automatically re-applied whenever the same card name is encountered, following priority: User overrides > `KNOWN_CARDS_MAP` > Heuristic rules.
- **Preservation**: Existing classification behavior for cards without overrides, existing persistence of app state, and cross-zone update behavior must remain unchanged.
- **classifyCard**: The pure function in `src/app/classification-engine.ts` that returns `{ origin, roles }` for a card. Currently checks `KNOWN_CARDS_MAP` then heuristic `RULE_SET`.
- **Override Map**: A `Map<string, { origin: CardOrigin, roles: CardRole[] }>` keyed by normalized card name (trimmed, lowercased), stored in `localStorage` under a dedicated key.
- **normalizeCardNameForLookup**: Existing helper in `classification-engine.ts` that trims and lowercases a card name.

## Bug Details

### Bug Condition

The bug manifests when a user manually confirms a card's classification (setting origin and/or toggling roles so that `needsReview` becomes `false`) and then encounters the same card in a new context — a different deck, a re-import, or after `reclassifyAll`. The system has no persistent memory of the user's decision, so it falls back to `KNOWN_CARDS_MAP` or heuristics.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { cardName: string, userHasConfirmedClassification: boolean, context: 'new-deck' | 're-import' | 'reclassify' }
  OUTPUT: boolean

  RETURN input.userHasConfirmedClassification === true
         AND input.context IN ['new-deck', 're-import', 'reclassify']
         AND NOT persistentOverrideExists(normalize(input.cardName))
END FUNCTION
```

### Examples

- User sets "Ash Blossom & Joyous Spring" to `origin: 'engine'` with roles `['starter']` in Deck A. Imports Deck B containing the same card → card appears as `origin: 'non_engine'`, roles `['handtrap']`, `needsReview: true` (KNOWN_CARDS_MAP default). Expected: `origin: 'engine'`, roles `['starter']`, `needsReview: false`.
- User classifies a custom/unknown card "My Custom Card" as `origin: 'engine'`, roles `['combo_piece']`. Creates a new deck with the same card → card appears with heuristic defaults. Expected: override applied.
- User triggers `reclassifyAll` → all auto-classified cards are re-evaluated, but previously confirmed cards lose their manual classification. Expected: overrides are consulted first.
- User has no override for "Maxx C" → system returns `KNOWN_CARDS_MAP` entry as before (no change).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Cards with no user override that exist in `KNOWN_CARDS_MAP` must continue to receive their `KNOWN_CARDS_MAP` classification
- Cards with no user override and not in `KNOWN_CARDS_MAP` must continue to be classified by heuristic `RULE_SET` + `deriveOrigin`
- The existing debounced 180ms auto-save of app state to `localStorage` (key `ygo-probability-lab:v2`) must not be affected
- `toggleRoleForCard` and `setOriginForCard` must continue to update all copies across all zones (main, extra, side)
- Adding a card via search results must continue to call `classifyCard` and set `needsReview: true` for new cards (unless an override exists)

**Scope:**
All inputs where the card has no user override should be completely unaffected by this fix. This includes:
- Cards only in `KNOWN_CARDS_MAP`
- Cards classified purely by heuristics
- The main app state persistence mechanism

## Hypothesized Root Cause

Based on the bug description, the root cause is architectural — there is no persistence layer for user classification decisions:

1. **No persistent storage for overrides**: `setOriginForCard` and `toggleRoleForCard` mutate `DeckCardInstance` objects in Redux state, but these are ephemeral per-deck-session. There is no mechanism to write confirmed classifications to `localStorage`.

2. **`classifyCard` has no override input**: The function signature `classifyCard(card, name?)` only consults `KNOWN_CARDS_MAP` and `RULE_SET`. There is no parameter or lookup for user overrides, so even if overrides were stored, the classification pipeline would not use them.

3. **`reclassifyAll` skips confirmed cards but doesn't restore overrides**: The function skips cards where `!card.needsReview && card.origin !== null && card.roles.length > 0`, but when a card is freshly added (e.g., re-import), it starts with `needsReview: true` and gets overwritten by heuristics.

4. **`addSearchResultToZone` always sets `needsReview: true`**: Even if the user previously confirmed the same card, the add flow doesn't check for an existing override.

## Correctness Properties

Property 1: Bug Condition - Override Applied on Classification

_For any_ card name that has an entry in the overrides map, when `classifyCard` is called with that overrides map, the function SHALL return the override's `{ origin, roles }` instead of consulting `KNOWN_CARDS_MAP` or heuristic rules.

**Validates: Requirements 2.1, 2.2, 2.5**

Property 2: Preservation - Non-Override Classification Unchanged

_For any_ card name that does NOT have an entry in the overrides map, when `classifyCard` is called with that overrides map, the function SHALL produce the exact same result as calling `classifyCard` without overrides, preserving the existing `KNOWN_CARDS_MAP` → heuristic fallback chain.

**Validates: Requirements 3.1, 3.2**

## Fix Implementation

### Changes Required

**File**: `src/app/model.ts`

**Specific Changes**:
1. **Add storage key constant**: Add `CLASSIFICATION_OVERRIDES_KEY = 'ygo-probability-lab:classification-overrides:v1'` alongside existing storage keys.
2. **Add `ClassificationOverride` type**: `{ origin: CardOrigin; roles: CardRole[] }` — or reuse `ClassificationSuggestion` from classification-engine.

---

**File**: `src/app/classification-engine.ts`

**Function**: `classifyCard`

**Specific Changes**:
1. **Add optional `overrides` parameter**: `classifyCard(card, name?, overrides?: ReadonlyMap<string, ClassificationSuggestion>)`.
2. **Check overrides first**: Before `KNOWN_CARDS_MAP` lookup, check the overrides map by normalized name. If found, return a copy of the override entry.
3. **Export `normalizeCardNameForLookup`**: Make the existing private helper public so persistence code can use the same normalization.

---

**File**: `src/app/persistence.ts`

**Specific Changes**:
1. **Add `loadClassificationOverrides()`**: Reads the override map from `localStorage`, returns a `Map<string, ClassificationSuggestion>`.
2. **Add `saveClassificationOverrides(map)`**: Writes the override map to `localStorage`.
3. **Add `saveClassificationOverride(name, suggestion)`**: Upserts a single entry.
4. **Add `removeClassificationOverride(name)`**: Removes a single entry.
5. **Add `clearClassificationOverrides()`**: Removes the entire key from `localStorage`.

---

**File**: `src/app/deck-builder.ts`

**Specific Changes**:
1. **Update `addSearchResultToZone`**: Accept optional `overrides` map. Call `classifyCard(card, name, overrides)`. If override was found, set `needsReview: false`.
2. **Update `reclassifyAll`**: Accept optional `overrides` map. Pass it to `classifyCard`. If override was found for a card, set `needsReview: false`.
3. **Update `classifyAllUnclassified`**: Same pattern — accept and pass overrides.
4. **Update `setOriginForCard`**: After mutation, if the card's `needsReview` is `false`, call `saveClassificationOverride` with the card's normalized name and `{ origin, roles }`.
5. **Update `toggleRoleForCard`**: Same — persist override when `needsReview` becomes `false`.

---

**File**: `src/app/deck-builder-slice.ts`

**Specific Changes**:
1. **Thread overrides through action payloads**: Add `overrides` to payloads for `addSearchResultToDefaultDeckZone`, `addSearchResultToDeckZone`, `classifyAllUnclassifiedCards`, `reclassifyAllCards`.

---

**File**: `src/app/store.ts`

**Specific Changes**:
1. **Load overrides at startup**: Call `loadClassificationOverrides()` alongside `loadState()` and make the map available to dispatched actions.

---

**File**: `src/components/DeckRolesPanel.tsx` (optional)

**Specific Changes**:
1. **Add "Clear override" button**: Per-card action to remove a single override.
2. **Add "Clear all overrides" button**: Global action in the panel header or settings area.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that `classifyCard` ignores user overrides because it has no mechanism to receive them.

**Test Plan**: Write tests that call `classifyCard` for cards that a user would have manually classified, and verify that the function returns `KNOWN_CARDS_MAP` or heuristic defaults instead of the user's choice. Run these on UNFIXED code to observe failures.

**Test Cases**:
1. **Override ignored on classify**: Call `classifyCard` for "Ash Blossom" with an overrides map containing a custom classification → returns KNOWN_CARDS_MAP default (will fail on unfixed code because the parameter doesn't exist)
2. **Override ignored on reclassify**: Build a deck, manually classify a card, call `reclassifyAll` → card reverts to heuristic default (will fail on unfixed code)
3. **Override ignored on re-add**: Manually classify a card, remove it, re-add it → card gets default classification (will fail on unfixed code)

**Expected Counterexamples**:
- `classifyCard` returns `KNOWN_CARDS_MAP` entry even when an override should take priority
- Possible causes: no overrides parameter, no persistent storage, no override lookup

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  overrides := Map { normalize(input.cardName) -> { origin: input.userOrigin, roles: input.userRoles } }
  result := classifyCard_fixed(input.card, input.cardName, overrides)
  ASSERT result.origin === input.userOrigin
  ASSERT result.roles === input.userRoles
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT classifyCard_original(input.card, input.cardName) = classifyCard_fixed(input.card, input.cardName, emptyOverrides)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for cards without overrides, then write property-based tests capturing that behavior.

**Test Cases**:
1. **KNOWN_CARDS_MAP preservation**: For any card in KNOWN_CARDS_MAP with no override, verify `classifyCard(card, name, emptyMap)` returns the same result as `classifyCard(card, name)`
2. **Heuristic preservation**: For any card not in KNOWN_CARDS_MAP with no override, verify identical results
3. **needsReview preservation**: For newly added cards with no override, verify `needsReview` is still `true`

### Unit Tests

- Test `classifyCard` with overrides map containing an entry for the card → returns override
- Test `classifyCard` with empty overrides map → falls through to KNOWN_CARDS_MAP / heuristics
- Test `saveClassificationOverride` / `loadClassificationOverrides` round-trip
- Test `removeClassificationOverride` removes only the target entry
- Test `clearClassificationOverrides` removes all entries
- Test `setOriginForCard` persists override when `needsReview` becomes `false`
- Test `toggleRoleForCard` persists override when `needsReview` becomes `false`

### Property-Based Tests

- Generate random card names and override entries; verify `classifyCard` with overrides always returns the override when present
- Generate random `ApiCardReference` objects with no override; verify `classifyCard` with empty overrides produces identical results to the original function
- Generate random deck states and override maps; verify `reclassifyAll` with overrides preserves override classifications

### Integration Tests

- Full flow: add card → manually classify → re-import deck → verify override applied
- Full flow: classify card → `reclassifyAll` → verify override preserved
- Full flow: save override → reload page → verify override loaded from localStorage
- Clear single override → verify card reverts to default classification on next classify
- Clear all overrides → verify all cards revert to defaults
