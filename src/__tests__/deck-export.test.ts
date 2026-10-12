/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { buildDeckImportPreview, buildDeckImportPreviewFromJson } from '../app/deck-import'
import { buildDeckJson, buildDecklistText, describeExportSelection, type DeckExportSelection } from '../app/deck-image-export'
import { computeDeckImageLayout, type DeckImageLayout } from '../app/deck-image-layout'
import { buildKdeDecklist } from '../app/kde-decklist'
import { fillKdeDecklistPdf } from '../app/kde-decklist-pdf'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from '../app/model'

let nextId = 1

function card(name: string, cardType = 'Effect Monster', frameType = 'effect'): DeckCardInstance {
  const id = nextId++
  return {
    instanceId: `card-${id}`,
    name,
    origin: null,
    roles: [],
    needsReview: false,
    apiCard: {
      ygoprodeckId: id,
      cardType,
      frameType,
      description: null,
      race: null,
      attribute: null,
      level: null,
      linkValue: null,
      atk: null,
      def: null,
      archetype: null,
      ygoprodeckUrl: null,
      imageUrl: null,
      imageUrlSmall: null,
      banlist: { tcg: null, ocg: null, goat: null },
      genesys: { points: null },
    },
  }
}

const copies = (count: number, factory: () => DeckCardInstance) => Array.from({ length: count }, factory)

function deck(partial: Partial<DeckBuilderState>): DeckBuilderState {
  return { deckName: 'Test', main: [], extra: [], side: [], isEditingDeck: false, ...partial }
}

describe('buildKdeDecklist', () => {
  const sample = deck({
    main: [
      ...copies(3, () => card('Ash Blossom & Joyous Spring')),
      ...copies(2, () => card('Pot of Prosperity', 'Spell Card', 'spell')),
      card('Infinite Impermanence', 'Trap Card', 'trap'),
      card('Evil★Twin Ki-sikil'),
    ],
    extra: copies(2, () => card('Accesscode Talker', 'Link Monster', 'link')),
    side: [card('Droll & Lock Bird')],
  })

  it('agrupa por tipo con cantidades y totales en los campos oficiales', () => {
    const { fields, overflow } = buildKdeDecklist(sample)

    expect(fields).toMatchObject({
      'Monster 1': 'Ash Blossom & Joyous Spring',
      'Monster Card 1 Count': '3',
      'Monster 2': 'Evil*Twin Ki-sikil',
      'Total Monster Cards': '4',
      'Spell 1': 'Pot of Prosperity',
      'Spell Card 1 Count': '2',
      'Trap 1': 'Infinite Impermanence',
      'Total Trap Cards': '1',
      'Extra Deck 1': 'Accesscode Talker',
      'Extra Deck 1 Count': '2',
      'Side Deck 1': 'Droll & Lock Bird',
      'Total Side Deck': '1',
      'Main Deck Total': '7',
    })
    expect(overflow).toEqual([])
  })

  it('avisa cuando una sección tiene más cartas distintas que filas', () => {
    const extra = Array.from({ length: 16 }, (_, index) => card(`Extra ${index}`, 'XYZ Monster', 'xyz'))
    const { fields, overflow } = buildKdeDecklist(deck({ extra }))

    expect(overflow).toEqual(['Extra Deck'])
    expect(fields['Extra Deck 15']).toBe('Extra 14')
    expect(fields['Total Extra Deck']).toBe('16')
  })

  it('completa la planilla oficial y la deja editable', async () => {
    const template = readFileSync(resolve(process.cwd(), 'src/assets/kde-decklist.pdf'))
    const bytes = await fillKdeDecklistPdf(template, buildKdeDecklist(sample))
    const form = (await PDFDocument.load(bytes)).getForm()

    expect(form.getTextField('Monster 1').getText()).toBe('Ash Blossom & Joyous Spring')
    expect(form.getTextField('Main Deck Total').getText()).toBe('7')
    expect(form.getTextField('First  Middle Names').isReadOnly()).toBe(false)
  })
})

describe('describeExportSelection', () => {
  const selection = (picked: Partial<DeckExportSelection>): DeckExportSelection => ({ image: false, pdf: false, ydk: false, txt: false, json: false, ...picked })

  it('nombra los archivos tildados, en orden y con "y" antes del último', () => {
    expect(describeExportSelection(selection({ image: true, pdf: true, ydk: true }))).toBe('imagen, decklist PDF y YDK')
    expect(describeExportSelection(selection({ image: true, ydk: true }))).toBe('imagen y YDK')
    expect(describeExportSelection(selection({ pdf: true }))).toBe('decklist PDF')
    expect(describeExportSelection(selection({ txt: true, json: true }))).toBe('lista TXT y JSON')
    expect(describeExportSelection(selection({}))).toBe('')
  })
})

describe('exportar la lista en texto y el JSON', () => {
  const sample = deck({
    deckName: 'Gatos',
    main: [...copies(3, () => card('Ash Blossom & Joyous Spring')), ...copies(2, () => card('Pot of Prosperity', 'Spell Card', 'spell')), card('7 Colored Fish')],
    extra: copies(2, () => card('Accesscode Talker', 'Link Monster', 'link')),
    side: [card('Droll & Lock Bird')],
  })
  const names = (zone: DeckZone, cards: DeckBuilderState) => cards[zone].map((entry) => entry.name)
  const counts = (deckBuilder: DeckBuilderState) => (['main', 'extra', 'side'] as const).map((zone) => names(zone, deckBuilder).sort())

  it('la lista en texto agrupa por zona con cantidades y se vuelve a importar igual', () => {
    const text = buildDecklistText(sample)

    expect(text).toBe('Main Deck (6)\n3 Ash Blossom & Joyous Spring\n2 Pot of Prosperity\n1 7 Colored Fish\n\nExtra Deck (2)\n2 Accesscode Talker\n\nSide Deck (1)\n1 Droll & Lock Bird\n')

    const catalog = [...sample.main, ...sample.extra, ...sample.side].map((entry) => ({ ...entry.apiCard, name: entry.name }))
    const preview = buildDeckImportPreview({ cards: catalog, deckFormat: 'unlimited', deckName: 'Gatos', text })

    expect(preview.invalidLines).toEqual([])
    expect(preview.missingEntries).toEqual([])
    expect(counts(preview.importedDeck)).toEqual(counts(sample))
  })

  it('el JSON lleva el deck con sus roles y se vuelve a importar tal cual', () => {
    const withRoles = { ...sample, main: sample.main.map((entry, index) => (index === 0 ? { ...entry, origin: 'non_engine' as const, roles: ['handtrap' as const] } : entry)) }
    const preview = buildDeckImportPreviewFromJson({ deckName: 'x', text: buildDeckJson(withRoles) })

    expect(preview.importedDeck.deckName).toBe('Gatos')
    expect(counts(preview.importedDeck)).toEqual(counts(sample))
    expect(preview.importedDeck.main[0]).toMatchObject({ name: 'Ash Blossom & Joyous Spring', origin: 'non_engine', roles: ['handtrap'] })
    // Lo guardado no lleva ids de instancia: son de esta sesión.
    expect(buildDeckJson(sample)).not.toContain('instanceId')
  })
})

describe('computeDeckImageLayout', () => {
  const allCards = (layout: DeckImageLayout) => layout.zones.flatMap((zone) => zone.cards)

  it('apila Main, Extra y Side a todo el ancho, como en el builder', () => {
    const layout = computeDeckImageLayout({ main: 40, extra: 15, side: 15 })
    const [main, extra, side] = layout.zones

    expect(layout.zones.map((zone) => zone.zone)).toEqual(['main', 'extra', 'side'])
    expect(main?.cards).toHaveLength(40)
    expect(extra?.panel.width).toBe(main?.panel.width)
    expect(side!.panel.y).toBeGreaterThan(extra!.panel.y + extra!.panel.height)
  })

  it('Extra y Side van en una sola fila; si no entran, las cartas se superponen', () => {
    const layout = computeDeckImageLayout({ main: 40, extra: 15, side: 5 })
    const [, extra, side] = layout.zones

    expect(new Set(extra!.cards.map((rect) => rect.y)).size).toBe(1)
    expect(extra!.cards[1]!.x - extra!.cards[0]!.x).toBeLessThan(extra!.cards[0]!.width)
    expect(side!.cards[1]!.x - side!.cards[0]!.x).toBeGreaterThanOrEqual(side!.cards[0]!.width)
  })

  it('omite zonas vacías', () => {
    const layout = computeDeckImageLayout({ main: 40, extra: 15, side: 0 })
    expect(layout.zones.map((zone) => zone.zone)).toEqual(['main', 'extra'])
  })

  const overlapping = (cards: ReadonlyArray<{ x: number; y: number; width: number; height: number }>) =>
    cards.some((a, i) =>
      cards.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height),
    )

  it('mantiene la proporción real y todo dentro del lienzo; hasta 40 cartas el Main va en grilla de 10 sin superponerse', () => {
    const layout = computeDeckImageLayout({ main: 40, extra: 15, side: 15 })

    for (const rect of allCards(layout)) {
      expect(rect.height / rect.width).toBeCloseTo(614 / 421)
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y + rect.height).toBeLessThanOrEqual(layout.height)
      expect(rect.x + rect.width).toBeLessThanOrEqual(layout.width)
    }

    const main = layout.zones[0]!
    expect(new Set(main.cards.map((rect) => rect.y)).size).toBe(4)
    expect(overlapping(main.cards)).toBe(false)
  })

  it('pasadas las 40 cartas el Main va en filas de 15 superpuestas, como el builder', () => {
    const main = computeDeckImageLayout({ main: 44, extra: 0, side: 0 }).zones[0]!
    const rowsY = [...new Set(main.cards.map((rect) => rect.y))]

    expect(rowsY).toHaveLength(3)
    expect(main.cards.filter((rect) => rect.y === rowsY[0]).length).toBe(15)
    expect(main.cards[1]!.x - main.cards[0]!.x).toBeLessThan(main.cards[0]!.width)
    expect(main.cards[14]!.x + main.cards[14]!.width).toBeCloseTo(main.panel.x + main.panel.width)
  })
})
