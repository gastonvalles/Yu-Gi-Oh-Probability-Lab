# Tasks

## Task 1: Create test file with helpers and arbitraries

- [-] 1.1 Create `src/__tests__/probability-engine.test.ts` with imports, `referenceCombination` helper, `makeCard` factory, and `makeState` factory
- [ ] 1.2 Implement `arbValidCalculatorState` fast-check arbitrary that generates valid CalculatorState objects (deckSize 40–50, handSize 1–7, 1–4 unique cards with copies summing to deckSize, 1–3 patterns with card_pool matchers referencing generated cards, cards with valid origin and roles)
- [ ] 1.3 Implement `arbInvalidCalculatorState` fast-check arbitrary that generates states with blocking validation errors

## Task 2: Property-based tests for combination identities (Req 1)

- [ ] 2.1 [PBT] Property 1: Combination boundary identities — for any valid CalculatorState where deckSize equals handSize, totalHands equals 1; referenceCombination returns non-negative integers and 0 for invalid inputs
- [ ] 2.2 [PBT] Property 2: Combination symmetry — for any (n, k) with 0 ≤ k ≤ n ≤ 200, referenceCombination(n, k) equals referenceCombination(n, n - k)
- [ ] 2.3 [PBT] Property 3: Combination Pascal's rule — for any n > 0 and 0 < k < n with n ≤ 200, referenceCombination(n, k) equals referenceCombination(n - 1, k - 1) + referenceCombination(n - 1, k)

## Task 3: Property-based tests for engine invariants (Req 2–5)

- [ ] 3.1 [PBT] Property 4: Hand count partition and bounds — for any valid CalculatorState, verify totalHands = C(deckSize, handSize), partition identity, and all count bounds
- [ ] 3.2 [PBT] Property 5: Probability ratios and bounds — for any valid CalculatorState, verify all probability ratios equal hand counts / totalHands, totalProbability in [0,1], and probability partition sums to 1 within 1e-10
- [ ] 3.3 [PBT] Property 6: Per-pattern result consistency — for any valid CalculatorState, verify patternResults length, matchingHands bounds, probability ratios, possible flag, and goodHands >= max opening matchingHands
- [ ] 3.4 [PBT] Property 7: Determinism — for any valid CalculatorState, calling calculateProbabilities twice returns deeply equal results
- [ ] 3.5 [PBT] Property 8: Blocking validation errors produce null summary — for any invalid CalculatorState, calculateProbabilities returns null summary and non-empty blockingIssues

## Task 4: Example-based tests for trivial/impossible cases and reuse policy (Req 6, 7)

- [ ] 4.1 Test guaranteed opening pattern (deck of one card, require 1 copy) returns totalProbability 1.0
- [ ] 4.2 Test impossible pattern (requires more copies than deck has) returns totalProbability 0.0
- [ ] 4.3 Test impossible pattern (requires more copies than handSize) returns totalProbability 0.0
- [ ] 4.4 Test no opening patterns returns goodHands 0 and totalProbability 0.0
- [ ] 4.5 Test guaranteed problem pattern returns badProbability 1.0
- [ ] 4.6 Test reusePolicy "forbid" requires distinct card copies for overlapping conditions
- [ ] 4.7 Test reusePolicy "allow" permits same card copy to satisfy multiple conditions
- [ ] 4.8 Test reusePolicy "forbid" with insufficient copies reports pattern as not matching

## Task 5: Example-based tests for validation, pattern logic, and edge cases (Req 8, 9, 10)

- [ ] 5.1 Test validateCalculationState returns error for deckSize < 40, handSize > deckSize, empty cards, empty patterns, duplicate names, deckSize < 1 / handSize < 1
- [ ] 5.2 Test pattern logic "all" requires every condition to match
- [ ] 5.3 Test pattern logic "any" requires at least one condition to match
- [ ] 5.4 Test pattern logic "any" with minimumConditionMatches > 1 requires threshold
- [ ] 5.5 Test exclude condition: hand containing the excluded card reports condition as not matching
- [ ] 5.6 Test deckSize equals handSize returns totalHands = 1
- [ ] 5.7 Test pattern referencing cards not in deck returns 0 matchingHands
- [ ] 5.8 Test multiple overlapping opening patterns count each hand once in goodHands
- [ ] 5.9 Test hand matching both opening and problem pattern increments overlapHands

## Task 6: Run all tests and verify

- [ ] 6.1 Run `vitest --run src/__tests__/probability-engine.test.ts` and verify all tests pass
