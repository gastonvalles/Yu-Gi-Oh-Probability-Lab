# Tasks: Turn-Context Aware Rules

Implementation plan for `turn-context-aware-rules`, derived from `design.md` and `requirements.md`.

Each task lists the files touched and the requirements it satisfies. Property-based tests (marked **PBT**) use `fast-check` and live in `src/__tests__/`.

---

## 1. Data model & core types

- [x] 1.1 Add `TurnContext` and `TurnView` type aliases to `src/types.ts` (`'first' | 'second' | 'either'` and `'first' | 'second' | 'average'`) and add a `turnContext: TurnContext` field to the `Pattern` interface. _(Reqs: 1.1, 1.2, 1.5)_

- [x] 1.2 Update `src/app/model.ts` `PortablePattern` to include an optional `turnContext?: TurnContext` field. _(Reqs: 7.1, 7.2, 7.3)_

- [x] 1.3 Add `normalizeTurnContext(value: unknown): TurnContext` to `src/app/patterns.ts` (returns `'first'`, `'second'`, `'either'`, defaulting to `'either'` for anything else). _(Reqs: 1.2, 7.2)_

- [x] 1.4 Extend `getPatternDefinitionKey` in `src/app/patterns.ts` to include `turnContext: normalizeTurnContext(pattern.turnContext)` in the serialized signature. _(Reqs: 1.3, 1.4, 9.2, 9.3)_

- [x] 1.5 **PBT** Add `src/__tests__/turn-context-model.test.ts` covering: _(Reqs: 1.2, 1.3, 1.4)_
  - [x] 1.5.1 **PBT** `normalizeTurnContext` returns `'either'` for any input outside `{'first','second','either'}` and returns the input verbatim otherwise (uses `fc.anything()` on the reject path).
  - [x] 1.5.2 **PBT** Two patterns identical except for `turnContext ∈ {'first','second'}` produce different `getPatternDefinitionKey` outputs.
  - [x] 1.5.3 **PBT** A pattern with `turnContext: 'either'` and a pattern with `turnContext` stripped (then defaulted through `normalizeTurnContext`) produce identical `getPatternDefinitionKey` outputs.

## 2. Pattern factories

- [x] 2.1 Extend `createPattern`, `createMatcherPattern`, and `createGroupPattern` in `src/app/pattern-factory.ts` to accept a `turnContext` parameter/option defaulting to `'either'`, and assign it on the returned pattern. _(Reqs: 1.1, 1.5, 9.1)_

- [x] 2.2 **PBT** In a new `src/__tests__/turn-context-factories.test.ts`: _(Reqs: 1.1, 9.1)_
  - [x] 2.2.1 **PBT** For arbitrary inputs to the three factories without a `turnContext` argument, `result.turnContext === 'either'`.
  - [x] 2.2.2 **PBT** When `turnContext: 'first' | 'second' | 'either'` is passed, the returned pattern's field equals that value.
  - [x] 2.2.3 **PBT** Building every preset in `PATTERN_PRESET_DEFINITIONS` yields patterns with `turnContext === 'either'`.

## 3. Curation & signature updates

- [x] 3.1 In `src/app/pattern-curation.ts`, extend `curatePattern` to set `turnContext = normalizeTurnContext(pattern.turnContext)` on the curated output. _(Reqs: 1.2, 9.3)_

- [x] 3.2 Update `getPatternCollectionSignature` in `src/app/pattern-curation.ts` to include `turnContext` in the serialized per-pattern object. _(Req: 9.2)_

- [x] 3.3 **PBT** In a new `src/__tests__/turn-context-curation.test.ts`: _(Reqs: 1.2, 8.6, 9.2, 9.3)_
  - [x] 3.3.1 **PBT** For arbitrary input patterns (including `turnContext` set to random junk values), `curatePatterns(patterns, cards)` produces only patterns where `turnContext ∈ {'first','second','either'}`.
  - [x] 3.3.2 **PBT** `curatePatterns(curatePatterns(p, c), c) ≡ curatePatterns(p, c)` — idempotence including `turnContext` normalization.
  - [x] 3.3.3 **PBT** Two pattern collections that differ only in one pattern's `turnContext ∈ {'first','second'}` produce different `getPatternCollectionSignature` outputs.
  - [x] 3.3.4 **PBT** Two patterns identical except for `turnContext ∈ {'first','second'}` both survive curation (they are semantically distinct and not deduplicated).

## 4. Redux action & editor actions interface

- [x] 4.1 Add `setPatternTurnContext(patternId, value)` reducer action in `src/app/patterns-slice.ts`; export the action creator. _(Reqs: 2.2, 2.3)_

- [x] 4.2 Add matching helper `updatePatternTurnContext(patterns, patternId, value)` in `src/app/pattern-updates.ts` (same shape as `updatePatternName`, sets `needsReview: false`). _(Req: 2.3)_

- [x] 4.3 Extend the `PatternEditorActions` interface in `src/components/probability/pattern-editor-actions.ts` with `setPatternTurnContext: (patternId: string, value: TurnContext) => void`. _(Req: 2.2)_

- [x] 4.4 Wire the action bag in `src/app/use-pattern-editor-actions.ts` (or wherever `PatternEditorActions` is assembled) to dispatch the new Redux action. _(Req: 2.2)_

- [x] 4.5 Update the `trackedPatternActions` bag in `src/components/ProbabilityPanel.tsx` to pass through `setPatternTurnContext` while marking `pendingFeedbackRef` for KPI-change animation. _(Req: 2.2)_

- [x] 4.6 **PBT** In a new `src/__tests__/turn-context-reducer.test.ts`: _(Reqs: 2.3, 8.7)_
  - [x] 4.6.1 **PBT** For arbitrary `patterns` and arbitrary `(patternId, value)`, applying `setPatternTurnContext` changes only the target pattern's `turnContext` field and leaves all other patterns and all other fields untouched.
  - [x] 4.6.2 **PBT** If `patternId` does not match any pattern, the resulting state equals the input state.

## 5. Pure filtering & aggregation module

- [x] 5.1 Create `src/app/turn-context.ts` exporting:
  - [x] 5.1.1 `selectPatternsForView(patterns, view)` per the algorithmic pseudocode. _(Reqs: 4.1, 4.2, 4.3)_
  - [x] 5.1.2 `hasAsymmetricRules(patterns)` — returns `true` iff any pattern's `turnContext !== 'either'`. _(Req: 3.2, 3.3)_
  - [x] 5.1.3 `aggregateKpiAcrossViews(patterns, baseState)` per the algorithmic pseudocode. _(Reqs: 5.1, 5.2, 5.3, 5.4, 5.5)_

- [x] 5.2 **PBT** In a new `src/__tests__/turn-context-selection.test.ts`: _(Reqs: 4.1, 4.2, 4.3, 8.1, 8.2)_
  - [x] 5.2.1 **PBT** When every pattern has `turnContext === 'either'`, `selectPatternsForView(patterns, view)` equals `patterns` for all three views.
  - [x] 5.2.2 **PBT** For `view ∈ {'first','second'}`, `p ∈ selectPatternsForView(patterns, view) ⟺ p.turnContext ∈ {view, 'either'}`.
  - [x] 5.2.3 **PBT** `selectPatternsForView(patterns, view)` is always a subsequence of `patterns` (order preserved, no duplicates).

- [x] 5.3 **PBT** In a new `src/__tests__/turn-context-aggregation.test.ts`: _(Reqs: 5.1, 5.2, 5.3, 5.5, 8.3, 8.4)_
  - [x] 5.3.1 **PBT** (Backward compat) For any valid calculator state where every pattern has `turnContext === 'either'`, `aggregateKpiAcrossViews(...).cleanProbability` equals the single-summary `cleanProbability` from `calculateProbabilities(...)` to within `1e-9`.
  - [x] 5.3.2 **PBT** (Definition) For any valid calculator state with mixed `turnContext`, `aggregate.cleanProbability` equals the arithmetic mean of the first and second sub-view clean probabilities to within `1e-9`.
  - [x] 5.3.3 **PBT** (Bounds) `0 ≤ aggregate.cleanProbability ≤ 1` and `min(subProbs) ≤ aggregate.cleanProbability ≤ max(subProbs)`.
  - [x] 5.3.4 **PBT** `aggregate.patternResults` contains exactly the set of input patterns' ids (no duplicates, no omissions).
  - [x] 5.3.5 Example test: when one sub-view's summary is null, the aggregate surfaces a handled null case without crashing.

## 6. Rule editor UI

- [x] 6.1 Create `src/components/probability/rule-builder/TurnContextToggle.tsx` matching the `KindToggle` pattern: three-button `radiogroup`, `aria-checked` on active, dispatches `actions.setPatternTurnContext`. _(Reqs: 2.1, 2.2, 2.4, 2.5)_

- [x] 6.2 Insert `TurnContextToggle` in `src/components/probability/rule-builder/RuleBuilder.tsx` directly below the existing `KindToggle` in the header block. _(Req: 2.1)_

- [x] 6.3 Add example test `src/__tests__/turn-context-toggle.test.tsx`: _(Reqs: 2.1, 2.2, 2.4, 2.5)_
  - [x] 6.3.1 Renders three buttons with labels "Going First", "Going Second", "Ambos".
  - [x] 6.3.2 Clicking a button invokes `actions.setPatternTurnContext` with the correct value.
  - [x] 6.3.3 The button matching `currentTurnContext` has `aria-checked="true"`; others have `aria-checked="false"`.
  - [x] 6.3.4 Default `'either'` marks "Ambos" as active.

## 7. Global view toggle in the KPI Hero

- [x] 7.1 Create `src/components/probability/TurnViewToggle.tsx` — three-button control with labels "Going First", "Going Second", "Promedio"; emits `onChange(view)`. _(Reqs: 3.2, 3.4)_

- [x] 7.2 Extend `DeckQualityHeroProps` in `src/components/probability/DeckQualityHero.tsx` with `activeTurnView`, `onChangeTurnView`, `hasAsymmetricRules`; render `<TurnViewToggle>` in the hero header only when `hasAsymmetricRules === true`. _(Reqs: 3.2, 3.3, 3.4)_

- [x] 7.3 Pipe `activeTurnView` down from `ProbabilityPanel` using `useState<TurnView>('average')`; also compute `hasAsymmetricRules` via `useMemo` over `activePatterns`. _(Reqs: 3.1, 3.5)_

- [x] 7.4 Wire per-rule cards in `DeckQualityHero` to be filtered by `activeTurnView`: use the `detailOpeningEntries` / `detailProblemEntries` produced from a pipeline that already accepts `selectedPatterns`. Pass the filtered `openingEntries` / `problemEntries` in single-view modes; pass the full set in `'average'`. _(Reqs: 6.1, 6.2, 6.3)_

- [x] 7.5 Add a small visual indicator in the per-rule card (within `DeckQualityHero.CardSection`) shown when the card's source pattern has `turnContext !== 'either'`. Use short labels: "1º" (going first) or "2º" (going second), styled with subtle color. _(Req: 6.4)_

- [x] 7.6 Add example tests in `src/__tests__/turn-view-toggle.test.tsx`: _(Reqs: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4)_
  - [x] 7.6.1 Toggle hidden when all patterns have `turnContext === 'either'`.
  - [x] 7.6.2 Toggle rendered when at least one pattern has `turnContext !== 'either'`.
  - [x] 7.6.3 Default active view is "Promedio".
  - [x] 7.6.4 Clicking "Going First" switches the KPI display to the first-view calculation.
  - [x] 7.6.5 Remounting `ProbabilityPanel` resets the view to "Promedio".
  - [x] 7.6.6 In `'first'` view, cards derived from `'second'` rules are hidden.
  - [x] 7.6.7 In `'average'` view, a `'first'`-context rule's card shows the "1º" indicator.

## 8. Calculation pipeline integration

- [x] 8.1 In `src/components/ProbabilityPanel.tsx`, replace the current single-path `useMemo` for `result` with a branching computation:
  - [x] 8.1.1 If `activeTurnView === 'average'` AND `hasAsymmetricRules`, call `aggregateKpiAcrossViews(allChecks, { deckSize, handSize, cards })`.
  - [x] 8.1.2 Otherwise, call `calculateProbabilities` with `selectPatternsForView(allChecks, activeTurnView)`.
  _(Reqs: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2)_

- [x] 8.2 Adapt the `deckSummary` derivation to read `cleanProbability` / `cleanHands` / `totalHands` from both paths (aggregated vs single). _(Reqs: 4.4, 5.1, 5.2, 5.5)_

- [x] 8.3 Update `buildProbabilityCheckPipeline` callers (or the pipeline itself in `src/components/probability/probability-lab-helpers.ts`) so the summary used for `patternResults` comes from the right source (aggregated result in `'average'+asymmetric`, single result otherwise). _(Reqs: 5.3, 6.1, 6.2, 6.3)_

- [x] 8.4 **PBT** Integration-level property test in `src/__tests__/turn-context-pipeline.test.ts`: _(Reqs: 5.1, 5.2, 5.3)_
  - [x] 8.4.1 **PBT** For any valid state where every pattern has `turnContext === 'either'`, the panel's resulting `deckSummary.cleanProbability` equals the pre-feature calculation to `1e-9`.
  - [x] 8.4.2 **PBT** For any valid state with mixed `turnContext`, the panel's resulting `deckSummary.cleanProbability` lies in `[min(sub), max(sub)]`.

## 9. Persistence & migration

- [x] 9.1 Update `toPortableConfig` in `src/app/app-state-codec.ts`: bump `version` to `16`; include `turnContext` in each emitted `PortablePattern`. _(Reqs: 7.3)_

- [x] 9.2 Update `fromPortableConfig` in `src/app/app-state-codec.ts`: for each deserialized pattern, set `turnContext = normalizeTurnContext(rawPattern.turnContext)` (missing → `'either'`). Preserve existing version-agnostic parsing. _(Reqs: 7.1, 7.2, 7.5)_

- [x] 9.3 Bump `DEFAULT_PATTERNS_VERSION` from `9` to `10` in `src/components/deck-mode/use-deck-mode-controller.ts`. _(Req: 7.6)_

- [x] 9.4 **PBT** In a new `src/__tests__/turn-context-codec.test.ts`: _(Reqs: 7.1, 7.2, 7.3, 7.4)_
  - [x] 9.4.1 **PBT** Round-trip: `fromPortableConfig(toPortableConfig(state))` yields an `AppState` with identical `turnContext` on every pattern.
  - [x] 9.4.2 **PBT** A v15-shaped config (no `turnContext` on any pattern) loads with every pattern having `turnContext === 'either'`.
  - [x] 9.4.3 **PBT** A v16 config with random/invalid `turnContext` values defaults them to `'either'` while preserving legal values.
  - [x] 9.4.4 **PBT** A v15 round-trip to v16 produces patterns whose `getPatternDefinitionKey` equals the legacy key (no ghost duplicates).
  - [x] 9.4.5 Example: legacy `WorkspaceSnapshot` JSON (hand-built v15 payload) loaded via `fromPortableConfig` yields usable patterns with `turnContext === 'either'`.

- [x] 9.5 **PBT** In `src/__tests__/turn-context-maintenance.test.ts`: _(Reqs: 7.6, 9.3)_
  - [x] 9.5.1 **PBT** Simulate `usePatternMaintenance` flow: `patternsSeedVersion: 9` state containing the three auto-seed patterns (with `turnContext === 'either'`) after the version bump does NOT duplicate any auto-seed pattern when `curatePatterns(..., { includeDefaults: true })` runs.
  - [x] 9.5.2 **PBT** After migration, every pattern in the resulting state has a valid `turnContext`.

## 10. Non-regression for the engine

- [x] 10.1 Verify `calculateProbabilities`, `buildCalculationSummary`, and `validateCalculationState` do not read `turnContext`. If any branch references the field, extract the filtering to the pipeline. _(Req: 10.1, 10.3)_

- [x] 10.2 Update the arbitraries in `src/__tests__/probability-engine.test.ts` and `src/__tests__/drawer-autoclose.test.ts` to emit `turnContext` on generated patterns. Keep existing properties intact. _(Req: 10.2)_

- [x] 10.3 **PBT** Append to `probability-engine.test.ts`: _(Req: 10.3)_
  - [x] 10.3.1 **PBT** For any calculator state, `calculateProbabilities(state)` equals `calculateProbabilities(stripTurnContext(state))` — the engine ignores the field.

## 11. Presets (optional cleanup)

- [x] 11.1 Review `PATTERN_PRESET_DEFINITIONS` in `src/app/pattern-presets.ts` and consider flagging the advanced preset `starter_with_boardbreaker_opening` as `turnContext: 'second'` (its description already mentions "going second"). Mark as a follow-up rather than a blocking task. _(Informational; does not block Req completion.)_

## 12. Verification

- [x] 12.1 Run the full test suite with `npm test` and ensure all new and pre-existing tests pass.

- [ ] 12.2 Manually verify the Probability Lab flows:
  - [ ] 12.2.1 Fresh load with an existing deck — KPI number is unchanged (backward compat).
  - [ ] 12.2.2 Mark a rule as "Going Second" — the turn-view toggle appears; switching to "Going First" hides that rule's card and recomputes the KPI.
  - [ ] 12.2.3 Save, reload, confirm `turnContext` survives in localStorage.
  - [ ] 12.2.4 Create a pre-update deck snapshot, restore it, confirm all rules load with `turnContext: 'either'`.

- [x] 12.3 Run `npm run build` to confirm TypeScript compiles across the entire project.
