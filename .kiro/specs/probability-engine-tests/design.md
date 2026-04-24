# Design Document: Probability Engine Tests

## Overview

This spec adds a comprehensive test suite for the Yu-Gi-Oh! probability calculation engine. The engine computes exact combinatorial probabilities for opening hands by enumerating all C(deckSize, handSize) combinations and evaluating user-defined patterns against each hand.

The test suite lives in `src/__tests__/probability-engine.test.ts` and uses **vitest** + **fast-check** (both already installed). It covers the `combination` helper (not exported — tested indirectly via `buildCalculationSummary`), `buildCalculationSummary`, `calculateProbabilities`, `validateCalculationState`, and the pattern-matching subsystem.

No production code changes are required. The `combination` function is private to `probability-summary.ts`, so all combination-identity properties are verified indirectly through `buildCalculationSummary` (which uses `combination` to compute `totalHands`). Direct combination tests require exporting the function or using a known-value approach — we choose the known-value approach for boundary tests and verify identities through the summary's `totalHands` field.

## Architecture

```
src/__tests__/probability-engine.test.ts
    │
    ├── imports: calculateProbabilities (probability.ts)
    ├── imports: buildCalculationSummary (probability-summary.ts)
    ├── imports: validateCalculationState (probability-validation.ts)
    ├── imports: createMatcherPattern (pattern-factory.ts)
    └── imports: types (types.ts)
```

All tests target the public API surface. The `combination` function is tested indirectly — we verify `totalHands === C(deckSize, handSize)` by computing the expected value inline using a local `referenceCombination` helper in the test file.

### Test Organization

```
describe('Probability Engine')
  ├── describe('Combination identities (via totalHands)')
  │     ├── property: boundary identities
  │     ├── property: symmetry
  │     └── property: Pascal's rule
  ├── describe('Hand count partition invariant')
  │     └── property: partition + bounds
  ├── describe('Probability consistency')
  │     └── property: ratios + bounds
  ├── describe('Per-pattern result invariants')
  │     └── property: per-pattern consistency
  ├── describe('Determinism')
  │     └── property: identical input → identical output
  ├── describe('Blocking validation → null summary')
  │     └── property: invalid state → null summary
  ├── describe('Trivial and impossible cases')
  │     └── example tests for Req 6
  ├── describe('Reuse policy enforcement')
  │     └── example tests for Req 7
  ├── describe('Input validation')
  │     └── example tests for Req 8
  ├── describe('Pattern logic modes')
  │     └── example tests for Req 9
  └── describe('Edge cases and boundary conditions')
        └── example tests for Req 10
```

## Components and Interfaces

### Test Helpers

**`referenceCombination(n, k)`** — A local pure function in the test file that computes C(n, k) using the multiplicative formula. Used to verify `totalHands` values independently of the production `combination` function.

**`makeCard(id, name, copies)`** — Factory for creating minimal `CardEntry` objects with required fields populated (source, apiCard, origin, roles, needsReview).

**`makeState(overrides)`** — Factory for creating valid `CalculatorState` objects with sensible defaults (deckSize=40, handSize=5, one card, one pattern).

### fast-check Arbitraries

**`arbValidCalculatorState`** — Generates random valid `CalculatorState` objects:
- `deckSize`: 40–60
- `handSize`: 1–min(deckSize, 10) (kept small for performance)
- `cards`: 1–4 cards with copies summing to deckSize, each with unique names, valid origin/roles
- `patterns`: 1–3 patterns with conditions referencing the generated cards via `card_pool` matchers

The arbitrary must ensure:
- Card copies sum to exactly deckSize
- All card names are unique
- Pattern conditions reference valid card IDs
- Cards have non-null origin and non-empty roles (to pass validation)

**`arbInvalidCalculatorState`** — Generates states that will produce blocking validation errors (deckSize < 40, handSize > deckSize, empty cards, empty patterns).

## Data Models

No new data models. Tests consume existing types:
- `CalculatorState` — input to the engine
- `CalculationSummary` — output from `buildCalculationSummary`
- `CalculationOutput` — output from `calculateProbabilities`
- `CardEntry`, `HandPattern`, `PatternCondition` — building blocks
- `ValidationIssue` — validation output

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Combination boundary identities (via totalHands)

*For any* valid CalculatorState where deckSize equals handSize, `buildCalculationSummary` SHALL return `totalHands` equal to 1 (since C(n,n) = 1). *For any* valid CalculatorState where handSize equals 0 (tested via the reference combination helper), C(n,0) SHALL equal 1. *For any* valid (n, k) pair, the reference combination function SHALL return a non-negative integer, and SHALL return 0 when k < 0 or k > n.

**Validates: Requirements 1.1, 1.2, 1.5, 1.6**

### Property 2: Combination symmetry

*For any* non-negative integers n and k where 0 ≤ k ≤ n (with n ≤ 200), `referenceCombination(n, k)` SHALL equal `referenceCombination(n, n - k)`.

**Validates: Requirements 1.3**

### Property 3: Combination Pascal's rule

*For any* integers n > 0 and 0 < k < n (with n ≤ 200), `referenceCombination(n, k)` SHALL equal `referenceCombination(n - 1, k - 1) + referenceCombination(n - 1, k)`.

**Validates: Requirements 1.4**

### Property 4: Hand count partition and bounds

*For any* valid CalculatorState, `buildCalculationSummary` SHALL produce a result where:
- `totalHands` equals `referenceCombination(deckSize, handSize)`
- `goodHands + badHands - overlapHands + neutralHands === totalHands`
- `0 ≤ goodHands ≤ totalHands`
- `0 ≤ badHands ≤ totalHands`
- `0 ≤ overlapHands ≤ min(goodHands, badHands)`
- `0 ≤ neutralHands ≤ totalHands`

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

### Property 5: Probability ratios and bounds

*For any* valid CalculatorState, `buildCalculationSummary` SHALL produce a result where:
- `totalProbability === goodHands / totalHands`
- `badProbability === badHands / totalHands`
- `neutralProbability === neutralHands / totalHands`
- `overlapProbability === overlapHands / totalHands`
- `0 ≤ totalProbability ≤ 1`
- `totalProbability + badProbability - overlapProbability + neutralProbability ≈ 1` (within 1e-10)

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 6: Per-pattern result consistency

*For any* valid CalculatorState, `buildCalculationSummary` SHALL produce `patternResults` where:
- `patternResults.length === patterns.length`
- Each `matchingHands` is between 0 and `totalHands` inclusive
- Each `probability === matchingHands / totalHands`
- Each `possible === (matchingHands > 0)`
- For states with only opening patterns: `goodHands >= max(matchingHands)` across all patterns

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 7: Determinism

*For any* valid CalculatorState, calling `calculateProbabilities` twice with the same input SHALL return deeply equal `CalculationOutput` values.

**Validates: Requirements 5.1, 5.2**

### Property 8: Blocking validation errors produce null summary

*For any* CalculatorState that has blocking validation errors (deckSize < 40, handSize > deckSize, empty cards, or empty patterns), `calculateProbabilities` SHALL return `summary: null` and a non-empty `blockingIssues` array.

**Validates: Requirements 8.7**

## Error Handling

Tests verify error handling through:
- **Validation errors** (Req 8): `validateCalculationState` returns error-level issues for invalid inputs
- **Null summary** (Req 8.7): `calculateProbabilities` returns `null` summary when blocking issues exist
- **Impossible patterns** (Req 6.2, 6.3): Engine returns 0 probability, not errors
- **Edge cases** (Req 10): Engine handles degenerate inputs without crashing

No error handling is needed in the test code itself — tests assert expected behavior.

## Testing Strategy

### Property-Based Tests (fast-check)

8 properties, each running **100+ iterations** via fast-check:

| Property | Description | Validates |
|----------|-------------|-----------|
| 1 | Combination boundary identities | Req 1.1, 1.2, 1.5, 1.6 |
| 2 | Combination symmetry | Req 1.3 |
| 3 | Combination Pascal's rule | Req 1.4 |
| 4 | Hand count partition and bounds | Req 2.1–2.6 |
| 5 | Probability ratios and bounds | Req 3.1–3.6 |
| 6 | Per-pattern result consistency | Req 4.1–4.5 |
| 7 | Determinism | Req 5.1, 5.2 |
| 8 | Blocking validation → null summary | Req 8.7 |

**Configuration**: `{ numRuns: 100 }` minimum per property. Deck sizes kept to 40–50 and hand sizes to 1–7 to keep enumeration fast.

**Library**: `fast-check` v4.7.0 (already installed)

**Tag format**: Each property test includes a comment: `Feature: probability-engine-tests, Property N: <title>`

### Example-Based Tests (vitest)

Targeted tests for specific scenarios that don't benefit from randomization:

- **Trivial/impossible cases** (Req 6): 5 concrete scenarios
- **Reuse policy** (Req 7): 3 concrete scenarios testing forbid vs allow
- **Input validation** (Req 8): 6 concrete validation error checks
- **Pattern logic modes** (Req 9): 4 concrete scenarios for all/any/at-least/exclude
- **Edge cases** (Req 10): 5 concrete boundary scenarios

### Test File

Single file: `src/__tests__/probability-engine.test.ts`

All tests use vitest's `describe`/`it`/`expect` with `fc.assert(fc.property(...))` for property tests.
