# Requirements Document

## Introduction

The Classification Engine Improvements feature enhances the existing heuristic-based auto-classification engine in `src/app/classification-engine.ts` with two targeted upgrades for competitive-level accuracy. First, a curated known-cards map (`KNOWN_CARDS_MAP`) of 50–100 competitively relevant Yu-Gi-Oh! cards with pre-assigned roles and origins is checked before heuristic rules run, giving instant and accurate classification for staple cards that appear across virtually every tournament deck. Second, the existing 10 heuristic rules receive refined regex patterns to catch more card patterns, reduce false positives and negatives, and handle edge cases the current patterns miss — including better hand trap detection, improved searcher patterns, Quick-Play spell handling, and more precise board breaker and floodgate identification. Both changes preserve the engine's pure-function architecture with no external dependencies.

## Glossary

- **Classification_Engine**: The pure-function module at `src/app/classification-engine.ts` that receives an `ApiCardReference` and returns a `ClassificationSuggestion` containing a suggested `CardOrigin` and `CardRole[]`.
- **KNOWN_CARDS_MAP**: A static lookup table mapping normalized card names to pre-defined `ClassificationSuggestion` objects, checked before heuristic rules run.
- **RULE_SET**: The ordered array of 10 `HeuristicRule` objects evaluated by the Classification_Engine when a card is not found in the KNOWN_CARDS_MAP.
- **HeuristicRule**: A single classification rule that inspects `ApiCardReference` properties and returns zero or more `CardRole` values.
- **ClassificationSuggestion**: The output of the Classification_Engine for one card, containing a suggested `CardOrigin` and a list of suggested `CardRole[]`.
- **ApiCardReference**: The card data object containing `cardType`, `frameType`, `description`, `race`, `attribute`, `level`, `linkValue`, `atk`, `def`, `archetype`, `banlist`, and `genesys` fields.
- **Known_Card**: A card whose name exists as a key in the KNOWN_CARDS_MAP, receiving its classification directly from the map without heuristic evaluation.
- **Heuristic_Card**: A card whose name does not exist in the KNOWN_CARDS_MAP, classified by running the RULE_SET heuristic rules.
- **Normalized_Card_Name**: A card name transformed to a canonical form (trimmed, lowercased) for consistent lookup in the KNOWN_CARDS_MAP.

## Requirements

### Requirement 1: Known Cards Map Structure

**User Story:** As a competitive player, I want a curated map of well-known staple cards with pre-assigned classifications, so that the most commonly played cards in tournament decks receive accurate roles and origins without relying on regex heuristics.

#### Acceptance Criteria

1. THE Classification_Engine SHALL export a `KNOWN_CARDS_MAP` constant that maps Normalized_Card_Names to `ClassificationSuggestion` objects.
2. THE KNOWN_CARDS_MAP SHALL contain entries for a minimum of 50 competitively relevant cards spanning the following categories: hand traps, staple spells, staple traps, board breakers, draw spells, and common tech cards.
3. WHEN a new entry is added to the KNOWN_CARDS_MAP, THE Classification_Engine SHALL require only the card name string, a `CardOrigin` value, and a `CardRole[]` array — no other configuration or registration step.
4. THE KNOWN_CARDS_MAP SHALL store each entry keyed by the Normalized_Card_Name (trimmed and lowercased) to ensure case-insensitive and whitespace-tolerant lookups.
5. FOR ALL entries in the KNOWN_CARDS_MAP, each entry SHALL contain exactly one valid `CardOrigin` value and one or more valid `CardRole` values with no duplicates in the roles array.

### Requirement 2: Known Cards Map Lookup Priority

**User Story:** As a competitive player, I want known staple cards to bypass heuristic rules entirely, so that cards like Ash Blossom or Nibiru always get the correct classification regardless of how their effect text parses.

#### Acceptance Criteria

1. WHEN the Classification_Engine receives an ApiCardReference whose name (after normalization) exists in the KNOWN_CARDS_MAP, THE Classification_Engine SHALL return the pre-defined ClassificationSuggestion from the map without evaluating any HeuristicRule in the RULE_SET.
2. WHEN the Classification_Engine receives an ApiCardReference whose name (after normalization) does not exist in the KNOWN_CARDS_MAP, THE Classification_Engine SHALL evaluate the RULE_SET heuristic rules as before.
3. THE Classification_Engine SHALL normalize the card name from the ApiCardReference using the same normalization logic applied to KNOWN_CARDS_MAP keys (trim and lowercase) before performing the lookup.
4. FOR ALL cards in the KNOWN_CARDS_MAP, the ClassificationSuggestion returned by the Classification_Engine SHALL be identical to the entry stored in the map.

### Requirement 3: Known Cards Map Coverage

**User Story:** As a world championship-level player, I want the known-cards map to cover the staple cards that appear in virtually every competitive deck profile, so that tournament-level deck preparation starts with accurate baselines.

#### Acceptance Criteria

1. THE KNOWN_CARDS_MAP SHALL include entries for commonly played hand traps, including but not limited to: Ash Blossom & Joyous Spring, Maxx "C", Effect Veiler, Ghost Ogre & Snow Rabbit, Ghost Belle & Haunted Mansion, Droll & Lock Bird, D.D. Crow, Nibiru the Primal Being, PSY-Framegear Gamma, Infinite Impermanence, Ghost Mourner & Moonlit Chill, Dimension Shifter, and Skull Meister.
2. THE KNOWN_CARDS_MAP SHALL include entries for commonly played staple spells, including but not limited to: Called by the Grave, Crossout Designator, Triple Tactics Talent, Forbidden Droplet, Dark Ruler No More, Harpie's Feather Duster, Raigeki, Lightning Storm, Pot of Prosperity, Pot of Desires, Pot of Extravagance, Allure of Darkness, Upstart Goblin, Foolish Burial, Monster Reborn, One for One, and Book of Moon.
3. THE KNOWN_CARDS_MAP SHALL include entries for commonly played staple traps, including but not limited to: Infinite Impermanence, Solemn Judgment, Solemn Strike, Torrential Tribute, Compulsory Evacuation Device, Dimensional Barrier, Anti-Spell Fragrance, Skill Drain, Rivalry of Warlords, Gozen Match, and There Can Be Only One.
4. THE KNOWN_CARDS_MAP SHALL include entries for commonly played board breakers and tech cards, including but not limited to: Evenly Matched, Lava Golem, Kaijus (Gameciel the Sea Turtle Kaiju, Gadarla the Mystery Dust Kaiju, Dogoran the Mad Flame Kaiju, Kumongous the Sticky String Kaiju), Super Polymerization, and Forbidden Chalice.
5. WHEN a card appears in multiple categories (such as Infinite Impermanence being both a hand trap and a trap-based disruption), THE KNOWN_CARDS_MAP entry SHALL include all applicable roles in the roles array.

### Requirement 4: Improved Hand Trap Detection Pattern

**User Story:** As a competitive player, I want the hand trap heuristic to catch more hand trap patterns beyond the current "discard this card" check, so that hand traps with non-standard activation text are correctly identified.

#### Acceptance Criteria

1. WHEN an ApiCardReference is a monster card with a description containing a Quick Effect clause combined with hand-activation language (such as "you can send this card from your hand to the GY" or "you can reveal this card in your hand" or "you can banish this card from your hand"), THE Classification_Engine SHALL include `handtrap` in the suggested roles.
2. WHEN an ApiCardReference is a monster card with a description containing "during either player's turn" or "during your opponent's Main Phase" combined with a disruptive effect, THE Classification_Engine SHALL include `handtrap` in the suggested roles.
3. WHEN an ApiCardReference is a trap card with a description containing hand-activation language (such as "you can activate this card from your hand"), THE Classification_Engine SHALL evaluate the card for the `handtrap` role in addition to trap-based roles.
4. WHEN an ApiCardReference is a monster card with a description containing "if your opponent" as a trigger condition combined with a Special Summon from the hand, THE Classification_Engine SHALL evaluate the card for the `handtrap` role.

### Requirement 5: Improved Searcher Detection Pattern

**User Story:** As a competitive player, I want the searcher heuristic to distinguish between generic searchers and archetype-specific searchers, and to catch more search patterns, so that cards like Reinforcement of the Army and Emergency Teleport are correctly tagged.

#### Acceptance Criteria

1. WHEN an ApiCardReference has a description matching "add 1" or "add up to" followed by "from your Deck to your hand", THE Classification_Engine SHALL include `searcher` in the suggested roles.
2. WHEN an ApiCardReference has a description matching "excavate" or "look at the top" combined with "add" and "to your hand", THE Classification_Engine SHALL include `searcher` in the suggested roles.
3. WHEN an ApiCardReference has a description matching "Special Summon 1" or "Special Summon from your Deck" (deck-to-field recruitment), THE Classification_Engine SHALL include `searcher` in the suggested roles.

### Requirement 6: Improved Draw Spell Detection Pattern

**User Story:** As a competitive player, I want the draw spell heuristic to handle conditional draw effects and pot-style spells that excavate or reveal, so that cards like Pot of Prosperity and Pot of Extravagance are correctly tagged.

#### Acceptance Criteria

1. WHEN an ApiCardReference is a spell card with a description matching "draw" followed by a number and "card", THE Classification_Engine SHALL include `draw` in the suggested roles.
2. WHEN an ApiCardReference is a spell card with a description matching "excavate the top" or "reveal the top" combined with "add" and "to your hand", THE Classification_Engine SHALL include `draw` in the suggested roles.
3. WHEN an ApiCardReference is a monster card with a description containing unconditional draw effects (such as "draw 1 card" or "draw 2 cards"), THE Classification_Engine SHALL evaluate the card for the `draw` role regardless of card type.

### Requirement 7: Improved Board Breaker and Removal Detection

**User Story:** As a competitive player, I want the board breaker and removal heuristics to handle bounce effects, banish effects, and Kaiju-style tribute mechanics, so that cards like Evenly Matched and Kaijus are correctly classified.

#### Acceptance Criteria

1. WHEN an ApiCardReference has a description matching "banish all" or "shuffle all" or "return all cards" combined with opponent-targeting language, THE Classification_Engine SHALL include `boardbreaker` in the suggested roles.
2. WHEN an ApiCardReference has a description matching "Tribute 1 monster your opponent controls" or similar opponent-tribute mechanics, THE Classification_Engine SHALL include `removal` in the suggested roles.
3. WHEN an ApiCardReference has a description matching "negate the effects of 1 face-up" or "negate the effects of all" combined with opponent-targeting, THE Classification_Engine SHALL include `removal` or `boardbreaker` in the suggested roles based on whether the effect targets one card or all cards.

### Requirement 8: Improved Quick-Play Spell and Counter Trap Handling

**User Story:** As a competitive player, I want Quick-Play spells with negation effects to be correctly classified as disruption, and counter traps to be recognized as disruption, so that cards like Forbidden Droplet and Solemn Judgment are accurately tagged.

#### Acceptance Criteria

1. WHEN an ApiCardReference is a Quick-Play spell card with a description containing negation language (such as "negate the effects" or "negate the activation"), THE Classification_Engine SHALL include `disruption` in the suggested roles.
2. WHEN an ApiCardReference is a counter trap card, THE Classification_Engine SHALL include `disruption` in the suggested roles.
3. WHEN an ApiCardReference is a trap card with a description containing "negate the Summon" or "negate the activation" combined with destruction, THE Classification_Engine SHALL include `disruption` in the suggested roles.

### Requirement 9: Improved Floodgate Detection

**User Story:** As a competitive player, I want the floodgate heuristic to catch continuous restriction effects on monsters and field spells in addition to continuous spells and traps, so that cards like Barrier Statue monsters and Mystic Mine are correctly tagged.

#### Acceptance Criteria

1. WHEN an ApiCardReference is a continuous spell, continuous trap, or field spell with a description containing persistent restriction language (such as "cannot Special Summon", "cannot activate", "cannot add cards", "cannot be destroyed by"), THE Classification_Engine SHALL include `floodgate` in the suggested roles.
2. WHEN an ApiCardReference is a monster card with a description containing a persistent restriction that applies while the monster is face-up on the field (such as "while this card is face-up" combined with "cannot"), THE Classification_Engine SHALL evaluate the card for the `floodgate` role.
3. WHEN an ApiCardReference has a description containing "each player can only" or "neither player can" restriction language, THE Classification_Engine SHALL include `floodgate` in the suggested roles.

### Requirement 10: Engine Purity and Extensibility

**User Story:** As a developer, I want the improved classification engine to remain a pure-function module with no external dependencies, so that the engine is testable, deterministic, and easy to extend.

#### Acceptance Criteria

1. THE Classification_Engine SHALL remain a pure-function module with no imports from Redux, React, DOM, network, or file-system modules.
2. THE Classification_Engine SHALL accept an ApiCardReference as input and return a ClassificationSuggestion as output, with no side effects or external state mutations.
3. FOR ALL valid ApiCardReference inputs, running the Classification_Engine twice on the same input SHALL produce identical ClassificationSuggestion outputs (idempotence property).
4. FOR ALL valid ApiCardReference inputs, the ClassificationSuggestion produced by the Classification_Engine SHALL survive a JSON serialization round-trip: `JSON.parse(JSON.stringify(suggestion))` produces a deeply equal suggestion (round-trip property).
5. THE Classification_Engine SHALL export the KNOWN_CARDS_MAP and the RULE_SET so that both can be tested in isolation.
6. WHEN a Known_Card is looked up in the KNOWN_CARDS_MAP, THE Classification_Engine SHALL return a new object (not a reference to the stored entry) to prevent external mutation of the map data.
