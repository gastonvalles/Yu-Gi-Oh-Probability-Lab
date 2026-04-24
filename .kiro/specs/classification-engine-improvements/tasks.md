# Tasks

## Task 1: Add KNOWN_CARDS_MAP and update classifyCard signature

- [x] 1.1 Create the `normalizeCardName` helper function in `classification-engine.ts` (trim + toLowerCase)
- [x] 1.2 Create the `KNOWN_CARDS_MAP_ENTRIES` array with 50+ entries covering hand traps, staple spells, staple traps, board breakers, and tech cards as specified in Requirements 3.1–3.4
- [x] 1.3 Export `KNOWN_CARDS_MAP` as `ReadonlyMap<string, ClassificationSuggestion>` built from the entries array
- [x] 1.4 Update `classifyCard` signature to accept optional `name` parameter: `classifyCard(card: ApiCardReference, name?: string)`
- [x] 1.5 Add map lookup logic at the top of `classifyCard`: normalize name, check map, return cloned suggestion if found
- [x] 1.6 Update call sites in `deck-builder.ts` to pass card name to `classifyCard`

## Task 2: Refine heuristic rule regex patterns

- [x] 2.1 Update `ruleHandtrap` — add patterns for "send from hand to GY", "banish from hand", "reveal in hand", "if your opponent" trigger + Special Summon, trap hand-activation, "during either player's turn" / "during opponent's Main Phase"
- [x] 2.2 Update `ruleDraw` — add "excavate the top" / "reveal the top" + "add to hand" pattern, extend to monster cards with unconditional draw effects
- [x] 2.3 Update `ruleSearcher` — add "add 1" / "add up to" + "from your Deck to your hand", "excavate" / "look at the top" + "add" + "to your hand", "Special Summon from your Deck" recruitment
- [x] 2.4 Update `ruleBoardbreaker` — add "banish all" / "shuffle all" + opponent-targeting, "negate the effects of all" + opponent-targeting
- [x] 2.5 Update `ruleRemoval` — add "Tribute 1 monster your opponent controls" (Kaiju-style), single-target "negate the effects of 1 face-up"
- [x] 2.6 Update `ruleFloodgate` — add monster floodgates ("while face-up" + "cannot"), field spells, "each player can only" / "neither player can"
- [x] 2.7 Update `ruleDisruption` — ensure counter trap auto-tag, add "negate the Summon" + destroy pattern for traps
- [x] 2.8 Review `ruleRecovery`, `rulePayoff`, `ruleBrick` for minor refinements if needed

## Task 3: Write property-based tests (Properties 1–5)

- [ ] 3.1 Create test file `src/__tests__/classification-engine.test.ts` with shared arbitraries (reuse `arbApiCardReference` pattern from existing tests)
- [ ] 3.2 [PBT] Property 1: Map entry invariants — for all entries in KNOWN_CARDS_MAP, keys are normalized, origin is valid, roles are non-empty and unique `{Feature: classification-engine-improvements, Property 1: Map entry invariants}`
- [ ] 3.3 [PBT] Property 2: Known card lookup correctness — for any known card name with case/whitespace variation, classifyCard returns deeply equal result to map entry `{Feature: classification-engine-improvements, Property 2: Known card lookup correctness}`
- [ ] 3.4 [PBT] Property 3: Clone isolation — for any known card, returned object is not same reference as stored entry `{Feature: classification-engine-improvements, Property 3: Clone isolation}`
- [ ] 3.5 [PBT] Property 4: Idempotence — for any ApiCardReference, classifyCard(x) deep-equals classifyCard(x) `{Feature: classification-engine-improvements, Property 4: Idempotence}`
- [ ] 3.6 [PBT] Property 5: JSON round-trip — for any ApiCardReference, classifyCard result survives JSON.parse(JSON.stringify(...)) `{Feature: classification-engine-improvements, Property 5: JSON serialization round-trip}`

## Task 4: Write property-based tests (Properties 6–11) for heuristic rules

- [ ] 4.1 [PBT] Property 6: Hand trap detection — for any card matching hand trap patterns, handtrap role is assigned `{Feature: classification-engine-improvements, Property 6: Hand trap detection}`
- [ ] 4.2 [PBT] Property 7: Searcher detection — for any card matching searcher patterns, searcher role is assigned `{Feature: classification-engine-improvements, Property 7: Searcher detection}`
- [ ] 4.3 [PBT] Property 8: Draw detection — for any card matching draw patterns, draw role is assigned `{Feature: classification-engine-improvements, Property 8: Draw detection}`
- [ ] 4.4 [PBT] Property 9: Board breaker and removal detection — for any card matching boardbreaker/removal patterns, correct role is assigned `{Feature: classification-engine-improvements, Property 9: Board breaker and removal detection}`
- [ ] 4.5 [PBT] Property 10: Disruption detection — for any card matching disruption patterns, disruption role is assigned `{Feature: classification-engine-improvements, Property 10: Disruption detection}`
- [ ] 4.6 [PBT] Property 11: Floodgate detection — for any card matching floodgate patterns, floodgate role is assigned `{Feature: classification-engine-improvements, Property 11: Floodgate detection}`

## Task 5: Write example-based unit tests for map coverage

- [ ] 5.1 Write tests verifying KNOWN_CARDS_MAP.size >= 50
- [ ] 5.2 Write tests verifying all hand traps from Requirement 3.1 exist with correct roles
- [ ] 5.3 Write tests verifying all staple spells from Requirement 3.2 exist with correct roles
- [ ] 5.4 Write tests verifying all staple traps from Requirement 3.3 exist with correct roles
- [ ] 5.5 Write tests verifying all board breakers and tech cards from Requirement 3.4 exist with correct roles
- [ ] 5.6 Write tests verifying multi-role cards (e.g., Infinite Impermanence) have all applicable roles per Requirement 3.5
