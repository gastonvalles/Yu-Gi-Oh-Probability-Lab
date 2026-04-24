# Bugfix Requirements Document

## Introduction

When a user manually corrects a card's classification (origin and roles) via `setOriginForCard` or `toggleRoleForCard` in the deck builder, the correction is stored only on the `DeckCardInstance` within the current deck state. This means the manual classification is lost when the same card appears in a different deck, after re-importing a deck, or after a full reclassification. The user expects that once they manually confirm a card's classification (setting `needsReview` to `false`), that classification should persist and be automatically applied whenever the same card is encountered in the future.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user manually sets the origin or toggles roles for a card (causing `needsReview` to become `false`) and then imports a new deck containing the same card THEN the system discards the user's previous manual classification and applies the default auto-classification from `KNOWN_CARDS_MAP` or heuristic rules instead

1.2 WHEN a user manually classifies a card in one deck and then creates or loads a different deck containing the same card THEN the system does not recall the user's manual classification and the card appears with the default auto-classification and `needsReview: true`

1.3 WHEN a user triggers `reclassifyAll` THEN the system overwrites all auto-classified cards but has no mechanism to re-apply previously confirmed manual classifications, so cards that were manually classified in prior sessions revert to heuristic defaults

### Expected Behavior (Correct)

2.1 WHEN a user manually sets the origin or toggles roles for a card (causing `needsReview` to become `false`) and then imports a new deck containing the same card THEN the system SHALL apply the user's previously saved classification override (origin and roles) to that card automatically, with `needsReview` set to `false`

2.2 WHEN a user manually classifies a card in one deck and then creates or loads a different deck containing the same card THEN the system SHALL look up the persistent override map by normalized card name and apply the stored origin and roles, so the card appears pre-classified with `needsReview: false`

2.3 WHEN a user triggers `reclassifyAll` THEN the system SHALL consult the persistent override map before falling back to `KNOWN_CARDS_MAP` or heuristic rules, so that user-confirmed classifications take priority and are preserved across reclassification

2.4 WHEN a user manually confirms a card's classification (origin set and/or roles toggled, resulting in `needsReview: false`) THEN the system SHALL persist that classification as an override entry in localStorage, keyed by the normalized card name, containing `{ origin, roles }`

2.5 WHEN `classifyCard` is called for a card that has a user override THEN the system SHALL return the user override instead of consulting `KNOWN_CARDS_MAP` or heuristic rules, following the priority order: User overrides > KNOWN_CARDS_MAP > Heuristic rules

2.6 WHEN a user requests to clear a specific card's override THEN the system SHALL remove that single entry from the persistent override map without affecting other overrides

2.7 WHEN a user requests to clear all overrides THEN the system SHALL remove the entire override map from localStorage

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a card has no user override in the persistent map and exists in `KNOWN_CARDS_MAP` THEN the system SHALL CONTINUE TO return the `KNOWN_CARDS_MAP` classification as it does today

3.2 WHEN a card has no user override and is not in `KNOWN_CARDS_MAP` THEN the system SHALL CONTINUE TO classify the card using the heuristic `RULE_SET` and `deriveOrigin` as it does today

3.3 WHEN the user adds a card to a deck via search results THEN the system SHALL CONTINUE TO call `classifyCard` and set `needsReview: true` for newly added cards (unless an override exists, in which case `needsReview` is `false`)

3.4 WHEN the existing debounced auto-save (180ms) persists the main app state to localStorage THEN the system SHALL CONTINUE TO save and load the deck builder state, patterns, and settings without interference from the override storage mechanism

3.5 WHEN `toggleRoleForCard` or `setOriginForCard` is called THEN the system SHALL CONTINUE TO update all copies of the card across all zones (main, extra, side) in the current deck state as it does today
