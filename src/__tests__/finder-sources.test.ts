import { describe, expect, it } from 'vitest'

import type { Expansion, ExpansionCard } from '../app/card-prices'
import { META_DECKS } from '../app/meta'
import { getReplayEntries } from '../app/replays'
import { findDeckResults, findReplayResults } from '../components/shell/finder-decks'
import { cardResult, findExpansionResults, findPrintResults, setCodePrefix } from '../components/shell/finder-sources'

const EXPANSIONS: Expansion[] = [
  { id: 1, name: 'Legend of Blue Eyes White Dragon', date: '2002-03-08', count: 126, code: 'LOB' },
  { id: 2, name: 'Metal Raiders', date: '2002-06-26', count: 100, code: 'MRD' },
  { id: 3, name: 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)', date: '2023-01-01', count: 126, code: 'LOB' },
]

const card = (code: string, rarity: string, productId: number): ExpansionCard => ({ cardId: 1, name: 'Blue-Eyes White Dragon', code, rarity, edition: '1st Edition', market: 1, url: '', productId, variant: '' })

describe('el superbuscador: de dónde saca los resultados', () => {
  it('un deck de torneo se encuentra por quien lo jugó y lleva a su link directo', () => {
    const deck = META_DECKS.decks.find((candidate) => candidate.player) ?? META_DECKS.decks[0]!
    const found = findDeckResults(deck.player ?? deck.name, 100)

    expect(found.map((result) => result.id)).toContain(`deck:${deck.id}`)
    expect(found.find((result) => result.id === `deck:${deck.id}`)?.action).toEqual({ type: 'hash', hash: `#tournaments?deck=${deck.id}` })
    // Sin letras suficientes no hay nada que buscar.
    expect(findDeckResults('a')).toEqual([])
  })

  it('un replay se encuentra por sus jugadores y lleva a su video', () => {
    const entry = getReplayEntries()[0]

    if (!entry) {
      return
    }

    const found = findReplayResults(entry.players[0].name, 500)

    expect(found.map((result) => result.id)).toContain(`replay:${entry.video.id}`)
    expect(found[0]?.action).toMatchObject({ type: 'hash' })
  })

  it('un código es el prefijo y el guion; un nombre, no', () => {
    expect(setCodePrefix('LOB-EN001')).toBe('lob')
    expect(setCodePrefix(' sdbe-')).toBe('sdbe')
    expect(setCodePrefix('blue-eyes white')).toBeNull()
    expect(setCodePrefix('lob')).toBeNull()
  })

  it('una expansión se encuentra por nombre, año o código; con un código, sólo las de ese código', () => {
    expect(findExpansionResults(EXPANSIONS, 'metal').map((result) => result.label)).toEqual(['Metal Raiders'])
    expect(findExpansionResults(EXPANSIONS, '2023').map((result) => result.id)).toEqual(['set:3'])
    expect(findExpansionResults(EXPANSIONS, 'LOB-EN001').map((result) => result.id)).toEqual(['set:1', 'set:3'])
    expect(findExpansionResults(EXPANSIONS, 'metal')[0]?.action).toEqual({ type: 'hash', hash: '#expansions?set=2' })
  })

  it('una impresión se encuentra por el principio de su código y lleva a esa carta en su expansión', () => {
    const prints = [card('LOB-EN001', 'Ultra Rare', 11), card('LOB-EN002', 'Common', 12), card('LOB-EN010', 'Rare', 13)]
    const found = findPrintResults({ id: 1 }, prints, 'lob-en00')

    expect(found.map((result) => result.hint)).toEqual(['LOB-EN001 · Ultra Rare', 'LOB-EN002 · Common'])
    expect(found[0]?.action).toEqual({ type: 'hash', hash: '#expansions?set=1&print=11' })
    // Lo que no es un código no busca impresiones.
    expect(findPrintResults({ id: 1 }, prints, 'blue eyes')).toEqual([])
  })

  it('una carta se lista con su tipo y su arquetipo, y se abre en su detalle', () => {
    const dark = { ygoprodeckId: 46986414, name: 'Dark Magician', cardType: 'Normal Monster', archetype: 'Dark Magician' } as never

    expect(cardResult(dark)).toMatchObject({ id: 'card:46986414', label: 'Dark Magician', hint: 'Normal Monster · Dark Magician', action: { type: 'card' } })
  })
})
