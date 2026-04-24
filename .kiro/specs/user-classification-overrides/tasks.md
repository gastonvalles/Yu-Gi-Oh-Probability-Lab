# Tasks

## 1. Add override types and storage key
- [x] 1.1 Add `CLASSIFICATION_OVERRIDES_KEY` constant to `src/app/model.ts`
- [x] 1.2 Export `ClassificationOverride` type alias (reuse `ClassificationSuggestion`) from `src/app/classification-engine.ts`
- [x] 1.3 Export `normalizeCardNameForLookup` from `src/app/classification-engine.ts`

## 2. Add persistence functions for overrides
- [x] 2.1 Add `loadClassificationOverrides()` to `src/app/persistence.ts` — reads override map from localStorage, returns `Map<string, ClassificationSuggestion>`
- [x] 2.2 Add `saveClassificationOverrides(map)` to `src/app/persistence.ts` — writes entire override map to localStorage
- [x] 2.3 Add `saveClassificationOverride(name, suggestion)` to `src/app/persistence.ts` — upserts a single entry (load → set → save)
- [x] 2.4 Add `removeClassificationOverride(name)` to `src/app/persistence.ts` — removes a single entry
- [x] 2.5 Add `clearClassificationOverrides()` to `src/app/persistence.ts` — removes the entire key from localStorage

## 3. Update classifyCard to accept overrides
- [x] 3.1 Add optional `overrides?: ReadonlyMap<string, ClassificationSuggestion>` parameter to `classifyCard` in `src/app/classification-engine.ts`
- [x] 3.2 Check overrides map before `KNOWN_CARDS_MAP` lookup — if found, return a copy of the override entry

## 4. Update deck-builder functions to thread overrides
- [x] 4.1 Update `addSearchResultToZone` in `src/app/deck-builder.ts` to accept optional overrides map, pass to `classifyCard`, set `needsReview: false` when override found
- [x] 4.2 Update `addSearchResultToDefaultZone` to accept and forward overrides
- [x] 4.3 Update `reclassifyAll` to accept optional overrides map, pass to `classifyCard`, set `needsReview: false` for overridden cards
- [x] 4.4 Update `classifyAllUnclassified` to accept optional overrides map, pass to `classifyCard`, set `needsReview: false` for overridden cards
- [x] 4.5 Update `setOriginForCard` to call `saveClassificationOverride` when a card's `needsReview` becomes `false` and it has both origin and roles
- [x] 4.6 Update `toggleRoleForCard` to call `saveClassificationOverride` when a card's `needsReview` becomes `false` and it has both origin and roles

## 5. Update deck-builder-slice to thread overrides through actions
- [x] 5.1 Add `overrides` field to `AddSearchResultToDeckZonePayload` and `AddSearchResultToDefaultDeckZonePayload` in `src/app/deck-builder-slice.ts`
- [x] 5.2 Pass overrides from action payloads to `addSearchResultToZone` and `addSearchResultToDefaultZone`
- [x] 5.3 Update `classifyAllUnclassifiedCards` and `reclassifyAllCards` reducers to accept and pass overrides

## 6. Load overrides at app startup and wire into dispatch sites
- [x] 6.1 Load overrides map via `loadClassificationOverrides()` at startup in `src/app/store.ts` or a new module, and make it available to action dispatchers
- [x] 6.2 Update all dispatch call sites (search panel, deck import, reclassify button) to include the overrides map in action payloads

## 7. Add clear override UI (optional)
- [ ] 7.1 Add per-card "Clear override" action in `src/components/DeckRolesPanel.tsx` that calls `removeClassificationOverride`
- [ ] 7.2 Add "Clear all overrides" button in the panel that calls `clearClassificationOverrides`

## 8. Write tests
- [ ] 8.1 Unit test: `classifyCard` with overrides map returns override when entry exists
- [ ] 8.2 Unit test: `classifyCard` with empty overrides map falls through to KNOWN_CARDS_MAP / heuristics
- [ ] 8.3 Unit test: persistence round-trip — `saveClassificationOverride` then `loadClassificationOverrides` returns the entry
- [ ] 8.4 Unit test: `removeClassificationOverride` removes only the target entry
- [ ] 8.5 Unit test: `clearClassificationOverrides` removes all entries
- [ ] 8.6 PBT (Property 1 — Bug Condition): For any card name with an override entry, `classifyCard(card, name, overrides)` returns the override's origin and roles
- [ ] 8.7 PBT (Property 2 — Preservation): For any card name without an override, `classifyCard(card, name, emptyMap)` returns the same result as `classifyCard(card, name)`
