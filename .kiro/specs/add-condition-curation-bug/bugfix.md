# Bugfix Requirements Document

## Introduction

When a user creates a custom rule in the Rule Builder and adds multiple conditions, configuring any single condition causes all unconfigured (empty) conditions to be removed from the pattern. This happens because the `curatePattern` function in `pattern-curation.ts` has an `isJustCreated` guard that only preserves patterns where **all** conditions have `matcher === null`. Once any condition is configured, the pattern passes through full curation, which eliminates conditions with `null` matchers. The `usePatternMaintenance` effect then replaces the store patterns with the curated result, causing the user's empty conditions to vanish mid-editing.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a pattern has a mix of configured conditions (matcher !== null) and unconfigured conditions (matcher === null), AND the pattern maintenance effect runs curation THEN the system removes all unconfigured conditions from the pattern

1.2 WHEN a pattern has an empty name and at least one configured condition alongside unconfigured conditions THEN the system renames the pattern to "Salida sin nombre" or "Problema sin nombre" during curation, overriding the user's in-progress editing state

1.3 WHEN the user adds a new empty condition to a pattern that already has at least one configured condition THEN the system immediately removes the newly added empty condition on the next curation cycle

### Expected Behavior (Correct)

2.1 WHEN a pattern has a mix of configured conditions (matcher !== null) and unconfigured conditions (matcher === null), AND the pattern maintenance effect runs curation THEN the system SHALL preserve all unconfigured conditions in the pattern

2.2 WHEN a pattern has an empty name and contains unconfigured conditions (indicating active editing) THEN the system SHALL preserve the empty name without auto-renaming

2.3 WHEN the user adds a new empty condition to a pattern that already has at least one configured condition THEN the system SHALL keep the empty condition in the pattern so the user can configure it at their own pace

### Unchanged Behavior (Regression Prevention)

3.1 WHEN all conditions in a pattern have configured matchers (matcher !== null) AND the pattern name is empty THEN the system SHALL CONTINUE TO rename the pattern to the default name ("Salida sin nombre" / "Problema sin nombre")

3.2 WHEN a pattern has configured conditions that reference cards no longer in the deck THEN the system SHALL CONTINUE TO remove those invalid conditions during curation

3.3 WHEN a pattern has duplicate conditions (same matcher, quantity, kind, distinct) THEN the system SHALL CONTINUE TO deduplicate them during curation

3.4 WHEN a pattern's only conditions are all invalid (referencing removed cards with no valid matchers remaining) THEN the system SHALL CONTINUE TO remove the entire pattern during curation

3.5 WHEN all conditions in a pattern have null matchers and the pattern name is empty THEN the system SHALL CONTINUE TO preserve the pattern as-is (existing `isJustCreated` behavior for fully unconfigured patterns)

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(pattern)
  INPUT: pattern of type HandPattern
  OUTPUT: boolean

  // The bug triggers when a pattern has at least one unconfigured condition
  // AND at least one configured condition (so isJustCreated is false)
  hasUnconfigured ← EXISTS c IN pattern.conditions WHERE c.matcher = null
  hasConfigured ← EXISTS c IN pattern.conditions WHERE c.matcher ≠ null

  RETURN hasUnconfigured AND hasConfigured
END FUNCTION
```

```pascal
// Property: Fix Checking - Unconfigured conditions are preserved
FOR ALL pattern WHERE isBugCondition(pattern) DO
  result ← curatePattern'(pattern)
  unconfiguredCount ← COUNT(c IN pattern.conditions WHERE c.matcher = null)
  resultUnconfiguredCount ← COUNT(c IN result.conditions WHERE c.matcher = null)
  ASSERT result ≠ null
  ASSERT resultUnconfiguredCount = unconfiguredCount
END FOR
```

```pascal
// Property: Preservation Checking - Non-buggy patterns curate identically
FOR ALL pattern WHERE NOT isBugCondition(pattern) DO
  ASSERT curatePattern(pattern) = curatePattern'(pattern)
END FOR
```
