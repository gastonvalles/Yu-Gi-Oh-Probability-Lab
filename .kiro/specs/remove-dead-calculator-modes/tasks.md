# Implementation Plan

- [-] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — Dead Modes Accepted by parseMode and CalculatorMode Type
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Setup**: Install `vitest` and `fast-check` as dev dependencies; add a `test` script (`vitest --run`) to `package.json`; create `vite.config.ts` test configuration if needed
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases: `parseMode('manual')` and `parseMode('gambling')`
  - Test that `parseMode('manual')` returns `'deck'` (not `'manual'`) — from Bug Condition in design: `isBugCondition(input) WHERE input.mode = 'manual' OR input.mode = 'gambling'`
  - Test that `parseMode('gambling')` returns `'deck'` (not `'gambling'`)
  - Property: for all string inputs where `input === 'manual' || input === 'gambling'`, assert `parseMode(input) === 'deck'`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists because `parseMode` currently returns the dead mode value)
  - Document counterexamples found (e.g., `parseMode('manual')` returns `'manual'` instead of `'deck'`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.5, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Deck Mode Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Setup**: Create test file alongside the exploration test
  - Observe: `parseMode('deck')` returns `'deck'` on unfixed code
  - Observe: `parseMode(undefined)` returns `'deck'` on unfixed code
  - Observe: `parseMode(null)` returns `'deck'` on unfixed code
  - Observe: `parseMode(42)` returns `'deck'` on unfixed code
  - Observe: `parseMode('anything-else')` returns `'deck'` on unfixed code
  - Write property-based test: for all inputs where `input !== 'manual' && input !== 'gambling'`, assert `parseMode(input) === 'deck'` (from Preservation Requirements in design)
  - Write property-based test: for random valid `AppState` objects with `mode: 'deck'`, assert `toPortableConfig` → `fromPortableConfig` round-trips `handSize`, `deckFormat`, `deckBuilder.deckName`, and `patterns` correctly (from Preservation Requirements in design: serialization round-trip)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Remove dead calculator modes

  - [x] 3.1 Narrow CalculatorMode type and remove mode from state interfaces
    - In `src/app/model.ts`: change `export type CalculatorMode = 'deck' | 'manual' | 'gambling'` to `export type CalculatorMode = 'deck'`
    - In `src/app/model.ts`: remove `mode: CalculatorMode` from `AppState` interface
    - In `src/app/model.ts`: remove `mode: CalculatorMode` from `PortableConfig` interface
    - In `src/app/model.ts`: remove `mode: 'deck'` from `createInitialState()` return value
    - _Bug_Condition: isBugCondition(input) where input.mode = 'manual' OR input.mode = 'gambling'_
    - _Expected_Behavior: CalculatorMode = 'deck' literal, no union with dead modes_
    - _Preservation: AppState and PortableConfig no longer carry a mode field; all other fields unchanged_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.2 Remove mode from settings slice
    - In `src/app/settings-slice.ts`: remove `mode: CalculatorMode` from `SettingsState` interface and initial state
    - Remove the `setMode` reducer action and its export
    - Remove the `CalculatorMode` import from `./model`
    - _Bug_Condition: setMode action allowed switching to dead modes_
    - _Expected_Behavior: no setMode action exists; settings only manage handSize and deckFormat_
    - _Preservation: setHandSize and setDeckFormat actions continue to work correctly_
    - _Requirements: 2.2, 3.4_

  - [x] 3.3 Remove mode from store mapping functions
    - In `src/app/store.ts`: remove `mode: state.settings.mode` from `selectAppState`
    - In `src/app/store.ts`: remove `mode: state.mode` from `buildRootState` settings mapping
    - _Bug_Condition: selectAppState and buildRootState propagated dead mode values_
    - _Expected_Behavior: AppState no longer includes mode; store mapping omits it_
    - _Preservation: all other fields in selectAppState and buildRootState remain unchanged_
    - _Requirements: 2.4, 3.2_

  - [x] 3.4 Simplify parseMode and clean up app-state-codec
    - In `src/app/utils.ts`: change `parseMode` to always return `'deck'` regardless of input (backward compatibility for old persisted data)
    - In `src/app/app-state-codec.ts` `toPortableConfig`: remove `mode: state.mode` from output
    - In `src/app/app-state-codec.ts` `fromPortableConfig`: remove `mode` from the returned `AppState` (keep calling `parseMode` for backward compat but don't assign result)
    - In `src/app/deck-import.ts` `buildPortableConfigFromDeckBuilderRecord`: remove `mode: initialState.mode` from the constructed `PortableConfig`
    - _Bug_Condition: parseMode accepted 'manual' and 'gambling' as valid; codec round-tripped dead mode values_
    - _Expected_Behavior: parseMode always returns 'deck'; codec omits mode field_
    - _Preservation: parseMode('deck') still returns 'deck'; all non-mode serialization fields unchanged_
    - _Requirements: 2.4, 2.5, 3.2, 3.3_

  - [x] 3.5 Delete dead UI components and simplify App.tsx
    - Delete `src/components/ModeTabs.tsx`
    - Delete `src/components/PlaceholderPanel.tsx`
    - In `src/App.tsx`: remove `PlaceholderPanel` import, `setMode` import, `useAppDispatch`, `useAppSelector` for mode, conditional rendering for `'manual'` and `'gambling'` branches, and conditional CSS class
    - Simplify `App.tsx` to always use `min-h-screen w-full bg-transparent p-0` class and always render `<DeckModeScreen />`
    - _Bug_Condition: ModeTabs rendered clickable dead tabs; PlaceholderPanel rendered "coming soon" panels; App.tsx had conditional branches for dead modes_
    - _Expected_Behavior: no ModeTabs, no PlaceholderPanel, App always renders DeckModeScreen with deck layout_
    - _Preservation: DeckModeScreen rendering is unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1_

  - [x] 3.6 Remove unused mode props from ProbabilityPanel and use-deck-mode-controller
    - In `src/components/ProbabilityPanel.tsx`: remove `mode: CalculatorMode` and `onModeChange: (mode: CalculatorMode) => void` from `ProbabilityPanelProps`; remove `CalculatorMode` import; remove `mode: _mode` and `onModeChange: _onModeChange` from `ProbabilityPanelContent` destructuring
    - In `src/components/deck-mode/use-deck-mode-controller.ts`: remove `setMode` import; remove `handleModeChange` callback; remove `mode: settings.mode` and `onModeChange: handleModeChange` from the `probability` return object; remove `settings.mode` from `appState` memo and its dependency array
    - Update `DeckModeScreen` or any intermediate component that passes `mode`/`onModeChange` to `ProbabilityPanel` to stop passing those props
    - _Bug_Condition: unused mode props propagated through component tree_
    - _Expected_Behavior: no mode-related props in ProbabilityPanel or controller_
    - _Preservation: probability calculations and display unchanged_
    - _Requirements: 2.2, 3.5_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Dead Modes Eliminated
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `parseMode` now returns `'deck'` for all dead mode inputs)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** — Deck Mode Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — deck mode behavior, serialization round-trip, and settings management all unchanged)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite (`vitest --run`) and confirm all property-based tests pass
  - Verify TypeScript compilation succeeds (`tsc --noEmit`) with no type errors
  - Ensure all tests pass, ask the user if questions arise
