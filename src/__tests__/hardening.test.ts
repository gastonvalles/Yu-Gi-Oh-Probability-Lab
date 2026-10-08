import { describe, expect, it } from 'vitest'

import { fromPortableConfig } from '../app/app-state-codec'
import { buildDeckImportPreview, buildDeckImportPreviewFromJson } from '../app/deck-import'
import { keepCardImageUrl, MAX_CARD_DESCRIPTION_LENGTH, parseSearchResponse } from '../ygoprodeck/parser'
import type { ApiCardSearchResult } from '../ygoprodeck'

const ash: ApiCardSearchResult = {
  ygoprodeckId: 14558127, name: 'Ash Blossom & Joyous Spring', cardType: 'Tuner Monster', frameType: 'effect', description: null,
  race: 'Zombie', attribute: 'FIRE', level: 3, linkValue: null, atk: '0', def: '1800', archetype: null, ygoprodeckUrl: null,
  imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
}

describe('importación: cantidades absurdas', () => {
  it('"999999 Ash" se recorta, aplica 3 copias y deja un solo conflicto con el resto', () => {
    const started = performance.now()
    const preview = buildDeckImportPreview({ cards: [ash], deckFormat: 'unlimited', deckName: 'x', text: '999999 Ash Blossom & Joyous Spring' })

    expect(performance.now() - started).toBeLessThan(500)
    expect(preview.importedTotals.main).toBe(3)
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0]!.count).toBe(57)
  })
})

describe('importación JSON: topes por zona y por nombre', () => {
  const card = (name: string, id: number) => ({
    name,
    origin: 'engine',
    roles: ['starter'],
    needsReview: false,
    apiCard: { ...ash, ygoprodeckId: id, name },
  })

  it('más de 3 copias de un nombre y más de 60 cartas por zona quedan afuera, y se informa', () => {
    const main = [
      ...Array.from({ length: 5 }, () => card('Ash Blossom & Joyous Spring', 1)),
      ...Array.from({ length: 70 }, (_, index) => card(`Relleno ${index}`, 100 + index)),
    ]
    const preview = buildDeckImportPreviewFromJson({ deckName: 'x', text: JSON.stringify({ deckName: 'Bomba', main, extra: [], side: [] }) })

    expect(preview.importedTotals.main).toBe(60)
    expect(preview.importedDeck.main.filter((entry) => entry.name === 'Ash Blossom & Joyous Spring')).toHaveLength(3)
    expect(preview.conflicts.map((conflict) => conflict.count).reduce((total, count) => total + count, 0)).toBe(15)
  })
})

describe('datos externos', () => {
  it('la descripción de una carta se recorta a un largo razonable (hay regex cuadráticas encima)', () => {
    const page = parseSearchResponse({
      data: [{ id: 1, name: 'Larga', type: 'Spell Card', frameType: 'spell', desc: 'x'.repeat(100_000) }],
      meta: { current_rows: 1, total_rows: 1, rows_remaining: 0 },
    })

    expect(page.results[0]!.description?.length).toBe(MAX_CARD_DESCRIPTION_LENGTH)
  })

  it('sólo se aceptan imágenes del CDN de YGOPRODeck', () => {
    expect(keepCardImageUrl('https://images.ygoprodeck.com/images/cards/1.jpg')).toBe('https://images.ygoprodeck.com/images/cards/1.jpg')
    expect(keepCardImageUrl('https://evil.example/track.gif')).toBeNull()
    expect(keepCardImageUrl('javascript:alert(1)')).toBeNull()
    expect(keepCardImageUrl('http://images.ygoprodeck.com/x.jpg')).toBeNull()
  })

  it('el tamaño de mano guardado se acota a 1..10', () => {
    const config = {
      version: 16, handSize: 25, deckFormat: 'unlimited', patternsSeeded: false, patternsSeedVersion: 0,
      disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: 'x', main: [], extra: [], side: [] }, patterns: [],
    }

    expect(fromPortableConfig(config).handSize).toBe(10)
    expect(fromPortableConfig({ ...config, handSize: 0 }).handSize).toBe(1)
  })
})
