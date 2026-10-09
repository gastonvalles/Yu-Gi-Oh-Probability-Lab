import { describe, expect, it } from 'vitest'

import { indexCardRules, type CardRulesData } from '../app/card-rules'
import { CARD_RULE } from '../app/card-script-rules'
import CARD_RULES from '../data/card-rules.json'

const index = indexCardRules(CARD_RULES as CardRulesData)
const has = (id: number, flag: keyof typeof CARD_RULE) => ((index.get(id) ?? 0) & CARD_RULE[flag]) !== 0

describe('src/data/card-rules.json (lo que escribe scripts/sync-meta-decks.mjs)', () => {
  it('cubre casi todas las cartas con script y guarda el commit de los scripts', () => {
    expect(index.size).toBeGreaterThan(12_000)
    expect(CARD_RULES.scripts).toMatch(/^[0-9a-f]{7,}$/)
  })

  it('las cartas de siempre salen como se espera', () => {
    // Ash Blossom: hand trap que niega; la juegan decks de cualquier arquetipo.
    expect(has(14558127, 'handtrap') && has(14558127, 'negate') && has(14558127, 'generic')).toBe(true)
    // Raigeki destruye sólo lo del rival; Dark Hole, lo de los dos.
    expect(has(12580477, 'hitsOpponent') && !has(12580477, 'hitsEither')).toBe(true)
    expect(has(53129443, 'hitsEither') && !has(53129443, 'hitsOpponent')).toBe(true)
    // Skill Drain restringe a los dos jugadores.
    expect(has(82732705, 'floodgate')).toBe(true)
    // Fiendsmith Engraver busca desde la mano y es pieza de su paquete.
    expect(has(60764609, 'search') && has(60764609, 'mentions')).toBe(true)
    // Cyber Dragon se invoca sola desde la mano; Lava Golem también, pero al campo del rival.
    expect(has(70095154, 'selfFromHand') && !has(70095154, 'givesToOpponent')).toBe(true)
    expect(has(102380, 'givesToOpponent')).toBe(true)
    // Kuriboh - Multiply!: hand trap que el texto no dejaba ver.
    expect(has(14965712, 'handtrap')).toBe(true)
    // Ruler of the End of the World: tiene script, pero ningún efecto de hand trap.
    expect(index.has(3739500) && !has(3739500, 'handtrap')).toBe(true)
    // Mitsurugi no Mikoto, Saji busca al invocarse; Branded Fusion fusiona del Deck: empiezan la jugada.
    expect(has(18176525, 'starts') && has(44362883, 'starts')).toBe(true)
    // Monster Reborn trae del cementerio; Fiendsmith Engraver vuelve desde ahí.
    expect(has(83764718, 'recovery') && has(60764609, 'recovery')).toBe(true)
    // A Fallen of Albaz lo nombran muchas cartas; Engraver actúa desde la mano.
    expect(has(68468459, 'referenced') && has(60764609, 'usesHand')).toBe(true)
  })
})
