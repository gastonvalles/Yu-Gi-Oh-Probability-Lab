# Bugfix Requirements Document

## Introduction

The app defines a `CalculatorMode` type with three values: `'deck'`, `'manual'`, and `'gambling'`. However, only the `'deck'` mode is implemented. The `'manual'` and `'gambling'` modes are dead code — they render placeholder panels with no functionality, expose non-functional tabs in the UI via `ModeTabs`, and add unnecessary branches throughout the state management and serialization layers. This creates user confusion (clickable tabs that lead nowhere) and codebase complexity that should be eliminated.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the app renders the `ModeTabs` component THEN the system displays three clickable tabs ("Auto", "Manual", "Gambling") even though only "Auto" (deck mode) is functional

1.2 WHEN a user selects the "Manual" tab THEN the system renders a `PlaceholderPanel` with a "coming soon" message instead of any working calculator

1.3 WHEN a user selects the "Gambling" tab THEN the system renders a `PlaceholderPanel` with a "coming soon" message instead of any working calculator

1.4 WHEN the app serializes state via `PortableConfig` THEN the system includes a `mode` field that can hold `'manual'` or `'gambling'` values that serve no purpose

1.5 WHEN the app deserializes state via `parseMode` in `utils.ts` THEN the system accepts `'manual'` and `'gambling'` as valid mode values even though they have no implementation

1.6 WHEN the mode is not `'deck'` THEN the system applies a different CSS layout class in `App.tsx` (`mx-auto min-h-screen w-[min(1760px,100vw)]`) for placeholder panels that will never contain real content

### Expected Behavior (Correct)

2.1 WHEN the app renders THEN the system SHALL NOT display any mode-switching tabs since only one mode exists

2.2 WHEN the app loads THEN the system SHALL always operate in deck mode without any mechanism to switch to non-existent modes

2.3 WHEN the app loads THEN the system SHALL NOT render any `PlaceholderPanel` for unimplemented modes

2.4 WHEN the app serializes state THEN the system SHALL either omit the mode field or always write `'deck'` as the only valid value

2.5 WHEN the app deserializes state with a `mode` value of `'manual'` or `'gambling'` THEN the system SHALL fall back to `'deck'` (backward compatibility with existing persisted data)

2.6 WHEN the app renders the main layout THEN the system SHALL always use the deck mode layout class without conditional branching on dead modes

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the app is in deck mode THEN the system SHALL CONTINUE TO render the `DeckModeScreen` component with full deck-building and probability functionality

3.2 WHEN the app serializes and deserializes state THEN the system SHALL CONTINUE TO correctly round-trip all deck builder data, patterns, hand size, and deck format settings

3.3 WHEN the app loads persisted state that was saved with `mode: 'deck'` THEN the system SHALL CONTINUE TO restore the full application state correctly

3.4 WHEN the `settings` Redux slice manages `handSize` and `deckFormat` THEN the system SHALL CONTINUE TO dispatch and apply those settings correctly

3.5 WHEN the `ProbabilityPanel` receives mode-related props THEN the system SHALL CONTINUE TO calculate and display probability results correctly (note: the unused `mode` and `onModeChange` props in `ProbabilityPanel` are already prefixed with `_` and can be removed)

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type CalculatorMode
  OUTPUT: boolean

  // Returns true when the mode is one of the dead/unimplemented modes
  RETURN X = 'manual' OR X = 'gambling'
END FUNCTION
```

## Fix Checking Property

```pascal
// Property: Fix Checking - Dead modes are eliminated
FOR ALL X WHERE isBugCondition(X) DO
  // The type system no longer allows 'manual' or 'gambling' as valid values
  ASSERT CalculatorMode = 'deck' (literal type, no union with dead modes)
  // Any persisted state with dead mode values falls back to 'deck'
  ASSERT parseMode(X) = 'deck'
  // No UI elements exist to switch to dead modes
  ASSERT ModeTabs component does not exist
  ASSERT PlaceholderPanel component does not exist
END FOR
```

## Preservation Checking Property

```pascal
// Property: Preservation Checking - Deck mode behavior is unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  // X = 'deck' — the only valid mode
  ASSERT F(X) = F'(X)
  // Deck mode rendering, state management, serialization, and probability
  // calculations all produce identical results before and after the fix
END FOR
```
