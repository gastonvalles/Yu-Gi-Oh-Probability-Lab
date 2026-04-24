# Remove Dead Calculator Modes — Bugfix Design

## Overview

The `CalculatorMode` type defines three values (`'deck'`, `'manual'`, `'gambling'`) but only `'deck'` is implemented. The `'manual'` and `'gambling'` modes are dead code that expose non-functional UI tabs, render placeholder panels, and add unnecessary conditional branches across the state management, serialization, and rendering layers. This fix eliminates the dead modes entirely — narrowing the type to a literal `'deck'`, deleting the `ModeTabs` and `PlaceholderPanel` components, removing mode-switching logic, and simplifying the layout to always render deck mode.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when the app's `CalculatorMode` value is `'manual'` or `'gambling'`, leading to dead UI paths and non-functional tabs
- **Property (P)**: The desired behavior — the type system only allows `'deck'`, dead mode UI elements are removed, and persisted data with old mode values falls back to `'deck'`
- **Preservation**: Existing deck mode behavior (rendering, state management, serialization, probability calculations) must remain completely unchanged
- **CalculatorMode**: The type in `src/app/model.ts` that currently unions `'deck' | 'manual' | 'gambling'` — to be narrowed to `'deck'`
- **ModeTabs**: Component in `src/components/ModeTabs.tsx` that renders three clickable mode-switching buttons — to be deleted
- **PlaceholderPanel**: Component in `src/components/PlaceholderPanel.tsx` that renders "coming soon" panels for unimplemented modes — to be deleted
- **parseMode**: Function in `src/app/utils.ts` that accepts `'manual'` and `'gambling'` as valid values — to be simplified
- **PortableConfig**: Serialization interface in `src/app/model.ts` that includes a `mode` field typed as `CalculatorMode`
- **SettingsState**: Redux slice state in `src/app/settings-slice.ts` that holds the current `mode`

## Bug Details

### Bug Condition

The bug manifests when the app allows navigation to or persistence of `'manual'` or `'gambling'` mode values. The `ModeTabs` component renders clickable tabs for these dead modes, `PlaceholderPanel` renders empty "coming soon" content, and the `App.tsx` layout applies a different CSS class for non-deck modes. The `parseMode` function in `utils.ts` accepts these dead values as valid, and the `PortableConfig` serialization format can round-trip them.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { mode: string }
  OUTPUT: boolean

  RETURN input.mode = 'manual' OR input.mode = 'gambling'
END FUNCTION
```

### Examples

- User clicks the "Manual" tab in `ModeTabs` → app switches to `mode: 'manual'` → `PlaceholderPanel` renders with "Calculadora Manual" title and a "coming soon" message. Expected: no tab exists, app stays in deck mode.
- User clicks the "Gambling" tab in `ModeTabs` → app switches to `mode: 'gambling'` → `PlaceholderPanel` renders with "Calculadora Gambling" title. Expected: no tab exists, app stays in deck mode.
- App deserializes persisted state with `mode: 'manual'` → `parseMode` returns `'manual'` → app enters dead mode. Expected: `parseMode` returns `'deck'` as fallback.
- App is in `mode: 'manual'` → `App.tsx` applies `mx-auto min-h-screen w-[min(1760px,100vw)]` layout class instead of the deck mode class. Expected: always uses deck mode layout.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Deck mode rendering via `DeckModeScreen` with full deck-building, categorization, probability, and export functionality must continue to work exactly as before
- State serialization and deserialization of all deck builder data, patterns, hand size, and deck format settings must round-trip correctly
- Loading persisted state that was saved with `mode: 'deck'` must restore the full application state correctly
- The `settings` Redux slice must continue to manage `handSize` and `deckFormat` correctly
- Probability calculations and display in `ProbabilityPanel` must produce identical results
- The `selectAppState` and `buildRootState` functions in `store.ts` must continue to correctly map between `RootState` and `AppState`

**Scope:**
All inputs that do NOT involve the dead `'manual'` or `'gambling'` mode values should be completely unaffected by this fix. This includes:
- All deck builder operations (add, remove, move, import, export cards)
- All pattern/probability operations
- All settings changes (hand size, deck format)
- All workspace sharing and snapshot operations

## Hypothesized Root Cause

Based on the codebase analysis, the root cause is straightforward — the dead modes were scaffolded as future features that were never implemented:

1. **Type Definition Too Broad**: `CalculatorMode` in `src/app/model.ts` is defined as `'deck' | 'manual' | 'gambling'` when only `'deck'` has any implementation. This allows the type system to accept dead values throughout the codebase.

2. **UI Components for Unimplemented Features**: `ModeTabs` (`src/components/ModeTabs.tsx`) renders tabs for all three modes, and `PlaceholderPanel` (`src/components/PlaceholderPanel.tsx`) exists solely to show "coming soon" content for the dead modes.

3. **Serialization Accepts Dead Values**: `parseMode` in `src/app/utils.ts` explicitly accepts `'manual'` and `'gambling'` as valid, allowing them to persist and restore.

4. **Conditional Branching on Dead Modes**: `App.tsx` has conditional rendering for `mode === 'manual'` and `mode === 'gambling'` branches, plus a conditional CSS class based on whether mode is `'deck'`.

5. **Unused Props Propagation**: `ProbabilityPanel` accepts `mode` and `onModeChange` props (already prefixed with `_` indicating they're unused) that flow from `useDeckModeController` through `DeckModeScreen`.

## Correctness Properties

Property 1: Bug Condition — Dead Modes Eliminated

_For any_ input where the mode value is `'manual'` or `'gambling'` (isBugCondition returns true), the fixed codebase SHALL reject these values at the type level (CalculatorMode = `'deck'` literal), the `parseMode` function SHALL return `'deck'` as a fallback, and no UI elements SHALL exist to switch to or render dead modes.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation — Deck Mode Behavior Unchanged

_For any_ input where the mode value is `'deck'` (isBugCondition returns false), the fixed codebase SHALL produce exactly the same rendering, state management, serialization, and probability calculation results as the original code, preserving all existing deck mode functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/model.ts`

**Changes**:
1. **Narrow CalculatorMode type**: Change `export type CalculatorMode = 'deck' | 'manual' | 'gambling'` to `export type CalculatorMode = 'deck'`
2. **Remove mode from AppState**: Remove the `mode: CalculatorMode` field from `AppState` interface since it's always `'deck'`
3. **Remove mode from PortableConfig**: Remove the `mode: CalculatorMode` field from `PortableConfig` interface
4. **Remove mode from createInitialState**: Remove `mode: 'deck'` from the initial state factory

---

**File**: `src/app/settings-slice.ts`

**Changes**:
1. **Remove mode from SettingsState**: Remove `mode: CalculatorMode` from the interface and initial state
2. **Remove setMode action**: Delete the `setMode` reducer and its export
3. **Remove CalculatorMode import**: Clean up the unused import

---

**File**: `src/app/store.ts`

**Changes**:
1. **Remove mode from selectAppState**: Remove `mode: state.settings.mode` from the returned `AppState`
2. **Remove mode from buildRootState**: Remove `mode: state.mode` from the settings slice mapping

---

**File**: `src/app/utils.ts`

**Changes**:
1. **Simplify parseMode**: Change to always return `'deck'` regardless of input (backward compatibility for deserialization of old persisted data)
2. **Remove CalculatorMode import**: Clean up the unused import

---

**File**: `src/app/app-state-codec.ts`

**Changes**:
1. **Remove mode from toPortableConfig**: Remove `mode: state.mode` from the serialized output
2. **Remove mode from fromPortableConfig**: Remove `parseMode(value.mode)` call and `mode` from the returned state
3. **Remove parseMode import**: Clean up the unused import

---

**File**: `src/App.tsx`

**Changes**:
1. **Remove PlaceholderPanel import**: Delete the import
2. **Remove setMode import**: Delete the import
3. **Remove mode selector**: Remove `useAppSelector` for `state.settings.mode`
4. **Remove dispatch**: Remove `useAppDispatch` (if no other uses remain)
5. **Remove conditional rendering**: Delete the `mode === 'manual'` and `mode === 'gambling'` branches
6. **Simplify layout**: Always use the deck mode CSS class `min-h-screen w-full bg-transparent p-0`
7. **Always render DeckModeScreen**: Remove the `mode === 'deck'` conditional

---

**File**: `src/components/ModeTabs.tsx` — **DELETE**

Delete the entire file. No other component besides `PlaceholderPanel` imports it.

---

**File**: `src/components/PlaceholderPanel.tsx` — **DELETE**

Delete the entire file. Only `App.tsx` imports it.

---

**File**: `src/components/ProbabilityPanel.tsx`

**Changes**:
1. **Remove mode and onModeChange props**: Remove `mode: CalculatorMode` and `onModeChange: (mode: CalculatorMode) => void` from `ProbabilityPanelProps`
2. **Remove CalculatorMode import**: Clean up the unused import
3. **Remove underscore-prefixed params**: Remove `mode: _mode` and `onModeChange: _onModeChange` from `ProbabilityPanelContent` destructuring

---

**File**: `src/components/deck-mode/use-deck-mode-controller.ts`

**Changes**:
1. **Remove setMode import**: Remove from the settings-slice import
2. **Remove handleModeChange callback**: Delete the `handleModeChange` callback
3. **Remove mode and onModeChange from probability return**: Remove `mode: settings.mode` and `onModeChange: handleModeChange` from the returned controller object

---

**File**: `src/app/deck-import.ts`

**Changes**:
1. **Remove mode from buildPortableConfigFromDeckBuilderRecord**: Remove `mode: initialState.mode` from the constructed `PortableConfig` (this field will no longer exist on the interface)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that verify the type system and runtime behavior allow dead mode values. Run these tests on the UNFIXED code to observe the bug in action.

**Test Cases**:
1. **parseMode Accepts Dead Values**: Call `parseMode('manual')` and `parseMode('gambling')` — both return the dead value instead of falling back to `'deck'` (will fail on unfixed code by returning the dead value)
2. **CalculatorMode Type Allows Dead Values**: Verify that `'manual'` and `'gambling'` are assignable to `CalculatorMode` (will demonstrate the type is too broad)
3. **ModeTabs Renders Dead Tabs**: Render `ModeTabs` and verify it produces three buttons including "Manual" and "Gambling" (will demonstrate dead UI on unfixed code)
4. **App Renders PlaceholderPanel**: Set mode to `'manual'` and verify `App` renders `PlaceholderPanel` instead of `DeckModeScreen` (will demonstrate dead rendering path)

**Expected Counterexamples**:
- `parseMode('manual')` returns `'manual'` instead of `'deck'`
- `parseMode('gambling')` returns `'gambling'` instead of `'deck'`
- `ModeTabs` renders 3 buttons when only 1 should exist

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := parseMode_fixed(input.mode)
  ASSERT result = 'deck'
  ASSERT CalculatorMode type only allows 'deck'
  ASSERT ModeTabs component does not exist in codebase
  ASSERT PlaceholderPanel component does not exist in codebase
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT parseMode_original(input) = parseMode_fixed(input)
  ASSERT toPortableConfig_original(deckState) round-trips with fromPortableConfig_fixed
  ASSERT App renders DeckModeScreen identically
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for deck mode operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **parseMode Preservation**: Observe that `parseMode('deck')` returns `'deck'` on unfixed code, then verify this continues after fix
2. **Serialization Round-Trip Preservation**: Observe that `toPortableConfig` → `fromPortableConfig` round-trips all deck state correctly on unfixed code, then verify this continues after fix
3. **App Rendering Preservation**: Observe that `App` renders `DeckModeScreen` when mode is `'deck'` on unfixed code, then verify this continues after fix (now unconditionally)
4. **Settings Slice Preservation**: Observe that `setHandSize` and `setDeckFormat` actions work correctly on unfixed code, then verify they continue after fix

### Unit Tests

- Test `parseMode` returns `'deck'` for all inputs including `'manual'`, `'gambling'`, `'deck'`, `undefined`, `null`, random strings
- Test that `fromPortableConfig` correctly deserializes old persisted data that contains `mode: 'manual'` or `mode: 'gambling'` (backward compatibility)
- Test that `toPortableConfig` produces valid output without a `mode` field (or with `mode: 'deck'`)
- Test that `App` renders `DeckModeScreen` unconditionally without any mode-switching UI

### Property-Based Tests

- Generate random `parseMode` inputs (strings, numbers, null, undefined, objects) and verify the result is always `'deck'`
- Generate random valid `AppState` objects and verify `toPortableConfig` → `fromPortableConfig` round-trips correctly without mode field corruption
- Generate random settings actions (`setHandSize`, `setDeckFormat`) and verify the settings reducer produces correct state without mode-related side effects

### Integration Tests

- Test full app load with persisted state containing `mode: 'manual'` — verify app renders in deck mode
- Test full app load with persisted state containing `mode: 'gambling'` — verify app renders in deck mode
- Test full app load with persisted state containing `mode: 'deck'` — verify app renders in deck mode (unchanged)
- Test that workspace sharing/import with old format data containing dead mode values loads correctly
