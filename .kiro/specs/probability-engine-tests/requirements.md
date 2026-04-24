# Requirements Document

## Introduction

Comprehensive property-based and example-based test suite for the Yu-Gi-Oh! probability calculation engine. The engine computes exact combinatorial probabilities for opening hands by enumerating all C(deckSize, handSize) combinations and evaluating user-defined patterns against each hand. Tests verify mathematical correctness, invariant preservation, determinism, and edge-case handling across the `combination` helper, `buildCalculationSummary`, `validateCalculationState`, and pattern-matching subsystems.

## Glossary

- **Engine**: The probability calculation system composed of `calculateProbabilities`, `buildCalculationSummary`, `validateCalculationState`, and the pattern-matching subsystem (`resolvePattern`, `matchesResolvedPattern`, `getMatchedRequirementCount`).
- **Combination_Function**: The `combination(n, k)` helper in `probability-summary.ts` that computes the binomial coefficient C(n, k).
- **CalculationSummary**: The output record produced by `buildCalculationSummary`, containing `totalHands`, `goodHands`, `badHands`, `overlapHands`, `neutralHands`, `totalProbability`, `badProbability`, `neutralProbability`, `overlapProbability`, and `patternResults`.
- **CalculatorState**: The input record containing `deckSize`, `handSize`, `cards` (array of `CardEntry`), and `patterns` (array of `HandPattern`).
- **PatternProbability**: A per-pattern result record containing `matchingHands`, `probability`, `patternId`, `name`, `kind`, and `possible`.
- **Hand**: A multiset of cards drawn from the deck, represented as an integer array of per-card counts summing to `handSize`.
- **Opening_Pattern**: A `HandPattern` with `kind: 'opening'` — a desirable hand configuration.
- **Problem_Pattern**: A `HandPattern` with `kind: 'problem'` — an undesirable hand configuration.
- **Reuse_Policy**: The `reusePolicy` field on a pattern (`'allow'` or `'forbid'`) controlling whether the same card copy may satisfy multiple conditions within one pattern.
- **Validator**: The `validateCalculationState` function in `probability-validation.ts`.

## Requirements

### Requirement 1: Combination Function Mathematical Identities

**User Story:** As a developer, I want the combination function to satisfy standard binomial coefficient identities, so that all hand-count calculations built on it are mathematically correct.

#### Acceptance Criteria

1. THE Combination_Function SHALL return 1 when k equals 0 for all non-negative n.
2. THE Combination_Function SHALL return 1 when k equals n for all non-negative n.
3. THE Combination_Function SHALL return the same value for C(n, k) and C(n, n − k) (symmetry identity) for all valid n and k.
4. THE Combination_Function SHALL satisfy Pascal's rule: C(n, k) equals C(n − 1, k − 1) plus C(n − 1, k) for all n greater than 0 and 0 less than k less than n.
5. THE Combination_Function SHALL return 0 when k is negative or k exceeds n.
6. THE Combination_Function SHALL return a non-negative integer for all valid inputs.

### Requirement 2: Hand Count Partition Invariant

**User Story:** As a developer, I want the sum of good, bad, neutral, and overlap hand counts to equal the total hand count, so that every possible hand is accounted for exactly once.

#### Acceptance Criteria

1. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set totalHands equal to C(deckSize, handSize).
2. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL satisfy the partition identity: goodHands plus badHands minus overlapHands plus neutralHands equals totalHands.
3. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure goodHands is between 0 and totalHands inclusive.
4. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure badHands is between 0 and totalHands inclusive.
5. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure overlapHands is between 0 and the minimum of goodHands and badHands inclusive.
6. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure neutralHands is between 0 and totalHands inclusive.

### Requirement 3: Probability Bounds and Consistency

**User Story:** As a developer, I want all probability values to be valid fractions of totalHands, so that displayed percentages are always meaningful.

#### Acceptance Criteria

1. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set totalProbability equal to goodHands divided by totalHands.
2. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set badProbability equal to badHands divided by totalHands.
3. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set neutralProbability equal to neutralHands divided by totalHands.
4. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set overlapProbability equal to overlapHands divided by totalHands.
5. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure totalProbability is between 0 and 1 inclusive.
6. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure totalProbability plus badProbability minus overlapProbability plus neutralProbability equals 1 within floating-point tolerance.

### Requirement 4: Per-Pattern Result Invariants

**User Story:** As a developer, I want each pattern's matching hand count and probability to be consistent with the total, so that individual pattern statistics are trustworthy.

#### Acceptance Criteria

1. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL produce one PatternProbability entry per pattern in the input.
2. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL ensure each PatternProbability matchingHands is between 0 and totalHands inclusive.
3. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set each PatternProbability probability equal to matchingHands divided by totalHands.
4. WHEN buildCalculationSummary produces a CalculationSummary, THE Engine SHALL set PatternProbability possible to true if and only if matchingHands is greater than 0.
5. WHEN buildCalculationSummary produces a CalculationSummary with only Opening_Pattern entries, THE Engine SHALL ensure goodHands is greater than or equal to the maximum matchingHands across all opening patterns.

### Requirement 5: Determinism

**User Story:** As a developer, I want the engine to produce identical output for identical input, so that results are reproducible and cacheable.

#### Acceptance Criteria

1. WHEN calculateProbabilities is called twice with the same CalculatorState, THE Engine SHALL return identical CalculationSummary values both times.
2. WHEN buildCalculationSummary is called twice with the same CalculatorState, THE Engine SHALL return identical patternResults arrays both times.

### Requirement 6: Trivial and Impossible Cases

**User Story:** As a developer, I want the engine to return probability 1.0 for guaranteed patterns and 0.0 for impossible patterns, so that boundary conditions are handled correctly.

#### Acceptance Criteria

1. WHEN a deck contains only copies of one card and a single Opening_Pattern requires 1 copy of that card, THE Engine SHALL return totalProbability equal to 1.0.
2. WHEN a single Opening_Pattern requires more copies of a card than exist in the deck, THE Engine SHALL return totalProbability equal to 0.0.
3. WHEN a single Opening_Pattern requires more copies of a card than handSize, THE Engine SHALL return totalProbability equal to 0.0.
4. WHEN no patterns are of kind opening, THE Engine SHALL return goodHands equal to 0 and totalProbability equal to 0.0.
5. WHEN a single Problem_Pattern requires 1 copy of a card and the deck contains only copies of that card, THE Engine SHALL return badProbability equal to 1.0.

### Requirement 7: Reuse Policy Enforcement

**User Story:** As a developer, I want the forbid reuse policy to prevent the same card copy from satisfying multiple conditions, so that pattern matching reflects real hand constraints.

#### Acceptance Criteria

1. WHEN a pattern has reusePolicy "forbid" and two include conditions reference the same card pool, THE Engine SHALL require distinct card copies for each condition.
2. WHEN a pattern has reusePolicy "allow" and two include conditions reference the same card pool, THE Engine SHALL permit the same card copy to satisfy both conditions.
3. WHEN a pattern has reusePolicy "forbid" and the total copies in the hand are insufficient to satisfy all conditions with distinct cards, THE Engine SHALL report the pattern as not matching that hand.

### Requirement 8: Input Validation

**User Story:** As a developer, I want the validator to reject invalid inputs with blocking errors, so that the engine never runs on malformed state.

#### Acceptance Criteria

1. WHEN deckSize is less than 40, THE Validator SHALL return an error-level issue.
2. WHEN handSize exceeds deckSize, THE Validator SHALL return an error-level issue.
3. WHEN the cards array is empty, THE Validator SHALL return an error-level issue.
4. WHEN the patterns array is empty, THE Validator SHALL return an error-level issue.
5. WHEN a card has a duplicate name, THE Validator SHALL return an error-level issue.
6. WHEN deckSize is less than 1 or handSize is less than 1, THE Validator SHALL return an error-level issue.
7. WHEN calculateProbabilities receives a state with blocking validation errors, THE Engine SHALL return a null summary and a non-empty blockingIssues array.

### Requirement 9: Pattern Logic Modes

**User Story:** As a developer, I want patterns with "all", "any", and "at-least" logic to match hands correctly, so that users can express complex opening conditions.

#### Acceptance Criteria

1. WHEN a pattern has logic "all", THE Engine SHALL require every condition to match for the pattern to match a hand.
2. WHEN a pattern has logic "any", THE Engine SHALL require at least one condition to match for the pattern to match a hand.
3. WHEN a pattern has logic "any" and minimumConditionMatches greater than 1, THE Engine SHALL require at least minimumConditionMatches conditions to match for the pattern to match a hand.
4. WHEN a pattern has an exclude condition requiring 0 copies of a card and the hand contains that card, THE Engine SHALL report the exclude condition as not matching.

### Requirement 10: Edge Cases and Boundary Conditions

**User Story:** As a developer, I want the engine to handle degenerate inputs gracefully, so that no valid CalculatorState causes a crash or incorrect result.

#### Acceptance Criteria

1. WHEN deckSize equals handSize, THE Engine SHALL return totalHands equal to 1 (only one possible hand).
2. WHEN all cards have 0 copies referenced by patterns and remaining copies are "other cards", THE Engine SHALL produce a valid CalculationSummary with 0 matchingHands for all patterns.
3. WHEN a pattern has conditions referencing cards not present in the deck, THE Engine SHALL report 0 matchingHands for that pattern.
4. WHEN multiple opening patterns overlap (same hand matches both), THE Engine SHALL count that hand once in goodHands (not double-count).
5. WHEN a hand matches both an Opening_Pattern and a Problem_Pattern, THE Engine SHALL count that hand in both goodHands and badHands and increment overlapHands by 1.
