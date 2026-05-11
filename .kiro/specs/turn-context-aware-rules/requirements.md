# Requirements Document: Turn-Context Aware Rules

## Introduction

This feature extends the Probability Lab so users can mark individual rules as applying only when going first, only when going second, or always (the default "either"). A corresponding global toggle in the KPI Hero lets users view the deck's quality from each perspective or as an average. Existing rules, decks, and saved states must continue to work unchanged; turn-context awareness is strictly additive.

Requirements below are derived from the design document (`design.md`), which defines the data model, components, algorithms, and correctness properties that these requirements formalize.

## Requirements

### Requirement 1: Turn-Context Data Model

**User Story:** As a user curating probability rules, I want each rule to carry a turn-context label so the app can tell which rules describe going-first hands, going-second hands, or both.

#### Acceptance Criteria

1.1. WHEN a new `HandPattern` is created via `createPattern`, `createMatcherPattern`, or `createGroupPattern`, THE system SHALL assign `turnContext = 'either'` unless the caller explicitly passes `'first'` or `'second'`.

1.2. WHEN `curatePatterns` processes a pattern with `turnContext` absent, null, undefined, or outside `{ 'first', 'second', 'either' }`, THE system SHALL normalize `turnContext` to `'either'`.

1.3. WHEN `getPatternDefinitionKey` computes a signature for two patterns that differ only in `turnContext` and both have `turnContext ∈ { 'first', 'second' }`, THE signatures SHALL differ.

1.4. WHEN `getPatternDefinitionKey` is computed for a pattern with `turnContext = 'either'` versus a pre-migration equivalent pattern with `turnContext` absent and defaulted to `'either'`, THE signatures SHALL be equal.

1.5. WHEN auto-seeded default patterns (`starter_opening`, `no_starter_problem`, `double_brick_problem`) are built via `buildDefaultPatterns`, THEY SHALL have `turnContext = 'either'`.

### Requirement 2: Rule Editor — Turn Context Toggle

**User Story:** As a user editing a rule, I want a three-way selector in the rule editor to mark the rule as Going First, Going Second, or Both, so I can model turn-asymmetric hand evaluations.

#### Acceptance Criteria

2.1. WHEN the rule editor (`RuleBuilder`) renders for a given `HandPattern`, THE system SHALL display a `TurnContextToggle` below the name input and kind toggle with three options labeled "Going First", "Going Second", and "Ambos".

2.2. WHEN a user clicks one of the three turn-context options, THE system SHALL dispatch `setPatternTurnContext(patternId, value)` and update the pattern's `turnContext` immediately.

2.3. WHEN the active rule's `turnContext` changes, ONLY that rule's `turnContext` SHALL be modified; all other patterns and all other fields on the same pattern SHALL remain unchanged.

2.4. WHEN rendering the toggle, THE option corresponding to the current `turnContext` SHALL be visually marked as active and SHALL expose `aria-checked="true"` via `role="radio"`.

2.5. WHEN `turnContext` equals `'either'` (the default), THE "Ambos" option SHALL be the active one.

### Requirement 3: Probability Lab — Turn View Toggle

**User Story:** As a user analyzing my deck, I want a global toggle in the KPI Hero that switches between Going First, Going Second, and Promedio views, so I can see how different turn scenarios change the deck's quality.

#### Acceptance Criteria

3.1. WHEN the Probability Lab first opens, THE `activeTurnView` SHALL default to `'average'`.

3.2. WHEN at least one pattern has `turnContext ≠ 'either'` (asymmetric rules exist), THE `DeckQualityHero` SHALL render a `TurnViewToggle` with three options: "Going First", "Going Second", "Promedio".

3.3. WHEN every pattern has `turnContext === 'either'` (no asymmetric rules), THE `TurnViewToggle` SHALL NOT be rendered.

3.4. WHEN the user clicks a turn view option, THE system SHALL set `activeTurnView` to the chosen value and re-derive the KPI and pattern cards in the same render cycle.

3.5. WHEN the Probability Lab is closed and reopened (navigation, reload), THE `activeTurnView` SHALL reset to `'average'` — this state is not persisted.

### Requirement 4: KPI Calculation — Single-View Modes

**User Story:** As a user viewing the Going First or Going Second perspective, I want the KPI to reflect only the rules that apply to that turn, so the number accurately represents that scenario.

#### Acceptance Criteria

4.1. WHEN `activeTurnView === 'first'`, THE set of patterns used for the KPI calculation SHALL equal `selectPatternsForView(patterns, 'first')`, which includes every pattern with `turnContext ∈ { 'first', 'either' }`.

4.2. WHEN `activeTurnView === 'second'`, THE set of patterns used for the KPI calculation SHALL equal `selectPatternsForView(patterns, 'second')`, which includes every pattern with `turnContext ∈ { 'second', 'either' }`.

4.3. WHEN `selectPatternsForView` executes for any view and any input, THE relative order of patterns in the result SHALL match their order in the input.

4.4. WHEN the filtered set for a single-view mode is non-empty, THE KPI number displayed in `DeckQualityHero` SHALL equal `calculateProbabilities` of the filtered state (existing math, new input).

4.5. WHEN the filtered set for a single-view mode is empty, THE KPI Hero SHALL render its existing "no active rules" empty state without crashing.

### Requirement 5: KPI Calculation — Promedio View

**User Story:** As a user looking at the Promedio view, I want a KPI that fairly blends going-first and going-second perspectives, so the main number remains meaningful even when my rules are asymmetric.

#### Acceptance Criteria

5.1. WHEN `activeTurnView === 'average'` AND no patterns have `turnContext ≠ 'either'`, THE KPI SHALL equal the single `calculateProbabilities` result over the full pattern list. The result SHALL be bit-identical to the pre-feature behavior.

5.2. WHEN `activeTurnView === 'average'` AND at least one pattern has `turnContext ≠ 'either'`, THE KPI's `cleanProbability` SHALL equal the arithmetic mean of `cleanProbabilityOf(calculateProbabilities(selectPatternsForView(p, 'first')))` and `cleanProbabilityOf(calculateProbabilities(selectPatternsForView(p, 'second')))`.

5.3. WHEN `aggregateKpiAcrossViews` builds the returned `patternResults`, EVERY pattern from the input SHALL be represented exactly once, with its probability taken from whichever sub-view included it.

5.4. WHEN either sub-view returns `summary: null` (validation error), THE aggregated result SHALL surface a `summary: null` in the same way as today's single-summary failure mode.

5.5. WHEN `aggregateKpiAcrossViews` produces a `cleanProbability`, THE value SHALL satisfy `0 ≤ cleanProbability ≤ 1`.

### Requirement 6: Per-Rule Cards in the KPI Hero

**User Story:** As a user inspecting the opening and problem cards in the hero, I want cards to reflect the active view, so I'm not misled by rules that don't apply to the current scenario.

#### Acceptance Criteria

6.1. WHEN `activeTurnView === 'first'`, THE opening and problem cards in the hero SHALL display only patterns where `turnContext ∈ { 'first', 'either' }`.

6.2. WHEN `activeTurnView === 'second'`, THE opening and problem cards in the hero SHALL display only patterns where `turnContext ∈ { 'second', 'either' }`.

6.3. WHEN `activeTurnView === 'average'`, THE opening and problem cards SHALL display all patterns regardless of `turnContext`.

6.4. WHEN a pattern has `turnContext ≠ 'either'` AND is displayed in a single-view mode, THE card SHALL display a small visual indicator (icon or label) clarifying the rule's turn scope. IN `'average'` view, the indicator SHALL also appear on any card whose `turnContext ≠ 'either'`.

### Requirement 7: Persistence & Backward Compatibility

**User Story:** As a user with existing deck states in localStorage, URL share links, or workspace snapshots, I want my decks to open correctly after the update, so I don't lose my work.

#### Acceptance Criteria

7.1. WHEN `fromPortableConfig` parses a `PortableConfig` with `version = 15`, THE system SHALL assign `turnContext = 'either'` to every deserialized pattern.

7.2. WHEN `fromPortableConfig` parses a `PortableConfig` with `version = 16`, THE system SHALL read each pattern's `turnContext` from the payload, normalizing invalid or missing values to `'either'`.

7.3. WHEN `toPortableConfig` serializes `AppState`, THE output SHALL have `version = 16` AND every `patterns[i].turnContext` field SHALL be present with a valid `TurnContext` value.

7.4. WHEN a legacy v15 state is loaded, normalized, and re-saved, THE round-trip SHALL produce a v16 config whose pattern signatures (via `getPatternDefinitionKey`) equal the signatures of the original v15 patterns (no ghost duplicates).

7.5. WHEN a `WorkspaceSnapshot` created before this feature is loaded after the update, THE restored `HandPattern[]` SHALL have `turnContext = 'either'` on every pattern and SHALL be usable without manual fixup.

7.6. WHEN `usePatternMaintenance` runs on app load with `DEFAULT_PATTERNS_VERSION` bumped to 10, THE state seed migration SHALL only re-seed defaults once and SHALL NOT duplicate auto-seeded patterns just because their definition key changed due to this migration (property 1.4 guarantees the key is preserved).

### Requirement 8: Correctness Invariants (Property-Based Test Coverage)

**User Story:** As a maintainer, I want property-based tests enforcing the invariants from the design, so future refactors don't silently break turn-context semantics.

#### Acceptance Criteria

8.1. WHERE every pattern has `turnContext === 'either'`, THE test suite SHALL assert `selectPatternsForView(patterns, view) = patterns` for every `view ∈ { 'first', 'second', 'average' }`.

8.2. WHERE `view ∈ { 'first', 'second' }`, THE test suite SHALL assert `pattern ∈ selectPatternsForView(patterns, view) ⟺ pattern.turnContext ∈ { view, 'either' }`.

8.3. WHERE every pattern has `turnContext === 'either'`, THE test suite SHALL assert `aggregateKpiAcrossViews(...).cleanProbability` equals the pre-feature single-summary `cleanProbability` to within floating-point tolerance.

8.4. WHERE at least one pattern has `turnContext ≠ 'either'`, THE test suite SHALL assert the aggregated `cleanProbability` lies in the closed interval `[min(subViewProbs), max(subViewProbs)]`.

8.5. THE test suite SHALL assert that stripping `turnContext` and defaulting it via `normalizeTurnContext` preserves `getPatternDefinitionKey` for every pattern.

8.6. THE test suite SHALL assert that `curatePatterns(curatePatterns(p, c), c) ≡ curatePatterns(p, c)` (idempotence), including the new `turnContext` normalization step.

8.7. THE test suite SHALL assert that `setPatternTurnContext(state, {patternId, value})` changes only the target pattern's `turnContext` and leaves all other state properties unmodified.

### Requirement 9: Preset Definitions and Pattern Curation Consistency

**User Story:** As a user, I want preset definitions and curation to handle the new field without breaking recommended rules or causing unexpected re-seeding.

#### Acceptance Criteria

9.1. WHEN any preset in `PATTERN_PRESET_DEFINITIONS` is built via its `build(cards)` function, THE resulting pattern SHALL have `turnContext = 'either'` unless the preset definition explicitly overrides it.

9.2. WHEN `getPatternCollectionSignature` serializes the pattern collection in `curatePatterns`, THE signature SHALL include each pattern's `turnContext` so diff detection in `usePatternMaintenance` correctly identifies when a `turnContext` change requires state update.

9.3. WHEN `curatePatterns` encounters duplicate patterns (same `getPatternDefinitionKey`), AT MOST ONE SHALL be kept, and `turnContext` SHALL participate in the dedup key.

### Requirement 10: Non-Regression for the Untouched Calculation Engine

**User Story:** As a maintainer, I want the core combinatorial engine (`calculateProbabilities`, `buildCalculationSummary`, `probability-validation`) to remain unchanged by this feature, so existing engine-level guarantees and property tests keep passing without modification.

#### Acceptance Criteria

10.1. THE functions `calculateProbabilities`, `buildCalculationSummary`, and `validateCalculationState` SHALL NOT read, write, or branch on `turnContext`.

10.2. THE existing property-based tests in `probability-engine.test.ts` SHALL continue to pass unchanged, except for arbitrary updates that populate `turnContext` on generated patterns.

10.3. WHEN the engine receives a `CalculatorState` whose `patterns[i].turnContext` values are any valid combination, THE result SHALL be mathematically identical to the result produced by the same patterns with `turnContext` field removed.
