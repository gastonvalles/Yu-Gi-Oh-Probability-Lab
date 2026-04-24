# Requirements Document

## Introduction

The Auto Card Classification feature adds heuristic-based automatic classification suggestions to the Yu-Gi-Oh! Probability Lab deck builder. When cards are added to a deck (individually or via bulk import), the Classification_Engine analyzes each card's API data (card type, frame type, effect text, archetype, attribute, level, ATK, DEF, race) and suggests an origin (engine, non_engine, hybrid) and one or more roles from the 16 available role types. Users can accept, modify, or reject every suggestion. The goal is to eliminate the tedious manual tagging bottleneck for competitive players preparing multiple deck variants, while preserving full user control over final classifications.

## Glossary

- **Classification_Engine**: The pure-function module that receives an `ApiCardReference` and returns a suggested `CardOrigin` and `CardRole[]` based on heuristic rules.
- **Heuristic_Rule**: A single classification rule that inspects one or more card properties (card type, frame type, description, archetype, attribute, level, ATK, DEF, race) and produces a classification suggestion.
- **Rule_Set**: The ordered collection of all Heuristic_Rules evaluated by the Classification_Engine for a given card.
- **Classification_Suggestion**: The output of the Classification_Engine for one card, containing a suggested origin and a list of suggested roles.
- **Auto_Classified_Card**: A DeckCardInstance whose origin and roles were set by the Classification_Engine and whose `needsReview` flag is `true`.
- **Manually_Classified_Card**: A DeckCardInstance whose origin or roles were explicitly set or confirmed by the user and whose `needsReview` flag is `false`.
- **Classify_All_Action**: A user-initiated action that runs the Classification_Engine on every unclassified card in the current deck at once.
- **DeckCardInstance**: The internal model representing a single card copy in a deck zone, carrying `origin`, `roles`, and `needsReview` fields.
- **ApiCardReference**: The card data object returned by the YGOPRODeck API, containing `cardType`, `frameType`, `description`, `race`, `attribute`, `level`, `linkValue`, `atk`, `def`, and `archetype`.

## Requirements

### Requirement 1: Classification Engine Core

**User Story:** As a competitive player, I want the app to analyze card data and suggest origin and roles, so that I do not have to manually classify every card from scratch.

#### Acceptance Criteria

1. WHEN the Classification_Engine receives an ApiCardReference, THE Classification_Engine SHALL return a Classification_Suggestion containing exactly one CardOrigin and one or more CardRole values.
2. THE Classification_Engine SHALL be a pure function that depends only on the ApiCardReference input and the Rule_Set, with no side effects or external state.
3. WHEN the Classification_Engine cannot determine a confident origin for a card, THE Classification_Engine SHALL default the suggested origin to `non_engine`.
4. WHEN the Classification_Engine cannot determine any confident role for a card, THE Classification_Engine SHALL return an empty roles array.
5. THE Classification_Engine SHALL evaluate Heuristic_Rules in a deterministic, fixed order so that the same ApiCardReference always produces the same Classification_Suggestion.

### Requirement 2: Heuristic Rules for Role Detection

**User Story:** As a competitive player, I want the classification to recognize common card patterns like hand traps, board breakers, searchers, and draw cards, so that the suggestions are useful as a starting point.

#### Acceptance Criteria

1. WHEN an ApiCardReference has a description containing phrases associated with hand-activation disruption (such as "discard this card" combined with negation or destruction effects, or belongs to a known hand trap archetype), THE Classification_Engine SHALL include `handtrap` in the suggested roles.
2. WHEN an ApiCardReference has a cardType of "Spell Card" and a description indicating unconditional draw or deck-filtering effects, THE Classification_Engine SHALL include `draw` in the suggested roles.
3. WHEN an ApiCardReference has a description indicating search effects (such as "add 1" or "add from your Deck to your hand"), THE Classification_Engine SHALL include `searcher` in the suggested roles.
4. WHEN an ApiCardReference has a description indicating mass removal or field-clearing effects (such as "destroy all" or "return all" or "send all"), THE Classification_Engine SHALL include `boardbreaker` in the suggested roles.
5. WHEN an ApiCardReference has a cardType of "Trap Card" or a description indicating continuous restriction effects, THE Classification_Engine SHALL evaluate the card for the `floodgate` or `disruption` roles based on whether the effect is persistent or reactive.
6. WHEN an ApiCardReference has a description indicating targeted or single-card removal (such as "destroy 1", "banish 1", "return 1"), THE Classification_Engine SHALL include `removal` in the suggested roles.
7. WHEN an ApiCardReference has a description indicating recovery from the Graveyard or banished zone (such as "add from your GY" or "Special Summon from your GY"), THE Classification_Engine SHALL include `recovery` in the suggested roles.
8. WHEN an ApiCardReference has a frameType indicating an Extra Deck monster (fusion, synchro, xyz, link), THE Classification_Engine SHALL evaluate the card for the `payoff` role.

### Requirement 3: Heuristic Rules for Origin Detection

**User Story:** As a competitive player, I want the classification to distinguish engine cards from non-engine cards, so that the probability calculations for engine density are accurate from the start.

#### Acceptance Criteria

1. WHEN an ApiCardReference has a cardType of "Spell Card" or "Trap Card" and the suggested roles contain only interaction roles (handtrap, disruption, boardbreaker, floodgate, removal), THE Classification_Engine SHALL suggest `non_engine` as the origin.
2. WHEN an ApiCardReference has suggested roles that include at least one game-plan role (starter, extender, enabler, searcher, draw, combo_piece, payoff, recovery), THE Classification_Engine SHALL suggest `engine` as the origin.
3. WHEN an ApiCardReference has suggested roles that include both game-plan roles and interaction roles, THE Classification_Engine SHALL suggest `hybrid` as the origin.
4. WHEN an ApiCardReference has a suggested role of `tech`, THE Classification_Engine SHALL suggest `non_engine` as the origin.
5. WHEN an ApiCardReference has a suggested role of `brick` or `garnet`, THE Classification_Engine SHALL suggest `engine` as the origin.

### Requirement 4: Single-Card Auto-Classification on Add

**User Story:** As a competitive player, I want each card to receive classification suggestions the moment I add it to my deck, so that I can review and adjust as I build.

#### Acceptance Criteria

1. WHEN a card is added to any deck zone via the search panel, THE Deck_Builder SHALL run the Classification_Engine on the added card and apply the Classification_Suggestion to the new DeckCardInstance.
2. WHEN the Classification_Engine produces a Classification_Suggestion for a newly added card, THE Deck_Builder SHALL set the DeckCardInstance `needsReview` flag to `true`.
3. WHEN a card is added and the Classification_Engine returns an empty roles array, THE Deck_Builder SHALL set the DeckCardInstance origin to the suggested origin, leave roles empty, and set `needsReview` to `true`.

### Requirement 5: Classify All Deck Action

**User Story:** As a competitive player preparing multiple deck variants, I want to auto-classify all unclassified cards in my deck at once, so that I can quickly get a baseline classification for an imported decklist.

#### Acceptance Criteria

1. WHEN the user triggers the Classify_All_Action, THE Deck_Builder SHALL run the Classification_Engine on every DeckCardInstance in the main, extra, and side zones that has `origin` equal to `null` and `roles` equal to an empty array.
2. WHEN the Classify_All_Action processes a DeckCardInstance, THE Deck_Builder SHALL apply the Classification_Suggestion and set the `needsReview` flag to `true` on that DeckCardInstance.
3. WHEN the Classify_All_Action completes, THE Deck_Builder SHALL preserve the origin and roles of any DeckCardInstance that was already classified before the action was triggered.
4. WHEN all cards in the deck already have an origin and at least one role, THE Classify_All_Action SHALL produce no changes to the deck state.

### Requirement 6: Auto-Classification on Deck Import

**User Story:** As a competitive player, I want imported decklists to receive automatic classification suggestions, so that I can start analyzing probabilities immediately after import.

#### Acceptance Criteria

1. WHEN a deck is imported via text, YDK, or JSON import, THE Deck_Builder SHALL run the Classification_Engine on every card in the imported deck.
2. WHEN the import process applies auto-classification, THE Deck_Builder SHALL set the `needsReview` flag to `true` on every auto-classified DeckCardInstance.
3. WHEN a JSON import contains cards that already have origin and roles set, THE Deck_Builder SHALL preserve the existing classification and set `needsReview` to `false` for those cards.

### Requirement 7: User Override of Suggestions

**User Story:** As a competitive player, I want to accept, modify, or reject any auto-classification suggestion, so that I always have final control over how my cards are tagged.

#### Acceptance Criteria

1. WHEN the user sets an origin on an Auto_Classified_Card, THE Deck_Builder SHALL update the origin and set the `needsReview` flag to `false`.
2. WHEN the user toggles a role on an Auto_Classified_Card, THE Deck_Builder SHALL update the roles and set the `needsReview` flag to `false`.
3. WHEN the user modifies any classification field on a Manually_Classified_Card, THE Deck_Builder SHALL keep the `needsReview` flag as `false`.
4. THE Deck_Builder SHALL apply user classification changes to all copies of the same card (matched by ygoprodeckId) across all deck zones, consistent with the existing `setOriginForCard` and `toggleRoleForCard` behavior.

### Requirement 8: Review State Visibility

**User Story:** As a competitive player, I want to see which cards were auto-classified and which I manually tagged, so that I know which suggestions still need my review.

#### Acceptance Criteria

1. WHILE a DeckCardInstance has `needsReview` equal to `true`, THE Classification_Panel SHALL display a visual indicator distinguishing the card from manually classified cards.
2. WHEN the user filters cards by classification state, THE Classification_Panel SHALL include a "Revisión pendiente" filter that shows only cards with `needsReview` equal to `true`.
3. THE Classification_Panel SHALL display the count of cards pending review in the classification overview section.

### Requirement 9: Classification Engine Testability

**User Story:** As a developer, I want the classification engine to be a pure, testable module, so that I can validate heuristic accuracy and add new rules without regressions.

#### Acceptance Criteria

1. THE Classification_Engine SHALL accept an ApiCardReference as input and return a Classification_Suggestion as output, with no dependency on Redux state, DOM, or network calls.
2. FOR ALL valid ApiCardReference inputs, classifying then serializing then deserializing the Classification_Suggestion SHALL produce an equivalent Classification_Suggestion (round-trip property).
3. FOR ALL valid ApiCardReference inputs, running the Classification_Engine twice on the same input SHALL produce identical Classification_Suggestion outputs (idempotence property).
4. THE Classification_Engine module SHALL export the Rule_Set so that individual Heuristic_Rules can be tested in isolation.
